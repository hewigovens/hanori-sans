import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { FontIo } from 'ot-builder';
import * as hb from 'harfbuzzjs';
import { at } from './fonts.ts';
import { japaneseReadingsOnly, pairSets, sortPairSets } from './layout.ts';

function glyphs(bytes: Buffer, language: string, script = 'Hani', text = '日本語', kern = true) {
  const font = new hb.Font(new hb.Face(new hb.Blob(bytes)));
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  buffer.setLanguage(language);
  buffer.setScript(script);
  hb.shape(font, buffer, [new hb.Feature('liga', 0), new hb.Feature('kern', Number(kern))]);
  return { ids: buffer.getGlyphInfos().map(g => g.codepoint), width: buffer.getGlyphPositions().reduce((sum, g) => sum + g.xAdvance, 0) };
}

test('Japanese-only rules preserve lookup bytes, shaping, and repeated application', async () => {
  const bytes = await readFile(at('dist/HanoriSansFurigana-Regular.otf'));
  const sfnt = FontIo.readSfntOtf(bytes), original = sfnt.tables.get('GSUB')!;
  const selected = japaneseReadingsOnly(original);
  assert.deepEqual(selected.subarray(selected.readUInt16BE(6)), original.subarray(original.readUInt16BE(6)));
  assert.deepEqual(japaneseReadingsOnly(selected), selected);
  sfnt.tables.set('GSUB', selected);
  sfnt.tables.get('head')!.writeUInt32BE(0, 8);
  const result = FontIo.writeSfntOtf(sfnt);
  const base = await readFile(at('build/HanoriSansBase-Regular.otf'));
  for (const script of ['Hani', 'Kana', 'Zzzz']) {
    assert.deepEqual(glyphs(result, 'ja', script), glyphs(bytes, 'ja', script));
    for (const language of ['und', 'en', 'zh-Hans']) assert.deepEqual(glyphs(result, language, script), glyphs(base, language, script));
    assert.notDeepEqual(glyphs(result, 'ja', script).ids, glyphs(base, 'ja', script).ids);
  }
});

test('remapped PairSets must be sorted for HarfBuzz contextual kerning', async () => {
  const bytes = await readFile(at('build/HanoriSansBase-Regular.otf'));
  const sfnt = FontIo.readSfntOtf(bytes), original = sfnt.tables.get('GPOS')!;
  const scrambled = Buffer.from(original);
  for (const { start, count, stride } of pairSets(scrambled)) {
    const records = Array.from({ length: count }, (_, i) => Buffer.from(scrambled.subarray(start + i * stride, start + (i + 1) * stride))).reverse();
    records.forEach((record, i) => record.copy(scrambled, start + i * stride));
  }
  sfnt.tables.set('GPOS', scrambled);
  sfnt.tables.get('head')!.writeUInt32BE(0, 8);
  const broken = FontIo.writeSfntOtf(sfnt);
  const kern = (data: Buffer) => glyphs(data, 'en', 'Latn', 'office affinity efficient').width
    - glyphs(data, 'en', 'Latn', 'office affinity efficient', false).width;
  assert.notEqual(kern(broken), kern(bytes));
  sortPairSets(scrambled);
  assert.deepEqual(scrambled, original);
  sfnt.tables.get('head')!.writeUInt32BE(0, 8);
  assert.equal(kern(FontIo.writeSfntOtf(sfnt)), kern(bytes));
});
