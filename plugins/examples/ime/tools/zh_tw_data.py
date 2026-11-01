#!/usr/bin/env python3
"""Taiwan data for zhuyin: the tones each character takes, Taiwan words and readings the
pinyin lexicon lacks, and which Traditional form Taiwan writes for a Simplified word.

    zh_tw_data.py <McBopomofo Source/Data> <opencc data/dictionary> <pinyin-data> \
                  <phrase-pinyin-data> <zh-lexicon.tsv> <out dir>

Writes to <out dir>:
  zh-tones.tsv       char (Simplified, and Traditional where it differs) \t syllable \t tones (1-5)
  zh-tw-pack.tsv     Simplified word \t pinyin \t weight: McBopomofo's words and readings that
                     zh-lexicon.tsv lacks (Taiwan readings: 垃圾 le se, 星期 xing qi)
  zh-tw-script.tsv   Simplified \t Traditional: where Taiwan writes otherwise than OpenCC's s2tw
                     gives (台灣 for 臺灣), from McBopomofo's phrase counts

McBopomofo is MIT, OpenCC Apache-2.0, pinyin-data and phrase-pinyin-data MIT. The test sets
are annotated with libchewing's data instead (tools/make_zhuyin_testset.py), which this does
not read, so the benchmark's readings do not come from the engine's own tables.
"""
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict

TONE_MARK = {'ˊ': 2, 'ˇ': 3, 'ˋ': 4, '˙': 5}


def read_opencc(path):
	table = {}
	for line in open(path, encoding='utf8'):
		line = line.rstrip('\n')
		if not line or line.startswith('#'):
			continue
		k, v = line.split('\t', 1)
		table[k] = v.split(' ')
	return table


class Converter:
	"""OpenCC's way: segment by longest phrase, then each piece by longest match (first value)."""

	def __init__(self, *tables):
		self.table = {}
		for t in tables:
			for k, v in t.items():
				self.table.setdefault(k, v)
		self.maxlen = max(len(k) for k in self.table)

	def convert(self, text):
		out = []
		i = 0
		while i < len(text):
			for n in range(min(self.maxlen, len(text) - i), 0, -1):
				v = self.table.get(text[i:i + n])
				if v:
					out.append(v[0])
					i += n
					break
			else:
				out.append(text[i])
				i += 1
		return ''.join(out)


def strip_tone(p):
	"""Toned pinyin (ǎ or a3) → (toneless with ü as v, tone 1-5)."""
	p = p.strip().lower()
	m = re.fullmatch(r'([a-zü:v]+)([1-5])', p)
	if m:
		base, tone = m.group(1), int(m.group(2))
	else:
		tone = 5
		nfd = unicodedata.normalize('NFD', p)
		base = ''
		for c in nfd:
			if c == '̄':
				tone = 1
			elif c == '́':
				tone = 2
			elif c == '̌':
				tone = 3
			elif c == '̀':
				tone = 4
			elif c == '̈':
				base += ':'
			else:
				base += c
	base = base.replace('u:', 'v').replace('ü', 'v')
	return base, tone


