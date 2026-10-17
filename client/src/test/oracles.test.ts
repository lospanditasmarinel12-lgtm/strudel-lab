import { describe, it, expect } from 'vitest';
import { audioBufferToWavBlob } from '@/lib/wav-encoder';
import { diffToPatch, applyPatch } from '@/lib/diff';
import { makeAudioBuffer } from './mocks/audio';
import { parseWav, dequantize } from './oracles/wav';
import { isParseable, astEqual, semanticSignature } from './oracles/strudel';
import { applySpliceReference } from './oracles/diff';
import { installFakeClock } from './clock';
import { corpus, extractDocsPatterns } from './corpus';

describe('oracle: wav', () => {
  it('parses what the encoder writes and recovers quantized samples', async () => {
    const buffer = makeAudioBuffer(1, 4, 44100, (_, i) => [0, 16384, -16384, 8192][i]);
    const wav = audioBufferToWavBlob(buffer);
    const parsed = parseWav(await wav.arrayBuffer());
    expect(parsed.channels).toBe(1);
    expect(parsed.sampleRate).toBe(44100);
    expect(parsed.bitsPerSample).toBe(16);
    expect(parsed.samples.length).toBe(4);
    expect(Math.round(dequantize(parsed.samples[1]) * 32768)).toBeCloseTo(16384, -1);
    expect(parsed.samples[2]).toBeLessThan(0);
  });

  it('rejects non-RIFF bytes', () => {
    expect(() => parseWav(new Uint8Array(50))).toThrow();
  });
});

describe('oracle: strudel', () => {
  it('parses valid code and rejects invalid code', () => {
    expect(isParseable('s("bd").gain(0.5)')).toBe(true);
    expect(isParseable('s("bd"')).toBe(false);
  });

  it('compares structure ignoring whitespace', () => {
    expect(astEqual('s("bd").gain(0.5)', 's( "bd" ).gain( 0.5 )')).toBe(true);
    expect(semanticSignature('s("bd").gain(0.5)')).toBe(semanticSignature('s("bd").gain(0.5)'));
  });
});

describe('oracle: diff', () => {
  it('independently reproduces the library patch result', () => {
    const base = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
    const target = base.replace('line12', 'CHANGED') + '\nextra';
    const patch = diffToPatch(base, target);
    expect(applySpliceReference(base, patch)).toBe(target);
    expect(applyPatch(base, patch)).toBe(target);
  });
});

describe('infra: clock', () => {
  it('advances Date.now and performance.now together', () => {
    const clock = installFakeClock(1000);
    try {
      expect(Date.now()).toBe(1000);
      const t0 = performance.now();
      clock.advance(500);
      expect(Date.now()).toBe(1500);
      expect(performance.now() - t0).toBe(500);
    } finally {
      clock.uninstall();
    }
  });
});

describe('infra: corpus', () => {
  it('always contains curated fixtures', () => {
    const entries = corpus(false);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.every((e) => e.source === 'curated')).toBe(true);
  });

  it('docs extraction never throws and returns strings', () => {
    const docs = extractDocsPatterns(5);
    expect(Array.isArray(docs)).toBe(true);
    docs.forEach((d) => expect(typeof d).toBe('string'));
  });
});
