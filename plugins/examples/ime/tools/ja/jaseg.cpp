// Japanese text to words with Mozc's open dictionary (BSD-3; IPAdic-based vocabulary) and its
// connection costs: a Viterbi over the surface text, as a morphological analyzer does. It cuts the
// training text into words for the language model, and gives held-out sentences their readings.
//
//   jaseg vocab <dictionary_oss dir> <out.vocab>
//       the model's vocabulary: <s> </s> <unk> <x>, the word classes for words the dictionary
//       lacks, then every "surface<TAB>reading" of the dictionary once
//   jaseg seg <dictionary_oss dir> <vocab> <out-prefix> <threads> <max lines> <text files...>
//       <out-prefix>.<n>.ids: uint32 word ids, 1 ends a sentence (as lmtrain seg writes)
//   jaseg annotate <dictionary_oss dir>  < sentences  > surface<TAB>reading per word, a blank line after each
//
// Words the dictionary lacks: a run of katakana, of latin letters or of digits is one word of its
// class (<kata> <latin> <digit>), another character alone is <sym>; their cost is high, so the
// dictionary's words win where they can.
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <climits>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
using namespace std;

static void utf8_decode(const string &s, vector<uint32_t> &out) {
	out.clear();
	for (size_t i = 0; i < s.size();) {
		unsigned char c = s[i];
		uint32_t cp; int n;
		if (c < 0x80) { cp = c; n = 1; }
		else if ((c >> 5) == 6) { cp = c & 0x1f; n = 2; }
		else if ((c >> 4) == 14) { cp = c & 0x0f; n = 3; }
		else { cp = c & 0x07; n = 4; }
		for (int k = 1; k < n && i + k < s.size(); k++) cp = (cp << 6) | (s[i + k] & 0x3f);
		out.push_back(cp);
		i += n;
	}
}

static void utf8_append(string &s, uint32_t cp) {
	if (cp < 0x80) s += (char)cp;
	else if (cp < 0x800) { s += (char)(0xc0 | (cp >> 6)); s += (char)(0x80 | (cp & 0x3f)); }
	else if (cp < 0x10000) { s += (char)(0xe0 | (cp >> 12)); s += (char)(0x80 | ((cp >> 6) & 0x3f)); s += (char)(0x80 | (cp & 0x3f)); }
	else { s += (char)(0xf0 | (cp >> 18)); s += (char)(0x80 | ((cp >> 12) & 0x3f)); s += (char)(0x80 | ((cp >> 6) & 0x3f)); s += (char)(0x80 | (cp & 0x3f)); }
}

struct Entry { string surface, reading; uint16_t lid, rid; int16_t cost; };

struct Dict {
	vector<Entry> entries;
	// Surface trie: (node << 21 | code point) → child; entries ending at a node (CSR).
	unordered_map<uint64_t, uint32_t> child;
	vector<uint32_t> nodeStart, nodeEntries;
	uint32_t nodes = 1;
	vector<int16_t> conn;
	int dim = 0;
	uint16_t nounId = 0;  // 名詞,一般: words the dictionary lacks
	uint16_t symId = 0;   // 記号,一般
};

static Dict load_dict(const string &dir) {
	Dict d;
	char name[64];
	for (int k = 0; k < 10; k++) {
		snprintf(name, sizeof name, "/dictionary%02d.txt", k);
		ifstream in(dir + name);
		string line;
		while (getline(in, line)) {
			size_t a = line.find('\t'), b = line.find('\t', a + 1), c = line.find('\t', b + 1), e = line.find('\t', c + 1);
			if (e == string::npos) continue;
			Entry en;
			en.reading = line.substr(0, a);
			en.lid = (uint16_t)atoi(line.c_str() + a + 1);
			en.rid = (uint16_t)atoi(line.c_str() + b + 1);
			int cost = atoi(line.c_str() + c + 1);
			en.cost = (int16_t)min(cost, 32767);
			en.surface = line.substr(e + 1);
			d.entries.push_back(move(en));
		}
	}
	{
		ifstream in(dir + "/id.def");
		string line;
		while (getline(in, line)) {
			int id = atoi(line.c_str());
			if (line.find(" 名詞,一般,*,*,*,*,*") != string::npos) d.nounId = (uint16_t)id;
			if (line.find(" 記号,一般,*,*,*,*,*") != string::npos) d.symId = (uint16_t)id;
		}
	}
	{
		FILE *f = fopen((dir + "/connection_single_column.txt").c_str(), "r");
		if (!f) { fprintf(stderr, "no connection file\n"); exit(2); }
		if (fscanf(f, "%d", &d.dim) != 1) exit(2);
		d.conn.resize((size_t)d.dim * d.dim);
		for (size_t i = 0; i < d.conn.size(); i++) { int x; if (fscanf(f, "%d", &x) != 1) { fprintf(stderr, "short connection file\n"); exit(2); } d.conn[i] = (int16_t)min(x, 32767); }
		fclose(f);
	}
	// The trie.
	vector<uint32_t> nodeOf(d.entries.size());
	vector<uint32_t> cps;
	for (size_t i = 0; i < d.entries.size(); i++) {
		utf8_decode(d.entries[i].surface, cps);
		uint32_t node = 0;
		for (uint32_t cp : cps) {
			uint64_t key = ((uint64_t)node << 21) | cp;
			auto it = d.child.find(key);
			if (it == d.child.end()) { node = d.nodes++; d.child.emplace(key, node); }
			else node = it->second;
		}
		nodeOf[i] = node;
	}
	d.nodeStart.assign(d.nodes + 1, 0);
	for (uint32_t n : nodeOf) d.nodeStart[n + 1]++;
	for (uint32_t n = 0; n < d.nodes; n++) d.nodeStart[n + 1] += d.nodeStart[n];
	d.nodeEntries.resize(d.entries.size());
	vector<uint32_t> fill(d.nodeStart.begin(), d.nodeStart.end() - 1);
	for (size_t i = 0; i < d.entries.size(); i++) d.nodeEntries[fill[nodeOf[i]]++] = (uint32_t)i;
	fprintf(stderr, "%zu entries, %u trie nodes, connection %dx%d, noun %u sym %u\n", d.entries.size(), d.nodes, d.dim, d.dim, d.nounId, d.symId);
	return d;
}

