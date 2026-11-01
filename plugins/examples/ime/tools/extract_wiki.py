#!/usr/bin/env python3
"""Plain sentences from a MediaWiki pages-articles XML dump, for training and testing.

    lbzcat zhwiki.xml.bz2 | extract_wiki.py --lang zh --opencc <OpenCC/data/dictionary> \
        --train zh-wiki.txt --test zh-wiki-test.txt

Articles are split into training and test by a hash of their title (1 in --holdout goes to
test), so a test sentence never comes from an article the model was trained on. Chinese is
converted to Simplified (OpenCC's character table) for training; the test file keeps both.
"""
import argparse
import hashlib
import html
import multiprocessing as mp
import re
import sys

COMMENT = re.compile(r'<!--.*?-->', re.S)
DROP_TAGS = re.compile(r'<(ref|math|code|pre|gallery|syntaxhighlight|source|timeline|score|chem|imagemap|references|nowiki|templatestyles)\b[^>]*?(/>|>.*?</\1\s*>)', re.S | re.I)
SELF_REF = re.compile(r'<ref\b[^>]*/>', re.I)
TAG = re.compile(r'</?[a-zA-Z][^>]*>')
TEMPLATE = re.compile(r'\{\{[^{}]*\}\}')
TABLE = re.compile(r'\{\|.*?\|\}', re.S)
ZH_VARIANT = re.compile(r'-\{(.*?)\}-', re.S)
FILE_LINK = re.compile(r'\[\[(?:File|Image|文件|檔案|档案|图像|圖像|ファイル|画像|파일|그림|Category|分类|分類|カテゴリ|분류|Media):[^\[\]]*(?:\[\[[^\[\]]*\]\][^\[\]]*)*\]\]', re.I)
LINK = re.compile(r'\[\[([^\[\]|]*\|)?([^\[\]]*)\]\]')
EXT_LINK = re.compile(r'\[(?:https?:)?//\S+(?:\s+([^\]]*))?\]')
URL = re.compile(r'https?://\S+')
QUOTES = re.compile(r"'{2,}")
HEADING = re.compile(r'^=+.*=+\s*$', re.M)
LIST_MARK = re.compile(r'^[*#:;]+\s*', re.M)
HAN = re.compile(r'[㐀-䶿一-鿿豈-﫿]')
KANA = re.compile(r'[぀-ヿ]')
HANGUL = re.compile(r'[가-힣]')
LEFTOVER = re.compile(r'[{}\[\]|=<>]')
SPLIT = {
	'zh': re.compile(r'(?<=[。！？!?；;])|\n'),
	'ja': re.compile(r'(?<=[。！？!?])|\n'),
	'ko': re.compile(r'(?<=[.!?])\s+|\n'),
	'en': re.compile(r'(?<=[.!?])\s+(?=[A-Z"])|\n'),
}
LATIN = re.compile(r'[A-Za-z]')

_t2s = None


def zh_variant(m):
	body = m.group(1)
	if ':' not in body and '：' not in body:
		return body
	options = {}
	for part in body.split(';'):
		if ':' in part:
			k, v = part.split(':', 1)
			options[k.strip()] = v
	for key in ('zh-hans', 'zh-cn', 'zh-sg', 'zh', 'zh-hant', 'zh-tw', 'zh-hk'):
		if key in options:
			return options[key]
	return next(iter(options.values()), '')


def clean(text, lang):
	text = html.unescape(text)
	text = COMMENT.sub('', text)
	text = DROP_TAGS.sub('', text)
	text = SELF_REF.sub('', text)
	for _ in range(8):
		new = TEMPLATE.sub('', text)
		if new == text:
			break
		text = new
	text = TABLE.sub('', text)
	if lang == 'zh':
		text = ZH_VARIANT.sub(zh_variant, text)
	text = FILE_LINK.sub('', text)
	text = LINK.sub(lambda m: m.group(2), text)
	text = EXT_LINK.sub(lambda m: m.group(1) or '', text)
	text = URL.sub('', text)
	text = TAG.sub('', text)
	text = QUOTES.sub('', text)
	text = HEADING.sub('', text)
	text = LIST_MARK.sub('', text)
	return text


