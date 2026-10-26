import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import { at, root, families, readJSON } from './fonts.ts';
import { sha256 } from './verify.ts';

const capture = promisify(execFile);
async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(command, args, { cwd: root, stdio: 'inherit' });
    process.on('error', reject);
    process.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`)));
  });
}

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
const xcodeArgs = ['-quiet', '-project', project, '-scheme', 'HanoriPreview', '-destination', macDestination,
  '-derivedDataPath', derivedData, 'CODE_SIGNING_ALLOWED=NO'];

async function generateProject() {
  try { await capture('xcodegen', ['--version']); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  await run('xcodegen', ['generate', '--spec', 'app/project.yml', '--quiet']);
}

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
  await generateProject();
  await run('xcodebuild', [...xcodeArgs, 'build']);
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
      await generateProject();
      await run('xcodebuild', [...xcodeArgs, ...(args[0] === '--unit' ? ['-only-testing:HanoriPreviewTests'] : []), 'test']);
      break;
    default: throw new Error('Usage: node tools/hanori.ts <fetch|build|verify|app|test-app>');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
