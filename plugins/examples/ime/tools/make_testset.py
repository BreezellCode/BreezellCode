#!/usr/bin/env python3
"""A Chinese test set: clauses sampled from held-out text, with their pinyin.

    make_testset.py --domain wiki --n 1000 --seed 7 --phrases <phrase-pinyin-data> --rime <rime-ice> \
        --out wiki.jsonl <test files...>

Test files hold one sentence per line, or "original<TAB>simplified" (the simplified half is used).
A clause is a run of Han characters between punctuation, 4 to 24 characters long. Its pinyin
comes from the longest phrases first: rime-ice's own readings (the highest weight), then
phrase-pinyin-data, then each character's most common reading. Both engines get the same pinyin.
"""
import argparse
import json
import random
import re
import unicodedata

HAN_RUN = re.compile(r'[一-鿿]{4,24}')
SYLLABLE = re.compile(r'^[a-z]+$')


def toneless(syllable):
	out = []
	for c in unicodedata.normalize('NFD', syllable):
		if unicodedata.category(c) == 'Mn':
			if c == '̈':  # ü
				out[-1] = 'v'
			continue
		out.append('v' if c == 'ü' else c)
	return ''.join(out)


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
			if len(parts) >= 3 and parts[2].lstrip('-').isdigit():
				yield parts[0], parts[1], int(parts[2])


def load_readings(phrase_dir, rime_dir):
	phrases = {}
	with open(f'{phrase_dir}/large_pinyin.txt', encoding='utf8') as f:
		for line in f:
			if line.startswith('#') or ':' not in line:
				continue
			word, reading = line.split(':', 1)
			word = word.strip()
			syl = [toneless(s) for s in reading.split('#')[0].split()]
			if len(syl) == len(word) and all(SYLLABLE.match(s) for s in syl):
				phrases[word] = ' '.join(syl)
	best = {}
	for table in ('cn_dicts/8105', 'cn_dicts/base'):
		for word, code, weight in rows(f'{rime_dir}/{table}.dict.yaml'):
			if len(code.split(' ')) != len(word):
				continue
			if weight > best.get(word, ('', -1))[1]:
				best[word] = (code, weight)
	# A character's own reading: among its readings with at least half the top weight (rime-ice
	# gives 这 zhe / zhei, 长 chang / zhang the same weight), the one its phrases use most.
	uses = {}
	for word, reading in phrases.items():
		for ch, syl in zip(word, reading.split(' ')):
			uses[(ch, syl)] = uses.get((ch, syl), 0) + 1
	char_weights = {}
	for table in ('cn_dicts/8105',):
		for word, code, weight in rows(f'{rime_dir}/{table}.dict.yaml'):
			if len(word) == 1:
				char_weights.setdefault(word, {})[code] = max(weight, char_weights.get(word, {}).get(code, 0))
	chars = {}
	for ch, readings in char_weights.items():
		top = max(readings.values())
		close = [r for r, w in readings.items() if w >= 0.5 * top]
		chars[ch] = max(close, key=lambda r: (uses.get((ch, r), 0), readings[r]))
	# Words: rime-ice's readings first (they are the ones people type: 那些 na xie), then
	# phrase-pinyin-data for the words rime-ice does not spell out.
	words = {w: c for w, (c, _) in best.items() if len(w) > 1}
	for w, c in phrases.items():
		words.setdefault(w, c)
	return words, chars


def annotate(text, words, chars, max_len=10):
	out = []
	i = 0
	while i < len(text):
		for length in range(min(max_len, len(text) - i), 1, -1):
			reading = words.get(text[i:i + length])
			if reading:
				out.append(reading)
				i += length
				break
		else:
			reading = chars.get(text[i])
			if not reading:
				return None
			out.append(reading)
			i += 1
	return ' '.join(out)


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument('--domain', required=True)
	ap.add_argument('--n', type=int, default=1000)
	ap.add_argument('--seed', type=int, default=7)
	ap.add_argument('--phrases', required=True)
	ap.add_argument('--rime', required=True)
	ap.add_argument('--out', required=True)
	ap.add_argument('--markdown', action='store_true', help='inputs are Markdown files: skip code blocks')
	ap.add_argument('--context', type=int, default=0, help='keep this many characters of the file before each clause (code included) as its context')
	ap.add_argument('--ordered', action='store_true', help='keep the clauses in file order (a user writing one document after another)')
	ap.add_argument('files', nargs='+')
	a = ap.parse_args()
	words, chars = load_readings(a.phrases, a.rime)
	clauses = []
	seen = set()
	for path in sorted(a.files) if a.ordered else a.files:
		in_code = False
		so_far = ''
		with open(path, encoding='utf8', errors='replace') as f:
			for raw in f:
				line = raw
				if a.markdown:
					if line.lstrip().startswith('```'):
						in_code = not in_code
						continue
					if in_code:
						continue
					line = re.sub(r'`[^`]*`', ' ', line)
				line = line.rstrip('\n')
				text = line.split('\t', 1)[1] if '\t' in line else line
				for m in HAN_RUN.finditer(text):
					clause = m.group(0)
					if clause not in seen:
						seen.add(clause)
						context = (so_far + raw[:m.start()])[-a.context:] if a.context else ''
						clauses.append((clause, context))
				so_far = (so_far + raw)[-max(a.context, 1):]
	if not a.ordered:
		random.Random(a.seed).shuffle(clauses)
	n = 0
	with open(a.out, 'w', encoding='utf8') as out:
		for clause, context in clauses:
			if n >= a.n:
				break
			pinyin = annotate(clause, words, chars)
			if not pinyin:
				continue
			item = {'id': f'{a.domain}-{n}', 'domain': a.domain, 'text': clause, 'pinyin': pinyin}
			if context:
				item['context'] = context
			out.write(json.dumps(item, ensure_ascii=False) + '\n')
			n += 1
	print(f'{a.domain}: {n} clauses from {len(clauses)}')


if __name__ == '__main__':
	main()
