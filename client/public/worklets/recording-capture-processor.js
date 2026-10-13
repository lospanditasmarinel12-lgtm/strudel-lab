class RecordingCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferDuration = options.processorOptions.bufferDuration || 30;
    this.chunkDuration = options.processorOptions.chunkDuration || 0.5;
    this.sampleRate = sampleRate;
    this.maxSamples = this.bufferDuration * sampleRate;
    this.chunkSamples = this.chunkDuration * sampleRate;
    this.ringBuffer = [];
    this.writeIndex = 0;
    this.accumulatedSamples = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const channelCount = input.length;
    const frameCount = input[0].length;

    if (this.ringBuffer.length === 0) {
      for (let ch = 0; ch < channelCount; ch++) {
        this.ringBuffer[ch] = new Float32Array(this.maxSamples);
      }
    }

    for (let ch = 0; ch < channelCount; ch++) {
      const channel = this.ringBuffer[ch];
      for (let i = 0; i < frameCount; i++) {
        channel[(this.writeIndex + i) % this.maxSamples] = input[ch][i];
      }
    }
    this.writeIndex = (this.writeIndex + frameCount) % this.maxSamples;
    this.accumulatedSamples += frameCount;

    if (this.accumulatedSamples >= this.chunkSamples) {
      this.accumulatedSamples = 0;
      const readStart = (this.writeIndex - this.chunkSamples + this.maxSamples) % this.maxSamples;

      for (let ch = 0; ch < channelCount; ch++) {
        const channel = this.ringBuffer[ch];
        const chunk = new Float32Array(this.chunkSamples);
        for (let i = 0; i < this.chunkSamples; i++) {
          chunk[i] = channel[(readStart + i) % this.maxSamples];
        }
        this.port.postMessage({
          type: 'chunk',
          buffer: chunk.buffer,
          channel: ch,
          channelCount: channelCount,
          sampleRate: this.sampleRate,
        }, [chunk.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('recording-capture-processor', RecordingCaptureProcessor);
