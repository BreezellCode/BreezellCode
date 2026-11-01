/**
 * Breezell input method engine. Pure TypeScript, no dependencies: it runs in Breezell's core
 * (a utility process) and in the benchmarks alike.
 */
export { BOS, EOS, UNK, OTHER, loadNgramModel, type NgramModel } from './core/lm.js';
export { SYLLABLES, syllableGraph, syllableId, syllableOf, prefixRange, slipsOf, EdgeKind, type SyllableEdge } from './zh/pinyin.js';
export { loadZhLexicon, combineLexicons, arcTone, type ZhLexicon, type WordArc } from './zh/lexicon.js';
export { ZhDecoder, INITIAL_PENALTY, PARTIAL_PENALTY, TONE_PENALTY, type ZhCandidate, type ZhDecodeResult, type ZhLayout } from './zh/decoder.js';
export { ZhSession, learnFrom, type ZhSessionState, type ZhSessionOptions } from './zh/session.js';
export { PINYIN, type ZhSpeller } from './zh/speller.js';
export { ZHUYIN, DACHEN, TONES, zhuyinOf, dachenOf, keysToZhuyin, zhuyinGraph } from './zh/zhuyin.js';
export { loadToneTable, type ToneTable } from './zh/tones.js';
export { doublePinyin, spell, type DoublePinyinSpeller } from './zh/doublePinyin.js';
export { DOUBLE_PINYIN_SCHEMES } from './zh/doublePinyinSchemes.js';
export { ScriptConverter } from './zh/script.js';
export { loadCodeTable, type CodeTable } from './table/table.js';
export { TableSession, type TableOptions, type TableCandidate, type TableState } from './table/session.js';
export { RomajiTable, RomajiComposer, toRomaji } from './ja/romaji.js';
export { loadJaLexicon, type JaLexicon } from './ja/lexicon.js';
export { JaConverter, KATA_TOKEN, type JaCandidate, type JaSegment } from './ja/converter.js';
export { HangulComposer, DUBEOLSIK, composeKeys, keysOf, syllableText } from './ko/hangul.js';
export { PrefixPredictor, type Prediction } from './core/predict.js';
export { SpellCorrector, type Correction, type CorrectorOptions } from './core/correct.js';
export { AdaptiveModel, type AdaptiveSnapshot, type LearnedWord } from './core/adaptive.js';
