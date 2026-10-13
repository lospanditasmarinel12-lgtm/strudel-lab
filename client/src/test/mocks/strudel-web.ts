import { vi } from 'vitest';
import { FakeAudioNode } from './audio';

export const mockDestinationGain = new FakeAudioNode();
mockDestinationGain.gain.value = 1;

export function createMockStrudelWeb() {
  return {
    getAudioContext: vi.fn(),
    getSuperdoughAudioController: vi.fn(() => ({
      output: { destinationGain: mockDestinationGain },
    })),
    evaluate: vi.fn(() => Promise.resolve()),
    hush: vi.fn(),
    initStrudel: vi.fn(() => Promise.resolve()),
    getTime: vi.fn(() => 0),
    getPattern: vi.fn(() => null),
  };
}
