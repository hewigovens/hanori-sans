import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { FontIo, Ot } from 'ot-builder';
import * as hb from 'harfbuzzjs';
import { at, basePath, disabledFeatures, families, fontPath, fontVersion, latinCodepoint, writeJSON } from './fonts.ts';
import { cffWidths } from './cff-widths.ts';
import { pairSets } from './layout.ts';

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + (((bytes[i] ?? 0) * 0x1000000) + ((bytes[i + 1] ?? 0) << 16) + ((bytes[i + 2] ?? 0) << 8) + (bytes[i + 3] ?? 0))) >>> 0;
  }
  return sum;
}

function checkSfnt(bytes: Buffer) {
  assert.equal(checksum(bytes), 0xb1b0afba, 'Invalid font checksum');
  const tags = new Set<string>();
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const record = 12 + i * 16;
    const tag = bytes.toString('ascii', record, record + 4);
    const offset = bytes.readUInt32BE(record + 8), length = bytes.readUInt32BE(record + 12);
    assert(!tags.has(tag) && offset % 4 === 0 && offset + length <= bytes.length, `Invalid table ${tag}`);
    tags.add(tag);
    const data = Buffer.from(bytes.subarray(offset, offset + length));
    if (tag === 'head') data.writeUInt32BE(0, 8);
    assert.equal(checksum(data), bytes.readUInt32BE(record + 4), `Invalid ${tag} checksum`);
  }
  for (const tag of ['CFF ', 'cmap', 'name', 'head', 'hmtx', 'maxp', 'OS/2', 'GSUB', 'GPOS', 'GDEF']) assert(tags.has(tag), `Missing ${tag}`);
}

export async function shapingFont(path: string, axes: Record<string, number> = {}) {
  const bytes = await readFile(at(path));
  const face = new hb.Face(new hb.Blob(bytes));
  const font = new hb.Font(face);
  font.setVariations(Object.entries(axes).map(([tag, value]) => new hb.Variation(tag, value)));
  return { font, face, bytes, tables: FontIo.readSfntOtf(bytes).tables };
}

export function shape(loaded: Awaited<ReturnType<typeof shapingFont>>, text: string, language?: string, kern = true) {
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  buffer.setLanguage(language ?? 'und');
  hb.shape(loaded.font, buffer, [new hb.Feature('liga', 0), new hb.Feature('kern', Number(kern))]);
  const ids = buffer.getGlyphInfos().map(g => g.codepoint);
  assert(!ids.includes(0), `Missing glyph in ${text}`);
  return { ids, width: buffer.getGlyphPositions().reduce((sum, g) => sum + g.xAdvance, 0) };
}

function checkCoverages(font: Ot.Font) {
  const ids = new Map([...font.glyphs.decideOrder()].map((g, i) => [g, i]));
  const seen = new Set<object>();
  function walk(value: unknown) {
    if (typeof value !== 'object' || value === null || seen.has(value) || ids.has(value as Ot.Glyph)) return;
    seen.add(value);
    if (value instanceof Set) {
      const coverage = [...value];
      if (coverage.length && coverage.every(g => ids.has(g))) {
        const order = coverage.map(g => ids.get(g)!);
        assert.deepEqual(order, [...order].sort((a, b) => a - b), 'Unsorted layout coverage');
      }
      for (const child of value) walk(child);
    } else if (value instanceof Map) {
      for (const [key, child] of value) { walk(key); walk(child); }
    } else for (const child of Object.values(value)) walk(child);
  }
  for (const table of [font.gsub, font.gpos, font.gdef]) walk(table);
}

const isHan = (cp: number) => (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x20000 && cp <= 0x3134f);
const kerningSamples = ['AVATAR', 'To Wa Ty Yo.', "A quiet morning. Let's read together.", 'office affinity efficient', 'Tfi Tfl ffi ffj', 'WAVY 0123456789'];

