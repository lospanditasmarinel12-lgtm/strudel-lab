import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installFakeMediaRecorder } from '@/test/mocks/audio';

/**
 * Deterministic, in-process simulation of the whole product journey:
 *
 *   write music -> record a performance -> persist -> export Song + Live-set
 *   -> import back -> resolve -> re-enact (play back)
 *
 * Everything is real except the audio engine and the browser file/audio globals.
 * Time is driven by a manual clock (spying `Date.now`/`performance.now`) so that
 * IndexedDB/Dexie keeps working on the real microtask queue — only the recorder's
 * notion of time is frozen.
 */

const { evaluateMock, stopMock, getCtxMock, getDestMock, samplesMock } = vi.hoisted(() => ({
  evaluateMock: vi.fn(() => Promise.resolve()),
  stopMock: vi.fn(),
  getCtxMock: vi.fn(() => null),
  getDestMock: vi.fn(() => null),
  samplesMock: vi.fn(),
}));

vi.mock('@/lib/strudel-engine', () => ({
  evaluateStrudelCode: evaluateMock,
  stopStrudel: stopMock,
  getStrudelAudioContext: getCtxMock,
  getSuperdoughDestination: getDestMock,
}));
vi.mock('@strudel/web', () => ({ samples: samplesMock }));

import { db } from '@/lib/stores/db';
import { SessionRecorder } from '@/lib/recorder';
import { createSession, getSession, getSessionSnapshots } from '@/lib/stores/session-store';
import { exportLiveSessionAsFile, exportSongAsFile, importLiveSessionFromFile } from '@/lib/session-exporter';
import { resolveSnapshotCodes } from '@/lib/timeline-parser';
import { CodeSessionPlayer } from '@/lib/code-session-player';

const BASE = 1_000_000;

const SCRIPT: string[] = [
  '$: s("bd ~ bd ~")',
  '$: s("bd ~ bd ~ hh")',
  '$: s("bd ~ bd ~ hh").gain(0.7)',
  '$: s("bd ~ bd ~ hh").gain(0.7)\n$: s("~ cp ~ cp")',
];

function setupDownloadCapture() {
  const captured: Blob[] = [];
  let pendingFile: File | null = null;

  vi.spyOn(URL, 'createObjectURL').mockImplementation((arg: Blob | MediaSource) => {
    if (arg instanceof Blob) captured.push(arg);
    return 'blob:test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'input') {
      const input: any = {
        type: '',
        accept: '',
        files: pendingFile ? [pendingFile] : [],
        onchange: null,
        click() {
          this.onchange?.();
        },
      };
      return input;
    }
    return { href: '', download: '', click: vi.fn() } as any;
  });

  return {
    captured,
    setNextFile(file: File) {
      pendingFile = file;
    },
  };
}

describe('journey: write -> record -> persist -> export -> import -> replay', () => {
  let now = BASE;
  let restoreRecorder: () => void;
  let download: ReturnType<typeof setupDownloadCapture>;

  beforeEach(async () => {
    await db.projects.clear();
    await db.sessions.clear();
    await db.codeSnapshots.clear();
    await db.customSamples.clear();

    now = BASE;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(performance, 'now').mockImplementation(() => now - BASE);
    restoreRecorder = installFakeMediaRecorder();
    download = setupDownloadCapture();
    evaluateMock.mockClear();
    stopMock.mockClear();
    samplesMock.mockClear();
  });

  afterEach(() => {
    restoreRecorder();
    vi.restoreAllMocks();
  });

  const advance = (ms: number) => {
    now += ms;
  };

  it('keeps the performance faithful from recording through replay', async () => {
    const recorder = new SessionRecorder();
    recorder.startRecording('project-1', 120, SCRIPT[0]);

    for (let i = 1; i < SCRIPT.length; i++) {
      advance(4000);
      recorder.handleCodeChange(SCRIPT[i]);
      recorder.commitAllEntities();
    }
    advance(500);
    recorder.handleAction(SCRIPT[SCRIPT.length - 1], 'evaluate');
    advance(500);
    recorder.handleAction(SCRIPT[SCRIPT.length - 1], 'bpm_change');

    const result = recorder.stopRecording();
    expect(result.finalCode).toBe(SCRIPT[SCRIPT.length - 1]);
    expect(result.audioBlob).toBeInstanceOf(Blob);
    expect(result.duration).toBeGreaterThan(0);

    const snapshots = recorder.getSnapshots();
    expect(snapshots.length).toBeGreaterThan(2);
    expect(snapshots.some((s) => s.actionType === 'evaluate')).toBe(true);

    const session = await createSession({
      projectId: 'project-1',
      name: 'Journey Set',
      bpm: 120,
      duration: result.duration,
      audioBlob: result.audioBlob,
      snapshots,
      tracks: [],
      finalCode: result.finalCode,
    });

    const storedSnapshots = await getSessionSnapshots(session.id);
    expect(storedSnapshots.length).toBe(snapshots.length);

    const originalResolved = resolveSnapshotCodes(snapshots).map((s) => s.code);
    expect(originalResolved[originalResolved.length - 1]).toBe(result.finalCode);

    // Export the Song.
    await exportSongAsFile(session, storedSnapshots);
    const songBlob = download.captured[download.captured.length - 1];
    const songText = await songBlob.text();
    expect(songText).toContain('// @kind song');
    expect(songText).toContain('s("bd ~ bd ~ hh")');

    // Export the Live-set.
    download.captured.length = 0;
    await exportLiveSessionAsFile(session, storedSnapshots);
    const liveBlob = download.captured[download.captured.length - 1];
    const liveText = await liveBlob.text();
    const live = JSON.parse(liveText);
    expect(live.kind).toBe('live-session');
    expect(live.finalCode).toBe(result.finalCode);
    expect(resolveSnapshotCodes(live.snapshots).map((s) => s.code)).toEqual(originalResolved);

    // Import the Live-set back through the real import path.
    download.setNextFile(new File([liveText], 'journey.strudel.live.json', { type: 'application/json' }));
    const imported = await importLiveSessionFromFile();
    const importedSnapshots = await getSessionSnapshots(imported.id);
    expect(resolveSnapshotCodes(importedSnapshots as any).map((s) => s.code)).toEqual(originalResolved);

    // Re-enact the imported session; the code must walk to the final state.
    const entries = snapshots.map((s, i) => ({
      timestamp: s.timestamp,
      code: originalResolved[i],
      actionType: s.actionType,
    }));
    const player = new CodeSessionPlayer(entries, result.duration, 120);
    const seen: string[] = [];
    player.onCodeUpdate = (c) => seen.push(c);
    for (const e of entries) player.seek(e.timestamp);
    expect(seen[seen.length - 1]).toBe(result.finalCode);
    expect(evaluateMock).toHaveBeenCalled();
    player.destroy();

    const refetched = await getSession(imported.id);
    expect(refetched).toBeDefined();
  });
});
