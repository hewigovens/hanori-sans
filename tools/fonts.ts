import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { FontIo, Ot, Rectify, CliProc } from 'ot-builder';
import { buildFont, loadConfig } from 'furifont';
import * as hb from 'harfbuzzjs';
import { unionOutline } from './outlines.ts';
import { japaneseReadingsOnly, sortPairSets } from './layout.ts';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const at = (...paths: string[]) => join(root, ...paths);
export const readJSON = async <T>(...paths: string[]): Promise<T> => JSON.parse(await readFile(at(...paths), 'utf8'));
export const writeJSON = async (path: string, value: unknown) => writeFile(at(path), JSON.stringify(value, null, 2) + '\n');
export interface Family {
  id: string;
  name: string;
  latin: string;
  latinName: string;
  cjk: string;
  cjkName: string;
  axes: Record<string, number>;
  credits: string;
}
export const families = await readJSON<Family[]>('families.json');
export const { version } = await readJSON<{ version: string }>('package.json');
const [major, minor, patch] = version.split('.').map(Number);
export const fontVersion = `${major}.${minor}${String(patch).padStart(2, '0')}`;
export const buildTime = new Date('2026-10-26T00:00:00Z');
export const stem = (family: Family) => family.name.replaceAll(' ', '');
export const reportPath = (family: Family, name: string) => `dist/${family.id === 'sans' ? '' : family.id + '-'}${name}.json`;
export const basePath = (family: Family) => `build/${stem(family)}Base-Regular.otf`;
export const fontPath = (family: Family, ruby = false) => `dist/${stem(family)}${ruby ? 'Furigana' : ''}-Regular.otf`;
export const disabledFeatures = new Set(['liga', 'dlig', 'pwid', 'palt', 'halt', 'locl']);
export type Font = Ot.Font<Ot.ListGlyphStore>;
export const readFont = async (path: string): Promise<Font> => FontIo.readFont(FontIo.readSfntOtf(await readFile(at(path))), Ot.ListGlyphStoreFactory);
export const writeFont = async (path: string, font: Font) => {
  font.head.created = font.head.modified = buildTime;
  const sfnt = FontIo.writeFont(font);
  const gpos = sfnt.tables.get('GPOS');
  if (gpos) sortPairSets(gpos);
  await writeFile(at(path), FontIo.writeSfntOtf(sfnt));
};
export const advance = (glyph: Ot.Glyph) => Ot.Var.Ops.originOf(glyph.horizontal.end) - Ot.Var.Ops.originOf(glyph.horizontal.start);
export const latinCodepoint = (cp: number) => (cp >= 0x20 && cp <= 0x7e)
  || (((cp >= 0xa0 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) && /\p{L}/u.test(String.fromCodePoint(cp)));

export async function loadLatin(family: Family): Promise<Font> {
  const font = await readFont(`sources/${family.latin}`);
  if (!font.fvar) return font;
  const instance = new Map<Ot.Var.Dim, number>();
  for (const { dim } of font.fvar.axes) {
    const value = family.axes[dim.tag];
    assert(value !== undefined && value >= dim.min && value <= dim.max, `Pin ${dim.tag} within its source range`);
    let normalized = value === dim.default ? 0 : value < dim.default
      ? (value - dim.default) / (dim.default - dim.min) : (value - dim.default) / (dim.max - dim.default);
    const segments = font.avar?.segmentMaps.get(dim);
    if (segments) {
      for (let i = 1; i < segments.length; i++) {
        const [x0, y0] = segments[i - 1], [x1, y1] = segments[i];
        if (normalized >= x0 && normalized <= x1) {
          normalized = y0 + (normalized - x0) * (y1 - y0) / (x1 - x0);
          break;
        }
      }
    }
    instance.set(dim, normalized);
  }
  const evaluate = (value: Ot.Var.Value) => Math.round(Ot.Var.Ops.evaluate(value, instance));
  Rectify.inPlaceRectifyFontCoords({ coord: evaluate, cv: evaluate }, Rectify.IdPointAttachmentRectifier, font);
  font.fvar = font.avar = null;
  font.stat = null;
  return font;
}

function renameBase(font: Font, family: Family, copyright: string) {
  assert(Ot.Font.isCff(font), 'Hanori requires a CFF source');
  const name = family.name + ' Base';
  const postscript = stem(family) + 'Base-Regular';
  const names = new Map<number, string>([
    [1, name], [2, 'Regular'], [3, `${fontVersion};${postscript}`], [4, `${name} Regular`],
    [5, `Version ${fontVersion}`], [6, postscript], [16, name], [17, 'Regular'],
    [9, family.credits], [13, 'Licensed under the SIL Open Font License, Version 1.1.'], [14, 'https://openfontlicense.org/'],
    [10, `${family.latinName} Latin + ${family.cjkName}. Simplified Chinese forms; full-width Han.`],
  ]);
  if (copyright) names.set(0, `${font.name?.records.find(r => r.nameID === 0)?.value}; ${copyright}`);
  assert(font.name);
  font.name.records = font.name.records.filter(r => !names.has(r.nameID));
  for (const [nameID, value] of names) {
    font.name.records.push({ platformID: 3, encodingID: 1, languageID: 0x409, nameID, value });
  }
  font.cff.postScriptFontName = postscript;
  font.cff.topDict.familyName = name;
  font.cff.topDict.fullName = `${name} Regular`;
  font.cff.topDict.version = fontVersion;
  font.head.fontRevision = Number(fontVersion);
}

function transferKerning(font: Font, donor: Font, mapping: Map<Ot.Glyph, Ot.Glyph>) {
  assert(donor.gpos && font.gpos && font.gdef && donor.gdef);
  const source = donor.gpos;
  source.features = source.features.filter(f => f.tag === 'kern');
  const needed = new Set<Ot.Gpos.Lookup>();
  function visit(lookup: Ot.Gpos.Lookup) {
    if (needed.has(lookup)) return;
    needed.add(lookup);
    if (lookup.type === Ot.Gpos.LookupType.Chaining) {
      for (const rule of lookup.rules) for (const app of rule.applications) visit(app.apply);
    }
  }
  for (const feature of source.features) for (const lookup of feature.lookups) visit(lookup);
  source.lookups = source.lookups.filter(l => needed.has(l));
  const glyphRef = { glyphRef: (glyph: Ot.Glyph) => mapping.get(glyph) };
  const transferred = Rectify.rectifyGposTable(glyphRef, Rectify.IdAxisRectifier, Rectify.IdCoordRectifier, Rectify.IdPointAttachmentRectifier, source);
  assert(transferred, 'No Latin kerning survived subsetting');
  const roots = [...new Set(transferred.features.flatMap(f => f.lookups))];
  assert(roots.length, 'No Latin kerning roots');
  font.gpos.lookups.push(...transferred.lookups);
  for (const feature of font.gpos.features) if (feature.tag === 'kern') feature.lookups = roots;
  const gdef = Rectify.rectifyGdefTable(glyphRef, Rectify.IdCoordRectifier, Rectify.IdPointAttachmentRectifier, donor.gdef);
  font.gdef.glyphClassDef ??= new Map();
  for (const [glyph, cls] of gdef.glyphClassDef ?? []) font.gdef.glyphClassDef.set(glyph, cls);
  // ot-builder keeps filtering sets and contextual references as object links;
  // its writer remaps glyph IDs, nested lookups, and GDEF filtering-set indices.
  font.gdef.markGlyphSets = [...(font.gdef.markGlyphSets ?? []), ...(gdef.markGlyphSets ?? [])];
  return transferred.lookups.length;
}

export async function buildBase(family: Family) {
  const font = await readFont(`sources/${family.cjk}`);
  const donor = await loadLatin(family);
  assert(font.cmap && donor.cmap);
  const originalUpm = donor.head.unitsPerEm;
  const bytes = await readFile(at('sources', family.latin));
  const hbFont = new hb.Font(new hb.Face(new hb.Blob(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))));
  hbFont.setVariations(Object.entries(family.axes).map(([tag, value]) => new hb.Variation(tag, value)));
  CliProc.rebaseFont(donor, font.head.unitsPerEm);
  const replacements = new Map<Ot.Glyph, Ot.Glyph>();
  const mapping = new Map<Ot.Glyph, Ot.Glyph>();
  for (const [cp, target] of [...font.cmap.unicode.entries()].sort(([a], [b]) => a - b)) {
    const source = donor.cmap.unicode.get(cp);
    if (!source || !latinCodepoint(cp)) continue;
    if (replacements.has(target)) {
      assert.equal(replacements.get(target), source, `Ambiguous Latin alias U+${cp.toString(16)}`);
      continue;
    }
    replacements.set(target, source);
    mapping.set(source, target);
    target.geometry = Ot.Font.isTtf(donor)
      ? await unionOutline(hbFont.glyphToPath(hbFont.nominalGlyph(cp)!), font.head.unitsPerEm / originalUpm)
      : source.geometry;
    target.horizontal = { start: 0, end: Math.round(advance(source)) };
    target.hints = null;
  }
  const kerning = transferKerning(font, donor, mapping);
  for (const table of [font.gsub, font.gpos]) {
    assert(table);
    for (const feature of table.features) if (disabledFeatures.has(feature.tag)) feature.lookups = [];
  }
  renameBase(font, family, String(donor.name?.records.find(r => r.nameID === 0)?.value));
  await mkdir(at('build'), { recursive: true });
  await mkdir(at('dist'), { recursive: true });
  await writeFont(basePath(family), font);
  const report = { family: family.name, latin_glyphs_replaced: replacements.size, latin_kerning_lookups: kerning,
    glyph_count: font.glyphs.decideOrder().length, cjk_units_per_em: font.head.unitsPerEm };
  await writeJSON(reportPath(family, 'base-report'), report);
  console.log(report);
}