export async function verifyFonts() {
  const reports = [];
  for (const family of families) {
    const sourceHb = await shapingFont(`sources/${family.cjk}`), donorHb = await shapingFont(`sources/${family.latin}`, family.axes);
    const plainHb = await shapingFont(basePath(family)), rubyHb = await shapingFont(fontPath(family, true));
    assert.notDeepEqual(shape(rubyHb, '日本語', 'en').ids, shape(plainHb, '日本語', 'en').ids, `No always-on readings in ${family.name}`);
    for (const ruby of [false, true]) {
      const path = fontPath(family, ruby), shaped = await shapingFont(path);
      checkSfnt(shaped.bytes);
      assert.equal(shaped.face.getName(1, 'en'), family.name + (ruby ? ' Furigana' : ''));
      assert.equal(shaped.face.getName(6, 'en'), basename(path, '.otf'));
      assert.equal(shaped.face.getName(5, 'en'), `Version ${fontVersion}`);
      assert.equal(shaped.tables.get('OS/2')!.readUInt16BE(8), 0);
      const glyphCount = shaped.tables.get('maxp')!.readUInt16BE(4);
      assert(glyphCount <= 65535);
      for (const cp of sourceHb.face.collectUnicodes()) assert(shaped.font.nominalGlyph(cp), `Lost U+${cp.toString(16)}`);
      let hanCount = 0;
      for (const cp of shaped.face.collectUnicodes()) {
        const glyph = shaped.font.nominalGlyph(cp)!;
        if (isHan(cp)) {
          hanCount++;
          assert.equal(shaped.font.glyphHAdvance(glyph), shaped.face.upem, `Uneven Han advance U+${cp.toString(16)}`);
          assert.deepEqual(shaped.font.glyphToJson(glyph), sourceHb.font.glyphToJson(sourceHb.font.nominalGlyph(cp)!), `Changed Chinese outline U+${cp.toString(16)}`);
        }
        if (latinCodepoint(cp) && sourceHb.font.nominalGlyph(cp) && donorHb.font.nominalGlyph(cp)) {
          const expected = Math.round(donorHb.font.glyphHAdvance(donorHb.font.nominalGlyph(cp)!) * shaped.face.upem / donorHb.face.upem);
          assert.equal(shaped.font.glyphHAdvance(glyph), expected, `Changed Latin advance U+${cp.toString(16)}`);
        }
      }
      for (const table of ['GSUB', 'GPOS'] as const) {
        shaped.face.getTableFeatureTags(table).forEach((tag, i) => {
          if (disabledFeatures.has(tag)) assert.equal(shaped.face.getFeatureLookups(table, i).length, 0, `Enabled ${tag}`);
        });
      }
      const gpos = shaped.tables.get('GPOS')!;
      for (const { start, count, stride } of pairSets(gpos)) {
        const ids = Array.from({ length: count }, (_, i) => gpos.readUInt16BE(start + i * stride));
        assert.deepEqual(ids, [...new Set(ids)].sort((a, b) => a - b), 'PairSet glyphs must be sorted and unique');
      }
      // Layout needs glyph identities and metrics, not millions of outline
      // points. Supply empty in-memory outlines to the layout reader only.
      const layout = FontIo.readSfntOtf(shaped.bytes);
      layout.tables.delete('CFF ');
      layout.tables.set('glyf', Buffer.alloc(0));
      layout.tables.set('loca', Buffer.alloc((glyphCount + 1) * 4));
      const head = Buffer.from(layout.tables.get('head')!);
      head.writeInt16BE(1, 50);
      layout.tables.set('head', head);
      checkCoverages(FontIo.readFont(layout, Ot.ListGlyphStoreFactory));
      const width = cffWidths(shaped.tables.get('CFF ')!);
      for (let cp = 32; cp < 127; cp++) {
        const gid = shaped.font.nominalGlyph(cp)!;
        assert.equal(width(gid), shaped.font.glyphHAdvance(gid), `CFF/hmtx mismatch at U+${cp.toString(16)}`);
      }
      for (const text of ['今天是星期一，我们一起学习中文。', '今日は日本語の勉強をします。', '今日', '日本', '東京']) {
        for (const language of [undefined, 'en', 'zh-Hans', 'ja']) {
          const result = shape(shaped, text, language);
          const expected = shape(ruby || language === 'ja' ? rubyHb : plainHb, text, language);
          assert.deepEqual(result, expected, `Wrong readings for ${family.name}, ${language ?? 'no hint'}`);
        }
      }
      for (const text of kerningSamples) {
        const expected = (shape(donorHb, text, 'en').width - shape(donorHb, text, 'en', false).width) * shaped.face.upem / donorHb.face.upem;
        const actual = shape(shaped, text, 'en').width - shape(shaped, text, 'en', false).width;
        assert(Math.abs(actual - expected) <= text.length * 0.6, `Latin kerning differs from source: ${family.name} ${text}`);
      }
      reports.push({ file: basename(path), family: family.name + (ruby ? ' Furigana' : ''), glyphs: glyphCount,
        codepoints: shaped.face.collectUnicodes().length, full_width_han_checked: hanCount, sha256: sha256(shaped.bytes) });
      console.log(`Verified ${basename(path)}: ${hanCount} Chinese outlines, Latin metrics/kerning, and language hints`);
    }
  }
  assert.deepEqual((await readdir(at('dist'))).filter(p => p.endsWith('.otf')).sort(), reports.map(r => r.file).sort());
  await writeJSON('dist/validation.json', { checks: ['font and table checksums', 'font tables load', 'base coverage retained', 'full-width Han',
    'all Chinese Han outlines retained', 'Latin source widths and kerning', 'CFF/hmtx consistency', 'sorted layout coverages',
    'locale substitutions disabled', 'language-dependent furigana', 'embedding permitted'], fonts: reports });
}
