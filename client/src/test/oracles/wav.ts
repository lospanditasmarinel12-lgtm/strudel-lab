/**
 * Independent RIFF/WAVE reader used as a differential oracle for
 * `client/src/lib/wav-encoder.ts`. It parses the byte stream directly instead of
 * trusting the encoder's own header math.
 */

export interface ParsedWav {
  riff: string;
  wave: string;
  fmtChunkSize: number;
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataLength: number;
  /** Interleaved int16 samples. */
  samples: Int16Array;
}

function ascii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

export function parseWav(input: ArrayBuffer | Uint8Array): ParsedWav {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 44) throw new Error(`too short for a WAV header: ${bytes.length} bytes`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const riff = ascii(view, 0, 4);
  const wave = ascii(view, 8, 4);
  if (riff !== 'RIFF') throw new Error(`missing RIFF marker (got "${riff}")`);
  if (wave !== 'WAVE') throw new Error(`missing WAVE marker (got "${wave}")`);

  let fmt: { size: number; format: number; channels: number; rate: number; byteRate: number; blockAlign: number; bits: number } | null = null;
  let data: { offset: number; length: number } | null = null;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        size,
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        byteRate: view.getUint32(body + 8, true),
        blockAlign: view.getUint16(body + 12, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      data = { offset: body, length: size };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!fmt) throw new Error('missing fmt chunk');
  if (!data) throw new Error('missing data chunk');
  if (fmt.bits !== 16) throw new Error(`expected 16-bit PCM, got ${fmt.bits}`);

  const sampleCount = Math.floor(data.length / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) samples[i] = view.getInt16(data.offset + i * 2, true);

  return {
    riff,
    wave,
    fmtChunkSize: fmt.size,
    audioFormat: fmt.format,
    channels: fmt.channels,
    sampleRate: fmt.rate,
    byteRate: fmt.byteRate,
    blockAlign: fmt.blockAlign,
    bitsPerSample: fmt.bits,
    dataLength: data.length,
    samples,
  };
}

/** Convert an int16 sample back to the [-1, 1) float it was quantized from. */
export function dequantize(sample: number): number {
  return sample / (sample < 0 ? 0x8000 : 0x7fff);
}
