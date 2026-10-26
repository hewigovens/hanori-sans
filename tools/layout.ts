import assert from 'node:assert/strict';

export function* pairSets(table: Buffer) {
  const list = table.readUInt16BE(8);
  for (let i = 0; i < table.readUInt16BE(list); i++) {
    const lookup = list + table.readUInt16BE(list + 2 + i * 2);
    const type = table.readUInt16BE(lookup);
    for (let j = 0; j < table.readUInt16BE(lookup + 4); j++) {
      let subtable = lookup + table.readUInt16BE(lookup + 6 + j * 2), subType = type;
      if (type === 9) { subType = table.readUInt16BE(subtable + 2); subtable += table.readUInt32BE(subtable + 4); }
      if (subType !== 2 || table.readUInt16BE(subtable) !== 1) continue;
      const bits = (n: number): number => n ? 1 + bits(n & (n - 1)) : 0;
      const stride = 2 + 2 * (bits(table.readUInt16BE(subtable + 4)) + bits(table.readUInt16BE(subtable + 6)));
      for (let k = 0; k < table.readUInt16BE(subtable + 8); k++) {
        const set = subtable + table.readUInt16BE(subtable + 10 + k * 2);
        yield { start: set + 2, count: table.readUInt16BE(set), stride };
      }
    }
  }
}

/** ot-builder 1.8.1 emits some remapped PairSets in donor order. HarfBuzz and
 * Core Text binary-search them, so sort by the destination second-glyph ID.
 * Records keep their size and their subtable-relative device offsets.
 */
export function sortPairSets(table: Buffer) {
  for (const { start, count, stride } of pairSets(table)) {
    const records = Array.from({ length: count }, (_, i) => Buffer.from(table.subarray(start + i * stride, start + (i + 1) * stride)));
    records.sort((a, b) => a.readUInt16BE(0) - b.readUInt16BE(0));
    records.forEach((record, i) => record.copy(table, start + i * stride));
  }
}

const u16 = (...values: number[]) => {
  const bytes = Buffer.alloc(values.length * 2);
  values.forEach((value, i) => bytes.writeUInt16BE(value, i * 2));
  return bytes;
};
interface Language { required: number; features: number[] }
function readLanguage(table: Buffer, offset: number): Language {
  assert.equal(table.readUInt16BE(offset), 0, 'Unexpected LangSys lookup order');
  return { required: table.readUInt16BE(offset + 2), features: Array.from({ length: table.readUInt16BE(offset + 4) }, (_, i) => table.readUInt16BE(offset + 6 + i * 2)) };
}
function languageBytes(language: Language) { return u16(0, language.required, language.features.length, ...language.features); }

/** Serialize an OpenType tag/offset list; all child offsets are relative to it. */
function tagList(entries: [string, Buffer][], prefix: Buffer = Buffer.alloc(0)) {
  const sorted = entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  let offset = prefix.length + 2 + sorted.length * 6;
  const records = sorted.map(([tag, bytes]) => {
    const record = Buffer.concat([Buffer.from(tag, 'ascii'), u16(offset)]);
    offset += bytes.length;
    return record;
  });
  return Buffer.concat([prefix, u16(sorted.length), ...records, ...sorted.map(([, bytes]) => bytes)]);
}

/** Change only ScriptList. Feature and lookup bytes (including glyph IDs) stay intact. */
export function japaneseReadingsOnly(table: Buffer): Buffer {
  assert.equal(table.readUInt32BE(0), 0x00010000, 'Unsupported GSUB version');
  const scriptOffset = table.readUInt16BE(4), featureOffset = table.readUInt16BE(6), lookupOffset = table.readUInt16BE(8);
  assert(scriptOffset >= 10 && scriptOffset < featureOffset && featureOffset < lookupOffset, 'Unexpected GSUB section order');
  const ruby = new Set<number>();
  for (let i = 0; i < table.readUInt16BE(featureOffset); i++) {
    if (table.toString('ascii', featureOffset + 2 + i * 6, featureOffset + 6 + i * 6) === 'rclt') ruby.add(i);
  }
  assert(ruby.size, 'No automatic furigana feature');
  const plain = (language: Language): Language => ({ required: ruby.has(language.required) ? 65535 : language.required,
    features: language.features.filter(feature => !ruby.has(feature)) });
  const scripts: [string, Buffer][] = [];
  for (let i = 0; i < table.readUInt16BE(scriptOffset); i++) {
    const record = scriptOffset + 2 + i * 6;
    const tag = table.toString('ascii', record, record + 4), offset = scriptOffset + table.readUInt16BE(record + 4);
    const defaultOffset = table.readUInt16BE(offset);
    const defaultLanguage = defaultOffset ? plain(readLanguage(table, offset + defaultOffset)) : undefined;
    const languages = new Map<string, Language>();
    for (let j = 0; j < table.readUInt16BE(offset + 2); j++) {
      const r = offset + 4 + j * 6;
      languages.set(table.toString('ascii', r, r + 4), plain(readLanguage(table, offset + table.readUInt16BE(r + 4))));
    }
    if (['DFLT', 'hani', 'kana'].includes(tag)) {
      const japanese = languages.get('JAN ') ?? defaultLanguage ?? { required: 65535, features: [] };
      languages.set('JAN ', { ...japanese, features: [...new Set([...japanese.features, ...ruby])].sort((a, b) => a - b) });
    }
    const defaultBytes = defaultLanguage ? languageBytes(defaultLanguage) : Buffer.alloc(0);
    const bytes = tagList([...languages].map(([tag, language]) => [tag, languageBytes(language)]), u16(defaultLanguage ? 4 + languages.size * 6 : 0));
    scripts.push([tag, Buffer.concat([bytes.subarray(0, 4 + languages.size * 6), defaultBytes, bytes.subarray(4 + languages.size * 6)])]);
    // The default LangSys precedes the named languages, so move their offsets.
    const script = scripts.at(-1)![1];
    for (let j = 0; j < languages.size; j++) script.writeUInt16BE(script.readUInt16BE(8 + j * 6) + defaultBytes.length, 8 + j * 6);
  }
  const scriptList = tagList(scripts);
  return Buffer.concat([u16(1, 0, 10, 10 + scriptList.length, 10 + scriptList.length + lookupOffset - featureOffset), scriptList, table.subarray(featureOffset)]);
}
