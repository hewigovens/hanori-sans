import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile, chmod, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { exec, root } from './process.ts';

const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
assert(/^\d+\.\d+\.\d+$/.test(version), 'Font releases require a stable MAJOR.MINOR.PATCH version.');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const tags = args.filter(arg => arg !== '--check');
const [tag = process.env.RELEASE_TAG || `v${version}`] = tags;
assert(tags.length <= 1, 'Usage: node tools/release.ts [--check] [vMAJOR.MINOR.PATCH]');
assert.equal(tag, `v${version}`, 'Release tag must match package.json.');
if (checkOnly) {
  console.log(`Release version: ${tag}`);
  process.exit(0);
}
const output = join(root, 'build/release');
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, 'fonts-'));
const files = ['HanoriSans-Regular.otf', 'HanoriSansFurigana-Regular.otf', 'HanoriSerif-Regular.otf', 'HanoriSerifFurigana-Regular.otf'];
const archive = `Hanori-${version}.zip`;
try {
  for (const file of files) await copyFile(join(root, 'dist', file), join(stage, file));
  await mkdir(join(stage, 'licenses'));
  for (const file of (await readdir(join(root, 'licenses'))).sort()) {
    await copyFile(join(root, 'licenses', file), join(stage, 'licenses', file));
    files.push(`licenses/${file}`);
  }
  await writeFile(join(stage, 'README.txt'), `Hanori ${version}\n\nInstall the four OTF files using your operating system's font manager. Default faces require Japanese language hints for readings; Furigana faces show dictionary readings automatically. Readings can be wrong.\n\nKeep all included licenses and dictionary attribution when redistributing.\nhttps://github.com/hewigovens/hanori-sans\n`);
  files.push('README.txt');
  files.sort();
  // Fixed metadata keeps the archive reproducible.
  const epoch = new Date('2026-10-26T00:00:00Z');
  for (const file of files) {
    await chmod(join(stage, file), 0o644);
    await utimes(join(stage, file), epoch, epoch);
  }
  const path = join(output, archive);
  await rm(path, { force: true });
  await exec('zip', ['-X', '-q', path, ...files], { cwd: stage, env: { ...process.env, TZ: 'UTC' } });
  const entries = (await exec('unzip', ['-Z1', path])).stdout.trim().split('\n');
  assert.deepEqual(entries, files, 'Release archive must contain exactly the fonts, notices, and README.');
  // Check the archive itself, not the staging copy.
  for (const file of files) {
    const result = await exec('unzip', ['-p', path, file], { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 });
    assert(result.stdout.equals(await readFile(join(stage, file))), `Archive content mismatch: ${file}`);
  }
  const sha256 = createHash('sha256').update(await readFile(path)).digest('hex');
  await writeFile(join(output, 'SHA256SUMS'), `${sha256}  ${archive}\n`);
  await writeFile(join(output, 'font-hanori.rb'), `cask "font-hanori" do\n  version "${version}"\n  sha256 "${sha256}"\n\n  url "https://github.com/hewigovens/hanori-sans/releases/download/v#{version}/Hanori-#{version}.zip"\n  name "Hanori"\n  desc "English, Simplified Chinese, and Japanese fonts with optional furigana"\n  homepage "https://github.com/hewigovens/hanori-sans"\n\n${files.filter(file => file.endsWith('.otf')).map(file => `  font "${file}"`).join('\n')}\nend\n`);
  console.log(`Verified ${archive}: ${sha256}`);
} finally { await rm(stage, { recursive: true, force: true }); }
