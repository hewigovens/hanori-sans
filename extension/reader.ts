import type { Annotation } from './analysis.js';

export interface Preferences {
  enabled: boolean;
  family: 'sans' | 'serif';
  includeUntagged: boolean;
  mode?: 'font' | 'accurate';
}
export interface ReaderStatus extends Preferences {
  count: number;
  skipped?: number;
  error?: string;
}

// Self-contained: Chrome serializes this function.
export async function reader(request?: Preferences | 'print'): Promise<ReaderStatus> {
  const api = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? globalThis.chrome;
  type Controller = { run: (request?: Preferences | 'print') => Promise<ReaderStatus> };
  const world = globalThis as typeof globalThis & { __hanoriReader?: Controller };
  if (!world.__hanoriReader) {
    let prefs: Preferences = { enabled: false, family: 'sans', includeUntagged: false, mode: 'font' };
    const wrappers = new Set<HTMLSpanElement>();
    const rubies = new Map<HTMLElement, HTMLElement>();
    const pieces = new WeakSet<Node>();
    const skipped = new Map<Node, number>();
    const pending = new Set<Node>();
    const analyzed = new Map<string, Annotation[]>();
    let face: FontFace | undefined;
    let observer: MutationObserver | undefined;
    let queue = Promise.resolve();
    let epoch = 0;
    let lastError: string | undefined;
    // randomUUID is unavailable on HTTP pages.
    const owner = Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
    const excluded = 'script,style,noscript,textarea,input,select,option,pre,code,kbd,samp,svg,math,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
    const allowed = (parent: Element) => {
      if (parent.closest(excluded) || document.designMode === 'on') return false;
      const lang = parent.closest('[lang]')?.getAttribute('lang')?.trim().toLowerCase();
      return lang ? /^ja(?:-|$)/.test(lang) : prefs.includeUntagged;
    };
    const contains = (root: Node, node: Node) => root === node || root.contains(node);
    const piece = (value: string) => { const node = document.createTextNode(value); pieces.add(node); return node; };
    const clear = (root?: Node) => {
      for (const [ruby, rt] of rubies) {
        if (!root || !ruby.isConnected || contains(root, ruby)) {
          rt.remove();
          const before = ruby.previousSibling;
          const first = before && pieces.has(before) ? before : ruby.firstChild;
          ruby.replaceWith(...ruby.childNodes);
          // Rejoin split text for later passes.
          if (first instanceof Text && pieces.has(first)) {
            for (let next = first.nextSibling; next instanceof Text && pieces.has(next); next = first.nextSibling) {
              first.appendData(next.data);
              next.remove();
            }
          }
          rubies.delete(ruby);
        }
      }
      for (const span of wrappers) {
        if (!root || !span.isConnected || contains(root, span)) {
          span.replaceWith(...span.childNodes);
          wrappers.delete(span);
        }
      }
      for (const node of skipped.keys()) if (!root || !node.isConnected || contains(root, node)) skipped.delete(node);
    };
    const observe = () => observer?.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['lang', 'contenteditable', 'role'],
    });
    const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    const isBlock = (element: Element) => /^(block|list-item|flex|grid|table-cell|table-caption|flow-root)$/.test(getComputedStyle(element).display);
    const block = (node: Node): Node => {
      let element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      while (element && element !== document.body) {
        if (!wrappers.has(element as HTMLSpanElement) && isBlock(element)) return element;
        element = element.parentElement;
      }
      return document.body;
    };
    // Queue the smallest region a page change can affect, so readings elsewhere stay in place.
    const changed = (records: MutationRecord[]) => {
      for (const record of records) {
        if (record.type !== 'childList') { pending.add(block(record.target)); continue; }
        for (const node of record.addedNodes) {
          if (!japanese.test(node.textContent ?? '')) continue;
          pending.add(node instanceof Element && isBlock(node) ? node : block(record.target));
        }
        // A removed block leaves the sentences around it intact; removed inline text does not.
        const inline = [...record.target.childNodes].some(node => node.nodeType === Node.TEXT_NODE && /\S/.test(node.nodeValue ?? ''));
        if (inline && [...record.removedNodes].some(node => japanese.test(node.textContent ?? ''))) pending.add(block(record.target));
      }
    };
    // Keep page changes that arrived while we were editing.
    const pause = () => { if (observer) { changed(observer.takeRecords()); observer.disconnect(); } };
    type Part = { node: Text; start: number; value: string; protected: boolean };
    type Group = { text: string; parts: Part[] };
    const collect = (root: Node) => {
      const groups: Group[] = [];
      let group: Group = { text: '', parts: [] };
      const flush = () => { if (group.text.trim()) groups.push(group); group = { text: '', parts: [] }; };
      const visit = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (!parent || !allowed(parent)) { flush(); return; }
          // Author ruby base stays sentence context.
          if (parent.closest('rt,rp')) return;
          const text = node as Text;
          group.parts.push({ node: text, start: group.text.length, value: text.data, protected: !!parent.closest('ruby') });
          group.text += text.data;
          return;
        }
        if (!(node instanceof Element)) return;
        if (node.matches(excluded)) { flush(); return; }
        if (node.tagName === 'BR') { flush(); return; }
        const boundary = node !== root && isBlock(node);
        if (boundary) flush();
        for (const child of node.childNodes) visit(child);
        if (boundary) flush();
      };
      visit(root);
      flush();
      return groups;
    };
    const wrap = (node: Text) => {
      if (!node.parentElement || wrappers.has(node.parentElement as HTMLSpanElement)) return;
      const span = document.createElement('span');
      span.style.setProperty('font-family', '"Hanori Extension Local"', 'important');
      span.style.setProperty('line-height', '1.8', 'important');
      node.replaceWith(span);
      span.append(node);
      wrappers.add(span);
    };
    // Returns how many readings were left out because their base crosses inline elements.
    const annotate = (group: Group, annotations: Annotation[]) => {
      for (const part of group.parts) {
        if (part.protected) continue;
        const fitting = annotations.filter(a => a.start >= part.start && a.end <= part.start + part.value.length);
        if (!fitting.length) continue;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        for (const annotation of fitting) {
          const start = annotation.start - part.start, end = annotation.end - part.start;
          fragment.append(piece(part.value.slice(cursor, start)));
          const ruby = document.createElement('ruby');
          const rt = document.createElement('rt');
          rt.textContent = annotation.reading;
          rt.dataset.hanoriOwner = owner;
          rt.style.setProperty('font-size', '.5em', 'important');
          ruby.style.setProperty('ruby-position', 'over', 'important');
          ruby.append(piece(part.value.slice(start, end)), rt);
          fragment.append(ruby);
          rubies.set(ruby, rt);
          cursor = end;
        }
        fragment.append(piece(part.value.slice(cursor)));
        part.node.replaceWith(fragment);
      }
      return annotations.filter(a => !group.parts.some(p => !p.protected && a.start >= p.start && a.end <= p.start + p.value.length) &&
        !group.parts.some(p => p.protected && a.start < p.start + p.value.length && a.end > p.start)).length;
    };
    const refresh = async (root: Node) => {
      if (!root.isConnected || !prefs.enabled) return;
      pause();
      clear(root);
      const groups = collect(root);
      for (const group of groups) for (const part of group.parts) {
        if (prefs.mode === 'accurate' ? japanese.test(part.value) : (!part.protected && /\p{Script=Han}/u.test(part.value))) wrap(part.node);
      }
      let omitted = 0;
      const waiting: Group[] = [];
      if (prefs.mode === 'accurate') {
        // Existing ruby needs the plain face too.
        for (const rt of root instanceof Element ? root.querySelectorAll('rt,rp') : []) {
          if (!allowed(rt)) continue;
          const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT);
          const nodes: Text[] = [];
          while (walker.nextNode()) nodes.push(walker.currentNode as Text);
          for (const node of nodes) wrap(node);
        }
        // Known text is restored before the next paint, so its readings never blink.
        for (const group of groups) {
          if (!/\p{Script=Han}/u.test(group.text)) continue;
          const known = analyzed.get(group.text);
          if (group.text.length > 8000) omitted++;
          else if (known) omitted += annotate(group, known);
          else waiting.push(group);
        }
      }
      observe();
      skipped.set(root, omitted);
      const revision = epoch;
      for (const group of waiting) {
        const response = await api.runtime.sendMessage({ type: 'analyze', text: group.text });
        if (revision !== epoch) return;
        if (response.error) throw new Error(response.error);
        if (analyzed.size >= 2000) analyzed.clear();
        analyzed.set(group.text, response.annotations);
        // The page changed this text meanwhile; its block is already queued again.
        if (group.parts.some(p => !p.node.isConnected || p.node.data !== p.value)) continue;
        pause();
        omitted += annotate(group, response.annotations);
        observe();
        skipped.set(root, omitted);
      }
    };
    const drain = async () => {
      const roots = [...pending].filter(node => ![...pending].some(other => other !== node && contains(other, node)));
      pending.clear();
      for (const root of roots) await refresh(root);
    };
    const enqueue = <T,>(work: () => Promise<T>): Promise<T> => {
      const result = queue.then(work);
      queue = result.then(() => {}, () => {});
      return result;
    };
    const onCopy = (event: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed || !event.clipboardData) return;
      const fragment = selection.getRangeAt(0).cloneContents();
      const readings = [...fragment.querySelectorAll('rt')].filter(rt => rt.dataset.hanoriOwner === owner);
      if (!readings.length) return;
      for (const rt of readings) rt.remove();
      event.clipboardData.setData('text/plain', fragment.textContent ?? '');
      event.preventDefault();
    };
    const stop = () => {
      observer?.disconnect(); observer = undefined;
      epoch++; pending.clear(); analyzed.clear(); clear();
      document.removeEventListener('copy', onCopy);
      if (face) document.fonts.delete(face);
      face = undefined;
    };
    const status = (): ReaderStatus => ({ ...prefs,
      count: prefs.mode === 'accurate' ? [...rubies.keys()].filter(s => s.isConnected).length : [...wrappers].filter(s => s.isConnected).length,
      skipped: [...skipped.values()].reduce((sum, n) => sum + n, 0), ...(lastError ? { error: lastError } : {}),
    });
    const apply = async (next?: Preferences | 'print') => {
      if (next === undefined) return status();
      if (next === 'print') {
        await drain();
        if (pending.size || lastError) throw new Error(lastError ?? 'The page is still changing. Wait before printing.');
        await document.fonts.ready;
        window.print();
        return status();
      }
      if (!['sans', 'serif'].includes(next.family) || typeof next.enabled !== 'boolean' || typeof next.includeUntagged !== 'boolean' ||
          (next.mode !== undefined && !['font', 'accurate'].includes(next.mode))) throw new Error('Invalid reading preferences.');
      let loaded: FontFace | undefined;
      if (next.enabled) {
        const name = next.family === 'sans' ? 'Hanori Sans Furigana' : 'Hanori Serif Furigana';
        const sources = next.mode === 'accurate'
          ? (next.family === 'sans' ? ['HiraginoSans-W3', 'YuGothic-Regular', 'Meiryo', 'NotoSansCJKjp-Regular'] : ['HiraMinProN-W3', 'YuMincho-Regular', 'MS-Mincho', 'NotoSerifCJKjp-Regular'])
          : [name.replaceAll(' ', '') + '-Regular', name + ' Regular'];
        const fontPath = `fonts/${name.replaceAll(' ', '')}-Regular.otf`;
        const bundled = next.mode !== 'accurate' && api.runtime?.getManifest?.().web_accessible_resources
          ?.some(resource => typeof resource !== 'string' && resource.resources.includes(fontPath));
        loaded = new FontFace('Hanori Extension Local', bundled
          ? `url("${api.runtime.getURL(fontPath)}")`
          : sources.map(n => `local("${n}")`).join(', '));
        try { await loaded.load(); } catch {
          throw new Error(next.mode === 'accurate' ? 'Accurate mode needs an installed plain Japanese font (Hiragino, Yu, Meiryo, MS Mincho, or Noto CJK JP). Automatic readings have not been replaced.' : bundled ? `Cannot load bundled ${name}. Reload the extension and page. This page may also restrict font loading.` : `Cannot load ${name}. Install it from Hanori dist/, then reopen the browser. This page may also restrict local fonts.`);
        }
      }
      stop(); lastError = undefined;
      prefs = { enabled: next.enabled, family: next.family, includeUntagged: next.includeUntagged, mode: next.mode ?? 'font' };
      if (loaded) {
        face = loaded; document.fonts.add(face);
        observer = new MutationObserver(records => {
          changed(records);
          void enqueue(drain).catch(error => { lastError = String(error.message ?? error); });
        });
        observe();
        try { await refresh(document.body); }
        catch (error) { lastError = String((error as Error).message ?? error); throw error; }
        if (prefs.mode === 'accurate') document.addEventListener('copy', onCopy);
      }
      return status();
    };
    world.__hanoriReader = { run: next => enqueue(() => apply(next)) };
  }
  try { return await world.__hanoriReader.run(request); }
  catch (error) { return { ...await world.__hanoriReader.run(), error: String((error as Error).message ?? error) }; }
}
