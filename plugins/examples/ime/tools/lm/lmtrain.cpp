// Breezell IME — n-gram language model trainer (word bigram/trigram, interpolated modified
// Kneser-Ney, count pruning). Written for the engine's own binary format; no dependencies.
//
//   lmtrain seg   <lexicon.tsv> <out-prefix> <threads> <text files...>
//       Segments each line into lexicon words (most probable segmentation by the lexicon's
//       unigram weights) and writes <out-prefix>.<n>.ids (uint32 word ids; 1 ends a sentence)
//       and <out-prefix>.vocab (the lexicon's words in id order).
//   lmtrain build <vocab> <order 2|3> <min-count-2> <min-count-3> <out.bzlm> <ids files...>
//       Counts n-grams and writes the model. Trigrams are counted only after a bigram context
//       seen at least 4 times (the rest would be pruned anyway), which keeps memory in bounds.
//
// Lexicon: one "word<TAB>weight" per line (UTF-8; the weight is a corpus count, any scale).
// Ids: 0 <s>, 1 </s>, 2 <unk> (a Han character the lexicon lacks), 3 <x> (digits, Latin…),
// then the lexicon's words. Punctuation and line ends close a sentence.
//
// Model (.bzlm, little endian):
//   "BZLM" u32 version=1, u32 V, u32 order, u32 n2, u32 n3
//   f32 uni[V]            ln P(w)            (interpolated KN, continuation counts)
//   f32 bow1[V]           ln backoff(w)      (for bigrams from w)
//   u32 off2[V+1], u32 w2[n2], f32 p2[n2]    bigrams by first word, sorted by second
//   f32 bow2[n2]          ln backoff(v,w)    (order 3: for trigrams from (v,w))
//   u32 off3[n2+1], u32 w3[n3], f32 p3[n3]   trigrams by bigram index, sorted by third
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

using namespace std;

static const uint32_t BOS = 0, EOS = 1, UNK = 2, OTHER = 3, FIRST_WORD = 4;

// ---------------------------------------------------------------- UTF-8

static void utf8_decode(const string &s, vector<uint32_t> &out) {
	out.clear();
	for (size_t i = 0; i < s.size();) {
		unsigned char c = s[i];
		uint32_t cp; int n;
		if (c < 0x80) { cp = c; n = 1; }
		else if ((c >> 5) == 6) { cp = c & 0x1f; n = 2; }
		else if ((c >> 4) == 14) { cp = c & 0x0f; n = 3; }
		else if ((c >> 3) == 30) { cp = c & 0x07; n = 4; }
		else { i++; continue; }
		if (i + n > s.size()) break;
		for (int k = 1; k < n; k++) cp = (cp << 6) | (s[i + k] & 0x3f);
		out.push_back(cp);
		i += n;
	}
}

static bool is_han(uint32_t c) {
	return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x20000 && c <= 0x2ebef) || (c >= 0xf900 && c <= 0xfaff);
}

static bool is_other_word(uint32_t c) {  // digits and letters: one <x> per run
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= 0xff10 && c <= 0xff19) || (c >= 0xff21 && c <= 0xff5a);
}

// ---------------------------------------------------------------- open-addressing counts

struct Counts {
	vector<uint64_t> keys;  // 0 = empty (keys are stored +1)
	vector<uint32_t> vals;
	uint64_t mask = 0, used = 0;
	explicit Counts(int bits) { keys.assign(1ull << bits, 0); vals.assign(1ull << bits, 0); mask = (1ull << bits) - 1; }
	static uint64_t mix(uint64_t x) { x ^= x >> 33; x *= 0xff51afd7ed558ccdull; x ^= x >> 33; x *= 0xc4ceb9fe1a85ec53ull; x ^= x >> 33; return x; }
	void add(uint64_t key, uint32_t n = 1) {
		uint64_t k = key + 1, i = mix(k) & mask;
		while (true) {
			if (keys[i] == k) { vals[i] += n; return; }
			if (keys[i] == 0) {
				keys[i] = k; vals[i] = n;
				if (++used * 10 > (mask + 1) * 8) { fprintf(stderr, "hash table full (%llu)\n", (unsigned long long)used); exit(3); }
				return;
			}
			i = (i + 1) & mask;
		}
	}
	uint32_t get(uint64_t key) const {
		uint64_t k = key + 1, i = mix(k) & mask;
		while (keys[i]) { if (keys[i] == k) return vals[i]; i = (i + 1) & mask; }
		return 0;
	}
};

// ---------------------------------------------------------------- seg

