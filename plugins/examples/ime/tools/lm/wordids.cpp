// Word ids for lmtrain from text whose words are separated by spaces (Korean, English…).
//
//   wordids vocab <max words> <min count> <out.counts> <text files...>
//       the most frequent words (punctuation stripped from their ends, English lowercased only
//       when --lower is given before the files), one "word<TAB>count" per line, most frequent first
//   wordids ids <vocab> <out-prefix> <threads> [--lower] <text files...>
//       <out-prefix>.<n>.ids: uint32 ids by the vocab's line numbers (words it lacks: 2 = <unk>),
//       1 ends a sentence
// Test files with "original<TAB>…" lines use the original.
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
using namespace std;

static bool edge_punct(unsigned char c) {
	return strchr(".,!?;:\"'()[]{}<>-_*~`/\\|", c) != nullptr;
}

// Splits on spaces; strips ASCII punctuation and common CJK punctuation at the word's ends.
static void words_of(const string &line, bool lower, vector<string> &out) {
	out.clear();
	size_t tab = line.find('\t');
	const string s = tab == string::npos ? line : line.substr(0, tab);
	size_t i = 0;
	while (i < s.size()) {
		while (i < s.size() && (s[i] == ' ' || s[i] == '\t')) i++;
		size_t j = i;
		while (j < s.size() && s[j] != ' ' && s[j] != '\t') j++;
		size_t a = i, b = j;
		auto cjk_punct = [&](size_t p) {  // … “ ” ‘ ’ 「 」 · (3-byte UTF-8)
			if (p + 3 > s.size()) return false;
			const unsigned char *u = (const unsigned char *)s.data() + p;
			return (u[0] == 0xe2 && u[1] == 0x80 && (u[2] == 0xa6 || u[2] == 0x9c || u[2] == 0x9d || u[2] == 0x98 || u[2] == 0x99)) ||
				(u[0] == 0xe3 && u[1] == 0x80 && (u[2] == 0x8c || u[2] == 0x8d)) || (u[0] == 0xc2 && u[1] == 0xb7);
		};
		for (;;) {
			if (a < b && edge_punct(s[a])) { a++; continue; }
			if (a + 3 <= b && cjk_punct(a)) { a += 3; continue; }
			break;
		}
		for (;;) {
			if (b > a && edge_punct(s[b - 1])) { b--; continue; }
			if (b >= a + 3 && cjk_punct(b - 3)) { b -= 3; continue; }
			break;
		}
		if (b > a) {
			string w = s.substr(a, b - a);
			if (lower) for (char &c : w) if (c >= 'A' && c <= 'Z') c += 32;
			out.push_back(move(w));
		}
		i = j;
	}
}

static int cmd_vocab(int argc, char **argv) {
	if (argc < 6) { fprintf(stderr, "usage: wordids vocab <max> <min count> <out.counts> [--lower] <files...>\n"); return 2; }
	size_t maxWords = atol(argv[2]);
	long minCount = atol(argv[3]);
	int at = 5;
	bool lower = false;
	if (at < argc && !strcmp(argv[at], "--lower")) { lower = true; at++; }
	unordered_map<string, long> counts;
	counts.reserve(1 << 24);
	vector<string> words;
	for (; at < argc; at++) {
		ifstream in(argv[at]);
		string line;
		while (getline(in, line)) {
			words_of(line, lower, words);
			for (auto &w : words) counts[w]++;
		}
	}
	vector<pair<string, long>> v(counts.begin(), counts.end());
	sort(v.begin(), v.end(), [](auto &a, auto &b) { return a.second > b.second || (a.second == b.second && a.first < b.first); });
	FILE *out = fopen(argv[4], "w");
	size_t n = 0;
	for (auto &p : v) {
		if (n >= maxWords || p.second < minCount) break;
		fprintf(out, "%s\t%ld\n", p.first.c_str(), p.second);
		n++;
	}
	fclose(out);
	fprintf(stderr, "%zu distinct words, kept %zu\n", v.size(), n);
	return 0;
}

static int cmd_ids(int argc, char **argv) {
	if (argc < 6) { fprintf(stderr, "usage: wordids ids <vocab> <out-prefix> <threads> [--lower] <files...>\n"); return 2; }
	unordered_map<string, uint32_t> vocab;
	{
		ifstream in(argv[2]);
		string line;
		uint32_t id = 0;
		while (getline(in, line)) vocab.emplace(line, id++);
	}
	string prefix = argv[3];
	int threads = atoi(argv[4]);
	int at = 5;
	bool lower = false;
	if (at < argc && !strcmp(argv[at], "--lower")) { lower = true; at++; }
	vector<string> files(argv + at, argv + argc);
	mutex lock;
	size_t fileAt = 0;
	ifstream in;
	atomic<long> tokens{0}, unknown{0};
	auto next_batch = [&](vector<string> &batch) {
		lock_guard<mutex> g(lock);
		batch.clear();
		string line;
		while (batch.size() < 5000) {
			if (!in.is_open() || !getline(in, line)) {
				if (in.is_open()) in.close();
				if (fileAt >= files.size()) break;
				in.open(files[fileAt++]);
				continue;
			}
			batch.push_back(line);
		}
		return !batch.empty();
	};
	vector<thread> pool;
	for (int t = 0; t < threads; t++) {
		pool.emplace_back([&, t] {
			FILE *out = fopen((prefix + "." + to_string(t) + ".ids").c_str(), "wb");
			vector<string> batch, words;
			vector<uint32_t> ids;
			while (next_batch(batch)) {
				ids.clear();
				for (auto &line : batch) {
					words_of(line, lower, words);
					if (words.empty()) continue;
					for (auto &w : words) {
						auto it = vocab.find(w);
						if (it == vocab.end()) { ids.push_back(2); unknown++; } else ids.push_back(it->second);
					}
					ids.push_back(1);
				}
				fwrite(ids.data(), 4, ids.size(), out);
				tokens += (long)ids.size();
			}
			fclose(out);
		});
	}
	for (auto &th : pool) th.join();
	fprintf(stderr, "%ld tokens, %ld unknown\n", tokens.load(), unknown.load());
	return 0;
}

int main(int argc, char **argv) {
	if (argc >= 2 && !strcmp(argv[1], "vocab")) return cmd_vocab(argc, argv);
	if (argc >= 2 && !strcmp(argv[1], "ids")) return cmd_ids(argc, argv);
	fprintf(stderr, "usage: wordids vocab|ids ...\n");
	return 2;
}
