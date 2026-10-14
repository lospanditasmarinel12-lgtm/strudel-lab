import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadApi() {
  return await import('./freesound-api');
}

describe('freesound-api', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it('stores and reads the key (localStorage fallback)', async () => {
    const api = await loadApi();
    expect(await api.hasApiKey()).toBe(false);
    await api.setApiKey('abc123');
    expect(await api.getApiKey()).toBe('abc123');
    expect(await api.hasApiKey()).toBe(true);
    await api.clearApiKey();
    expect(await api.hasApiKey()).toBe(false);
  });

  it('sends the key via the Authorization header, not the URL', async () => {
    const api = await loadApi();
    await api.setApiKey('secret-key');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.searchSounds('kick');

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain('token=');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Token secret-key');
  });

  it('throws NO_KEY when no key is set', async () => {
    const api = await loadApi();
    await expect(api.searchSounds('kick')).rejects.toMatchObject({ code: 'NO_KEY' });
  });

  it('validateApiKey uses the Authorization header', async () => {
    const api = await loadApi();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await api.validateApiKey('k')).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain('token=');
    expect((opts.headers as Record<string, string>).Authorization).toBe('Token k');
  });
});
