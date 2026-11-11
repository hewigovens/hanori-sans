import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webkit } from 'playwright';
import kuromoji from 'kuromoji';
import { reader } from '../extension/reader.ts';
import { analyze, type Correction } from '../extension/analysis.ts';
import { readFile } from 'node:fs/promises';

test('WebKit: bundled fonts without local Hanori access, Accurate mode, and undo', async () => {
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) =>
    kuromoji.builder({ dicPath: new URL('../node_modules/kuromoji/dict/', import.meta.url).pathname }).build((error, result) => error ? reject(error) : resolve(result)));
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let corrections: Correction[] = [];
    const analyzed: string[] = [];
    await page.exposeFunction('analyzeFixture', (text: string) => { analyzed.push(text); return { annotations: analyze(text, value => tokenizer.tokenize(value), corrections) }; });
    await page.goto('about:blank');
    const fonts: string[] = [];
    await page.route('https://hanori.invalid/fonts/*', async route => {
      const file = new URL(route.request().url()).pathname.split('/').pop()!;
      fonts.push(file);
      await route.fulfill({ contentType: 'font/otf', headers: { 'Access-Control-Allow-Origin': '*' }, body: await readFile(new URL(`../dist/${file}`, import.meta.url)) });
    });
    await page.evaluate(() => {
      const NativeFontFace = FontFace;
      (globalThis as any).FontFace = class extends NativeFontFace {
        constructor(family: string, source: string) {
          if (source.includes('local("Hanori')) throw new Error('Safari hides user-installed fonts');
          super(family, source);
        }
      };
      (globalThis as any).browser = { runtime: {
        getManifest: () => ({ web_accessible_resources: [{ resources: ['fonts/HanoriSansFurigana-Regular.otf', 'fonts/HanoriSerifFurigana-Regular.otf'] }] }),
        getURL: (path: string) => 'https://hanori.invalid/' + path,
        sendMessage: (message: { text: string }) => (globalThis as any).analyzeFixture(message.text),
      } };
    });
    await page.setContent('<!doctype html><html lang="ja"><meta charset="utf-8"><p id="text">かきまぜながら<em>熱</em>します。</p><p id="ambiguous">生物を食べる。</p><p id="rejoin">本を取り出す。</p><ruby id="author">日本<rt>にっぽん</rt></ruby><p lang="zh">日本文化</p></html>');
    const original = await page.locator('body').textContent();
    const font = { enabled: true, family: 'serif' as const, includeUntagged: false, mode: 'font' as const };
    assert.equal((await page.evaluate(reader, font)).error, undefined);
    assert.equal((await page.evaluate(reader, { ...font, family: 'sans' as const })).error, undefined);
    assert.deepEqual(fonts.sort(), ['HanoriSansFurigana-Regular.otf', 'HanoriSerifFurigana-Regular.otf']);
    const result = await page.evaluate(reader, { ...font, mode: 'accurate' as const });
    assert.equal(result.error, undefined, result.error);
    assert.equal(await page.locator('#text em rt').textContent(), 'ねっ');
    assert.equal(await page.locator('#author rt').textContent(), 'にっぽん');
    assert.ok(!(await page.locator('#ambiguous ruby').allTextContents()).some(text => text.startsWith('生物')));
    assert.equal(await page.locator('[lang="zh"] span').count(), 0);
    // Content added elsewhere must not rebuild or re-analyze existing readings.
    const before = analyzed.length;
    await page.evaluate(() => {
      (document.querySelector('#text rt') as any).kept = true;
      document.body.append(Object.assign(document.createElement('img'), { alt: '' }));
      document.body.append(Object.assign(document.createElement('p'), { id: 'added', textContent: '学校へ行く。' }));
    });
    await page.waitForSelector('#added rt');
    assert.equal(await page.evaluate(() => (document.querySelector('#text rt') as any).kept), true);
    assert.deepEqual(analyzed.slice(before), ['学校へ行く。']);
    // Re-annotate across earlier ruby boundaries.
    assert.deepEqual(await page.locator('#rejoin rt').allTextContents(), ['ほん', 'とりだ']);
    corrections = [{ id: 'test', scope: 'document', target: '', context: '本を取り出す', surface: '取り出す', reading: 'とりだす' }];
    assert.equal((await page.evaluate(reader, { ...font, mode: 'accurate' as const })).error, undefined);
    assert.deepEqual(await page.locator('#rejoin rt').allTextContents(), ['ほん', 'とりだす']);
    await page.evaluate(reader, { ...font, enabled: false });
    assert.equal(await page.locator('body').textContent(), original + '学校へ行く。');
    assert.equal(await page.locator('rt[data-hanori-owner]').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