struct Lexicon {
	unordered_map<string, pair<uint32_t, float>> words;  // word -> (id, ln p)
	vector<string> vocab;
	size_t max_len = 1;
};

static Lexicon load_lexicon(const char *path) {
	Lexicon lex;
	lex.vocab = {"<s>", "</s>", "<unk>", "<x>"};
	ifstream in(path);
	string line;
	vector<pair<string, double>> rows;
	double total = 0;
	unordered_map<string, size_t> at;
	vector<uint32_t> cps;
	while (getline(in, line)) {
		size_t tab = line.find('\t');
		if (tab == string::npos) continue;
		string w = line.substr(0, tab);
		double weight = atof(line.c_str() + tab + 1) + 1;
		auto it = at.find(w);
		if (it != at.end()) { rows[it->second].second = max(rows[it->second].second, weight); continue; }
		at[w] = rows.size();
		rows.push_back({w, weight});
	}
	for (auto &r : rows) total += r.second;
	for (auto &r : rows) {
		utf8_decode(r.first, cps);
		lex.max_len = max(lex.max_len, cps.size());
		lex.words[r.first] = {(uint32_t)lex.vocab.size(), (float)log(r.second / total)};
		lex.vocab.push_back(r.first);
	}
	lex.max_len = min<size_t>(lex.max_len, 16);
	return lex;
}

static string encode_range(const vector<uint32_t> &cps, size_t a, size_t b) {
	string s;
	for (size_t i = a; i < b; i++) {
		uint32_t c = cps[i];
		if (c < 0x80) s += (char)c;
		else if (c < 0x800) { s += (char)(0xc0 | (c >> 6)); s += (char)(0x80 | (c & 0x3f)); }
		else if (c < 0x10000) { s += (char)(0xe0 | (c >> 12)); s += (char)(0x80 | ((c >> 6) & 0x3f)); s += (char)(0x80 | (c & 0x3f)); }
		else { s += (char)(0xf0 | (c >> 18)); s += (char)(0x80 | ((c >> 12) & 0x3f)); s += (char)(0x80 | ((c >> 6) & 0x3f)); s += (char)(0x80 | (c & 0x3f)); }
	}
	return s;
}

// Most probable segmentation of a Han run [a, b).
static void segment_han(const Lexicon &lex, const vector<uint32_t> &cps, size_t a, size_t b, vector<uint32_t> &out) {
	size_t n = b - a;
	vector<double> best(n + 1, -1e300);
	vector<uint32_t> back_len(n + 1, 0), back_id(n + 1, UNK);
	best[0] = 0;
	const double unk_logp = -25.0;
	for (size_t i = 0; i < n; i++) {
		if (best[i] <= -1e299) continue;
		bool single = false;
		for (size_t len = 1; len <= lex.max_len && i + len <= n; len++) {
			auto it = lex.words.find(encode_range(cps, a + i, a + i + len));
			if (it == lex.words.end()) continue;
			if (len == 1) single = true;
			double s = best[i] + it->second.second;
			if (s > best[i + len]) { best[i + len] = s; back_len[i + len] = len; back_id[i + len] = it->second.first; }
		}
		if (!single && best[i] + unk_logp > best[i + 1]) { best[i + 1] = best[i] + unk_logp; back_len[i + 1] = 1; back_id[i + 1] = UNK; }
	}
	size_t start = out.size();
	for (size_t i = n; i > 0; i -= back_len[i]) out.push_back(back_id[i]);
	reverse(out.begin() + start, out.end());
}

static void segment_line(const Lexicon &lex, const string &line, vector<uint32_t> &cps, vector<uint32_t> &out) {
	utf8_decode(line, cps);
	size_t sentence_start = out.size();
	auto close = [&]() {
		if (out.size() > sentence_start) { out.push_back(EOS); sentence_start = out.size(); }
	};
	for (size_t i = 0; i < cps.size();) {
		if (is_han(cps[i])) {
			size_t j = i;
			while (j < cps.size() && is_han(cps[j])) j++;
			segment_han(lex, cps, i, j, out);
			i = j;
		} else if (is_other_word(cps[i])) {
			size_t j = i;
			while (j < cps.size() && (is_other_word(cps[j]) || cps[j] == '.' || cps[j] == '_' || cps[j] == '-')) j++;
			out.push_back(OTHER);
			i = j;
		} else if (cps[i] == ' ' || cps[i] == 0x3000 || cps[i] == 0x00b7 || cps[i] == 0x30fb) {
			i++;  // spaces and middle dots inside a sentence
		} else {
			close();  // punctuation and anything else ends the sentence
			i++;
		}
	}
	close();
}

