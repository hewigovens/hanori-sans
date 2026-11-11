export interface Token {
  surface_form: string;
  reading?: string;
  word_type: string;
  pos_detail_1?: string;
}
export interface Annotation {
  start: number;
  end: number;
  reading: string;
  source: 'analyzer' | 'phrase' | 'user';
}
export interface Correction {
  id: string;
  scope: 'document' | 'site';
  target: string;
  context: string;
  surface: string;
  reading: string;
}

export const hiragana = (value: string) => value.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const documentKey = (url: string) => { const parsed = new URL(url); parsed.hash = ''; return parsed.href; };

export function validateCorrection(value: Correction) {
  if (!value || !['document', 'site'].includes(value.scope) || typeof value.target !== 'string' ||
      typeof value.context !== 'string' || typeof value.surface !== 'string' || typeof value.reading !== 'string' ||
      !value.context || value.context.length > 500 || !value.surface || value.surface.length > 100 ||
      !value.context.includes(value.surface) || !/\p{Script=Han}/u.test(value.surface) ||
      !/^[ぁ-ゖァ-ヶー]{1,100}$/.test(value.reading)) {
    throw new Error('Enter a context phrase containing the written word, and a kana reading (up to 100 characters).');
  }
}

export function matchingCorrections(values: Correction[], url: string) {
  const parsed = new URL(url);
  // Document rules outrank site rules.
  return values.filter(c => c.scope === 'document' ? c.target === documentKey(url) : parsed.protocol !== 'file:' && c.target === parsed.origin)
    .sort((a, b) => Number(b.scope === 'document') - Number(a.scope === 'document'));
}

const phrases = [
  { context: '大豆を一ばん水にひたし', surface: '一', reading: 'ひと' },
  { context: '大豆を一ばん水にひたし', surface: '水', reading: 'みず' },
  { context: 'かきまぜながら熱します', surface: '熱', reading: 'ねっ' },
  { context: '半年から一年の間おいておく', surface: '間', reading: 'あいだ' },
  { context: '国分 牧衛', surface: '国分', reading: 'こくぶん' },
  { context: '国分 牧衛', surface: '牧衛', reading: 'まきえ' },
];

// Homographs: annotated only by a phrase or user rule.
const ambiguous = new Set(['生物', '間', '人気', '上手', '下手', '一日']);

export function analyze(text: string, tokenize: (text: string) => Token[], corrections: Correction[] = []): Annotation[] {
  if (text.length > 8000) throw new Error('This text block is too long to analyze safely (8,000 character limit).');
  const result: Annotation[] = [];
  const overlaps = (start: number, end: number) => result.some(a => start < a.end && end > a.start);
  for (const [rules, source] of [[corrections, 'user'], [phrases, 'phrase']] as const) {
    for (const rule of rules) {
      let position = 0;
      while ((position = text.indexOf(rule.context, position)) !== -1) {
        let local = 0;
        while ((local = rule.context.indexOf(rule.surface, local)) !== -1) {
          const start = position + local, end = start + rule.surface.length;
          if (!overlaps(start, end)) result.push({ start, end, reading: hiragana(rule.reading), source });
          local += rule.surface.length;
        }
        position += rule.context.length;
      }
    }
  }
  let cursor = 0;
  const tokens = tokenize(text);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const surface = token.surface_form;
    const start = text.indexOf(surface, cursor);
    if (start < 0 || /\S/u.test(text.slice(cursor, start))) throw new Error('Analyzer offsets do not match the original text.');
    cursor = start + surface.length;
    if (!/\p{Script=Han}/u.test(surface) || token.word_type !== 'KNOWN' || !token.reading ||
        token.pos_detail_1 === '固有名詞' || ambiguous.has(surface)) continue;
    // Split numerals/counters lack rendaku and date context.
    const number = /^[〇零一二三四五六七八九十百千万億兆\d]+$/u;
    if (number.test(surface) || (number.test(tokens[index - 1]?.surface_form ?? '') && /^[年月日時分人本枚個匹冊歳回]$/u.test(surface))) continue;
    let reading = hiragana(token.reading);
    if (!/^[ぁ-ゖー]+$/.test(reading)) continue;
    let left = 0, right = surface.length;
    // Trim matching edge kana only.
    const prefix = surface.match(/^[ぁ-ゖァ-ヶー]+/u)?.[0] ?? '';
    const suffix = surface.match(/[ぁ-ゖァ-ヶー]+$/u)?.[0] ?? '';
    if (prefix && reading.startsWith(hiragana(prefix))) { left = prefix.length; reading = reading.slice(prefix.length); }
    if (suffix && reading.endsWith(hiragana(suffix))) { right -= suffix.length; reading = reading.slice(0, -suffix.length); }
    if (reading && !overlaps(start + left, start + right)) result.push({ start: start + left, end: start + right, reading, source: 'analyzer' });
  }
  return result.sort((a, b) => a.start - b.start);
}
