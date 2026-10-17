import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeClock } from '@/test/clock';

/**
 * Wiring tests for `useRecorder`: it delegates to `globalRecorder`, converts the
 * webm blob to wav, builds tracks, throttles code-change recording, and exposes
 * pause/resume. The recorder engine itself is covered elsewhere.
 */

const { recorderMock, webmToWavMock, buildTracksMock } = vi.hoisted(() => {
  const recorderMock = {
    startRecording: vi.fn(),
    stopRecording: vi.fn(() => ({ audioBlob: new Blob(['webm']), duration: 1234, finalCode: 's("bd")' })),
    getSnapshots: vi.fn(() => [{ id: '1', entityId: 'e0', timestamp: 0, code: 's("bd")', actionType: 'edit' }]),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    handleCodeChange: vi.fn(),
    handleAction: vi.fn(),
    attachTimelineEngine: vi.fn(),
    reset: vi.fn(),
  };
  return {
    recorderMock,
    webmToWavMock: vi.fn(() => Promise.resolve(new Blob(['wav'], { type: 'audio/wav' }))),
    buildTracksMock: vi.fn(() => [{ name: 'bd', category: 'drums', color: '#f00', events: [], modifiers: [] }]),
  };
});

vi.mock('@/lib/recorder', () => ({ globalRecorder: recorderMock }));
vi.mock('@/lib/wav-encoder', () => ({ webmToWav: webmToWavMock }));
vi.mock('@/lib/timeline-parser', () => ({ buildTracksFromSnapshots: buildTracksMock }));

import { useRecorder } from './use-recorder';

describe('useRecorder', () => {
  let clock: ReturnType<typeof installFakeClock>;

  beforeEach(() => {
    clock = installFakeClock(1_000_000);
    vi.clearAllMocks();
  });

  afterEach(() => clock.uninstall());

  it('startRecording delegates and flips state', () => {
    const { result } = renderHook(() => useRecorder());
    act(() => result.current.startRecording('p1', 120, 's("bd")'));
    expect(recorderMock.startRecording).toHaveBeenCalledWith('p1', 120, 's("bd")');
    expect(result.current.recording).toBe(true);
    expect(result.current.paused).toBe(false);
  });

  it('stopRecording returns null when not recording', async () => {
    const { result } = renderHook(() => useRecorder());
    await expect(result.current.stopRecording()).resolves.toBeNull();
  });

  it('stopRecording returns the full result shape and builds tracks', async () => {
    const { result } = renderHook(() => useRecorder());
    act(() => result.current.startRecording('p1', 120, 's("bd")'));
    let out: any;
    await act(async () => {
      out = await result.current.stopRecording();
    });
    expect(recorderMock.stopRecording).toHaveBeenCalled();
    expect(out.audioBlob).toBeInstanceOf(Blob);
    expect(out.wavBlob.type).toBe('audio/wav');
    expect(out.duration).toBe(1234);
    expect(out.finalCode).toBe('s("bd")');
    expect(out.snapshots).toHaveLength(1);
    expect(buildTracksMock).toHaveBeenCalled();
    expect(result.current.recording).toBe(false);
  });

  it('falls back to the raw blob if wav conversion fails', async () => {
    webmToWavMock.mockRejectedValueOnce(new Error('no decode'));
    const { result } = renderHook(() => useRecorder());
    act(() => result.current.startRecording('p1', 120, 's("bd")'));
    let out: any;
    await act(async () => {
      out = await result.current.stopRecording();
    });
    expect(out.wavBlob).toBe(out.audioBlob);
  });

  it('throttles recordCodeChange to at most one per 200ms', () => {
    const { result } = renderHook(() => useRecorder());
    act(() => result.current.startRecording('p1', 120, 'a'));
    act(() => {
      result.current.recordCodeChange('b');
      result.current.recordCodeChange('c');
    });
    expect(recorderMock.handleCodeChange).toHaveBeenCalledTimes(1);
    act(() => clock.advance(250));
    act(() => result.current.recordCodeChange('d'));
    expect(recorderMock.handleCodeChange).toHaveBeenCalledTimes(2);
  });

  it('does not record code changes while paused', () => {
    const { result } = renderHook(() => useRecorder());
    act(() => result.current.startRecording('p1', 120, 'a'));
    act(() => result.current.togglePause());
    expect(recorderMock.pauseRecording).toHaveBeenCalled();
    act(() => result.current.recordCodeChange('b'));
    expect(recorderMock.handleCodeChange).not.toHaveBeenCalled();
  });

  it('forwards actions and attaches the timeline engine', () => {
    const { result } = renderHook(() => useRecorder());
    act(() => result.current.startRecording('p1', 120, 'a'));
    act(() => result.current.recordAction('a', 'play'));
    expect(recorderMock.handleAction).toHaveBeenCalledWith('a', 'play');
    const engine = {} as any;
    act(() => result.current.setTimelineEngine(engine));
    expect(recorderMock.attachTimelineEngine).toHaveBeenCalledWith(engine);
  });
});
