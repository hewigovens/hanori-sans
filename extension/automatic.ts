import { api } from './browser-api.js';
import { reader, type Preferences } from './reader.js';

// Runs on sites saved as Always enable.
void (async () => {
  const key = `site:${location.origin}`;
  const prefs = (await api.storage.local.get(key))[key] as Preferences | undefined;
  if (!prefs?.enabled) return;
  const result = await reader(prefs);
  if (result.error) console.warn('Hanori:', result.error);
})().catch(error => console.warn('Hanori:', error.message));
