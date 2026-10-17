import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { webmToWav, audioBufferToWavBlob } from '@/lib/wav-encoder';
import { parseWav, dequantize } from '@/test/oracles/wav';
import { DecodingFakeAudioContext, installDecodingAudioContext } from '@/test/mocks/audio';

/**
 * Property + differential tests for the WAV encoder.
 *
 * The previous version asserted inside un-awaited `.then(...)` callbacks, so
 * every async assertion was vacuous. Here every assertion is awaited and the
 * output is verified with the independent RIFF reader in `oracles/wav.ts`.
 */

function createMockBuffer(
  length: number,
  sr: number,
  channels: number,
  fillFn?: (ch: number, i: number) => number,
): AudioBuffer {
  const bufs: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = fillFn ? fillFn(ch, i) : 0;
    bufs.push(data);
  }
  return {
    length,
    sampleRate: sr,
    numberOfChannels: channels,
    duration: length / sr,
    getChannelData: (ch: number) => bufs[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('fuzz: wav-encoder (audioBufferToWavBlob)', () => {
  test('produces a valid RIFF/WAVE container for arbitrary sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 44100 }),
        fc.integer({ min: 1, max: 2 }),
        fc.integer({ min: 8000, max: 96000 }),
        async (length, channels, sampleRate) => {
          const blob = audioBufferToWavBlob(createMockBuffer(length, sampleRate, channels, () => 0));
          expect(blob.type).toBe('audio/wav');
          const parsed = parseWav(await blob.arrayBuffer());
          expect(parsed.riff).toBe('RIFF');
          expect(parsed.wave).toBe('WAVE');
          expect(parsed.channels).toBe(channels);
          expect(parsed.sampleRate).toBe(sampleRate);
          expect(parsed.bitsPerSample).toBe(16);
          expect(parsed.blockAlign).toBe(channels * 2);
          expect(parsed.dataLength).toBe(length * channels * 2);
          expect(parsed.samples.length).toBe(length * channels);
        },
      ),
      { numRuns: 100 },
    );
  });

  test('quantizes samples and clamps out-of-range values', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.float({ min: -4, max: 4, noNaN: true }), { maxLength: 64 }), async (samples) => {
        const buffer = createMockBuffer(samples.length, 44100, 1, (_, i) => samples[i] ?? 0);
        const parsed = parseWav(await audioBufferToWavBlob(buffer).arrayBuffer());
        for (let i = 0; i < samples.length; i++) {
          const expected = Math.max(-1, Math.min(1, samples[i]));
          // int16 quantization tolerance.
          expect(Math.abs(dequantize(parsed.samples[i]) - expected)).toBeLessThan(1 / 30000);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('interleaves stereo channels in order', async () => {
    const buffer = createMockBuffer(3, 44100, 2, (ch, i) => (ch === 0 ? 0.5 : -0.5) + i * 0);
    const parsed = parseWav(await audioBufferToWavBlob(buffer).arrayBuffer());
    // frame0 = (ch0=+0.5, ch1=-0.5), frame1 = ...
    expect(parsed.samples[0]).toBeGreaterThan(0);
    expect(parsed.samples[1]).toBeLessThan(0);
    expect(parsed.samples[2]).toBeGreaterThan(0);
    expect(parsed.samples[3]).toBeLessThan(0);
  });
});

describe('wav-encoder (webmToWav)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installDecodingAudioContext();
  });

  afterEach(() => {
    restore();
  });

  test('returns a silent WAV for tiny blobs (below the decode threshold)', async () => {
    const result = await webmToWav(new Blob([new Uint8Array(100)], { type: 'audio/webm' }));
    const parsed = parseWav(await result.arrayBuffer());
    expect(parsed.dataLength).toBe(0);
    expect(parsed.channels).toBe(1);
  });

  test('decodes a real payload and re-encodes it (success path)', async () => {
    DecodingFakeAudioContext.nextChannels = 1;
    DecodingFakeAudioContext.nextLength = 4;
    DecodingFakeAudioContext.nextSampleRate = 22050;
    DecodingFakeAudioContext.nextFill = (_, i) => [0, 16384, -16384, 8192][i];
    const result = await webmToWav(new Blob([new Uint8Array(2048)], { type: 'audio/webm' }));
    const parsed = parseWav(await result.arrayBuffer());
    expect(DecodingFakeAudioContext.decodeCount).toBe(1);
    expect(parsed.sampleRate).toBe(22050);
    expect(parsed.samples.length).toBe(4);
    expect(parsed.samples[1]).toBeGreaterThan(0);
    expect(parsed.samples[2]).toBeLessThan(0);
  });

  test('falls back to a silent WAV when decoding fails', async () => {
    DecodingFakeAudioContext.shouldReject = true;
    const result = await webmToWav(new Blob([new Uint8Array(2048)], { type: 'audio/webm' }));
    const parsed = parseWav(await result.arrayBuffer());
    expect(parsed.dataLength).toBe(0);
    expect(parsed.channels).toBe(2);
  });

  test('handles arbitrary blob sizes without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8000 }), async (size) => {
        const bytes = new Uint8Array(size);
        for (let i = 0; i < size; i++) bytes[i] = i % 256;
        const result = await webmToWav(new Blob([bytes], { type: 'audio/webm' }));
        expect(result.type).toBe('audio/wav');
        expect(result.size).toBeGreaterThanOrEqual(44);
      }),
      { numRuns: 40 },
    );
  });
});
