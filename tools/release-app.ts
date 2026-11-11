import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { exec, root, run } from './process.ts';
import { verifyMacApp } from './release-app-verify.ts';

const args = process.argv.slice(2);
assert(args.every(arg => arg === '--skip-notarization'), 'Usage: node tools/release-app.ts [--skip-notarization]');
const notarize = !args.includes('--skip-notarization');
const { version } = JSON.parse(await readFile(`${root}/package.json`, 'utf8')) as { version: string };
assert(/^\d+\.\d+\.\d+$/.test(version));
const git = async (...args: string[]) => (await exec('git', args, { cwd: root })).stdout.trim();
if (notarize) assert.equal(await git('status', '--porcelain'), '', 'Commit the reviewed source before notarizing a release. Use --skip-notarization for local packaging checks.');
const commit = await git('rev-parse', 'HEAD');
let identity = process.env.DEVELOPER_ID_APPLICATION;
if (!identity) {
  const identities = (await exec('security', ['find-identity', '-v', '-p', 'codesigning'])).stdout;
  const matches = [...identities.matchAll(/\) ([A-F0-9]{40}) "Developer ID Application:[^"]+"/g)];
  assert.equal(matches.length, 1, 'Set DEVELOPER_ID_APPLICATION to the Developer ID certificate SHA-1 when zero or multiple identities are available.');
  identity = matches[0][1];
}
const output = `${root}/build/release`;
await mkdir(output, { recursive: true });
// A failed run must not leave a publishable marker.
await rm(`${output}/app-release.json`, { force: true });
await run(process.execPath, ['tools/extension.ts', '--safari']);
await run('xcodebuild', ['-quiet', '-project', 'app/HanoriPreview.xcodeproj', '-scheme', 'HanoriPreview',
  '-configuration', 'Release', '-destination', 'generic/platform=macOS', '-derivedDataPath', 'build/apple-release',
  'ARCHS=arm64 x86_64', 'ONLY_ACTIVE_ARCH=NO', 'CODE_SIGN_STYLE=Manual', `CODE_SIGN_IDENTITY=${identity}`,
  'ENABLE_HARDENED_RUNTIME=YES', 'CODE_SIGN_INJECT_BASE_ENTITLEMENTS=NO', 'OTHER_CODE_SIGN_FLAGS=--timestamp', 'build']);
const app = `${root}/build/apple-release/Build/Products/Release/HanoriPreview.app`;
await verifyMacApp(app, version, false);
const filename = `HanoriPreview-${version}-macos-universal.zip`;
const archive = `${output}/${filename}`;
const pack = async () => {
  await rm(archive, { force: true });
  await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
};
await pack();
if (notarize) {
  const result = await exec('xcrun', ['notarytool', 'submit', archive, '--keychain-profile', process.env.NOTARY_PROFILE || 'notarytool',
    '--wait', '--timeout', '15m', '--output-format', 'json'], { maxBuffer: 4 * 1024 * 1024 });
  await writeFile(`${output}/notarization.json`, result.stdout);
  assert.equal(JSON.parse(result.stdout).status, 'Accepted', 'Notarization was not accepted; inspect build/release/notarization.json.');
  await run('xcrun', ['stapler', 'staple', app]);
  await pack();
}
const extracted = await mkdtemp(`${output}/verify-app-`);
try {
  await run('ditto', ['-x', '-k', archive, extracted]);
  await verifyMacApp(`${extracted}/HanoriPreview.app`, version, notarize);
} finally { await rm(extracted, { recursive: true, force: true }); }
const sha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(`${archive}.sha256`, `${sha256}  ${filename}\n`);
if (notarize) {
  assert.equal(await git('status', '--porcelain'), '', 'Source changed during release packaging.');
  assert.equal(await git('rev-parse', 'HEAD'), commit, 'HEAD changed during release packaging.');
  await writeFile(`${output}/app-release.json`, JSON.stringify({ version, commit, filename, sha256, notarized: true }, null, 2) + '\n');
}
console.log(`${notarize ? 'Notarized release' : 'Signed packaging check only (not publishable)'}: ${archive}`);
