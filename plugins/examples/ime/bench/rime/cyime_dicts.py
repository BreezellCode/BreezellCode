#!/usr/bin/env python3
"""rime-ice's dictionaries with CyIME's weights, for the librime baseline that comes closest to
CyIME's 26-key pinyin without its own native code.

    cyime_dicts.py <rime-ice dir> <CyIME app/data dir> <out dir (a copy of rime-ice to edit)>

As CyIME's build does (tasks-chinese.gradle.kts, read from its data files): each table's rows
become those of rime_ice_<table>_weights.tsv.gz, words in cyime_removed_words.txt.gz are left
out, and the rows of cyime_domain_terms.tsv and cyime_user_fixes.tsv raise an entry to at least
their weight (or add it).
"""
import gzip
import os
import sys

TABLES = ['8105', 'base', 'ext', 'tencent']


def main():
	src, data, out = sys.argv[1:4]
	removed = set(l.strip() for l in gzip.open(f'{data}/cyime_removed_words.txt.gz', 'rt', encoding='utf8') if l.strip() and not l.startswith('#'))
	raises = []
	for name in ('cyime_domain_terms.tsv', 'cyime_user_fixes.tsv'):
		for line in open(f'{data}/{name}', encoding='utf8'):
			if line.startswith('#') or not line.strip():
				continue
			parts = line.rstrip('\n').split('\t')
			if len(parts) == 3:
				raises.append((parts[0], parts[1], int(parts[2])))
	for table in TABLES:
		path = f'{out}/cn_dicts/{table}.dict.yaml'
		header = []
		with open(f'{src}/cn_dicts/{table}.dict.yaml', encoding='utf8') as f:
			for line in f:
				header.append(line)
				if line.rstrip('\n') == '...':
					break
		rows = []
		index = {}
		for line in gzip.open(f'{data}/rime_ice_{table}_weights.tsv.gz', 'rt', encoding='utf8'):
			parts = line.rstrip('\n').split('\t')
			if not parts[0] or parts[0] in removed:
				continue
			index[(parts[0], parts[1] if len(parts) == 3 else '')] = len(rows)
			rows.append(parts)
		if table == 'base':
			for text, code, weight in raises:
				i = index.get((text, code))
				if i is None:
					rows.append([text, code, str(weight)])
				elif int(rows[i][-1]) < weight:
					rows[i][-1] = str(weight)
		with open(path, 'w', encoding='utf8') as f:
			f.writelines(header)
			f.write('\n')
			for r in rows:
				f.write('\t'.join(r) + '\n')
		print(f'{table}: {len(rows)} rows', file=sys.stderr)


if __name__ == '__main__':
	main()
