import { api } from './browser-api.js';
import type { Preferences, ReaderStatus } from './reader.js';
import type { Correction } from './analysis.js';

const form = document.querySelector('form')!;
const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const family = document.querySelector<HTMLSelectElement>('#family')!;
const mode = document.querySelector<HTMLSelectElement>('#mode')!;
const untagged = document.querySelector<HTMLInputElement>('#untagged')!;
const always = document.querySelector<HTMLInputElement>('#always')!;
const status = document.querySelector<HTMLElement>('#status')!;
const print = document.querySelector<HTMLButtonElement>('#print')!;
let tabId: number;
let origin: string;
let key: string;
let active = false;

async function send(preferences?: Preferences | 'print'): Promise<ReaderStatus> {
  const response = await api.runtime.sendMessage({ type: 'reader', tabId, preferences });
  if (response.error) throw new Error(response.error);
  return response.status;
}
const preferences = (): Preferences => ({ enabled: enabled.checked, family: family.value as Preferences['family'], includeUntagged: untagged.checked, mode: mode.value as Preferences['mode'] });
function report(state: ReaderStatus) {
  active = state.enabled && !state.error;
  status.textContent = state.error ?? (state.enabled ? state.mode === 'accurate'
    ? `Accurate mode on · ${state.count} readings. Uncertain words may be left plain.${state.skipped ? ` ${state.skipped} block(s) or inline-split readings omitted.` : ''}`
    : `Font mode on · ${state.count} text spans. Readings may be incorrect.` : 'Readings are off.');
  print.disabled = !active;
}
function busy(value: boolean) {
  for (const input of form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) input.disabled = value;
  if (!value) { always.disabled = !origin; print.disabled = !active; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const next = preferences();
  const remember = always.checked && next.enabled;
  busy(true);
  status.textContent = next.mode === 'accurate' && next.enabled ? 'Analyzing locally… The first load opens the bundled dictionary.' : 'Applying…';
  try {
    // Must run inside the user gesture.
    if (remember && !await api.permissions.request({ origins: [`${origin}/*`] })) throw new Error('Site access was not granted. Uncheck Always enable to apply once.');
    const state = await send(next);
    if (origin) {
      if (remember) await api.storage.local.set({ [key]: next });
      else await api.storage.local.remove(key);
    }
    always.checked = remember;
    report(state);
  } catch (error) {
    status.textContent = String((error as Error).message);
    // Keep Print disabled after a failed apply.
    active = false;
  }
  finally { busy(false); }
});
print.addEventListener('click', async () => {
  try { await send('print'); } catch (error) { status.textContent = String((error as Error).message); }
});

busy(true);
try {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('Open a regular webpage, then reopen Hanori.');
  tabId = tab.id;
  const url = new URL(tab.url);
  origin = /^https?:$/.test(url.protocol) ? url.origin : '';
  key = `site:${origin}`;
  const saved = origin ? (await api.storage.local.get(key))[key] : undefined;
  const state = await send();
  enabled.checked = state.enabled;
  family.value = state.family;
  mode.value = state.mode ?? 'font';
  untagged.checked = state.includeUntagged;
  always.checked = Boolean(saved);
  document.querySelector('#site')!.textContent = origin || 'Current local file';
  busy(false);
  report(state);
  await loadCorrections();
} catch (error) { status.textContent = String((error as Error).message); }

async function correctionRequest(action: string, extra: Record<string, unknown> = {}): Promise<Correction[]> {
  const response = await api.runtime.sendMessage({ type: 'corrections', tabId, action, ...extra });
  if (response.error) throw new Error(response.error);
  return response.corrections;
}
async function loadCorrections() {
  const list = document.querySelector('#correction-list')!;
  list.replaceChildren();
  for (const correction of await correctionRequest('list')) {
    const item = document.createElement('li');
    item.append(document.createTextNode(`${correction.surface} → ${correction.reading} · ${correction.scope}\n“${correction.context}”`));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await correctionRequest('delete', { id: correction.id });
        await refreshCorrections();
      } catch (error) { document.querySelector('#correction-status')!.textContent = String((error as Error).message); remove.disabled = false; }
    });
    item.append(remove); list.append(item);
  }
}
async function refreshCorrections() {
  await loadCorrections();
  const current = await send();
  if (current.enabled && current.mode === 'accurate') report(await send(current));
  document.querySelector('#correction-status')!.textContent = 'Saved locally. Corrections apply in Accurate mode.';
}
document.querySelector('#correction-form')!.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector<HTMLButtonElement>('#correction-form button')!;
  const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!.value;
  button.disabled = true;
  try {
    await correctionRequest('save', { correction: { scope: field('scope'), context: field('context'), surface: field('surface'), reading: field('reading') } });
    await refreshCorrections();
  } catch (error) { document.querySelector('#correction-status')!.textContent = String((error as Error).message); }
  finally { button.disabled = false; }
});
