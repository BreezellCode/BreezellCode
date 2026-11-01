#!/usr/bin/env python3
"""A zhuyin test set: Traditional clauses from held-out Taiwan text, with the zhuyin people type
for them (tones included), annotated from libchewing's dictionary. The engine's own tables come
from McBopomofo (tools/zh_tw_data.py), so the readings are judged by a source it does not read.

    make_zhuyin_testset.py --domain tw-chat --n 1000 --seed 7 --chewing <libchewing-data/dict/chewing> \
        --opencc <opencc data/dictionary> --out tw-chat.jsonl <files...>

Files hold one sentence per line or "original<TAB>simplified" (the original is used); with --po
they are gettext .po files and their msgstr texts are used. A clause is a run of 4 to 24 Han
characters. Its reading: the fewest dictionary phrases that cover it (ties: the more frequent),
each phrase's reading the one its characters' common readings agree with most.

Each item: text (Traditional), simp (OpenCC t2s of it: scoring that ignores the script), zhuyin
(syllables with tone marks), input (Dachen keys, a tone key after every syllable, space for the
first tone) and inputToneless (the same keys without tones).
"""
import argparse
import json
import math
import random
import re
from collections import defaultdict

HAN_RUN = re.compile(r'[一-鿿]{4,24}')
DACHEN = {
	'ㄅ': '1', 'ㄆ': 'q', 'ㄇ': 'a', 'ㄈ': 'z', 'ㄉ': '2', 'ㄊ': 'w', 'ㄋ': 's', 'ㄌ': 'x', 'ㄍ': 'e', 'ㄎ': 'd', 'ㄏ': 'c',
	'ㄐ': 'r', 'ㄑ': 'f', 'ㄒ': 'v', 'ㄓ': '5', 'ㄔ': 't', 'ㄕ': 'g', 'ㄖ': 'b', 'ㄗ': 'y', 'ㄘ': 'h', 'ㄙ': 'n',
	'ㄧ': 'u', 'ㄨ': 'j', 'ㄩ': 'm', 'ㄚ': '8', 'ㄛ': 'i', 'ㄜ': 'k', 'ㄝ': ',', 'ㄞ': '9', 'ㄟ': 'o', 'ㄠ': 'l',
	'ㄡ': '.', 'ㄢ': '0', 'ㄣ': 'p', 'ㄤ': ';', 'ㄥ': '/', 'ㄦ': '-',
}
TONE_KEY = {'ˊ': '6', 'ˇ': '3', 'ˋ': '4', '˙': '7'}


def read_opencc(path):
	table = {}
	for line in open(path, encoding='utf8'):
		line = line.rstrip('\n')
		if line and not line.startswith('#'):
			k, v = line.split('\t', 1)
			table[k] = v.split(' ')[0]
	return table


def t2s(text, table, maxlen):
	out, i = [], 0
	while i < len(text):
		for n in range(min(maxlen, len(text) - i), 0, -1):
			v = table.get(text[i:i + n])
			if v:
				out.append(v)
				i += n
				break
		else:
			out.append(text[i])
			i += 1
	return ''.join(out)


def read_chewing(path):
	rows = []
	for line in open(path, encoding='utf8'):
		if line.startswith('#'):
			continue
		parts = line.rstrip('\n').split(',')
		if len(parts) >= 3 and parts[1].isdigit():
			rows.append((parts[0], int(parts[1]), parts[2].split(' ')))
	return rows


def keys(syllables, tones=True):
	out = []
	for s in syllables:
		mark = s[-1] if s[-1] in TONE_KEY else ''
		bare = s[:-1] if mark else s
		out.append(''.join(DACHEN[c] for c in bare))
		if tones:
			out.append(TONE_KEY.get(mark, ' '))
	return ''.join(out)


