#!/usr/bin/env python3
"""Sentences from an OPUS OpenSubtitles monolingual file (one subtitle line per line), for
training and testing.

    zcat subs-zh_cn.txt.gz | clean_subs.py --lang zh [--opencc <dictionary dir>] --train a.txt --test b.txt

Lines are kept in blocks of 500 (roughly a stretch of one film); 1 block in --holdout goes to
test, so test sentences come from stretches the model never saw. In Chinese and Japanese a space
between two characters separates clauses, so it becomes a break. Chinese goes to Simplified for
training (OpenCC's character table); test lines keep "original<TAB>simplified".
"""
import argparse
import hashlib
import re
import sys

HAN = re.compile(r'[㐀-䶿一-鿿]')
KANA = re.compile(r'[぀-ヿ]')
HANGUL = re.compile(r'[가-힣]')
NOISE = re.compile(r'[<>{}\[\]\\|@#$%^&*_=+~/]|^[-\s]+|[♪♫]')
CJK_SPACE = re.compile(r'(?<=[　-鿿＀-￯])\s+(?=[　-鿿＀-￯])')


def load_t2s(dictionary_dir):
	table = {}
	with open(f'{dictionary_dir}/TSCharacters.txt', encoding='utf8') as f:
		for line in f:
			parts = line.rstrip('\n').split('\t')
			if len(parts) == 2 and len(parts[0]) == 1:
				table[ord(parts[0])] = parts[1].split(' ')[0]
	return table


def keep(line, lang):
	n = len(line.replace(' ', ''))
	if lang == 'zh':
		return 2 <= n <= 80 and len(HAN.findall(line)) >= 0.6 * n
	if lang == 'ja':
		return 2 <= n <= 80 and len(HAN.findall(line)) + len(KANA.findall(line)) >= 0.6 * n
	return 2 <= n <= 120 and len(HANGUL.findall(line)) >= 0.5 * n


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument('--lang', choices=['zh', 'ja', 'ko'], required=True)
	ap.add_argument('--opencc')
	ap.add_argument('--train', required=True)
	ap.add_argument('--test', required=True)
	ap.add_argument('--holdout', type=int, default=200)
	a = ap.parse_args()
	t2s = load_t2s(a.opencc) if a.opencc else None
	n_train = n_test = 0
	with open(a.train, 'w', encoding='utf8') as train, open(a.test, 'w', encoding='utf8') as test:
		for i, line in enumerate(sys.stdin):
			line = line.strip()
			if not line or NOISE.search(line):
				continue
			if a.lang != 'ko':
				line = CJK_SPACE.sub('，' if a.lang == 'zh' else '、', line)
			if not keep(line, a.lang):
				continue
			block = i // 500
			if int(hashlib.md5(str(block).encode()).hexdigest()[:8], 16) % a.holdout == 0:
				test.write(f'{line}\t{line.translate(t2s)}\n' if t2s else line + '\n')
				n_test += 1
			else:
				train.write((line.translate(t2s) if t2s else line) + '\n')
				n_train += 1
	print(f'{n_train} train / {n_test} test lines', file=sys.stderr)


if __name__ == '__main__':
	main()
