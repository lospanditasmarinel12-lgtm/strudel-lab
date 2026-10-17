export class FakeAudioParam {
  value = 1;
  setValueAtTime(v: number, _time: number): this { this.value = v; return this; }
  linearRampToValueAtTime(v: number, _time: number): this { this.value = v; return this; }
}

export class FakeAudioNode {
  gain: FakeAudioParam = new FakeAudioParam();
  connections: FakeAudioNode[] = [];

  connect(dest: FakeAudioNode): void {
    this.connections.push(dest);
  }
  disconnect(dest?: FakeAudioNode): void {
    if (dest) {
      this.connections = this.connections.filter(c => c !== dest);
    } else {
      this.connections = [];
    }
  }
}

export class FakeMediaStreamDestination {
  stream = new MediaStream();
  connections: FakeAudioNode[] = [];

  connect(dest: FakeAudioNode): void {
    this.connections.push(dest);
  }
  disconnect(dest?: FakeAudioNode): void {
    if (dest) {
      this.connections = this.connections.filter(c => c !== dest);
    } else {
      this.connections = [];
    }
  }
}

export class FakeAudioContext {
  state = 'running';
  sampleRate = 48000;
  baseLatency = 0.01;
  outputLatency = 0.02;
  destination = new FakeAudioNode();
  nodes: FakeAudioNode[] = [];
  private _mediaStreamDests: FakeMediaStreamDestination[] = [];

  createGain(): FakeAudioNode {
    const node = new FakeAudioNode();
    this.nodes.push(node);
    return node;
  }

  createMediaStreamDestination(): FakeMediaStreamDestination {
    const dest = new FakeMediaStreamDestination();
    this._mediaStreamDests.push(dest);
    return dest;
  }

  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}

// ---------------------------------------------------------------------------
// Deterministic audio decoders (for wav-encoder success-path tests)
// ---------------------------------------------------------------------------

export function makeAudioBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
  fill: (channel: number, index: number) => number = () => 0,
): AudioBuffer {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) data[i] = fill(ch, i) / 32768; // int16 -> float
    channels.push(data);
  }
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channels[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

/**
 * AudioContext whose `decodeAudioData` succeeds deterministically, producing the
 * same PCM the encoder will quantize back. Overrides the rejecting global stub
 * from `test/setup.ts` for the duration of a test.
 */
export class DecodingFakeAudioContext extends FakeAudioContext {
  static nextChannels = 1;
  static nextLength = 8;
  static nextSampleRate = 44100;
  static nextFill: (ch: number, i: number) => number = (_, i) => (i % 2 === 0 ? 16384 : -16384);
  static decodeCount = 0;
  static shouldReject = false;

  decodeAudioData(_data: ArrayBuffer): Promise<AudioBuffer> {
    DecodingFakeAudioContext.decodeCount++;
    if (DecodingFakeAudioContext.shouldReject) return Promise.reject(new Error('mock decode failure'));
    return Promise.resolve(
      makeAudioBuffer(
        DecodingFakeAudioContext.nextChannels,
        DecodingFakeAudioContext.nextLength,
        DecodingFakeAudioContext.nextSampleRate,
        DecodingFakeAudioContext.nextFill,
      ),
    );
  }

  static reset(): void {
    DecodingFakeAudioContext.nextChannels = 1;
    DecodingFakeAudioContext.nextLength = 8;
    DecodingFakeAudioContext.nextSampleRate = 44100;
    DecodingFakeAudioContext.nextFill = (_, i) => (i % 2 === 0 ? 16384 : -16384);
    DecodingFakeAudioContext.decodeCount = 0;
    DecodingFakeAudioContext.shouldReject = false;
  }
}

/** Install `DecodingFakeAudioContext` as the global AudioContext; returns restore. */
export function installDecodingAudioContext(): () => void {
  const prev = (globalThis as any).AudioContext;
  DecodingFakeAudioContext.reset();
  (globalThis as any).AudioContext = DecodingFakeAudioContext;
  return () => {
    (globalThis as any).AudioContext = prev;
  };
}

// ---------------------------------------------------------------------------
// Controllable MediaRecorder (emits chunks, unlike the setup stub)
// ---------------------------------------------------------------------------

export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  chunks: Blob[] = [];

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }

  static isTypeSupported(): boolean {
    return true;
  }

  start(): void {
    this.state = 'recording';
  }

  emitChunk(size = 32): void {
    const blob = new Blob([new Uint8Array(size)], { type: 'audio/webm' });
    this.chunks.push(blob);
    this.ondataavailable?.({ data: blob });
  }

  pause(): void {
    if (this.state === 'recording') {
      this.emitChunk();
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'recording';
  }

  stop(): void {
    if (this.state === 'inactive') return;
    this.emitChunk();
    this.state = 'inactive';
    this.onstop?.();
  }

  static reset(): void {
    FakeMediaRecorder.instances = [];
  }
}

/** Install `FakeMediaRecorder` as the global; returns restore. */
export function installFakeMediaRecorder(): () => void {
  const prev = (globalThis as any).MediaRecorder;
  FakeMediaRecorder.reset();
  (globalThis as any).MediaRecorder = FakeMediaRecorder;
  return () => {
    (globalThis as any).MediaRecorder = prev;
  };
}
