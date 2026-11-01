#!/usr/bin/env python3
"""The Chinese lexicon from rime-ice's dictionaries (the ones its rime_ice.dict.yaml imports).

    zh_lexicon.py <rime-ice dir> <phrase-pinyin-data dir> <out dir>

Writes:
  zh-lexicon.tsv  word<TAB>pinyin (space-separated syllables)<TAB>weight, one line per reading.
                  Entries rime-ice lists without pinyin (its tencent table) get readings the way
                  Rime gives them: from phrase-pinyin-data when it has the phrase, else from the
                  readings of each character (those with at least 5% of the character's weight).
  zh-seg.tsv      word<TAB>weight, for segmenting the training text: only the tables with real
                  frequencies (characters, base, others); ext and tencent carry a flat weight.
"""
import itertools
import os
import re
import sys
import unicodedata

TABLES = ['cn_dicts/8105', 'cn_dicts/base', 'cn_dicts/ext', 'cn_dicts/tencent', 'cn_dicts/others']
SEG_TABLES = {'cn_dicts/8105', 'cn_dicts/base', 'cn_dicts/others'}
SYLLABLE = re.compile(r'^[a-z]+$')
TONE = {c: unicodedata.normalize('NFD', c)[0] for c in 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿ'}
TONE['ü'] = 'v'
for c in 'ǖǘǚǜ':
	TONE[c] = 'v'


def rows(path):
	body = False
	with open(path, encoding='utf8') as f:
		for line in f:
			line = line.rstrip('\n')
			if not body:
				body = line == '...'
				continue
			if not line or line.startswith('#'):
				continue
			parts = line.split('\t')
			if len(parts) == 2 and parts[1].lstrip('-').isdigit():
				yield parts[0], None, int(parts[1])
			elif len(parts) >= 2:
				weight = int(parts[2]) if len(parts) > 2 and parts[2].lstrip('-').isdigit() else 0
				yield parts[0], parts[1], weight


def toneless(syllable):
	return ''.join(TONE.get(c, c) for c in syllable)


def load_phrases(path):
	phrases = {}
	with open(path, encoding='utf8') as f:
		for line in f:
			if line.startswith('#') or ':' not in line:
				continue
			word, reading = line.split(':', 1)
			syllables = [toneless(s) for s in reading.split('#')[0].split()]
			if all(SYLLABLE.match(s) for s in syllables):
				phrases[word.strip()] = ' '.join(syllables)
	return phrases


def main():
	src, ppd, out = sys.argv[1], sys.argv[2], sys.argv[3]
	os.makedirs(out, exist_ok=True)
	phrases = load_phrases(f'{ppd}/large_pinyin.txt' if os.path.exists(f'{ppd}/large_pinyin.txt') else f'{ppd}/pinyin.txt')
	char_readings = {}
	entries = []  # (word, code or None, weight, table)
	for table in TABLES:
		for word, code, weight in rows(f'{src}/{table}.dict.yaml'):
			entries.append((word, code, weight, table))
			if code and len(word) == 1 and SYLLABLE.match(code):
				char_readings.setdefault(word, {})
				char_readings[word][code] = max(weight, char_readings[word].get(code, 0))

	def readings_of(word):
		if word in phrases and len(phrases[word].split()) == len(word):
			return [phrases[word]]
		options = []
		for ch in word:
			rs = char_readings.get(ch)
			if not rs:
				return []
			top = max(rs.values())
			options.append([r for r, w in sorted(rs.items(), key=lambda x: -x[1]) if w >= 0.05 * top][:3])
		return [' '.join(c) for c in itertools.islice(itertools.product(*options), 4)]

	seen = set()
	seg = {}
	n = derived = 0
	with open(f'{out}/zh-lexicon.tsv', 'w', encoding='utf8') as lex:
		for word, code, weight, table in entries:
			codes = [code] if code else readings_of(word)
			if not code:
				derived += 1
			for c in codes:
				if not all(SYLLABLE.match(s) for s in c.split(' ')) or len(c.split(' ')) != len(word):
					continue
				if (word, c) in seen:  # rime-ice: the first table listing an entry wins
					continue
				seen.add((word, c))
				lex.write(f'{word}\t{c}\t{weight}\n')
				n += 1
			if table in SEG_TABLES and weight > seg.get(word, -1):
				seg[word] = weight
	with open(f'{out}/zh-seg.tsv', 'w', encoding='utf8') as f:
		for word, weight in seg.items():
			f.write(f'{word}\t{weight}\n')
	print(f'{n} readings ({derived} entries without pinyin read from their characters), {len(seg)} words for segmentation', file=sys.stderr)


if __name__ == '__main__':
	main()
