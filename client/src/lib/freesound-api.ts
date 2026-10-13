const API_BASE = 'https://freesound.org/apiv2';
const STORAGE_KEY = 'freesound_api_key';

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

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiKey(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/search/?query=test&page_size=1&token=${key}`);
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
  const apiKey = getApiKey();
  if (!apiKey) throw new FreesoundApiError('Freesound API key not set', 'NO_KEY');

  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  url.searchParams.set('token', apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal });
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
