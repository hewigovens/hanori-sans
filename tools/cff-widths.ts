import assert from 'node:assert/strict';

function index(bytes: Buffer, at: number) {
  const count = bytes.readUInt16BE(at);
  if (!count) return { items: [] as Buffer[], end: at + 2 };
  const size = bytes[at + 2];
  assert(size >= 1 && size <= 4, 'Invalid CFF INDEX offset size');
  const data = at + 3 + (count + 1) * size - 1;
  const offset = (i: number) => bytes.readUIntBE(at + 3 + i * size, size);
  assert(data + offset(count) <= bytes.length, 'CFF INDEX outside table');
  return { items: Array.from({ length: count }, (_, i) => bytes.subarray(data + offset(i), data + offset(i + 1))), end: data + offset(count) };
}
function number(bytes: Buffer, at: number, dict: boolean): [number, number] {
  const b = bytes[at];
  if (b >= 32 && b <= 246) return [b - 139, at + 1];
  if (b >= 247 && b <= 250) return [(b - 247) * 256 + bytes[at + 1] + 108, at + 2];
  if (b >= 251 && b <= 254) return [-(b - 251) * 256 - bytes[at + 1] - 108, at + 2];
  if (b === 28) return [bytes.readInt16BE(at + 1), at + 3];
  if (dict && b === 29) return [bytes.readInt32BE(at + 1), at + 5];
  if (!dict && b === 255) return [bytes.readInt32BE(at + 1) / 65536, at + 5];
  if (dict && b === 30) {
    // Real DICT operands are unrelated to the integer offsets and widths used here.
    do { at++; assert(at < bytes.length, 'Truncated CFF real operand'); }
    while ((bytes[at] & 15) !== 15 && (bytes[at] >> 4) !== 15);
    return [NaN, at + 1];
  }
  throw new Error(`Unsupported CFF operand ${b}`);
}
function dict(bytes: Buffer) {
  const result = new Map<number, number[]>();
  let stack: number[] = [];
  for (let at = 0; at < bytes.length;) {
    const b = bytes[at];
    if (b <= 21) { result.set(b === 12 ? 1200 + bytes[at + 1] : b, stack); stack = []; at += b === 12 ? 2 : 1; }
    else { const [value, next] = number(bytes, at, true); stack.push(value); at = next; }
  }
  return result;
}

/** Read only the width prefix, not the potentially huge composed glyph outline.
 * https://learn.microsoft.com/typography/opentype/spec/cff
 */
export function cffWidths(bytes: Buffer) {
  assert.equal(bytes[0], 1, 'Expected CFF1');
  const names = index(bytes, bytes[2]), tops = index(bytes, names.end), strings = index(bytes, tops.end);
  assert.equal(tops.items.length, 1);
  const top = dict(tops.items[0]), globals = index(bytes, strings.end).items;
  const charstrings = index(bytes, top.get(17)![0]).items;
  const fdDicts = top.has(1236) ? index(bytes, top.get(1236)![0]).items.map(dict) : [top];
  const privates = fdDicts.map(fd => {
    const [size, at] = fd.get(18)!;
    const pd = dict(bytes.subarray(at, at + size));
    return { defaultWidth: pd.get(20)?.[0] ?? 0, nominalWidth: pd.get(21)?.[0] ?? 0,
      local: pd.has(19) ? index(bytes, at + pd.get(19)![0]).items : [] };
  });
  function privateFor(gid: number) {
    const select = top.get(1237)?.[0];
    if (select === undefined) return privates[0];
    if (bytes[select] === 0) return privates[bytes[select + 1 + gid]];
    assert.equal(bytes[select], 3, 'Unsupported CFF FDSelect');
    for (let i = 0; i < bytes.readUInt16BE(select + 1); i++) {
      const range = select + 3 + i * 3;
      if (gid < bytes.readUInt16BE(range + 3)) return privates[bytes[range + 2]];
    }
    throw new Error(`No CFF Private DICT for glyph ${gid}`);
  }
  return (gid: number) => {
    const pd = privateFor(gid), stack: number[] = [];
    const nominal = () => pd.nominalWidth + stack[0];
    function prefix(code: Buffer, depth = 0): number | undefined {
      assert(depth <= 10, 'Excessive CFF subroutine nesting');
      for (let at = 0; at < code.length;) {
        const b = code[at];
        if (b === 28 || b >= 32) { const [value, next] = number(code, at, false); stack.push(value); at = next; continue; }
        at++;
        if ([1, 3, 18, 19, 20, 23].includes(b)) return stack.length % 2 ? nominal() : pd.defaultWidth;
        if (b === 4 || b === 22) return stack.length > 1 ? nominal() : pd.defaultWidth;
        if (b === 21) return stack.length > 2 ? nominal() : pd.defaultWidth;
        if (b === 14) return stack.length === 1 || stack.length === 5 ? nominal() : pd.defaultWidth;
        if (b === 11) return undefined;
        assert(b === 10 || b === 29, `Unsupported operator ${b} before CFF width`);
        const subrs = b === 10 ? pd.local : globals;
        const bias = subrs.length < 1240 ? 107 : subrs.length < 33900 ? 1131 : 32768;
        const subr = subrs[stack.pop()! + bias];
        assert(subr, 'Invalid CFF subroutine');
        const width = prefix(subr, depth + 1);
        if (width !== undefined) return width;
      }
      return undefined;
    }
    const width = prefix(charstrings[gid]);
    assert(width !== undefined, `No CFF width for glyph ${gid}`);
    return width;
  };
}
