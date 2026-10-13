import { db, type SampleCacheEntry, type CustomSample } from '@/lib/stores/db';
import { debugLog } from '@/lib/logger';
import { nanoid } from 'nanoid';

let bankManifest: Record<string, string[]> | null = null;
let manifestLoading = false;
let manifestPromise: Promise<Record<string, string[]> | null> | null = null;

const MANIFEST_URL = 'https://raw.githubusercontent.com/tidalcycles/dirt-samples/main/strudel.json';
const SAMPLE_BASE = 'github:tidalcycles/dirt-samples';

export const loadedBanks = new Set<string>();

export function extractBankNames(code: string): string[] {
  const banks = new Set<string>();
  const bankRegex = /\.bank\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = bankRegex.exec(code)) !== null) banks.add(match[1].trim());
  const soundRegex = /\.sound\(\s*["'](gm_[^"']+)["']\s*\)/g;
  while ((match = soundRegex.exec(code)) !== null) banks.add('gm');
  return Array.from(banks);
}

export async function loadManifest(): Promise<Record<string, string[]> | null> {
  if (bankManifest) return bankManifest;
  if (manifestLoading && manifestPromise) return manifestPromise;
  manifestLoading = true;
  manifestPromise = (async () => {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bankManifest = await res.json() as Record<string, string[]>;
      debugLog(`[SampleRegistry] Manifest loaded — ${Object.keys(bankManifest).length} banks`);
      return bankManifest;
    } catch (e: any) {
      console.warn('[SampleRegistry] Manifest fetch failed:', e instanceof Error ? e.message : e);
      manifestLoading = false;
      manifestPromise = null;
      return null;
    }
  })();
  return manifestPromise;
}

function findInManifest(bankName: string, manifest: Record<string, string[]>): string[] | null {
  if (manifest[bankName]) return manifest[bankName];
  const lowerBank = bankName.toLowerCase();
  for (const key of Object.keys(manifest)) {
    if (key.toLowerCase() === lowerBank) return manifest[key];
    if (key.toLowerCase().includes('_' + lowerBank) || lowerBank.includes('_' + key.toLowerCase())) return manifest[key];
  }
  const matchKey = Object.keys(manifest).find(k => k.toLowerCase().includes(lowerBank) || lowerBank.includes(k.toLowerCase()));
  if (matchKey) return manifest[matchKey];
  const startsWith = Object.keys(manifest).filter(k => k.toLowerCase().startsWith(lowerBank));
  if (startsWith.length > 0) {
    const combined: string[] = [];
    for (const k of startsWith) combined.push(...manifest[k]);
    return combined;
  }
  return null;
}

function extractInstrumentsFromPaths(paths: string[]): string[] {
  const instruments = new Set<string>();
  for (const path of paths) {
    const parts = path.split('/');
    if (parts.length >= 2) instruments.add(parts[0].toLowerCase());
    else {
      const name = parts[0].replace(/\.wav$/i, '').replace(/[_\d].*$/, '').toLowerCase();
      if (name) instruments.add(name);
    }
  }
  return instruments.size === 0 ? ['default'] : Array.from(instruments);
}

async function discoverFromGithub(bankName: string): Promise<string[] | null> {
  try {
    const res = await fetch('https://api.github.com/repos/tidalcycles/dirt-samples/contents/' + bankName);
    if (!res.ok) return null;
    const contents = await res.json() as { name: string; type: string }[];
    if (!Array.isArray(contents)) return null;
    const instruments = new Set<string>();
    for (const entry of contents) {
      if (entry.type === 'dir') instruments.add(entry.name.toLowerCase());
      else if (entry.type === 'file' && /\.wav$/i.test(entry.name)) {
        const name = entry.name.replace(/\.wav$/i, '').replace(/[_\d].*$/, '').toLowerCase();
        if (name) instruments.add(name);
      }
    }
    return instruments.size === 0 ? (contents.some(e => e.type === 'file') ? ['default'] : null) : Array.from(instruments);
  } catch { return null; }
}

async function discoverBank(bankName: string): Promise<string[] | null> {
  const cached = await db.sampleCache.get(bankName);
  if (cached) return cached.instruments;
  const manifest = await loadManifest();
  if (manifest) {
    const paths = findInManifest(bankName, manifest);
    if (paths) {
      const instruments = extractInstrumentsFromPaths(paths);
      await db.sampleCache.put({ bankName, instruments, discoveredAt: Date.now() });
      debugLog(`[SampleRegistry] Discovered bank "${bankName}"`);
      return instruments;
    }
  }
  const instruments = await discoverFromGithub(bankName);
  if (instruments) await db.sampleCache.put({ bankName, instruments, discoveredAt: Date.now() });
  return instruments;
}

