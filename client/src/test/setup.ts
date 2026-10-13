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