enum Klass { K_KATA, K_LATIN, K_DIGIT, K_SYM, K_OTHER };
static Klass klass(uint32_t c) {
	if ((c >= 0x30a1 && c <= 0x30fa) || c == 0x30fc || (c >= 0x31f0 && c <= 0x31ff)) return K_KATA;
	if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= 0xff21 && c <= 0xff3a) || (c >= 0xff41 && c <= 0xff5a)) return K_LATIN;
	if ((c >= '0' && c <= '9') || (c >= 0xff10 && c <= 0xff19)) return K_DIGIT;
	if ((c >= 0x3041 && c <= 0x3096) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || c == 0x3005) return K_OTHER;
	return K_SYM;
}
static const char *CLASS_TOKEN[] = { "<kata>", "<latin>", "<digit>", "<sym>" };

struct Node { int start, end; int entry; int klass; uint16_t lid, rid; int cost; long best; int prev; };

// The best path over cps; returns its nodes in order.
static void viterbi(const Dict &d, const vector<uint32_t> &cps, vector<Node> &nodes, vector<int> &path) {
	int n = (int)cps.size();
	nodes.clear();
	vector<vector<int>> endingAt(n + 1);
	nodes.push_back({0, 0, -1, -1, 0, 0, 0, 0, -1});  // BOS
	endingAt[0].push_back(0);
	for (int i = 0; i < n; i++) {
		if (endingAt[i].empty()) continue;
		size_t before = nodes.size();
		uint32_t node = 0;
		for (int j = i; j < n && j < i + 32; j++) {
			auto it = d.child.find(((uint64_t)node << 21) | cps[j]);
			if (it == d.child.end()) break;
			node = it->second;
			for (uint32_t k = d.nodeStart[node]; k < d.nodeStart[node + 1]; k++) {
				const Entry &e = d.entries[d.nodeEntries[k]];
				nodes.push_back({i, j + 1, (int)d.nodeEntries[k], -1, e.lid, e.rid, e.cost, 0, -1});
			}
		}
		Klass kl = klass(cps[i]);
		if (kl != K_OTHER || nodes.size() == before) {
			int j = i + 1;
			if (kl == K_KATA || kl == K_LATIN || kl == K_DIGIT) while (j < n && klass(cps[j]) == kl) j++;
			uint16_t id = kl == K_SYM ? d.symId : d.nounId;
			int k = kl == K_OTHER ? K_SYM : kl;
			nodes.push_back({i, j, -1, k, id, id, 9000 + 300 * (j - i), 0, -1});
		}
		for (size_t m = before; m < nodes.size(); m++) {
			Node &cur = nodes[m];
			long best = LONG_MAX; int arg = -1;
			for (int p : endingAt[i]) {
				long c = nodes[p].best + d.conn[(size_t)nodes[p].rid * d.dim + cur.lid];
				if (c < best) { best = c; arg = p; }
			}
			cur.best = best + cur.cost;
			cur.prev = arg;
			endingAt[cur.end].push_back((int)m);
		}
	}
	long best = LONG_MAX; int arg = -1;
	for (int p : endingAt[n]) {
		long c = nodes[p].best + d.conn[(size_t)nodes[p].rid * d.dim + 0];
		if (c < best) { best = c; arg = p; }
	}
	path.clear();
	for (int p = arg; p > 0; p = nodes[p].prev) path.push_back(p);
	reverse(path.begin(), path.end());
}

static string hiragana_of(const vector<uint32_t> &cps, int a, int b) {
	string s;
	for (int i = a; i < b; i++) {
		uint32_t c = cps[i];
		if (c >= 0x30a1 && c <= 0x30f6) c -= 0x60;
		utf8_append(s, c);
	}
	return s;
}

