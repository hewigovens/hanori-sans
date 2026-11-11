import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { exec, root } from './process.ts';
import { verifySafariResources } from './safari-resources.ts';

export async function verifyMacApp(app: string, version: string, notarized: boolean) {
  for (const file of ['HanoriSans-Regular.otf', 'HanoriSansFurigana-Regular.otf', 'HanoriSerif-Regular.otf', 'HanoriSerifFurigana-Regular.otf']) {
    assert((await readFile(`${app}/Contents/Resources/${file}`)).equals(await readFile(`${root}/dist/${file}`)), `Preview font differs: ${file}`);
  }
  for (const file of await readdir(`${root}/licenses`)) {
    assert((await readFile(`${app}/Contents/Resources/licenses/${file}`)).equals(await readFile(`${root}/licenses/${file}`)), `Preview notice differs: ${file}`);
  }
  const extension = `${app}/Contents/PlugIns/HanoriSafariExtension.appex`;
  let team: string | undefined;
  for (const [bundle, name, identifier] of [
    [app, 'HanoriPreview', 'me.hanori.preview'],
    [extension, 'HanoriSafariExtension', 'me.hanori.preview.safari'],
  ]) {
    const plist = `${bundle}/Contents/Info.plist`;
    const field = async (key: string) => (await exec('plutil', ['-extract', key, 'raw', '-o', '-', plist])).stdout.trim();
    assert.equal(await field('CFBundleIdentifier'), identifier);
    assert.equal(await field('CFBundleShortVersionString'), version, 'App, extension, and package.json versions must agree.');
    const archs = (await exec('lipo', ['-archs', `${bundle}/Contents/MacOS/${name}`])).stdout.trim().split(/\s+/).sort();
    assert.deepEqual(archs, ['arm64', 'x86_64'], `${name} must be universal.`);
    await exec('codesign', ['--verify', '--deep', '--strict', bundle]);
    const signature = (await exec('codesign', ['-dvv', bundle])).stderr;
    assert.match(signature, /Authority=Developer ID Application:/);
    assert.match(signature, /flags=.*runtime/);
    assert.match(signature, /Timestamp=/);
    const bundleTeam = signature.match(/TeamIdentifier=(\w+)/)?.[1];
    assert(bundleTeam, 'Missing signing team.');
    team ??= bundleTeam;
    assert.equal(bundleTeam, team, 'Host and extension must use the same signing team.');
    const entitlements = (await exec('codesign', ['-d', '--entitlements', ':-', bundle])).stdout;
    assert.match(entitlements, /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\s*\/>/);
    assert(!/<key>com\.apple\.security\.get-task-allow<\/key>\s*<true\s*\/>/.test(entitlements), 'Release must not allow debugger attachment.');
  }
  await verifySafariResources(`${extension}/Contents/Resources/`);
  if (notarized) {
    await exec('xcrun', ['stapler', 'validate', app]);
    await exec('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  }
}
