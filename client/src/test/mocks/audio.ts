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
