import { api } from './browser-api.js';
import Tokenizer from 'kuromoji/src/Tokenizer.js';
import Dictionaries from 'kuromoji/src/dict/DynamicDictionaries.js';

// MV3 workers lack XHR and fs; fetch packaged assets only.
export async function loadTokenizer() {
  const names = ['base', 'check', 'tid', 'tid_pos', 'tid_map', 'cc', 'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke'];
  const buffers = await Promise.all(names.map(async name => {
    const response = await fetch(api.runtime.getURL(`dict/${name}.dat.gz`));
    if (!response.ok || !response.body) throw new Error(`Cannot load packaged dictionary: ${name}`);
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }));
  const dictionary = new Dictionaries();
  dictionary.loadTrie(new Int32Array(buffers[0]), new Int32Array(buffers[1]));
  dictionary.loadTokenInfoDictionaries(new Uint8Array(buffers[2]), new Uint8Array(buffers[3]), new Uint8Array(buffers[4]));
  dictionary.loadConnectionCosts(new Int16Array(buffers[5]));
  dictionary.loadUnknownDictionaries(new Uint8Array(buffers[6]), new Uint8Array(buffers[7]), new Uint8Array(buffers[8]), new Uint8Array(buffers[9]), new Uint32Array(buffers[10]), new Uint8Array(buffers[11]));
  return new Tokenizer(dictionary);
}