def po_texts(path):
	"""The msgstr strings of a .po file."""
	text, cur, inside = [], [], False
	for line in open(path, encoding='utf8'):
		line = line.strip()
		if line.startswith('msgstr '):
			inside, cur = True, [line[7:]]
		elif inside and line.startswith('"'):
			cur.append(line)
		else:
			if inside:
				text.append(''.join(json.loads(s) for s in cur if s.startswith('"')))
			inside = False
	if inside:
		text.append(''.join(json.loads(s) for s in cur if s.startswith('"')))
	return text


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument('--domain', required=True)
	ap.add_argument('--n', type=int, default=1000)
	ap.add_argument('--seed', type=int, default=7)
	ap.add_argument('--chewing', required=True)
	ap.add_argument('--opencc', required=True)
	ap.add_argument('--out', required=True)
	ap.add_argument('--po', action='store_true')
	ap.add_argument('files', nargs='+')
	a = ap.parse_args()

	tsi = read_chewing(f'{a.chewing}/tsi.csv')
	word = read_chewing(f'{a.chewing}/word.csv')
	# Each character's readings, the common first: libchewing's counts where they say something,
	# else the order word.csv lists them in.
	char_freq = defaultdict(dict)
	for text, freq, syl in tsi:
		if len(text) == 1 and len(syl) == 1:
			char_freq[text][syl[0]] = max(freq, char_freq[text].get(syl[0], 0))
	char_order = defaultdict(list)
	for text, _, syl in word:
		if len(text) == 1 and len(syl) == 1 and syl[0] not in char_order[text]:
			char_order[text].append(syl[0])

	def char_score(ch, reading):
		f = char_freq[ch]
		if f and max(f.values()) > 5:
			return math.log(f.get(reading, 0) + 1)
		order = char_order[ch]
		return -order.index(reading) if reading in order else -10

	def best_char_reading(ch):
		# Sorted, so that ties go the same way on every run (sets iterate in hash order).
		options = sorted(set(char_freq[ch]) | set(char_order[ch]))
		return max(options, key=lambda r: char_score(ch, r)) if options else None

	phrases = defaultdict(lambda: [0, []])  # text → [freq, readings]
	for text, freq, syl in tsi:
		if len(text) >= 2 and len(syl) == len(text):
			p = phrases[text]
			p[0] = max(p[0], freq)
			p[1].append(syl)
	maxlen = max(len(k) for k in phrases)
	phrase_reading = {}
	for text, (freq, readings) in phrases.items():
		phrase_reading[text] = (freq, max(readings, key=lambda r: sum(char_score(c, s) for c, s in zip(text, r))))

	tables = read_opencc(f'{a.opencc}/TSPhrases.txt')
	for k, v in read_opencc(f'{a.opencc}/TSCharacters.txt').items():
		tables.setdefault(k, v)
	ts_max = max(len(k) for k in tables)

	def annotate(clause):
		n = len(clause)
		# best[i] = (segments, -sum ln freq, reading) for clause[:i]
		best = [None] * (n + 1)
		best[0] = (0, 0.0, [])
		for i in range(n):
			if best[i] is None:
				continue
			seg, cost, syl = best[i]
			r = best_char_reading(clause[i])
			if r:
				cand = (seg + 1, cost, syl + [r])
				if best[i + 1] is None or cand[:2] < best[i + 1][:2]:
					best[i + 1] = cand
			for L in range(2, min(maxlen, n - i) + 1):
				p = phrase_reading.get(clause[i:i + L])
				if p:
					cand = (seg + 1, cost - math.log(p[0] + 1), syl + p[1])
					if best[i + L] is None or cand[:2] < best[i + L][:2]:
						best[i + L] = cand
		return best[n][2] if best[n] else None

	clauses, seen = [], set()
	for path in a.files:
		texts = po_texts(path) if a.po else (l.rstrip('\n').split('\t', 1)[0] for l in open(path, encoding='utf8'))
		for t in texts:
			for m in HAN_RUN.finditer(t):
				c = m.group(0)
				if c not in seen:
					seen.add(c)
					clauses.append(c)
	random.Random(a.seed).shuffle(clauses)
	count = 0
	with open(a.out, 'w', encoding='utf8') as f:
		for clause in clauses:
			if count >= a.n:
				break
			syl = annotate(clause)
			if not syl or any(c not in DACHEN for s in syl for c in (s[:-1] if s[-1] in TONE_KEY else s)):
				continue
			item = {
				'id': f'{a.domain}-{count}', 'domain': a.domain, 'text': clause, 'simp': t2s(clause, tables, ts_max),
				'zhuyin': ' '.join(syl), 'input': keys(syl), 'inputToneless': keys(syl, False),
			}
			f.write(json.dumps(item, ensure_ascii=False) + '\n')
			count += 1
	print(f'{a.domain}: {count} clauses from {len(clauses)}')


if __name__ == '__main__':
	main()
