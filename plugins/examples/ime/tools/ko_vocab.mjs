#!/usr/bin/env node
// The Korean model's vocabulary in 2-set key order, so the words a typed prefix can become are one
// id range (engine/src/ko/predict.ts): <s> </s> <unk> <x>, then the Hangul words sorted by their
// keys, then the rest (mixed with digits or letters: the model knows them, nothing suggests them).
//
//   ko_vocab.mjs <ko.counts> <out.vocab>
import { readFileSync, writeFileSync } from 'node:fs';
import { keysOf } from '../engine/dist/engine/src/index.js';

const [countsPath, outPath] = process.argv.slice(2);
const words = readFileSync(countsPath, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')[0]);
const hangul = words.filter(w => /^[가-힣]+$/.test(w)).map(w => [keysOf(w), w]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1);
const rest = words.filter(w => !/^[가-힣]+$/.test(w));
writeFileSync(outPath, ['<s>', '</s>', '<unk>', '<x>', ...hangul.map(x => x[1]), ...rest].join('\n') + '\n');
console.error(`${hangul.length} Hangul words, ${rest.length} others`);
