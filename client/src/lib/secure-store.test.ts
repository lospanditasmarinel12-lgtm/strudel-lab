import { describe, it, expect, vi, beforeEach } from 'vitest';
import { secureClear, secureGet, secureSet } from './secure-store';

describe('secure-store', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it('falls back to localStorage when there is no electronAPI', async () => {
    await secureSet('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(await secureGet('k')).toBe('v');
    await secureClear('k');
    expect(await secureGet('k')).toBeNull();
  });

  it('prefers electronAPI.secureStore when present', async () => {
    const map = new Map<string, string>();
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      secureStore: {
        get: vi.fn(async (k: string) => map.get(k) ?? null),
        set: vi.fn(async (k: string, v: string) => {
          map.set(k, v);
          return true;
        }),
        clear: vi.fn(async (k: string) => {
          map.delete(k);
          return true;
        }),
      },
    };

    await secureSet('k', 'v');
    expect(map.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBeNull();
    expect(await secureGet('k')).toBe('v');
    await secureClear('k');
    expect(await secureGet('k')).toBeNull();
  });

  it('falls back to localStorage when the electron store throws', async () => {
    (window as Window & { electronAPI?: unknown }).electronAPI = {
      secureStore: {
        get: vi.fn(async () => {
          throw new Error('boom');
        }),
        set: vi.fn(async () => {
          throw new Error('boom');
        }),
        clear: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    };
    await secureSet('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(await secureGet('k')).toBe('v');
  });
});
