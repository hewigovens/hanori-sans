import assert from 'node:assert/strict';
import { access, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exec, root, run } from './process.ts';

const args = process.argv.slice(2);
assert(args.length <= 1, 'Usage: node tools/pack-extension.ts [signing-key.pem]');
const key = args[0] && resolve(args[0]);
if (key) await access(key);

await run(process.execPath, ['tools/extension.ts']);
const source = join(root, 'build/extension');
const { version } = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8')) as { version: string };
const output = join(root, 'build/release');
await mkdir(output, { recursive: true });

// The Web Store takes a ZIP for the first upload; later verified uploads take a CRX signed with your key.
const zip = join(output, `hanori-reading-${version}.zip`);
await rm(zip, { force: true });
await exec('zip', ['-X', '-q', '-r', zip, '.'], { cwd: source });
console.log(`Packed ${zip}`);

if (key) {
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  let browser: string | undefined;
  for (const candidate of candidates) {
    if (candidate && await access(candidate).then(() => true, () => false)) { browser = candidate; break; }
  }
  assert(browser, 'No Chromium-based browser found to sign the CRX. Set CHROME_BIN.');
  // The browser writes "<directory>.crx" beside the packed directory.
  await rm(`${source}.crx`, { force: true });
  await exec(browser, ['--headless=new', `--pack-extension=${source}`, `--pack-extension-key=${key}`]);
  const crx = join(output, `hanori-reading-${version}.crx`);
  await rename(`${source}.crx`, crx);
  console.log(`Signed ${crx}`);
}
