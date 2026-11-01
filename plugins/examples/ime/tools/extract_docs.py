#!/usr/bin/env python3
"""
Technical writing for the Chinese language model: the prose of documentation repositories
(Markdown, MDX, reStructuredText, notebooks' Markdown cells), one paragraph line per line, in mainland Simplified
Chinese (files under a zh-tw folder are converted, Taiwan terms included: 程式 → 程序); with
--english, the English prose instead.

Code blocks, front matter, HTML tags, template macros ({{ }}, {% %}) and link targets go; inline
code stays as the Latin it is (the model's <x>). Lines without a Han character go. A path that
contains any of --exclude (case-insensitive) is skipped: the sources the benchmarks' sentences
come from must not be trained on.

  extract_docs.py --out zh-tech.txt [--exclude vue --exclude python] <repo dirs...>
"""
import argparse
import json
import os
import re
import sys

import opencc

HAN = re.compile(r'[一-鿿]')
WORD = re.compile(r"[A-Za-z][a-z']+")
FENCE = re.compile(r'^\s*(```|~~~)')
TAGS = re.compile(r'</?[A-Za-z][^<>]*>')
# MDN's {{jsxref("Promise")}}, {{domxref("Node.textContent", "textContent")}}: the name shown.
MACRO_CALL = re.compile(r'\{\{\s*\w+\(\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?[^{}]*\)\s*\}\}')
MACROS = re.compile(r'\{\{[^{}]*\}\}|\{%[^%]*%\}|\{\{<[^>]*>\}\}|\{\{%[^%]*%\}\}')
IMAGE = re.compile(r'!\[([^\]]*)\]\([^)]*\)')
LINK = re.compile(r'\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\[[^\]]*\]')
INLINE_CODE = re.compile(r'`+([^`]*)`+')
EMPHASIS = re.compile(r'(\*\*|__|\*|~~)')
REF_DEF = re.compile(r'^\s*\[[^\]]+\]:\s*\S+')
# reStructuredText: :ref:`the text <target>` keeps the text; directives (.. note::) go.
RST_ROLE = re.compile(r':[\w:-]+:`([^`<]*)(?:<[^>]*>)?`')
RST_DIRECTIVE = re.compile(r'^\s*\.\.\s')
DOC_EXT = ('.md', '.mdx', '.markdown', '.ipynb', '.rst')


def chinese(line):
	return HAN.search(line) is not None


def english(line):
	return not HAN.search(line) and len(WORD.findall(line)) >= 3


def markdown_lines(text, keep=chinese):
	"""The prose lines of a Markdown text."""
	lines = text.split('\n')
	if lines and lines[0].strip() == '---':
		for i in range(1, len(lines)):
			if lines[i].strip() == '---':
				lines = lines[i + 1:]
				break
	in_code = False
	for line in lines:
		if FENCE.match(line):
			in_code = not in_code
			continue
		if in_code or REF_DEF.match(line) or RST_DIRECTIVE.match(line) or line.startswith('    ') and not line.strip().startswith(('-', '*', '1')):
			continue
		line = MACRO_CALL.sub(lambda m: f' {m.group(2) or m.group(1)} ', line)
		line = MACROS.sub(' ', line)
		line = IMAGE.sub(lambda m: m.group(1), line)
		line = LINK.sub(lambda m: m.group(1) or m.group(2) or '', line)
		line = RST_ROLE.sub(lambda m: m.group(1), line)
		line = INLINE_CODE.sub(lambda m: f' {m.group(1)} ', line)
		line = TAGS.sub(' ', line)
		line = EMPHASIS.sub('', line)
		line = re.sub(r'^\s*(?:(?:#+|>+|[-*+:]|\d+\.)\s+)+', '', line)
		line = line.replace('|', '，').replace('&nbsp;', ' ')
		line = re.sub(r'\s+', ' ', line).strip()
		if keep(line):
			yield line


def notebook_lines(text, keep=chinese):
	try:
		nb = json.loads(text)
	except ValueError:
		return
	for cell in nb.get('cells', []):
		if cell.get('cell_type') == 'markdown':
			src = cell.get('source', '')
			yield from markdown_lines(''.join(src) if isinstance(src, list) else src, keep)


def main():
	ap = argparse.ArgumentParser()
	ap.add_argument('--out', required=True)
	ap.add_argument('--exclude', action='append', default=[])
	ap.add_argument('--english', action='store_true', help='English prose instead (lines of three words or more, no Han)')
	ap.add_argument('dirs', nargs='+')
	a = ap.parse_args()
	excluded = [x.lower() for x in a.exclude]
	tw2sp = opencc.OpenCC('tw2sp')
	files = lines = skipped = 0
	with open(a.out, 'w', encoding='utf8') as out:
		for root_dir in a.dirs:
			for root, dirs, names in os.walk(root_dir):
				dirs[:] = sorted(d for d in dirs if not d.startswith('.') and d != 'node_modules')
				for name in sorted(names):
					if not name.lower().endswith(DOC_EXT):
						continue
					path = os.path.join(root, name)
					rel = os.path.relpath(path, root_dir).lower()
					if any(x in rel for x in excluded):
						skipped += 1
						continue
					with open(path, encoding='utf8', errors='replace') as f:
						text = f.read()
					taiwan = 'zh-tw' in rel or 'zh_tw' in rel
					keep = english if a.english else chinese
					got = notebook_lines(text, keep) if name.lower().endswith('.ipynb') else markdown_lines(text, keep)
					files += 1
					for line in got:
						out.write((tw2sp.convert(line) if taiwan else line) + '\n')
						lines += 1
	print(f'{files} files, {lines} lines ({skipped} files excluded) -> {a.out}', file=sys.stderr)


if __name__ == '__main__':
	main()