static int cmd_seg(int argc, char **argv) {
	if (argc < 6) { fprintf(stderr, "usage: lmtrain seg <lexicon.tsv> <out-prefix> <threads> <text files...>\n"); return 2; }
	Lexicon lex = load_lexicon(argv[2]);
	string prefix = argv[3];
	int threads = atoi(argv[4]);
	fprintf(stderr, "lexicon: %zu words, max length %zu\n", lex.vocab.size() - FIRST_WORD, lex.max_len);
	{
		ofstream v(prefix + ".vocab");
		for (auto &w : lex.vocab) v << w << '\n';
	}
	vector<string> files(argv + 5, argv + argc);
	mutex in_mutex;
	size_t file_index = 0;
	ifstream current;
	atomic<uint64_t> lines{0}, tokens{0};
	auto next_batch = [&](vector<string> &batch) {
		lock_guard<mutex> lock(in_mutex);
		batch.clear();
		string line;
		while (batch.size() < 20000) {
			if (!current.is_open() || !getline(current, line)) {
				if (current.is_open()) current.close();
				if (file_index >= files.size()) break;
				current.open(files[file_index++]);
				continue;
			}
			// test files carry "original<TAB>simplified": train on the simplified half
			size_t tab = line.find('\t');
			batch.push_back(tab == string::npos ? line : line.substr(tab + 1));
		}
		return !batch.empty();
	};
	vector<thread> pool;
	for (int t = 0; t < threads; t++) {
		pool.emplace_back([&, t]() {
			FILE *out = fopen((prefix + "." + to_string(t) + ".ids").c_str(), "wb");
			vector<string> batch;
			vector<uint32_t> cps, ids;
			while (next_batch(batch)) {
				ids.clear();
				for (auto &line : batch) segment_line(lex, line, cps, ids);
				fwrite(ids.data(), 4, ids.size(), out);
				uint64_t n = lines.fetch_add(batch.size()) + batch.size();
				tokens += ids.size();
				if (n % 2000000 < batch.size()) fprintf(stderr, "%llu lines, %llu tokens\n", (unsigned long long)n, (unsigned long long)tokens.load());
			}
			fclose(out);
		});
	}
	for (auto &th : pool) th.join();
	fprintf(stderr, "done: %llu lines, %llu tokens\n", (unsigned long long)lines.load(), (unsigned long long)tokens.load());
	return 0;
}

// ---------------------------------------------------------------- build

struct Discount { double d1, d2, d3; double of(uint32_t c) const { return c == 0 ? 0 : c == 1 ? d1 : c == 2 ? d2 : d3; } };

static Discount discounts(const uint64_t n[5]) {
	double y = n[1] / (double)(n[1] + 2 * n[2]);
	Discount d{1 - 2 * y * n[2] / n[1], 2 - 3 * y * n[3] / n[2], 3 - 4 * y * n[4] / n[3]};
	d.d1 = min(max(d.d1, 0.05), 0.95); d.d2 = min(max(d.d2, 0.1), 1.9); d.d3 = min(max(d.d3, 0.2), 2.9);
	return d;
}

static vector<uint32_t> read_ids(const vector<string> &files) {
	vector<uint32_t> all;
	for (auto &f : files) {
		FILE *in = fopen(f.c_str(), "rb");
		if (!in) { fprintf(stderr, "cannot read %s\n", f.c_str()); exit(2); }
		fseek(in, 0, SEEK_END); size_t n = ftell(in) / 4; fseek(in, 0, SEEK_SET);
		size_t at = all.size(); all.resize(at + n);
		if (fread(all.data() + at, 4, n, in) != n) { fprintf(stderr, "short read %s\n", f.c_str()); exit(2); }
		fclose(in);
	}
	return all;
}

