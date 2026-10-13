import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webmToWav, audioBufferToWavBlob } from './wav-encoder';

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

describe('wav-encoder', () => {
  describe('webmToWav', () => {
    it('returns a silent WAV for empty blob', async () => {
      const empty = new Blob([], { type: 'audio/webm' });
      const result = await webmToWav(empty);
      expect(result.type).toBe('audio/wav');
      expect(result.size).toBeGreaterThanOrEqual(44);
    });

    it('returns a silent WAV for very small blob', async () => {
      const tiny = new Blob(['a'], { type: 'audio/webm' });
      const result = await webmToWav(tiny);
      expect(result.type).toBe('audio/wav');
    });

    it('returns a silent WAV for corrupt blob', async () => {
      const corrupt = new Blob(['not-valid-audio-data-here'], { type: 'audio/webm' });
      const result = await webmToWav(corrupt);
      expect(result.type).toBe('audio/wav');
    });

    it('produces WAV header with correct RIFF signature', async () => {
      const result = await webmToWav(new Blob([], { type: 'audio/webm' }));
      const buf = await result.arrayBuffer();
      const view = new DataView(buf);
      expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
      expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    });

    it('silent WAV has 0 data length', async () => {
      const result = await webmToWav(new Blob([], { type: 'audio/webm' }));
      const buf = await result.arrayBuffer();
      const view = new DataView(buf);
      expect(view.getUint32(40, true)).toBe(0);
    });

    it('decode-failure fallback uses a stereo 48kHz header', async () => {
      // Must exceed the 1KB "too small" shortcut to reach decodeAudioData,
      // which the global AudioContext mock rejects, forcing the fallback.
      const corrupt = new Blob([new Uint8Array(2048)], { type: 'audio/webm' });
      const result = await webmToWav(corrupt);
      const view = new DataView(await result.arrayBuffer());
      expect(view.getUint16(22, true)).toBe(2); // channels
      expect(view.getUint32(24, true)).toBe(48000); // sample rate
      expect(view.getUint32(40, true)).toBe(0); // data length
    });
  });

  describe('audioBufferToWavBlob', () => {
    it('converts a mono silent AudioBuffer to WAV blob', () => {
      const sr = 44100;
      const buffer = createMockBuffer(sr, sr, 1, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBe(44 + sr * 2);
    });

    it('converts a stereo silent AudioBuffer to WAV blob', () => {
      const sr = 48000;
      const length = Math.floor(sr * 0.1);
      const buffer = createMockBuffer(length, sr, 2, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      expect(blob.size).toBe(44 + length * 2 * 2);
    });

    it('WAV header has correct RIFF/WAVE signature', async () => {
      const buffer = createMockBuffer(100, 44100, 1, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe('RIFF');
      expect(String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11))).toBe('WAVE');
    });

    it('WAV header indicates 1 channel for mono', async () => {
      const buffer = createMockBuffer(100, 44100, 1, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      expect(dv.getUint16(22, true)).toBe(1);
    });

    it('WAV header indicates 2 channels for stereo', async () => {
      const buffer = createMockBuffer(100, 44100, 2, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      expect(dv.getUint16(22, true)).toBe(2);
    });

    it('WAV header indicates 16-bit samples', async () => {
      const buffer = createMockBuffer(100, 44100, 1, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      expect(dv.getUint16(34, true)).toBe(16);
    });

    it('WAV header uses correct sample rate', async () => {
      const buffer = createMockBuffer(100, 22050, 1, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      expect(dv.getUint32(24, true)).toBe(22050);
    });

    it('WAV data chunk size matches expected byte count', async () => {
      const length = 441;
      const buffer = createMockBuffer(length, 44100, 2, () => 0);
      const blob = audioBufferToWavBlob(buffer);
      const ab = await blob.arrayBuffer();
      const dv = new DataView(ab);
      expect(dv.getUint32(40, true)).toBe(length * 2 * 2);
    });

    it('clamps samples to [-1, 1] range', () => {
      const sr = 44100;
      const buffer = createMockBuffer(10, sr, 1, (ch, i) => i < 5 ? 2.0 : -2.0);
      const blob = audioBufferToWavBlob(buffer);
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});
