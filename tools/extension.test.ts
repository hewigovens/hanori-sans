import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { reader } from '../extension/reader.ts';

test('Chromium: language boundaries, dynamic content, undo, and extension site persistence', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'hanori-extension-'));
  const extension = join(temporary, 'extension');
  await cp(new URL('../build/extension/', import.meta.url), extension, { recursive: true });
  // Test copy only: production uses activeTab and a permission prompt.
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
  const html = `<!doctype html><html><meta charset="utf-8"><title>Hanori test page</title>
    <style>body{font:20px/1.8 system-ui;max-width:760px;margin:40px auto}code{background:#eee}</style>
    <h1>Reading boundaries</h1><p id="unknown">日本語の勉強</p>
    <section lang="ja"><p id="ja">日本語の勉強です。</p>
    <p id="zh" lang="zh-Hans">日本文化研究</p><p id="en" lang="en">日本語</p>
    <p id="empty" lang="">日本語</p><p><ruby id="ruby">日本<rt>にほん</rt></ruby></p>
    <code id="code">日本語</code><p id="edit" contenteditable="true">日本語</p>
    <p><a id="link" href="#clicked">日本語</a><span id="icon">&#xe000;</span></p>
    <p id="dynamic"></p><p id="move">日本語</p>
    <div id="accurate-region" style="font-family:'Hanori Serif Furigana'">
      <p id="phrase">かきまぜながら<em>熱</em>します。</p>
      <p id="ambiguous"><a href="#food">生物</a>を食べる。</p>
      <p id="contrast">生物を研究する。</p>
      <p id="split"><em>日</em>本語を読む。</p>
      <p id="author"><ruby>日本<rt>にっぽん</rt></ruby>の学校。</p>
    </div></section></html>`;
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    await page.goto(origin);
    assert.equal(await page.title(), 'Hanori test page');
    const original = await page.locator('body').textContent();
    const on = { enabled: true, family: 'serif' as const, includeUntagged: false };
    const first = await page.evaluate(reader, on);
    assert.equal(first.error, undefined, first.error);
    assert.ok(first.count >= 3);
    for (const id of ['unknown', 'zh', 'en', 'empty', 'ruby', 'code', 'edit', 'icon']) {
      assert.equal(await page.locator(`#${id} span`).count(), 0, id);
    }
    assert.equal(await page.locator('#ja span').count(), 1);
    assert.equal(await page.locator('body').textContent(), original);
    await page.evaluate(reader, on);
    assert.equal(await page.locator('#ja span span').count(), 0);
    await page.locator('#link').click();
    assert.ok(page.url().endsWith('#clicked'));
    await page.evaluate(() => {
      document.querySelector('#dynamic')!.textContent = '日本語を読みます。';
      document.querySelector('#ja')!.setAttribute('lang', 'zh');
      document.querySelector('#move span')!.textContent = '変更した日本語';
    });
    await page.waitForFunction(() => !!document.querySelector('#dynamic span') && !document.querySelector('#ja span'));
    const expanded = await page.evaluate(reader, { ...on, includeUntagged: true });
    assert.equal(expanded.error, undefined);
    assert.equal(await page.locator('#unknown span').count(), 1);
    assert.equal(await page.locator('#empty span').count(), 1);
    assert.equal(await page.locator('#zh span').count(), 0);
    // Reinserted page content must not keep our styles.
    await page.evaluate(() => {
      const node = document.querySelector('#move')!;
      node.remove();
      (window as any).savedNode = node;
    });
    await page.evaluate(reader, { ...on, enabled: false });
    await page.evaluate(() => document.body.append((window as any).savedNode));
    assert.equal(await page.locator('#move').textContent(), '変更した日本語');
    assert.equal(await page.locator('span[style*="Hanori Extension"]').count(), 0);
    // A missing font is reported and leaves the page intact.
    await page.evaluate(() => {
      (window as any).savedFontFace = window.FontFace;
      window.FontFace = class extends FontFace {
        override load(): Promise<FontFace> { return Promise.reject(new Error('missing font fixture')); }
      };
    });
    const unavailable = await page.evaluate(reader, on);
    assert.match(unavailable.error ?? '', /Cannot load Hanori Serif Furigana/);
    assert.equal(unavailable.enabled, false);
    await page.evaluate(() => { window.FontFace = (window as any).savedFontFace; });

    // Saved site: the content script registers and runs on reload.
    await worker.evaluate(async ({ origin, on }) => {
      await chrome.storage.local.set({ [`site:${origin}`]: on });
    }, { origin, on });
    await assertEventually(async () => (await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 1);
    await page.reload();
    await page.waitForSelector('#ja span');
    const id = new URL(worker.url()).hostname;
    const tabId = await worker.evaluate(async origin => (await chrome.tabs.query({ url: `${origin}/*` }))[0].id!, origin);
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 384, height: 660 });
    popup.on('pageerror', error => errors.push(error.message));
    popup.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    // A popup tab has no active-tab context; stub tab selection only.
    await popup.addInitScript(({ tabId, origin }) => { chrome.tabs.query = async () => [{ id: tabId, url: origin }] as chrome.tabs.Tab[]; }, { tabId, origin });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    assert.equal(await popup.title(), 'Hanori reading help');
    assert.equal(await popup.locator('main').count(), 1);
    await popup.waitForFunction(() => document.querySelector('#status')!.textContent !== 'Checking this page…');
    assert.match(await popup.locator('#status').innerText(), /Font mode on/);
    await popup.locator('#enabled').uncheck();
    await popup.locator('#always').uncheck();
    await popup.getByRole('button', { name: 'Apply', exact: true }).click();
    await popup.waitForFunction(() => document.querySelector('#status')!.textContent === 'Readings are off.');
    assert.equal(await page.locator('#ja span').count(), 0);
    await assertEventually(async () => (await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 0);
    await popup.locator('#enabled').check();
    await popup.getByRole('button', { name: 'Apply', exact: true }).click();
    await popup.waitForFunction(() => document.querySelector('#status')!.textContent!.includes('Font mode on'));
    assert.equal(await page.locator('#ja span').count(), 1);
    const beforeAccurate = await page.locator('body').textContent();
    await context.setOffline(true);
    const analysisStarted = performance.now();
    await popup.locator('#mode').selectOption('accurate');
    await popup.getByRole('button', { name: 'Apply', exact: true }).click();
    await popup.waitForFunction(() => document.querySelector('#status')!.textContent!.startsWith('Accurate mode on'), { timeout: 15000 });
    console.log(`Cold offline Accurate mode on the browser fixture: ${Math.round(performance.now() - analysisStarted)} ms.`);
    assert.equal(await page.locator('#phrase em ruby rt').textContent(), 'ねっ');
    assert.equal(await page.locator('#ambiguous a ruby').count(), 0);
    assert.ok(!(await page.locator('#contrast ruby').allTextContents()).some(text => text.startsWith('生物')));
    assert.equal(await page.locator('#split em ruby').count(), 0);
    assert.equal(await page.locator('#author > ruby rt').textContent(), 'にっぽん');
    assert.equal(await page.locator('#icon span').count(), 0);
    assert.equal(await page.locator('#ambiguous a span').evaluate(node => getComputedStyle(node).fontFamily), '"Hanori Extension Local"');
    const fonts = await worker.evaluate(async tabId => (await chrome.scripting.executeScript({ target: { tabId }, func: () => [...document.fonts].map(font => font.family.replaceAll('"', '')) }))[0].result!, tabId);
    assert.equal(fonts.filter(name => name === 'Hanori Extension Local').length, 1);
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const documentNode = (await cdp.send('DOM.getDocument')).root.nodeId;
    const plainNode = (await cdp.send('DOM.querySelector', { nodeId: documentNode, selector: '#ambiguous a span' })).nodeId;
    const platformFonts = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId: plainNode })).fonts;
    assert.ok(platformFonts.length > 0);
    assert.ok(platformFonts.every(font => !font.familyName.includes('Hanori')), 'Ambiguous words must render with a plain font');
    await context.setOffline(false);

    // Correction editor.
    await popup.locator('#correction-editor summary').click();
    await popup.locator('#context').fill('生物を食べる');
    await popup.locator('#surface').fill('生物');
    await popup.locator('#reading').fill('なまもの');
    await popup.getByRole('button', { name: 'Save correction' }).click();
    await popup.waitForFunction(() => document.querySelector('#correction-status')!.textContent!.startsWith('Saved locally'));
    assert.equal(await page.locator('#ambiguous a ruby rt').textContent(), 'なまもの');
    assert.ok(!(await page.locator('#contrast ruby').allTextContents()).some(text => text.startsWith('生物')));
    await worker.evaluate(async ({ origin, on }) => chrome.storage.local.set({ [`site:${origin}`]: { ...on, mode: 'accurate' } }), { origin, on });
    await assertEventually(async () => (await worker.evaluate(() => chrome.scripting.getRegisteredContentScripts())).length === 1);
    await page.reload();
    await page.waitForSelector('#ambiguous a ruby rt');
    assert.equal(await page.locator('#ambiguous a ruby rt').textContent(), 'なまもの');
    const otherDocument = await context.newPage();
    await otherDocument.goto(`${origin}/other`);
    await otherDocument.waitForSelector('#phrase em rt');
    assert.equal(await otherDocument.locator('#ambiguous a ruby').count(), 0, 'Document correction must not leak to another path');
    await otherDocument.close();
    await page.locator('#ambiguous a').click();
    assert.ok(page.url().endsWith('#food'));
    const copied = await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#ambiguous')!);
      getSelection()!.removeAllRanges(); getSelection()!.addRange(range);
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
      getSelection()!.removeAllRanges();
      return data.getData('text/plain');
    });
    assert.equal(copied, '生物を食べる。');
    // Hold an analyzer response while the page changes: the stale result is rejected.
    await worker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId }, func: () => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (async (message: { type: string }) => {
        const response = await original(message);
        if (message.type === 'analyze') {
          chrome.runtime.sendMessage = original;
          await new Promise<void>(resolve => { (globalThis as any).releaseHanoriTest = resolve; });
        }
        return response;
      }) as typeof chrome.runtime.sendMessage;
    } }), tabId);
    await page.evaluate(() => {
      const text = document.createTextNode('学校へ行く。');
      (window as any).editedText = text;
      document.querySelector('#ambiguous')!.append(text);
    });
    await assertEventually(async () => (await worker.evaluate(async tabId => (await chrome.scripting.executeScript({ target: { tabId }, func: () => typeof (globalThis as any).releaseHanoriTest === 'function' }))[0].result, tabId)) === true);
    await page.evaluate(() => { (window as any).editedText.data = '本を読む。'; });
    await worker.evaluate(async tabId => chrome.scripting.executeScript({ target: { tabId }, func: () => { (globalThis as any).releaseHanoriTest(); } }), tabId);
    await page.waitForFunction(() => [...document.querySelectorAll('#ambiguous ruby')].some(r => r.textContent?.includes('ほん')));
    assert.ok(!(await page.locator('#ambiguous').textContent())!.includes('学校'));
    assert.equal(await page.locator('#ambiguous a ruby rt').textContent(), 'なまもの');
    // A language change undoes annotation.
    await page.locator('#phrase').evaluate(node => node.setAttribute('lang', 'zh'));
    await page.waitForFunction(() => !document.querySelector('#phrase rt'));
    await page.locator('#phrase').evaluate(node => node.setAttribute('lang', 'ja'));
    await page.waitForFunction(() => !!document.querySelector('#phrase rt'));

    // Safari rejects an empty-array write; removal must still work.
    await worker.evaluate(() => {
      const set = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = ((items: Record<string, unknown>) => {
        if (Array.isArray(items.corrections) && !items.corrections.length) throw new Error('Exceeded storage quota.');
        return set(items);
      }) as typeof chrome.storage.local.set;
    });
    await popup.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#ambiguous a ruby'));
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('corrections')).corrections), undefined);
    assert.ok(await worker.evaluate(async origin => (await chrome.storage.local.get(`site:${origin}`))[`site:${origin}`], origin), 'Removing the final correction preserves site settings');
    await popup.locator('#enabled').uncheck();
    await popup.getByRole('button', { name: 'Apply', exact: true }).click();
    await popup.waitForFunction(() => document.querySelector('#status')!.textContent === 'Readings are off.');
    assert.equal(await page.locator('rt[data-hanori-owner]').count(), 0);
    assert.equal(await page.locator('span[style*="Hanori Extension"]').count(), 0);
    assert.equal(await page.locator('#author > ruby rt').textContent(), 'にっぽん');
    assert.equal(await page.locator('body').textContent(), beforeAccurate!.replace('生物を食べる。', '生物を食べる。本を読む。'));
    await popup.locator('#enabled').check();
    await popup.getByRole('button', { name: 'Apply', exact: true }).click();
    await popup.waitForFunction(() => document.querySelector('#status')!.textContent!.startsWith('Accurate mode on'));
    await popup.locator('#correction-editor summary').click();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});

async function assertEventually(predicate: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Extension state did not converge within five seconds');
}