static int cmd_build(int argc, char **argv) {
	if (argc < 8) { fprintf(stderr, "usage: lmtrain build <vocab> <order 2|3> <min2> <min3> <out.bzlm> <ids files...>\n"); return 2; }
	size_t V = 0;
	{ ifstream v(argv[2]); string l; while (getline(v, l)) V++; }
	int order = atoi(argv[3]);
	uint32_t min2 = atoi(argv[4]), min3 = atoi(argv[5]);
	vector<uint32_t> ids = read_ids(vector<string>(argv + 7, argv + argc));
	fprintf(stderr, "V=%zu, %zu tokens\n", V, ids.size());

	if (V >= (1u << 21)) { fprintf(stderr, "vocabulary too large for 21-bit trigram keys\n"); return 2; }
	// Counts. Sentences: <s> w1 .. wn </s>; ids hold "w1 .. wn </s>". History (h2, h1) starts as (<s>, <s>).
	auto bits_for = [](double n) { int b = 20; while ((double)(1ull << b) * 0.75 < n && b < 31) b++; return b; };
	Counts c2(bits_for(ids.size() * 0.3));
	for (size_t i = 0, h1 = BOS; i < ids.size(); i++) {
		uint32_t w = ids[i];
		c2.add(((uint64_t)h1 << 32) | w);
		h1 = w == EOS ? BOS : w;
	}
	Counts *c3 = nullptr;
	if (order >= 3) {
		c3 = new Counts(bits_for(ids.size() * 0.3));
		uint32_t h2 = BOS, h1 = BOS;
		for (uint32_t w : ids) {
			if (h1 != BOS && c2.get(((uint64_t)h2 << 32) | h1) >= 4) c3->add(((uint64_t)h2 << 42) | ((uint64_t)h1 << 21) | w);
			if (w == EOS) { h2 = h1 = BOS; } else { h2 = h1; h1 = w; }
		}
	}
	fprintf(stderr, "distinct bigrams %llu%s\n", (unsigned long long)c2.used, c3 ? (" trigrams " + to_string(c3->used)).c_str() : "");

	// Gather bigrams by first word.
	struct Bi { uint32_t v, w, c; };
	vector<Bi> bi; bi.reserve(c2.used);
	for (uint64_t i = 0; i <= c2.mask; i++) if (c2.keys[i]) { uint64_t k = c2.keys[i] - 1; bi.push_back({(uint32_t)(k >> 32), (uint32_t)k, c2.vals[i]}); }
	sort(bi.begin(), bi.end(), [](const Bi &a, const Bi &b) { return a.v != b.v ? a.v < b.v : a.w < b.w; });

	// Continuation counts for the unigram: distinct left contexts of each word.
	vector<uint32_t> cont(V, 0);
	uint64_t cont_total = 0;
	for (auto &b : bi) { cont[b.w]++; cont_total++; }
	uint64_t n2c[5] = {0};
	for (auto &b : bi) if (b.c <= 4) n2c[b.c]++;
	Discount d2 = discounts(n2c);
	fprintf(stderr, "bigram discounts %.3f %.3f %.3f\n", d2.d1, d2.d2, d2.d3);

	// Unigram: continuation probability, smoothed with a uniform floor over the vocabulary.
	vector<float> uni_lp(V);
	{
		uint64_t seen = 0; for (size_t w = 0; w < V; w++) if (cont[w]) seen++;
		double floor_mass = 0.02;
		for (size_t w = 0; w < V; w++) {
			double p = (1 - floor_mass) * cont[w] / (double)cont_total + floor_mass / V;
			uni_lp[w] = (float)log(p);
		}
		uni_lp[BOS] = -99;
	}

	// Bigram: interpolated KN, then pruned; the pruned mass goes to the backoff weight.
	vector<uint32_t> off2(V + 1, 0);
	vector<uint32_t> w2; vector<float> p2; vector<float> bow1(V, 0);
	vector<uint64_t> big_index;  // for trigrams: (v << 32 | w) of each kept bigram
	for (size_t i = 0; i < bi.size();) {
		size_t j = i; uint64_t total = 0; uint32_t n1 = 0, n2 = 0, n3 = 0;
		for (; j < bi.size() && bi[j].v == bi[i].v; j++) { total += bi[j].c; if (bi[j].c == 1) n1++; else if (bi[j].c == 2) n2++; else n3++; }
		uint32_t v = bi[i].v;
		double gamma = (d2.d1 * n1 + d2.d2 * n2 + d2.d3 * n3) / total;
		double kept_p = 0, kept_lower = 0;
		off2[v] = w2.size();
		for (size_t k = i; k < j; k++) {
			bool keep = bi[k].c >= min2 || v == BOS || bi[k].w == EOS;
			if (!keep) continue;
			double lower = exp(uni_lp[bi[k].w]);
			double p = (bi[k].c - d2.of(bi[k].c)) / total + gamma * lower;
			w2.push_back(bi[k].w); p2.push_back((float)log(p)); big_index.push_back(((uint64_t)v << 32) | bi[k].w);
			kept_p += p; kept_lower += lower;
		}
		double bow = (1 - kept_p) / max(1e-12, 1 - kept_lower);
		bow1[v] = (float)log(max(bow, 1e-12));
		i = j;
	}
	// off2 must be monotone: words without bigrams start where the next one does.
	{
		vector<char> has(V, 0); for (auto &b : bi) has[b.v] = 1;
		uint32_t next = w2.size(); off2[V] = next;
		for (size_t v = V; v-- > 0;) { if (!has[v]) off2[v] = next; else next = off2[v]; }
	}
	fprintf(stderr, "kept bigrams %zu\n", w2.size());

	// Trigrams (order 3): KN over the kept bigram contexts, lower order = the bigram model.
	vector<float> bow2; vector<uint32_t> off3, w3; vector<float> p3;
	if (c3) {
		auto bigram_lp = [&](uint32_t v, uint32_t w) -> double {
			auto b = w2.begin() + off2[v], e = w2.begin() + off2[v + 1];
			auto it = lower_bound(b, e, w);
			if (it != e && *it == w) return p2[it - w2.begin()];
			return bow1[v] + uni_lp[w];
		};
		struct Tri { uint32_t u, v, w, c; };
		vector<Tri> tri; tri.reserve(c3->used);
		for (uint64_t i = 0; i <= c3->mask; i++) if (c3->keys[i]) { uint64_t k = c3->keys[i] - 1; tri.push_back({(uint32_t)(k >> 42), (uint32_t)((k >> 21) & 0x1fffff), (uint32_t)(k & 0x1fffff), c3->vals[i]}); }
		delete c3; c3 = nullptr;
		sort(tri.begin(), tri.end(), [](const Tri &a, const Tri &b) { return a.u != b.u ? a.u < b.u : a.v != b.v ? a.v < b.v : a.w < b.w; });
		uint64_t n3c[5] = {0}; for (auto &t : tri) if (t.c <= 4) n3c[t.c]++;
		Discount d3 = discounts(n3c);
		fprintf(stderr, "trigram discounts %.3f %.3f %.3f\n", d3.d1, d3.d2, d3.d3);
		bow2.assign(w2.size(), 0); off3.assign(w2.size() + 1, 0);
		size_t ti = 0;
		for (size_t bidx = 0; bidx < w2.size(); bidx++) {
			uint32_t u = (uint32_t)(big_index[bidx] >> 32), v = (uint32_t)big_index[bidx];
			off3[bidx] = w3.size();
			while (ti < tri.size() && (tri[ti].u < u || (tri[ti].u == u && tri[ti].v < v))) ti++;
			size_t j = ti; uint64_t total = 0; uint32_t n1 = 0, n2 = 0, n3 = 0;
			for (; j < tri.size() && tri[j].u == u && tri[j].v == v; j++) { total += tri[j].c; if (tri[j].c == 1) n1++; else if (tri[j].c == 2) n2++; else n3++; }
			if (!total) continue;
			double gamma = (d3.d1 * n1 + d3.d2 * n2 + d3.d3 * n3) / total;
			double kept_p = 0, kept_lower = 0;
			for (size_t k = ti; k < j; k++) {
				if (tri[k].c < min3 && tri[k].w != EOS) continue;
				double lower = exp(bigram_lp(v, tri[k].w));
				double p = (tri[k].c - d3.of(tri[k].c)) / total + gamma * lower;
				w3.push_back(tri[k].w); p3.push_back((float)log(p));
				kept_p += p; kept_lower += lower;
			}
			bow2[bidx] = (float)log(max((1 - kept_p) / max(1e-12, 1 - kept_lower), 1e-12));
			ti = j;
		}
		off3[w2.size()] = w3.size();
		fprintf(stderr, "kept trigrams %zu\n", w3.size());
	}

	FILE *out = fopen(argv[6], "wb");
	auto u32 = [&](uint32_t x) { fwrite(&x, 4, 1, out); };
	fwrite("BZLM", 1, 4, out); u32(1); u32(V); u32(order); u32(w2.size()); u32(w3.size());
	fwrite(uni_lp.data(), 4, V, out); fwrite(bow1.data(), 4, V, out);
	fwrite(off2.data(), 4, V + 1, out); fwrite(w2.data(), 4, w2.size(), out); fwrite(p2.data(), 4, p2.size(), out);
	if (order >= 3) {
		fwrite(bow2.data(), 4, bow2.size(), out); fwrite(off3.data(), 4, off3.size(), out);
		fwrite(w3.data(), 4, w3.size(), out); fwrite(p3.data(), 4, p3.size(), out);
	}
	fclose(out);
	fprintf(stderr, "wrote %s\n", argv[6]);
	return 0;
}

int main(int argc, char **argv) {
	if (argc >= 2 && !strcmp(argv[1], "seg")) return cmd_seg(argc, argv);
	if (argc >= 2 && !strcmp(argv[1], "build")) return cmd_build(argc, argv);
	fprintf(stderr, "usage: lmtrain seg|build ...\n");
	return 2;
}
