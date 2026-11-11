import assert from 'node:assert/strict';
import { test } from 'node:test';
import kuromoji from 'kuromoji';
import { analyze, matchingCorrections, validateCorrection, type Correction } from '../extension/analysis.ts';

const started = performance.now();
const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) =>
  kuromoji.builder({ dicPath: new URL('../node_modules/kuromoji/dict/', import.meta.url).pathname }).build((error, result) => error ? reject(error) : resolve(result)));
const loadMs = Math.round(performance.now() - started);
const tokenize = (text: string) => tokenizer.tokenize(text);
const cases = [
  ['大豆を一ばん水にひたし', '一', 'ひと'],
  ['大豆を一ばん水にひたし', '水', 'みず'],
  ['かきまぜながら熱します', '熱', 'ねっ'],
  ['半年から一年の間おいておく', '間', 'あいだ'],
  ['国分 牧衛', '国分', 'こくぶん'],
  ['国分 牧衛', '牧衛', 'まきえ'],
  ['食べた物を取り出す。', '食', 'た'],
  ['食べた物を取り出す。', '物', 'もの'],
  ['食べた物を取り出す。', '取り出', 'とりだ'],
  ['日本語を勉強します。', '日本語', 'にほんご'],
  ['日本語を勉強します。', '勉強', 'べんきょう'],
  ['学校で本を読む。', '学校', 'がっこう'],
  ['学校で本を読む。', '本', 'ほん'],
  ['学校で本を読む。', '読', 'よ'],
] as const;

test('reviewed readings: phrase fixes, inflections, and separate ordinary sentences', () => {
  for (const [text, surface, expected] of cases) {
    const actual = analyze(text, tokenize).find(a => text.slice(a.start, a.end) === surface);
    assert.equal(actual?.reading, expected, `${text}: ${surface}`);
  }
  console.log(`Reviewed readings: ${cases.length}/${cases.length}; local Node dictionary initialization ${loadMs} ms. This is a small fixture set, not a general accuracy estimate.`);
});

test('abstains on unsupported names, homographs, and split dates/counters', () => {
  for (const [text, surface] of [
    ['生物を研究する。', '生物'], ['生物を食べる。', '生物'],
    ['一年の間に変化した。', '間'], ['国分さんに会う。', '国分'],
    ['一日近くおいて作ります。', '日'], ['一日に出発します。', '日'],
    ['三人で三本買った。', '本'], ['三人で三本買った。', '人'],
  ]) assert.ok(!analyze(text, tokenize).some(a => text.slice(a.start, a.end) === surface), `${text}: ${surface}`);
});

test('context and scope isolate corrections; explicit user readings outrank phrase rules', () => {
  const rule: Correction = { id: 'test', scope: 'document', target: 'https://example.test/a', context: '生物を食べる', surface: '生物', reading: 'ナマモノ' };
  validateCorrection(rule);
  assert.equal(matchingCorrections([rule], 'https://example.test/a#section').length, 1);
  assert.equal(matchingCorrections([rule], 'https://example.test/b').length, 0);
  const text = '生物を食べる。生物を研究する。';
  const actual = analyze(text, tokenize, [rule]).filter(a => text.slice(a.start, a.end) === '生物');
  assert.deepEqual(actual.map(a => a.reading), ['なまもの']);
  const override = { ...rule, context: '大豆を一ばん水にひたし', surface: '一', reading: 'いち' };
  assert.equal(analyze(override.context, tokenize, [override]).find(a => a.start === 3)?.source, 'user');
  const site = { ...rule, scope: 'site' as const, target: 'https://example.test' };
  assert.equal(matchingCorrections([site], 'https://example.test/b').length, 1);
  assert.equal(matchingCorrections([site], 'https://other.test/a').length, 0);
  assert.deepEqual(matchingCorrections([site, rule], 'https://example.test/a'), [rule, site]);
  assert.throws(() => validateCorrection({ ...rule, reading: '<script>' }));
  assert.throws(() => validateCorrection({ ...rule, surface: '別' }));
});

test('offsets retain original spelling, whitespace, and astral characters', () => {
  const text = '😀 学校で本を読む。';
  assert.equal(analyze(text, tokenize).find(a => text.slice(a.start, a.end) === '学校')?.start, 3);
  assert.throws(() => analyze('学校', () => [{ surface_form: '学', word_type: 'KNOWN', reading: 'ガク' }, { surface_form: '違う', word_type: 'KNOWN' }]), /offsets/);
});
