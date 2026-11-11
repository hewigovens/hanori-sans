import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { basename } from 'node:path';
import { at, families, readJSON } from './fonts.ts';
import { exec as capture, run } from './process.ts';
import { verifySafariResources } from './safari-resources.ts';
import { sha256 } from './verify.ts';

async function fetchSources() {
  const sources = await readJSON<{ filename: string; url: string; sha256: string }[]>('sources.json');
  await mkdir(at('sources'), { recursive: true });
  for (const source of sources) {
    assert.equal(basename(source.filename), source.filename, 'Source filenames must stay within sources/');
    const path = at('sources', source.filename);
    const existing = await readFile(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    if (existing && sha256(existing) === source.sha256) { console.log(`Verified ${source.filename}`); continue; }
    const response = await fetch(source.url, { signal: AbortSignal.timeout(60_000) }).catch(error => {
      throw new Error(`Could not download ${source.filename}: ${error.message}`, { cause: error });
    });
    assert(response.ok, `Download failed (${response.status}): ${source.filename}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(sha256(bytes), source.sha256, `SHA-256 mismatch: ${source.filename}`);
    await writeFile(path + '.part', bytes);
    await rename(path + '.part', path);
    console.log(`Downloaded ${source.filename}`);
  }
}

const project = at('app/HanoriPreview.xcodeproj');
const derivedData = at('build/apple');
const appBundle = at('build/apple/Build/Products/Debug/HanoriPreview.app');
const macDestination = `platform=macOS,arch=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`;
const xcodeArgs = (destination = macDestination) => ['-quiet', '-project', project, '-scheme', 'HanoriPreview',
  '-destination', destination, '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO'];
// Native builds bundle these web resources.
const buildSafariResources = () => run(process.execPath, ['tools/extension.ts', '--safari']);

async function macAppPids() {
  let stdout: string;
  try { ({ stdout } = await capture('pgrep', ['-x', 'HanoriPreview'])); }
  catch (error) { if ((error as { code: number }).code === 1) return []; throw error; }
  const pids: number[] = [];
  for (const pid of stdout.trim().split(/\s+/)) {
    try {
      const result = await capture('ps', ['-p', pid, '-o', 'comm=']);
      if (result.stdout.trim() === `${appBundle}/Contents/MacOS/HanoriPreview`) pids.push(Number(pid));
    } catch (error) { if ((error as { code: number }).code !== 1) throw error; }
  }
  return pids;
}

async function app(mode = 'run') {
  assert(['run', '--verify', '--debug', '--logs', '--telemetry'].includes(mode), `Unknown app mode ${mode}`);
  for (const pid of await macAppPids()) process.kill(pid);
  await buildSafariResources();
  await run('xcodebuild', [...xcodeArgs(), 'build']);
  if (mode === '--debug') return run('lldb', ['--', `${appBundle}/Contents/MacOS/HanoriPreview`]);
  await run('/usr/bin/open', ['-n', appBundle]);
  if (mode === '--verify') {
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await macAppPids()).length) { console.log('Hanori Preview is running.'); return; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Hanori Preview did not stay running after launch');
  }
  if (mode === '--logs' || mode === '--telemetry') await run('/usr/bin/log', ['stream', '--info', '--style', 'compact', '--predicate',
    mode === '--logs' ? 'process == "HanoriPreview"' : 'subsystem == "me.hanori.preview"']);
}

async function safari(args: string[]) {
  assert(args.every(arg => ['--ios', '--open', '--project-only'].includes(arg)), 'safari accepts only --ios, --open, and --project-only');
  const ios = args.includes('--ios');
  assert(!(ios && args.includes('--open')), '--open launches only the macOS containing app. Run iOS from Xcode.');
  await buildSafariResources();
  if (args.includes('--project-only')) return;
  await run('xcodebuild', [...xcodeArgs(ios ? 'generic/platform=iOS Simulator' : macDestination), 'build']);
  const app = ios ? at('build/apple/Build/Products/Debug-iphonesimulator/HanoriPreview.app') : appBundle;
  await verifySafariResources(`${app}/${ios ? '' : 'Contents/'}PlugIns/HanoriSafariExtension.appex/${ios ? '' : 'Contents/Resources/'}`);
  console.log(`Built and checked Safari extension resources: ${app}`);
  if (args.includes('--open')) await run('/usr/bin/open', ['-n', app]);
}

try {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'fetch': await fetchSources(); break;
    case 'build': {
      const { buildBase, buildReadings } = await import('./fonts.ts');
      await fetchSources();
      for (const family of families) { await buildBase(family); await buildReadings(family); }
      break;
    }
    case 'verify': await (await import('./verify.ts')).verifyFonts(); break;
    case 'app': await app(args[0]); break;
    case 'test-app':
      assert(args.length === 0 || (args.length === 1 && args[0] === '--unit'), 'test-app accepts only --unit');
      await buildSafariResources();
      await run('xcodebuild', [...xcodeArgs(), ...(args[0] === '--unit' ? ['-only-testing:HanoriPreviewTests'] : []), 'test']);
      break;
    case 'safari': await safari(args); break;
    default: throw new Error('Usage: node tools/hanori.ts <fetch|build|verify|app|test-app|safari>');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
