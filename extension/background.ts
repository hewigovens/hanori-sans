import { api } from './browser-api.js';
import { reader, type Preferences } from './reader.js';
import { analyze, documentKey, matchingCorrections, validateCorrection, type Correction } from './analysis.js';
import { loadTokenizer } from './tokenizer.js';

let tokenizer: ReturnType<typeof loadTokenizer> | undefined;
let correctionQueue = Promise.resolve();
async function corrections(): Promise<Correction[]> {
  return ((await api.storage.local.get('corrections')).corrections ?? []) as Correction[];
}

api.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== api.runtime.id) return;
  if (message?.type === 'analyze' && sender.tab && sender.frameId === 0) {
    (async () => {
      if (typeof message.text !== 'string' || message.text.length > 8000) throw new Error('Text exceeds the local analysis limit.');
      const url = sender.url;
      if (!url || !/^(https?|file):/.test(url)) throw new Error('Unsupported document.');
      tokenizer ??= loadTokenizer().catch(error => { tokenizer = undefined; throw error; });
      const engine = await tokenizer;
      const rules = matchingCorrections(await corrections(), url);
      return { annotations: analyze(message.text, text => engine.tokenize(text), rules) };
    })().then(respond, error => respond({ error: `Local analysis failed: ${error.message}` }));
    return true;
  }
  if (sender.url !== api.runtime.getURL('popup.html') || !['reader', 'corrections'].includes(message?.type)) return;
  (async () => {
    const tab = await api.tabs.get(message.tabId);
    if (!tab.url || !/^(https?|file):/.test(tab.url)) throw new Error('Open a regular webpage first. Browser settings, stores, and PDF viewers are not supported.');
    if (message.type === 'corrections') {
      const url = tab.url;
      const change = async () => {
        let values = await corrections();
        const visible = matchingCorrections(values, url);
        if (message.action === 'save') {
          const value = message.correction as Correction;
          const scope = value.scope;
          const target = scope === 'site' ? new URL(url).origin : documentKey(url);
          if (scope === 'site' && target === 'null') throw new Error('Local-file corrections must use This document.');
          const rule = { ...value, target, id: crypto.randomUUID() };
          validateCorrection(rule);
          values = values.filter(c => !(c.scope === scope && c.target === target && c.context === rule.context && c.surface === rule.surface));
          if (values.length >= 500) throw new Error('The 500-correction limit has been reached. Remove an old correction first.');
          values.unshift(rule);
          await api.storage.local.set({ corrections: values });
        } else if (message.action === 'delete') {
          if (!visible.some(c => c.id === message.id)) throw new Error('This correction does not belong to the current document or site.');
          values = values.filter(c => c.id !== message.id);
          // Safari rejects an empty array here.
          if (values.length) await api.storage.local.set({ corrections: values });
          else await api.storage.local.remove('corrections');
        } else if (message.action !== 'list') throw new Error('Unknown correction action.');
        return { corrections: matchingCorrections(values, url) };
      };
      const result = correctionQueue.then(change);
      correctionQueue = result.then(() => {}, () => {});
      return result;
    }
    const results = await api.scripting.executeScript({
      target: { tabId: message.tabId }, func: reader,
      args: message.preferences === undefined ? [] : [message.preferences],
    });
    const result = results[0];
    if (!result?.result) throw new Error('This page does not allow Hanori to run.');
    if (result.result.error && message.preferences !== undefined) throw new Error(result.result.error);
    return { status: result.result };
  })().then(respond, error => respond({ error: String(error.message ?? error) }));
  return true;
});

async function reconcile() {
  const registered = await api.scripting.getRegisteredContentScripts();
  if (registered.length) await api.scripting.unregisterContentScripts({ ids: registered.map(s => s.id) });
  const values = await api.storage.local.get(null);
  const scripts: chrome.scripting.RegisteredContentScript[] = [];
  for (const [key, prefs] of Object.entries(values)) {
    if (!key.startsWith('site:') || !(prefs as Preferences)?.enabled) continue;
    const origin = key.slice(5);
    const match = `${origin}/*`;
    if (!/^https?:\/\//.test(origin) || !await api.permissions.contains({ origins: [match] })) continue;
    scripts.push({ id: `hanori-${scripts.length}`, matches: [match], js: ['automatic.js'], runAt: 'document_idle' });
  }
  if (scripts.length) await api.scripting.registerContentScripts(scripts);
}
let pending = Promise.resolve();
function schedule() { pending = pending.then(reconcile, reconcile).catch(error => console.error('Hanori site settings:', error)); }
api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && Object.keys(changes).some(key => key.startsWith('site:'))) schedule(); });
api.permissions.onRemoved.addListener(schedule);
api.runtime.onInstalled.addListener(schedule);
api.runtime.onStartup.addListener(schedule);
