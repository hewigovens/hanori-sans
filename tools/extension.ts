import { mkdir, readFile, writeFile, copyFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { exec } from './process.ts';

const safari = process.argv.includes('--safari');
if (process.argv.slice(2).some(arg => arg !== '--safari')) throw new Error('Usage: node tools/extension.ts [--safari]');
const destination = new URL(safari ? '../build/extension-safari/' : '../build/extension/', import.meta.url);
// Start empty: no stale files in the package.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
// Content scripts and Safari's background page are classic scripts.
for (const entry of ['background', 'popup', 'automatic']) await build({
  entryPoints: [fileURLToPath(new URL(`../extension/${entry}.ts`, import.meta.url))], bundle: true,
  outdir: fileURLToPath(destination), format: entry === 'automatic' || (safari && entry === 'background') ? 'iife' : 'esm',
  platform: 'browser', target: safari ? 'safari17' : 'chrome120', legalComments: 'linked' });
for (const name of ['manifest.json', 'popup.html', 'popup.css']) {
  await copyFile(new URL(`../extension/${name}`, import.meta.url), new URL(name, destination));
}
await cp(new URL('../node_modules/kuromoji/dict/', import.meta.url), new URL('dict/', destination), { recursive: true });
await mkdir(new URL('licenses/', destination), { recursive: true });
for (const [source, name] of [
  ['kuromoji/LICENSE-2.0.txt', 'Kuromoji-Apache-2.0.txt'],
  ['kuromoji/NOTICE.md', 'Kuromoji-IPADIC-NOTICE.md'],
  ['doublearray/LICENSE.txt', 'Doublearray-MIT.txt'],
]) await copyFile(new URL(`../node_modules/${source}`, import.meta.url), new URL(`licenses/${name}`, destination));
const manifest = JSON.parse(await readFile(new URL('manifest.json', destination), 'utf8'));
manifest.version = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
if (safari) {
  delete manifest.background.type;
  await mkdir(new URL('fonts/', destination), { recursive: true });
  const resources = ['HanoriSansFurigana-Regular.otf', 'HanoriSerifFurigana-Regular.otf'];
  for (const file of resources) await copyFile(new URL(`../dist/${file}`, import.meta.url), new URL(`fonts/${file}`, destination));
  await cp(new URL('../licenses/', import.meta.url), new URL('licenses/', destination), { recursive: true });
  manifest.web_accessible_resources = [{ resources: resources.map(file => `fonts/${file}`), matches: ['<all_urls>'] }];
}
// Toolbar icons fill their square: crop the Mac icon's transparent margin (824 of 1024), then scale.
await mkdir(new URL('icons/', destination), { recursive: true });
const tile = fileURLToPath(new URL('icons/icon-824.png', destination));
await exec('sips', ['-c', '824', '824', fileURLToPath(new URL('../app/Assets.xcassets/AppIcon.appiconset/Icon-mac-512@2x.png', import.meta.url)), '--out', tile]);
for (const size of Object.keys(manifest.icons)) await exec('sips', ['-z', size, size, tile, '--out', fileURLToPath(new URL(manifest.icons[size], destination))]);
await rm(tile);
await writeFile(new URL('manifest.json', destination), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifest.name}: built ${safari ? 'build/extension-safari' : 'build/extension'} (includes local IPADIC dictionary).`);
