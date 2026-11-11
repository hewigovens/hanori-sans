import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exec, root, run } from './process.ts';
import { verifyMacApp } from './release-app-verify.ts';

const repo = 'hewigovens/hanori-sans';
const output = `${root}/build/release`;
assert.equal(process.argv.length, 2, 'Usage: node tools/publish-release.ts');
const { version } = JSON.parse(await readFile(`${root}/package.json`, 'utf8')) as { version: string };
assert(/^\d+\.\d+\.\d+$/.test(version));
const tag = `v${version}`;
const git = async (...args: string[]) => (await exec('git', args, { cwd: root })).stdout.trim();
assert.equal(await git('status', '--porcelain'), '', 'Commit all release source changes before publishing.');
const commit = await git('rev-parse', 'HEAD');
assert.equal(await git('rev-parse', `${tag}^{commit}`), commit, 'Release tag must identify HEAD.');
const remote = await git('ls-remote', `https://github.com/${repo}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
const refs = remote.split('\n').map(line => line.split(/\s+/));
const remoteCommit = refs.find(([, ref]) => ref?.endsWith('^{}'))?.[0] ?? refs[0]?.[0];
assert.equal(remoteCommit, commit, 'Push the release tag before publishing.');
const runs = JSON.parse((await exec('gh', ['run', 'list', '--repo', repo, '--workflow', 'release.yml', '--commit', commit,
  '--branch', tag, '--event', 'push', '--status', 'success', '--json', 'databaseId'])).stdout) as unknown[];
assert(runs.length, 'Wait for the tag\'s Release checks workflow to succeed before publishing.');
const notes = `${root}/releases/${version}.md`;
assert((await readFile(notes, 'utf8')).trim(), `Write and commit releases/${version}.md first.`);
const marker = JSON.parse(await readFile(`${output}/app-release.json`, 'utf8'));
const appZip = `HanoriPreview-${version}-macos-universal.zip`;
assert.equal(marker.version, version);
assert.equal(marker.commit, commit, 'Repackage the app from this release commit.');
assert.equal(marker.filename, appZip);
assert.equal(marker.notarized, true, 'Notarization is required for publication.');
const digest = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
assert.equal(await digest(`${output}/${appZip}`), marker.sha256, 'Packaged app has changed.');
const extracted = await mkdtemp(`${output}/publish-check-`);
try {
  await exec('ditto', ['-x', '-k', `${output}/${appZip}`, extracted]);
  await verifyMacApp(`${extracted}/HanoriPreview.app`, version, true);
} finally { await rm(extracted, { recursive: true, force: true }); }
const tap = resolve(root, '../tap');
const tapRemote = (await exec('git', ['remote', 'get-url', '--push', 'origin'], { cwd: tap })).stdout.trim();
assert(/^(?:git@github\.com:|https:\/\/github\.com\/)hewigovens\/tap(?:\.git)?$/.test(tapRemote), 'Expected ../tap to be hewigovens/tap.');
assert.equal((await exec('git', ['status', '--porcelain', '--', 'Casks/font-hanori.rb', 'Casks/hanori-preview.rb'], { cwd: tap })).stdout.trim(), '', 'Preserve or commit existing Hanori cask edits first.');
await run(process.execPath, ['tools/release.ts', tag]);
const fontZip = `Hanori-${version}.zip`;
const fontHash = await digest(`${output}/${fontZip}`);
await writeFile(`${output}/SHA256SUMS`, `${fontHash}  ${fontZip}\n${marker.sha256}  ${appZip}\n`);
await run('gh', ['release', 'create', tag, `${output}/${fontZip}`, `${output}/${appZip}`, `${output}/SHA256SUMS`,
  '--repo', repo, '--verify-tag', '--title', `Hanori ${version}`, '--notes-file', notes]);
for (const [file, expected] of [[fontZip, fontHash], [appZip, marker.sha256]]) {
  const response = await fetch(`https://github.com/${repo}/releases/download/${tag}/${file}`);
  assert(response.ok && response.body, `Published asset is not publicly available: ${file}`);
  const reader = response.body.getReader(), hash = createHash('sha256');
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  assert.equal(hash.digest('hex'), expected, `Published asset checksum mismatch: ${file}`);
}
await writeFile(`${tap}/Casks/font-hanori.rb`, await readFile(`${output}/font-hanori.rb`));
await writeFile(`${tap}/Casks/hanori-preview.rb`, `cask "hanori-preview" do\n  version "${version}"\n  sha256 "${marker.sha256}"\n\n  url "https://github.com/${repo}/releases/download/v#{version}/HanoriPreview-#{version}-macos-universal.zip"\n  name "Hanori Preview"\n  desc "Font preview and Safari Japanese reading extension"\n  homepage "https://github.com/${repo}"\n\n  depends_on macos: :sonoma\n\n  app "HanoriPreview.app"\n\n  uninstall quit: "me.hanori.preview"\nend\n`);
console.log('Published and verified both assets. Review, audit, commit, and push the two Hanori casks in ../tap. No tap changes were committed or pushed.');