def good(sentence, lang):
	n = len(sentence)
	if lang == 'en':
		if n < 20 or n > 300 or LEFTOVER.search(sentence):
			return False
		return len(LATIN.findall(sentence)) >= 0.7 * len(sentence.replace(' ', ''))
	if lang == 'ko':
		if n < 8 or n > 200 or LEFTOVER.search(sentence):
			return False
		return len(HANGUL.findall(sentence)) >= 0.5 * len(sentence.replace(' ', ''))
	if n < 4 or n > 120 or LEFTOVER.search(sentence):
		return False
	if lang == 'zh':
		return len(HAN.findall(sentence)) >= 0.7 * n
	return len(HAN.findall(sentence)) + len(KANA.findall(sentence)) >= 0.7 * n and KANA.search(sentence) is not None


def sentences(page, lang):
	title, text = page
	out = []
	for s in SPLIT[lang].split(clean(text, lang)):
		s = s.strip().strip('　 ')
		if s and good(s, lang):
			out.append(s)
	return title, out


def load_t2s(dictionary_dir):
	table = {}
	with open(f'{dictionary_dir}/TSCharacters.txt', encoding='utf8') as f:
		for line in f:
			parts = line.rstrip('\n').split('\t')
			if len(parts) == 2 and len(parts[0]) == 1:
				table[ord(parts[0])] = parts[1].split(' ')[0]
	return table


def init(dictionary_dir):
	global _t2s
	_t2s = load_t2s(dictionary_dir) if dictionary_dir else None


def work(args):
	pages, lang, holdout = args
	train, test = [], []
	for page in pages:
		title, sents = sentences(page, lang)
		if not sents:
			continue
		is_test = int(hashlib.md5(title.encode('utf8')).hexdigest()[:8], 16) % holdout == 0
		if is_test:
			test.extend(f'{s}\t{s.translate(_t2s)}' if _t2s else s for s in sents)
		else:
			train.extend(s.translate(_t2s) if _t2s else s for s in sents)
	return train, test


REDIRECTS = ('#redirect', '#重定向', '#转到', '#轉到', '#転送', '#넘겨주기')


def pages_of(stream):
	"""(title, text) of each main-namespace article that is not a redirect."""
	title = text = None
	ns = None
	buf = None
	for line in stream:
		if buf is not None:
			end = line.find('</text>')
			if end >= 0:
				buf.append(line[:end])
				text = ''.join(buf)
				buf = None
				if ns == '0' and title and not text.lstrip().lower().startswith(REDIRECTS):
					yield title, text
			else:
				buf.append(line)
			continue
		s = line.lstrip()
		if s.startswith('<title>'):
			title = s[7:s.find('</title>')]
			ns = None
		elif s.startswith('<ns>'):
			ns = s[4:s.find('</ns>')]
		elif s.startswith('<text'):
			start = s.find('>') + 1
			if s.endswith('/>\n') and '</text>' not in s:
				continue
			end = s.find('</text>', start)
			if end >= 0:
				text = s[start:end]
				if ns == '0' and title and not text.lstrip().lower().startswith(REDIRECTS):
					yield title, text
			else:
				buf = [s[start:]]


def batches(stream, size):
	batch = []
	for page in pages_of(stream):
		batch.append(page)
		if len(batch) >= size:
			yield batch
			batch = []
	if batch:
		yield batch


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument('--lang', choices=['zh', 'ja', 'ko', 'en'], required=True)
	ap.add_argument('--opencc', help='OpenCC data/dictionary (zh: convert to Simplified)')
	ap.add_argument('--train', required=True)
	ap.add_argument('--test', required=True)
	ap.add_argument('--holdout', type=int, default=200)
	ap.add_argument('--workers', type=int, default=10)
	a = ap.parse_args()
	stream = open(sys.stdin.fileno(), encoding='utf8', errors='replace', buffering=1 << 20)
	n_train = n_test = pages = 0
	with mp.Pool(a.workers, initializer=init, initargs=(a.opencc if a.lang == 'zh' else None,)) as pool, \
			open(a.train, 'w', encoding='utf8') as train_out, open(a.test, 'w', encoding='utf8') as test_out:
		jobs = ((b, a.lang, a.holdout) for b in batches(stream, 200))
		for train, test in pool.imap(work, jobs, chunksize=1):
			pages += 200
			for s in train:
				train_out.write(s + '\n')
			for s in test:
				test_out.write(s + '\n')
			n_train += len(train)
			n_test += len(test)
			if pages % 100000 == 0:
				print(f'{pages} pages, {n_train} train / {n_test} test sentences', file=sys.stderr, flush=True)
	print(f'done: {n_train} train / {n_test} test sentences', file=sys.stderr)


if __name__ == '__main__':
	main()
