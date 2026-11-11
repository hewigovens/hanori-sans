// Safari uses `browser`; Chromium uses `chrome`.
export const api = (globalThis as typeof globalThis & { browser?: typeof chrome }).browser ?? globalThis.chrome;
