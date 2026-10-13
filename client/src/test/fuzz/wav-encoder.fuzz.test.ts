import { describe, expect, test } from 'vitest';
import fc from 'fast-check';
import { webmToWav, audioBufferToWavBlob } from '@/lib/wav-encoder';

function createMockBuffer(length: number, sr: number, channels: number, fillFn?: (ch: number, i: number) => number): AudioBuffer {
  const bufs: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = fillFn ? fillFn(ch, i) : 0;
    }
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
  } as AudioBuffer;
}

describe('fuzz: wav-encoder property-based tests', () => {
  test('audioBufferToWavBlob produces valid WAV headers for arbitrary buffer sizes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 44100 * 10 }),
        fc.integer({ min: 1, max: 2 }),
        fc.integer({ min: 8000, max: 96000 }),
        (length, channels, sampleRate) => {
          const buffer = createMockBuffer(length, sampleRate, channels, () => 0);
          const blob = audioBufferToWavBlob(buffer);
          expect(blob.type).toBe('audio/wav');
          const expectedSize = 44 + length * channels * 2;
          expect(blob.size).toBe(expectedSize);
        },
      ),
    );
  });

  test('audioBufferToWavBlob produces correct RIFF structure', async () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (length) => {
          const buffer = createMockBuffer(length, 44100, 1, () => 0.5);
          const blob = audioBufferToWavBlob(buffer);
          const ab = blob.arrayBuffer();
          ab.then((buf) => {
            const dv = new DataView(buf);
            expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe('RIFF');
            expect(String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11))).toBe('WAVE');
            expect(String.fromCharCode(dv.getUint8(12), dv.getUint8(13), dv.getUint8(14), dv.getUint8(15))).toBe('fmt ');
            expect(String.fromCharCode(dv.getUint8(36), dv.getUint8(37), dv.getUint8(38), dv.getUint8(39))).toBe('data');
          });
        },
      ),
    );
  });

  test('audioBufferToWavBlob handles extreme sample values without throwing', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -10, max: 10 }), { minLength: 0, maxLength: 100 }),
        (samples) => {
          const length = samples.length;
          const buffer = createMockBuffer(length, 44100, 1, (_, i) => samples[i] ?? 0);
          expect(() => audioBufferToWavBlob(buffer)).not.toThrow();
          const blob = audioBufferToWavBlob(buffer);
          expect(blob.size).toBe(44 + length * 2);
        },
      ),
    );
  });

  test('webmToWav handles arbitrary blob sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10000 }),
        async (size) => {
          const content = new Uint8Array(size);
          for (let i = 0; i < size; i++) {
            content[i] = i % 256;
          }
          const blob = new Blob([content], { type: 'audio/webm' });
          const result = await webmToWav(blob);
          expect(result.type).toBe('audio/wav');
          expect(result.size).toBeGreaterThanOrEqual(44);
        },
      ),
    );
  });

  test('bit depth is always 16-bit', () => {
    const buffer = createMockBuffer(10, 44100, 2, () => 0);
    const blob = audioBufferToWavBlob(buffer);
    const viewPromise = blob.arrayBuffer().then((ab) => new DataView(ab));
    viewPromise.then((dv) => {
      expect(dv.getUint16(34, true)).toBe(16);
    });
  });
});