def main():
	mcb, opencc, pinyin_data, phrase_data, lexicon_path, out = sys.argv[1:7]
	ts = Converter(read_opencc(f'{opencc}/TSPhrases.txt'), read_opencc(f'{opencc}/TSCharacters.txt'))
	s2tw_first = Converter(read_opencc(f'{opencc}/STPhrases.txt'), read_opencc(f'{opencc}/STCharacters.txt'))
	tw_variants = Converter(read_opencc(f'{opencc}/TWVariantsPhrases.txt'), read_opencc(f'{opencc}/TWVariants.txt'))

	def s2tw(text):
		return tw_variants.convert(s2tw_first.convert(text))

	# Zhuyin spelling → pinyin, from the characters McBopomofo gives both for.
	zhuyin_to_pinyin = {}
	base_rows = []
	for line in open(f'{mcb}/BPMFBase.txt', encoding='utf8'):
		parts = line.rstrip('\r\n').split(' ')
		if len(parts) < 3:
			continue
		char, zhuyin, pinyin = parts[0], parts[1], parts[2]
		tone = TONE_MARK.get(zhuyin[-1], 1)
		bare = zhuyin[:-1] if zhuyin[-1] in TONE_MARK else zhuyin
		py, _ = strip_tone(pinyin)
		zhuyin_to_pinyin.setdefault(bare, py)
		base_rows.append((char, py, tone))

	def reading(zhuyin_syllables):
		out = []
		for z in zhuyin_syllables:
			tone = TONE_MARK.get(z[-1], 1)
			bare = z[:-1] if z[-1] in TONE_MARK else z
			py = zhuyin_to_pinyin.get(bare)
			if not py:
				return None
			out.append((py, tone))
		return out

	# A character's own readings always count; a tone seen only inside words (三聲 sandhi written
	# out: 起碼 ㄑㄧˊ) counts when enough of the character's uses in words have it.
	occ = {}
	for line in open(f'{mcb}/phrase.occ', encoding='utf8'):
		parts = line.rstrip('\r\n').split(' ')
		if len(parts) == 2 and parts[1].isdigit():
			occ[parts[0]] = int(parts[1])

	tones = defaultdict(set)
	in_words = defaultdict(lambda: defaultdict(float))

	def add_tone(char, syllable, tone):
		tones[(char, syllable)].add(tone)
		simp = ts.convert(char)
		if simp != char:
			tones[(simp, syllable)].add(tone)

	def add_word_tone(char, syllable, tone, weight):
		in_words[(char, syllable)][tone] += weight
		simp = ts.convert(char)
		if simp != char:
			in_words[(simp, syllable)][tone] += weight

	for char, py, tone in base_rows:
		add_tone(char, py, tone)

	phrases = []  # (Traditional, [(syllable, tone)])
	for line in open(f'{mcb}/BPMFMappings.txt', encoding='utf8'):
		parts = line.rstrip('\r\n').split(' ')
		if len(parts) < 3:
			continue
		r = reading(parts[1:])
		if not r or len(r) != len(parts[0]):
			continue
		phrases.append((parts[0], r))
		for ch, (py, tone) in zip(parts[0], r):
			add_word_tone(ch, py, tone, 1 + occ.get(parts[0], 0))

	# Mainland data for the Simplified characters McBopomofo's table may not reach.
	for name in ('kTGHZ2013.txt', 'kMandarin.txt'):
		for line in open(f'{pinyin_data}/{name}', encoding='utf8'):
			if line.startswith('#') or ':' not in line:
				continue
			code, rest = line.split(':', 1)
			char = chr(int(code.strip()[2:], 16))
			for p in rest.split('#')[0].split(','):
				if p.strip():
					py, tone = strip_tone(p)
					tones[(char, py)].add(tone)
	for line in open(f'{phrase_data}/pinyin.txt', encoding='utf8'):
		if line.startswith('#') or ':' not in line:
			continue
		word, rest = line.split(':', 1)
		syl = rest.split('#')[0].split()
		if len(syl) != len(word):
			continue
		for ch, p in zip(word, syl):
			py, tone = strip_tone(p)
			add_word_tone(ch, py, tone, 1)
	for key, by_tone in in_words.items():
		total = sum(by_tone.values())
		for tone, w in by_tone.items():
			if w >= 3 and w >= 0.1 * total:
				tones[key].add(tone)

	with open(f'{out}/zh-tones.tsv', 'w', encoding='utf8') as f:
		for (char, py), ts_ in sorted(tones.items()):
			f.write(f'{char}\t{py}\t{"".join(str(t) for t in sorted(ts_))}\n')
	print(f'tones: {len(tones)} (char, syllable)', file=sys.stderr)

	# What the lexicon already has: Simplified word → set of readings (and its weight).
	known = defaultdict(set)
	weights = {}
	for line in open(lexicon_path, encoding='utf8'):
		parts = line.rstrip('\n').split('\t')
		if len(parts) != 3:
			continue
		known[parts[0]].add(parts[1])
		weights[(parts[0], parts[1])] = float(parts[2])

	# Weight of a McBopomofo phrase: fit ln(weight) = a + b ln(occ) on the entries both share.
	xs, ys = [], []
	for trad, r in phrases:
		simp = ts.convert(trad)
		key = ' '.join(p for p, _ in r)
		w = weights.get((simp, key))
		if w and w > 0 and occ.get(trad, 0) > 0:
			xs.append(math.log(occ[trad]))
			ys.append(math.log(w))
	n = len(xs)
	mx, my = sum(xs) / n, sum(ys) / n
	b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / max(1e-9, sum((x - mx) ** 2 for x in xs))
	a = my - b * mx
	print(f'weight fit on {n} shared entries: ln w = {a:.3f} + {b:.3f} ln occ', file=sys.stderr)

	pack = {}
	for trad, r in phrases:
		simp = ts.convert(trad)
		key = ' '.join(p for p, _ in r)
		if key in known.get(simp, ()):
			continue
		w = math.exp(a + b * math.log(max(1, occ.get(trad, 0)) + 1))
		if (simp, key) not in pack or pack[(simp, key)] < w:
			pack[(simp, key)] = w
	# Taiwan readings of single characters (和 ㄏㄢˋ, 垃 ㄌㄜˋ): McBopomofo gives no counts for
	# them, so each takes a share (TW_SINGLE_SHARE, 25%) of its character's weight in the lexicon:
	# a reading Taiwan uses that the mainland lexicon lacks is a common one there (和 ㄏㄢˋ, 期 ㄑㄧˊ).
	share = float(os.environ.get('TW_SINGLE_SHARE', '0.25'))
	char_total = defaultdict(float)
	for (word, key), w in weights.items():
		if len(word) == 1:
			char_total[word] += w
	singles = 0
	for char, py, _ in base_rows:
		simp = ts.convert(char)
		if len(simp) != 1 or py in known.get(simp, ()) or (simp, py) in pack:
			continue
		pack[(simp, py)] = share * char_total[simp] if char_total.get(simp) else 100
		singles += 1
	print(f'tw pack: {singles} single-character readings', file=sys.stderr)
	with open(f'{out}/zh-tw-pack.tsv', 'w', encoding='utf8') as f:
		for (simp, key), w in sorted(pack.items(), key=lambda kv: -kv[1]):
			f.write(f'{simp}\t{key}\t{w:.0f}\n')
	print(f'tw pack: {len(pack)} entries ({sum(1 for s, _ in pack if s not in known)} new words)', file=sys.stderr)

	# Taiwan's forms: for each Simplified phrase (and character) the Traditional form Taiwan
	# writes most, where it is not what s2tw gives.
	by_simp = defaultdict(lambda: defaultdict(int))
	for trad, count in occ.items():
		if not trad or any(not ('㐀' <= c <= '鿿' or '\U00020000' <= c <= '\U0003134f') for c in trad):
			continue
		by_simp[ts.convert(trad)][trad] += count
	overrides = {}
	for simp, forms in by_simp.items():
		trad, count = max(forms.items(), key=lambda kv: kv[1])
		total = sum(forms.values())
		# Only clear preferences: the form holds most uses and has been seen enough.
		if count < 20 or count < 0.6 * total:
			continue
		if s2tw(simp) != trad:
			overrides[simp] = trad
	with open(f'{out}/zh-tw-script.tsv', 'w', encoding='utf8') as f:
		for simp in sorted(overrides, key=lambda s: (len(s), s)):
			f.write(f'{simp}\t{overrides[simp]}\n')
	print(f'tw script overrides: {len(overrides)} ({sum(1 for s in overrides if len(s) == 1)} characters)', file=sys.stderr)


if __name__ == '__main__':
	main()
