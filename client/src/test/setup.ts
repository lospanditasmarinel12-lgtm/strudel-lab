import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Set up fake IndexedDB for Dexie-dependent tests
import 'fake-indexeddb/auto';

class FakeMediaStream {
  active = true;
  id = 'test-stream-' + Math.random();
  getTracks() { return []; }
  getAudioTracks() { return []; }
  getVideoTracks() { return []; }
  addTrack() {}
  removeTrack() {}
  clone() { return new FakeMediaStream(); }
}
vi.stubGlobal('MediaStream', FakeMediaStream);

vi.stubGlobal('MediaRecorder', vi.fn(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive',
  ondataavailable: null,
})));
(MediaRecorder as any).isTypeSupported = vi.fn(() => true);

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

class FakeStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
}
vi.stubGlobal('localStorage', new FakeStorage());
vi.stubGlobal('sessionStorage', new FakeStorage());

class FakeBaseAudioContext {
  state = 'running';
  sampleRate = 48000;
  baseLatency = 0.01;
  destination = {};
  createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaStreamDestination() { return { stream: new MediaStream() }; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
  decodeAudioData() { return Promise.reject(new Error('mock: cannot decode')); }
}
vi.stubGlobal('BaseAudioContext', FakeBaseAudioContext);
vi.stubGlobal('AudioContext', FakeBaseAudioContext);
vi.stubGlobal('webkitAudioContext', FakeBaseAudioContext);
