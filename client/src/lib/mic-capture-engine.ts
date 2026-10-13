import { getStrudelAudioContext } from './strudel-engine';
import { audioBufferToWavBlob } from './wav-encoder';
import { registerCustomSample } from './sample-registry';

type ChunkCallback = (buffer: AudioBuffer) => void;

export class MicCaptureEngine {
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private _isCapturing = false;
  private onChunk: ChunkCallback | null = null;

  private _ringChannels: Float32Array[] = [];
  private _ringWriteIndex = 0;
  private _ringLength = 0;
  private _ringCapacity = 0;
  private _ringSampleRate = 0;
  private _ringChannelCount = 0;

  get isCapturing(): boolean {
    return this._isCapturing;
  }

  async start(options?: {
    bufferDuration?: number;
    chunkDuration?: number;
    onChunk?: ChunkCallback;
  }): Promise<void> {
    if (this._isCapturing) return;
    this.onChunk = options?.onChunk ?? null;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err: unknown) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone permissions.');
        }
        if (err.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone.');
        }
      }
      throw new Error(`Microphone access failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const ctx = getStrudelAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    const bufferDuration = options?.bufferDuration ?? 2;
    this._ringCapacity = Math.ceil(bufferDuration * ctx.sampleRate);
    this._ringSampleRate = ctx.sampleRate;
    this._ringWriteIndex = 0;
    this._ringLength = 0;
    this._ringChannels = [];

    this.sourceNode = ctx.createMediaStreamSource(this.stream);

    try {
      const workletUrl = new URL('worklets/mic-capture-processor.js', window.location.href).href;
      await ctx.audioWorklet.addModule(workletUrl);
      this.workletNode = new AudioWorkletNode(ctx, 'mic-capture-processor', {
        processorOptions: {
          bufferDuration,
          chunkDuration: options?.chunkDuration ?? 0.5,
        },
      });
    } catch (err: unknown) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      throw new Error(`AudioWorklet setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.sourceNode.connect(this.workletNode);

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'chunk') {
        this.handleChunk(event.data);
      }
    };

    this._isCapturing = true;
  }

  private handleChunk(data: {
    buffer: ArrayBuffer;
    channel: number;
    channelCount: number;
    sampleRate: number;
  }): void {
    const samples = new Float32Array(data.buffer);

    if (this._ringChannels.length === 0) {
      this._ringChannelCount = data.channelCount;
      for (let ch = 0; ch < data.channelCount; ch++) {
        this._ringChannels[ch] = new Float32Array(this._ringCapacity);
      }
    }

    const ch = this._ringChannels[data.channel];
    for (let i = 0; i < samples.length; i++) {
      ch[(this._ringWriteIndex + i) % this._ringCapacity] = samples[i];
    }

    if (data.channel === data.channelCount - 1) {
      this._ringWriteIndex = (this._ringWriteIndex + samples.length) % this._ringCapacity;
      this._ringLength = Math.min(this._ringLength + samples.length, this._ringCapacity);
    }

    const ctx = getStrudelAudioContext();
    if (!ctx) return;
    const audioBuffer = ctx.createBuffer(data.channelCount, samples.length, data.sampleRate);
    audioBuffer.copyToChannel(samples, data.channel);
    if (data.channel === data.channelCount - 1) {
      this.onChunk?.(audioBuffer);
    }
  }

  getLatestBuffer(): Promise<AudioBuffer | null> {
    const ctx = getStrudelAudioContext();
    if (!ctx || this._ringLength === 0) return Promise.resolve(null);

    const numChannels = this._ringChannelCount;
    const length = this._ringLength;
    const sampleRate = this._ringSampleRate;
    const audioBuffer = ctx.createBuffer(numChannels, length, sampleRate);

    for (let ch = 0; ch < numChannels; ch++) {
      const out = audioBuffer.getChannelData(ch);
      const ring = this._ringChannels[ch];
      if (length < this._ringCapacity) {
        for (let i = 0; i < length; i++) out[i] = ring[i];
      } else {
        const part1Len = this._ringCapacity - this._ringWriteIndex;
        for (let i = 0; i < part1Len; i++) out[i] = ring[this._ringWriteIndex + i];
        for (let i = 0; i < this._ringWriteIndex; i++) out[part1Len + i] = ring[i];
      }
    }

    return Promise.resolve(audioBuffer);
  }

  async freezeAsSample(name: string, duration: number): Promise<{ blobUrl: string; duration: number }> {
    const buffer = await this.getLatestBuffer();
    if (!buffer) throw new Error('No mic data available. Speak or play something first.');

    const wavBlob = audioBufferToWavBlob(buffer);
    await registerCustomSample(name, wavBlob, 'local');
    const blobUrl = URL.createObjectURL(wavBlob);
    return { blobUrl, duration: buffer.duration };
  }

  getDevices(): Promise<MediaDeviceInfo[]> {
    return navigator.mediaDevices.enumerateDevices().then(devices =>
      devices.filter(d => d.kind === 'audioinput')
    );
  }

  stop(): void {
    this._isCapturing = false;
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this._ringChannels = [];
    this._ringWriteIndex = 0;
    this._ringLength = 0;
  }
}

export const globalMicCapture = new MicCaptureEngine();