static int cmd_vocab(int argc, char **argv) {
	if (argc < 4) { fprintf(stderr, "usage: jaseg vocab <dictionary_oss> <out.vocab>\n"); return 2; }
	Dict d = load_dict(argv[2]);
	FILE *out = fopen(argv[3], "w");
	fputs("<s>\n</s>\n<unk>\n<x>\n", out);
	for (const char *t : CLASS_TOKEN) fprintf(out, "%s\n", t);
	unordered_map<string, int> seen;
	size_t n = 0;
	for (const Entry &e : d.entries) {
		string k = e.surface + "\t" + e.reading;
		if (seen.emplace(k, 1).second) { fprintf(out, "%s\n", k.c_str()); n++; }
	}
	fclose(out);
	fprintf(stderr, "%zu words\n", n + 8);
	return 0;
}

static unordered_map<string, uint32_t> load_vocab(const string &path) {
	unordered_map<string, uint32_t> v;
	ifstream in(path);
	string line;
	uint32_t id = 0;
	while (getline(in, line)) v.emplace(line, id++);
	return v;
}

static int cmd_seg(int argc, char **argv) {
	if (argc < 8) { fprintf(stderr, "usage: jaseg seg <dictionary_oss> <vocab> <out-prefix> <threads> <max lines> <text files...>\n"); return 2; }
	Dict d = load_dict(argv[2]);
	auto vocab = load_vocab(argv[3]);
	vector<uint32_t> entryId(d.entries.size());
	for (size_t i = 0; i < d.entries.size(); i++) entryId[i] = vocab.at(d.entries[i].surface + "\t" + d.entries[i].reading);
	uint32_t classId[4];
	for (int k = 0; k < 4; k++) classId[k] = vocab.at(CLASS_TOKEN[k]);
	string prefix = argv[4];
	int threads = atoi(argv[5]);
	long maxLines = atol(argv[6]);
	vector<string> files(argv + 7, argv + argc);
	mutex inLock;
	size_t fileAt = 0;
	ifstream in;
	long lines = 0;
	atomic<long> tokens{0};
	auto next_batch = [&](vector<string> &batch) {
		lock_guard<mutex> g(inLock);
		batch.clear();
		string line;
		while (batch.size() < 2000 && lines < maxLines) {
			if (!in.is_open() || !getline(in, line)) {
				if (in.is_open()) in.close();
				if (fileAt >= files.size()) break;
				in.open(files[fileAt++]);
				continue;
			}
			// Test files hold "original<TAB>…": the original.
			size_t tab = line.find('\t');
			batch.push_back(tab == string::npos ? line : line.substr(0, tab));
			lines++;
		}
		return !batch.empty();
	};
	vector<thread> pool;
	for (int t = 0; t < threads; t++) {
		pool.emplace_back([&, t] {
			FILE *out = fopen((prefix + "." + to_string(t) + ".ids").c_str(), "wb");
			vector<string> batch;
			vector<uint32_t> cps, ids;
			vector<Node> nodes;
			vector<int> path;
			while (next_batch(batch)) {
				ids.clear();
				for (const string &line : batch) {
					utf8_decode(line, cps);
					if (cps.empty()) continue;
					viterbi(d, cps, nodes, path);
					for (int p : path) ids.push_back(nodes[p].entry >= 0 ? entryId[nodes[p].entry] : classId[nodes[p].klass]);
					ids.push_back(1);
				}
				fwrite(ids.data(), 4, ids.size(), out);
				tokens += (long)ids.size();
			}
			fclose(out);
		});
	}
	for (auto &th : pool) th.join();
	fprintf(stderr, "%ld lines, %ld tokens\n", lines, tokens.load());
	return 0;
}

static int cmd_annotate(int argc, char **argv) {
	if (argc < 3) { fprintf(stderr, "usage: jaseg annotate <dictionary_oss> < text\n"); return 2; }
	Dict d = load_dict(argv[2]);
	string line;
	vector<uint32_t> cps;
	vector<Node> nodes;
	vector<int> path;
	while (getline(cin, line)) {
		utf8_decode(line, cps);
		if (!cps.empty()) {
			viterbi(d, cps, nodes, path);
			for (int p : path) {
				const Node &nd = nodes[p];
				string surface;
				for (int i = nd.start; i < nd.end; i++) utf8_append(surface, cps[i]);
				const string reading = nd.entry >= 0 ? d.entries[nd.entry].reading : nd.klass == K_KATA ? hiragana_of(cps, nd.start, nd.end) : surface;
				printf("%s\t%s\t%s\n", surface.c_str(), reading.c_str(), nd.entry >= 0 ? "" : CLASS_TOKEN[nd.klass]);
			}
		}
		printf("\n");
	}
	return 0;
}

int main(int argc, char **argv) {
	if (argc >= 2 && !strcmp(argv[1], "vocab")) return cmd_vocab(argc, argv);
	if (argc >= 2 && !strcmp(argv[1], "seg")) return cmd_seg(argc, argv);
	if (argc >= 2 && !strcmp(argv[1], "annotate")) return cmd_annotate(argc, argv);
	fprintf(stderr, "usage: jaseg vocab|seg|annotate ...\n");
	return 2;
}
