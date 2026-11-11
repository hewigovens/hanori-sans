declare module 'kuromoji/src/Tokenizer.js' {
  import type { Token } from './analysis.js';
  export default class Tokenizer {
    constructor(dictionary: unknown);
    tokenize(text: string): Token[];
  }
}
declare module 'kuromoji/src/dict/DynamicDictionaries.js' {
  export default class Dictionaries {
    loadTrie(base: Int32Array, check: Int32Array): void;
    loadTokenInfoDictionaries(tokens: Uint8Array, pos: Uint8Array, map: Uint8Array): void;
    loadConnectionCosts(costs: Int16Array): void;
    loadUnknownDictionaries(tokens: Uint8Array, pos: Uint8Array, map: Uint8Array, chars: Uint8Array, compat: Uint32Array, invoke: Uint8Array): void;
  }
}
