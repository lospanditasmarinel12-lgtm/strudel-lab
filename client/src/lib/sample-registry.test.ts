import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/stores/db';

const { samplesMock, registerSoundfontsMock } = vi.hoisted(() => ({
  samplesMock: vi.fn(),
  registerSoundfontsMock: vi.fn(),
}));

vi.mock('@strudel/web', () => ({ samples: samplesMock }));
vi.mock('@strudel/soundfonts', () => ({ registerSoundfonts: registerSoundfontsMock }));

import {
  extractBankNames,
  registerCustomSample,
  importCustomSample,
  removeCustomSample,
  getCustomSamples,
} from './sample-registry';

describe('extractBankNames', () => {
  it('finds .bank(...) names', () => {
    expect(extractBankNames('s("bd").bank("RolandTR909")')).toEqual(['RolandTR909']);
  });

  it('maps gm_ soundfonts to the gm bank', () => {
    expect(extractBankNames('s("bd").sound("gm_piano")')).toEqual(['gm']);
  });

  it('dedups and returns empty for no banks', () => {
    expect(extractBankNames('s("bd")')).toEqual([]);
    expect(extractBankNames('s("bd").bank("A").bank("A")')).toEqual(['A']);
  });
});

describe('registerCustomSample', () => {
  beforeEach(async () => {
    samplesMock.mockClear();
    await db.customSamples.clear();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sample');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes unsafe characters in the name', async () => {
    const name = await registerCustomSample('my vox!!.wav', new Blob(['x']));
    expect(name).toMatch(/^[A-Za-z0-9_]+$/);
    expect(name.startsWith('my_vox')).toBe(true);
    expect(await db.customSamples.get(name)).toBeDefined();
  });

  it('suffixes on name collision instead of overwriting', async () => {
    const first = await registerCustomSample('kick', new Blob(['a']));
    const second = await registerCustomSample('kick', new Blob(['b']));
    expect(first).toBe('kick');
    expect(second).toBe('kick_1');
    expect(await db.customSamples.count()).toBe(2);
  });

  it('registers the blob with strudel', async () => {
    await registerCustomSample('snare', new Blob(['x']));
    expect(samplesMock).toHaveBeenCalledWith({ snare: ['blob:sample'] });
  });
});

describe('importCustomSample', () => {
  beforeEach(async () => {
    samplesMock.mockClear();
    await db.customSamples.clear();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:imported');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the exact referenced name', async () => {
    await importCustomSample('vox', new Blob(['x']), 'audio/wav');
    expect(await db.customSamples.get('vox')).toBeDefined();
    expect(samplesMock).toHaveBeenCalledWith({ vox: ['blob:imported'] });
  });

  it('overwrites an existing sample of the same name (faithful playback)', async () => {
    await registerCustomSample('vox', new Blob(['old']));
    const existing = await db.customSamples.get('vox');
    await importCustomSample('vox', new Blob(['new']), 'audio/wav');
    const after = await db.customSamples.get('vox');
    expect(after).toBeDefined();
    // One row, same identity, createdAt preserved across the overwrite.
    expect(await db.customSamples.count()).toBe(1);
    expect(after!.createdAt).toBe(existing!.createdAt);
    expect(samplesMock).toHaveBeenLastCalledWith({ vox: ['blob:imported'] });
  });

  it('sanitizes names that would otherwise be unsafe', async () => {
    await importCustomSample('a/b?c', new Blob(['x']), 'audio/wav');
    expect(await db.customSamples.get('a_b_c')).toBeDefined();
  });

  it('preserves an epoch-0 createdAt on overwrite', async () => {
    await db.customSamples.put({
      name: 'vox',
      fileName: 'vox',
      audioData: new Blob(['x']),
      sourceType: 'local',
      category: 'custom',
      createdAt: 0,
    });
    await importCustomSample('vox', new Blob(['y']), 'audio/wav');
    const after = await db.customSamples.get('vox');
    expect(after!.createdAt).toBe(0);
  });
});

describe('getCustomSamples ordering', () => {
  beforeEach(async () => {
    await db.customSamples.clear();
  });

  it('returns newest first', async () => {
    await db.customSamples.put({ name: 'a', fileName: 'a', audioData: new Blob(['a']), sourceType: 'local', category: 'custom', createdAt: 1 });
    await db.customSamples.put({ name: 'b', fileName: 'b', audioData: new Blob(['b']), sourceType: 'local', category: 'custom', createdAt: 2 });
    const list = await getCustomSamples();
    expect(list.map((s) => s.name)).toEqual(['b', 'a']);
  });

  it('removeCustomSample deletes the row', async () => {
    await db.customSamples.put({ name: 'z', fileName: 'z', audioData: new Blob(['z']), sourceType: 'local', category: 'custom', createdAt: 1 });
    await removeCustomSample('z');
    expect(await db.customSamples.get('z')).toBeUndefined();
  });
});