export async function buildReadings(family: Family) {
  process.env.SOURCE_DATE_EPOCH ??= String(buildTime.getTime() / 1000);
  const defaults = await loadConfig(root);
  for (const ruby of [true, false]) {
    const config = { ...defaults, version, base: basePath(family), family: family.name + (ruby ? ' Furigana' : '') };
    let previousStep: string | undefined;
    const result = await buildFont(config, { cwd: root, outDir: at('dist'), onProgress({ step }) {
      if (step !== previousStep) console.log(`${config.family}: ${previousStep = step}`);
    } });
    if (ruby) {
      await writeJSON(reportPath(family, 'furigana-report'), { version: config.version, compiler: 'furifont@0.6.2', config,
        stats: result.report.stats, files: result.files.map(({ name, bytes }) => ({ name, bytes })) });
    } else {
      const sfnt = FontIo.readSfntOtf(await readFile(at(fontPath(family))));
      const gsub = sfnt.tables.get('GSUB');
      assert(gsub);
      sfnt.tables.set('GSUB', japaneseReadingsOnly(gsub));
      sfnt.tables.get('head')!.writeUInt32BE(0, 8);
      await writeFile(at(fontPath(family)), FontIo.writeSfntOtf(sfnt));
      for (const file of result.files) if (file.name.endsWith('.ivs.json')) await rm(file.path);
    }
  }
  console.log(`Built ${family.name} and ${family.name} Furigana`);
}