export async function ensureBankLoaded(bankName: string): Promise<void> {
  const norm = bankName.trim();
  if (!norm || loadedBanks.has(norm)) return;
  const manifest = await loadManifest();
  if (!manifest) return;
  const paths = findInManifest(norm, manifest);
  if (!paths) { console.warn(`[SampleRegistry] Unknown bank "${norm}"`); return; }
  const instrumentPaths = new Map<string, string[]>();
  for (const p of paths) {
    const parts = p.split('/');
    if (parts.length >= 2) {
      const inst = parts[0].toLowerCase();
      if (!instrumentPaths.has(inst)) instrumentPaths.set(inst, []);
      instrumentPaths.get(inst)!.push(p);
    }
  }
  if (instrumentPaths.size === 0) return;
  try {
    const { samples } = await import('@strudel/web');
    const sampleMap: Record<string, string[]> = {};
    for (const [inst, instPaths] of instrumentPaths) {
      sampleMap[inst === 'default' ? norm.toLowerCase() : inst] = instPaths;
    }
    samples(sampleMap, SAMPLE_BASE);
    loadedBanks.add(norm);
  } catch (e) { console.warn(`[SampleRegistry] Failed to register bank "${norm}":`, e); }
}

export async function ensureSoundfontsLoaded(): Promise<void> {
  if (loadedBanks.has('gm')) return;
  try { const { registerSoundfonts } = await import('@strudel/soundfonts'); registerSoundfonts(); loadedBanks.add('gm'); } catch {}
}

export async function scanAndRegisterBanks(code: string): Promise<void> {
  const banks = extractBankNames(code);
  for (const bank of banks) {
    if (bank === 'gm') await ensureSoundfontsLoaded();
    else await ensureBankLoaded(bank);
  }
}

export async function registerCustomSample(
  name: string,
  fileOrBlob: File | Blob,
  sourceType: 'local' | 'url' = 'local',
  originalUrl?: string
): Promise<string> {
  let resolvedName = name.replace(/\.(wav|mp3|ogg|flac)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_');
  if (!resolvedName) resolvedName = `sample_${nanoid(6)}`;
  let finalName = resolvedName;
  let counter = 1;
  while (await db.customSamples.get(finalName)) finalName = `${resolvedName}_${counter++}`;
  const blob = fileOrBlob instanceof File ? new Blob([await fileOrBlob.arrayBuffer()], { type: fileOrBlob.type }) : fileOrBlob;
  const blobUrl = URL.createObjectURL(blob);
  try { const { samples } = await import('@strudel/web'); samples({ [finalName]: [blobUrl] }); } catch (e) {}
  await db.customSamples.put({ name: finalName, fileName: fileOrBlob instanceof File ? fileOrBlob.name : finalName, audioData: blob, sourceType, originalUrl, category: 'custom', createdAt: Date.now() });
  return finalName;
}

export async function removeCustomSample(name: string): Promise<void> { await db.customSamples.delete(name); }

/**
 * Restore a custom sample that was bundled into a shared Song/Live-set file.
 * Unlike `registerCustomSample`, this keeps the exact name referenced by the
 * shared code (overwriting any local sample with the same name) so playback is
 * faithful to the artist's version.
 */
export async function importCustomSample(name: string, blob: Blob, mime?: string): Promise<void> {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_') || `sample_${nanoid(6)}`;
  const typedBlob = blob.type ? blob : new Blob([blob], { type: mime || 'audio/wav' });
  const existing = await db.customSamples.get(safeName);
  try {
    const blobUrl = URL.createObjectURL(typedBlob);
    const { samples } = await import('@strudel/web');
    samples({ [safeName]: [blobUrl] });
  } catch (e) {
    console.warn(`[SampleRegistry] Failed to register imported sample "${safeName}"`, e);
  }
  await db.customSamples.put({
    name: safeName,
    fileName: existing?.fileName || safeName,
    audioData: typedBlob,
    sourceType: existing?.sourceType || 'local',
    originalUrl: existing?.originalUrl,
    category: 'custom',
    createdAt: existing?.createdAt || Date.now(),
  });
}

export async function getCustomSamples(): Promise<CustomSample[]> {
  return db.customSamples.orderBy('createdAt').reverse().toArray();
}

export async function rehydrateCustomSamples(): Promise<void> {
  const samples = await getCustomSamples();
  for (const sample of samples) {
    try {
      const blobUrl = URL.createObjectURL(sample.audioData);
      const { samples: samFunc } = await import('@strudel/web');
      samFunc({ [sample.name]: [blobUrl] });
    } catch (e) { console.warn(`[SampleRegistry] Failed to rehydrate "${sample.name}"`); }
  }
  debugLog(`[SampleRegistry] Rehydrated ${samples.length} custom samples`);
}

export async function downloadYoutubeAudio(url: string, name: string): Promise<Blob> {
  if (typeof window !== 'undefined' && window.electronAPI?.downloadYoutube) {
    const buffer = await window.electronAPI.downloadYoutube(url, { name });
    return new Blob([buffer]);
  }
  throw new Error('YouTube downloads require the desktop app (Electron build)');
}

export async function processCodeSamples(
  code: string,
  _onProgress?: (msg: string) => void
): Promise<string> {
  return code;
}
