/**
 * Key/value secret storage.
 *
 * In the Electron build, values are stored via the OS keychain using
 * `safeStorage` (exposed on `window.electronAPI.secureStore`). In the browser
 * build, falls back to `localStorage` (plaintext — acceptable for the web app).
 */

function electronStore(): NonNullable<Window['electronAPI']>['secureStore'] {
  if (typeof window === 'undefined') return undefined;
  return window.electronAPI?.secureStore;
}

export async function secureGet(key: string): Promise<string | null> {
  const store = electronStore();
  if (store) {
    try {
      return await store.get(key);
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  const store = electronStore();
  if (store) {
    try {
      await store.set(key, value);
      return;
    } catch {
      /* fall through to localStorage */
    }
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export async function secureClear(key: string): Promise<void> {
  const store = electronStore();
  if (store) {
    try {
      await store.clear(key);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
