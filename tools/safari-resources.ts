import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { root } from './process.ts';

export async function verifySafariResources(resources: string) {
  const manifest = JSON.parse(await readFile(`${resources}manifest.json`, 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, JSON.parse(await readFile(`${root}/package.json`, 'utf8')).version);
  assert.equal(manifest.background.type, undefined);
  for (const file of ['HanoriSansFurigana-Regular.otf', 'HanoriSerifFurigana-Regular.otf']) {
    assert((await readFile(resources + 'fonts/' + file)).equals(await readFile(`${root}/dist/${file}`)), `Bundled font differs: ${file}`);
    assert(manifest.web_accessible_resources.some((entry: { resources: string[] }) => entry.resources.includes('fonts/' + file)));
  }
  for (const file of await readdir(`${root}/licenses`)) {
    assert((await readFile(resources + 'licenses/' + file)).equals(await readFile(`${root}/licenses/${file}`)), `Bundled font notice differs: ${file}`);
  }
  for (const file of ['background.js', 'popup.js', 'automatic.js', 'popup.html', 'popup.css', 'icons/icon-128.png',
    'licenses/Kuromoji-IPADIC-NOTICE.md', 'licenses/Kuromoji-Apache-2.0.txt', 'licenses/Doublearray-MIT.txt']) {
    assert((await readFile(resources + file)).length > 0, `Missing bundled resource ${file}`);
  }
  assert.equal((await readdir(resources + 'dict')).filter(name => name.endsWith('.dat.gz')).length, 12);
  for (const file of await readdir(resources + 'dict')) {
    assert((await readFile(resources + 'dict/' + file)).equals(await readFile(`${root}/build/extension-safari/dict/${file}`)), `Bundled dictionary differs: ${file}`);
  }
}
