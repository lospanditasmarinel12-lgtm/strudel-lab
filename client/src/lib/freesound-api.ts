import { secureClear, secureGet, secureSet } from './secure-store';

const API_BASE = 'https://freesound.org/apiv2';
const STORAGE_KEY = 'freesound_api_key';

// In-memory cache so requests don't hit the (possibly IPC-backed) store each time.
let cachedKey: string | null | undefined;

export interface FreesoundSound {
  id: number;
  name: string;
  tags: string[];
  username: string;
  previews: {
    'preview-hq-mp3': string;
    'preview-lq-mp3': string;
    'preview-hq-ogg': string;
    'preview-lq-ogg': string;
  };
  duration: number;
  description: string;
  license: string;
}

export interface FreesoundSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundSound[];
}

export class FreesoundApiError extends Error {
  code: 'NO_KEY' | 'INVALID_KEY' | 'RATE_LIMITED' | 'NETWORK' | 'SERVER_ERROR';
  constructor(message: string, code: FreesoundApiError['code']) {
    super(message);
    this.name = 'FreesoundApiError';
    this.code = code;
  }
}

export async function getApiKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = await secureGet(STORAGE_KEY);
  return cachedKey;
}

export async function setApiKey(key: string): Promise<void> {
  cachedKey = key;
  await secureSet(STORAGE_KEY, key);
}

export async function clearApiKey(): Promise<void> {
  cachedKey = null;
  await secureClear(STORAGE_KEY);
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}

/** Authenticate via the `Authorization` header (keeps the key out of URLs). */
function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Token ${key}` };
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/search/?query=test&page_size=1`, {
      headers: authHeaders(key),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function freesoundFetch(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal
): Promise<any> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new FreesoundApiError('Freesound API key not set', 'NO_KEY');

  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal, headers: authHeaders(apiKey) });
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    throw new FreesoundApiError(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'NETWORK');
  }

  if (res.status === 401 || res.status === 403) {
    throw new FreesoundApiError('Invalid Freesound API key', 'INVALID_KEY');
  }
  if (res.status === 429) {
    throw new FreesoundApiError('Too many requests. Please wait a moment.', 'RATE_LIMITED');
  }
  if (!res.ok) {
    throw new FreesoundApiError(`Freesound API error: HTTP ${res.status}`, 'SERVER_ERROR');
  }

  return res.json();
}

export async function searchSounds(
  query: string,
  page: number = 1,
  pageSize: number = 20,
  signal?: AbortSignal
): Promise<FreesoundSearchResponse> {
  if (!query.trim()) throw new FreesoundApiError('Search query cannot be empty', 'NO_KEY');
  return freesoundFetch('/search/', {
    query: query.trim(),
    page: String(page),
    page_size: String(pageSize),
    fields: 'id,name,tags,username,previews,duration,description,license',
  }, signal);
}

export async function getSoundDetail(
  soundId: number,
  signal?: AbortSignal
): Promise<FreesoundSound> {
  return freesoundFetch(`/sounds/${soundId}/`, {
    fields: 'id,name,tags,username,previews,duration,description,license',
  }, signal);
}

export function getPreviewUrl(sound: FreesoundSound): string {
  return sound.previews['preview-hq-mp3'] || sound.previews['preview-lq-mp3'] || '';
}
