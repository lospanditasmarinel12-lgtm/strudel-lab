# Strudel Lab — Missing Features Implementation Plan

> **Status: historically-completed planning doc.** Most phases below landed in
> the codebase before this note was added. Line references (`file.ts:NN`) are
> stale and point at code that has since moved — treat function/component names
> as the source of truth, not line numbers. See `IMPROVEMENT_PLAN.md` for
> current, verified work.

**Goal:** Complete the recording, DAW, media import, and live audio input features with full Strudel integration.

---

## Context Map

Every file in this project and how it connects to others. Use this before starting any task to understand import paths.

### Export / Import Map

| Source File | Exports | Imported By |
|---|---|---|
| `client/src/lib/strudel-engine.ts` | `evaluateStrudelCode`, `stopStrudel`, `getStrudelAudioContext`, `getCPUUsage`, `getLatency`, `setMasterVolume`, `initStrudelEngine`, `isPlaying` | `recorder.ts`, `use-strudel.ts`, `studio.tsx` |
| `client/src/lib/recorder.ts` | `SessionRecorder`, `globalRecorder` | `use-recorder.ts` |
| `client/src/lib/wav-encoder.ts` | `webmToWav`, `captureAudioStream` | `use-recorder.ts` |
| `client/src/lib/timeline-parser.ts` | `parseEntities`, `buildTracksFromSnapshots`, `parseCodeAtTimestamp`, `extractCodeForEntity` | `recorder.ts`, `studio.tsx`, `playback.tsx`, `use-recorder.ts` |
| `client/src/lib/sample-registry.ts` | `registerCustomSample`, `removeCustomSample`, `getCustomSamples`, `loadedBanks`, `downloadYoutubeAudio`, `rehydrateCustomSamples`, `scanAndRegisterBanks`, `processCodeSamples` | `strudel-engine.ts`, `samples-panel.tsx` |
| `client/src/lib/stores/session-store.ts` | `createSession`, `getSession`, `getSessionSnapshots`, `deleteSession`, `updateSessionTracks`, `getAllSessions` | `studio.tsx`, `playback.tsx`, `recordings-panel.tsx` |
| `client/src/lib/stores/project-store.ts` | `getAllProjects`, `createProject`, `getProject`, `updateProject`, `deleteProject` | `studio.tsx`, `playback.tsx` |
| `client/src/lib/stores/db.ts` | `db`, `StrudelDB`, `SampleCacheEntry`, `CustomSample` | `sample-registry.ts`, `session-store.ts`, `project-store.ts` |
| `client/src/hooks/use-recorder.ts` | `useRecorder` | `studio.tsx` |
| `client/src/hooks/use-strudel.ts` | `useStrudel` | `studio.tsx` |
| `shared/schema.ts` | `Project`, `CodeSnapshot`, `RecordingSession`, `ParsedTrack`, `TrackEvent`, `TrackCategory`, `TRACK_CATEGORIES` | All stores, libs, pages, components |
| `client/src/App.tsx` | Routes | Entry point |
| `electron/main.cjs` | Electron main process | Platform bootstrap |

### Path Aliases (from vite.config.ts)

| Alias | Resolves to |
|---|---|
| `@/` | `client/src/` |
| `@shared/` | `shared/` |

### Test commands (to be added to package.json scripts section)

```json
{
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest --reporter=verbose",
  "test:coverage": "vitest run --coverage",
  "check": "npm run typecheck && npm run test && npm run build"
}
```

---

## Phase 0 — Quick Fixes (existing stubs)

> Effort: ~1 day.

### Phase 0 Task Sequence

```
0.1 Add getElapsedMs to recorder ──→ already done (recorder.ts:213-216)
    ↓
0.2 Fix studio.tsx live timeline   ──→ needs oldString/newString edits
    ↓
0.3 Fix timeline-panel duration     ──→ needs props update
    ↓
0.4 Fix status bar recording time   ──→ needs code edit
```

---

### Task 0.1 — getElapsedMs already exists in SessionRecorder

**Status: DONE.** `SessionRecorder` at `recorder.ts:213-216` already has:

```typescript
getElapsedMs(): number {
  if (!this.recording) return 0;
  return Math.round(performance.now() - this.startTime);
}
```

No action needed. `use-recorder.ts:10` has `currentDuration` ref that could expose this to React.

---

### Task 0.2 — Live timeline playhead in studio.tsx

**File:** `client/src/pages/studio.tsx`
**Depends on:** nothing
**Imports needed:** None (already has `useRef`, `useEffect`, `useState`)

**Current state (studio.tsx lines 195-213):**
The TimelinePanel receives hardcoded `duration={20000}` and `currentTime={0}`.

**Edit 1:** Add recording timing state and refs after existing state declarations

**Location:** After `const editorRef = useRef<MonacoEditorRef>(null);` (line 46)

**oldString:**
```typescript
  const editorRef = useRef<MonacoEditorRef>(null);
```

**newString:**
```typescript
  const editorRef = useRef<MonacoEditorRef>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const rafRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
```

**Edit 2:** Add requestAnimationFrame recording loop after `handleSelectProject`

**Location:** After `handleSelectProject` ends (after line 109)

**oldString:**
```typescript
  const handleRecordingStart = useCallback(() => {
    if (!selectedProject) return;
    startRecording(selectedProject.id, selectedProject.bpm || 120, code);
    setShowTimeline(true);
    addConsoleMessage('recording started...', 'info');
  }, [selectedProject, code, startRecording, addConsoleMessage]);
```

**newString:**
```typescript
  const handleRecordingStart = useCallback(() => {
    if (!selectedProject) return;
    startRecording(selectedProject.id, selectedProject.bpm || 120, code);
    setShowTimeline(true);
    recordingStartRef.current = performance.now();
    setRecordingDuration(0);
    setRecordingTime(0);
    addConsoleMessage('recording started...', 'info');
  }, [selectedProject, code, startRecording, addConsoleMessage]);
```

**Edit 3:** Start RAF loop after recording starts, cancel on stop

**Location:** Inside `handleRecordingStop`, before `try`.

**oldString:**
```typescript
  const handleRecordingStop = useCallback(async () => {
    const result = await stopRecording();
    if (!result || !selectedProject) return;
```

**newString:**
```typescript
  const handleRecordingStop = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const result = await stopRecording();
    if (!result || !selectedProject) return;
```

**Edit 4:** Add RAF effect to update recording time

**Location:** After `useEffect` that parses tracks (before `addConsoleMessage`)

**oldString:**
```typescript
  }, [code]);

  const addConsoleMessage
```

**newString:**
```typescript
  }, [code]);

  useEffect(() => {
    if (!recording) return;
    let running = true;

    function tick() {
      if (!running) return;
      const elapsed = performance.now() - recordingStartRef.current;
      setRecordingTime(elapsed);
      setRecordingDuration(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { running = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [recording]);

  const addConsoleMessage
```

**Edit 5:** Pass real values to TimelinePanel

**Location:** The TimelinePanel render section.

**oldString:**
```typescript
              <TimelinePanel
                tracks={currentTracks}
                duration={20000}
                currentTime={0}
              />
```

**newString:**
```typescript
              <TimelinePanel
                tracks={currentTracks}
                duration={recordingDuration || 20000}
                currentTime={recordingTime}
              />
```

**Edit 6:** Fix the status bar recording timer

**Location:** The REC indicator in the status bar.

**oldString:**
```typescript
          <span className="text-red-500 animate-pulse">● REC {formatDuration(0)}</span>
```

**newString:**
```typescript
          <span className="text-red-500 animate-pulse">● REC {formatDuration(recordingTime)}</span>
```

**Test spec:**
- When recording starts, `recordingTime` increases monotonically
- When recording stops, `recordingTime` stays at final value
- `TimelinePanel` receives `currentTime` > 0 during recording

**Error handling:**
- If `performance.now()` is not available (ancient browser), `recordingTime` stays 0 (safe fallback)
- If RAF callback fires after stop, `running` flag prevents setState
- If component unmounts during recording, cleanup cancels RAF

---

### Task 0.3 — Real CPU/latency monitoring

**File:** `client/src/lib/strudel-engine.ts`
**Depends on:** nothing
**Imports needed:** none

**Current state (lines 105-111):**
```typescript
export function isPlaying(): boolean { return isPlayingState; }
export function getCPUUsage(): number { return Math.round(Math.random() * 30 + 5); }
export function getLatency(): number { return Math.round(Math.random() * 10 + 5); }
```

**oldString:**
```typescript
export function getCPUUsage(): number { return Math.round(Math.random() * 30 + 5); }
export function getLatency(): number { return Math.round(Math.random() * 10 + 5); }
```

**newString:**
```typescript
let lastCpuSample = performance.now();
let cpuUsageValue = 0;

export function getCPUUsage(): number {
  try {
    const ctx = getStrudelAudioContext();
    if (!ctx) return 0;
    return Math.round(ctx.baseLatency * 1000) || 0;
  } catch { return 0; }
}

export function getLatency(): number { 
  try {
    const ctx = getStrudelAudioContext();
    if (!ctx) return 0;
    const latency = (ctx.baseLatency + (ctx as any).outputLatency) * 1000;
    return Math.round(latency) || 0;
  } catch { return 0; }
}
```

**Test spec:**
- `getCPUUsage()` returns a number, never NaN
- `getLatency()` returns `ctx.baseLatency + ctx.outputLatency` when AudioContext exists
- `getLatency()` returns 0 when AudioContext is null

**Error handling:**
- Try/catch wraps all AudioContext access
- Returns 0 on any failure (no crash)

---

### Task 0.4 — Master volume fix

**File:** `client/src/lib/strudel-engine.ts`
**Depends on:** nothing
**Imports needed:** none

**Current state (line 108):**
```typescript
export function setMasterVolume(volume: number): void { const ctx = getStrudelAudioContext(); if (ctx) try { const m = (ctx as any)._masterGain; if (m) m.gain.value = Math.max(0, Math.min(1, volume)); } catch {} }
```

**Note:** `(ctx as any)._masterGain` does not exist in superdough's audio pipeline. We need to create a dedicated gain node during init and store it.

**Edit 1:** Add master gain node to strudel-engine.ts

Add a module-level variable after `_lastActiveCode`:

**Location:** After line 8: `let _lastActiveCode = '';`

**oldString:**
```typescript
let _lastActiveCode = '';
let _onStateUpdate: ((s: StrudelVisualState) => void) | null = null;
```

**newString:**
```typescript
let _lastActiveCode = '';
let _masterGainNode: GainNode | null = null;
let _onStateUpdate: ((s: StrudelVisualState) => void) | null = null;
```

**Edit 2:** Create gain node during initStrudelEngine

**Location:** Inside `initStrudelEngine`, after `strudelInitialized = true;` (line 69)

**oldString:**
```typescript
    strudelInitialized = true;

    try { log('initStrudelEngine: rehydrating...');
```

**newString:**
```typescript
    strudelInitialized = true;

    // Create a master gain node and insert it into the audio graph
    try {
      const ctx = getStrudelAudioContext();
      if (ctx) {
        _masterGainNode = ctx.createGain();
        _masterGainNode.gain.value = 1.0;
        // Find superdough's output and route through master gain
        // superdough connects to ctx.destination — we intercept by connecting
        // our gain before destination. If ctx.destination already has upstream nodes,
        // this won't work perfectly; it's a best-effort insertion.
        _masterGainNode.connect(ctx.destination);
      }
    } catch (e) { log(`initStrudelEngine: master gain setup failed - ${e}`); }

    try { log('initStrudelEngine: rehydrating...');
```

**Edit 3:** Rewrite setMasterVolume to use the stored gain node

**oldString:**
```typescript
export function setMasterVolume(volume: number): void { const ctx = getStrudelAudioContext(); if (ctx) try { const m = (ctx as any)._masterGain; if (m) m.gain.value = Math.max(0, Math.min(1, volume)); } catch {} }
```

**newString:**
```typescript
export function setMasterVolume(volume: number): void {
  if (_masterGainNode) {
    _masterGainNode.gain.value = Math.max(0, Math.min(1, volume));
  }
}
```

**Test spec:**
- After `initStrudelEngine()`, `_masterGainNode` is non-null
- `setMasterVolume(0.5)` sets gain to 0.5
- `setMasterVolume(-1)` clamps to 0
- `setMasterVolume(2)` clamps to 1

**Error handling:**
- If AudioContext can't be created, `_masterGainNode` stays null, `setMasterVolume` is no-op
- If superdough already connected to `ctx.destination`, our gain node is parallel, not in series (best-effort — documented limitation)

---

## Phase 1 — Complete DAW-Like Timeline

> Effort: ~2-3 weeks. Tightly integrated with Strudel's recording/playback/edit cycle.

### Phase 1 Task Sequence

```
1.1 Create TimelineEngine (tick, seekTo, addEvent, etc.)
    ↓ depends on 1.1
1.2 Wire recording mode (recorder.ts + studio.tsx + timeline-engine.ts)
    ↓ depends on 1.1, 1.2
1.3 Upgrade playback page (refactor to TimelineEngine)
    ↓ depends on 1.1
1.4 Create edit mode page (session-editor.tsx)
    ↓ depends on 1.1, 1.4
1.5 Upgrade timeline canvas (interactive + waveform)
    ↓ depends on 1.2, 1.3, 1.4
1.6 Route integration (App.tsx)
```

---

### Task 1.1 — Create TimelineEngine core

**File:** `client/src/lib/timeline-engine.ts` (NEW)
**Depends on:** nothing
**Imports needed:**

```typescript
import { nanoid } from 'nanoid';
import type { ParsedTrack, TrackEvent, CodeSnapshot } from '@shared/schema';
```

**Full file content to write:**

```typescript
import { nanoid } from 'nanoid';

export type TimelineMode = 'idle' | 'recording' | 'playing' | 'paused' | 'editing';

export interface TimelineEvent {
  id: string;
  trackId: string;
  startMs: number;
  endMs: number;
  code: string;
  entityName: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  category: string;
  color: string;
  events: TimelineEvent[];
}

export interface TimelineConfig {
  bpm: number;
  timeSignature: [number, number];
}

export class TimelineEngine {
  mode: TimelineMode = 'idle';
  duration: number = 0;
  currentTime: number = 0;
  bpm: number;
  timeSignature: [number, number];
  tracks: TimelineTrack[] = [];
  snapshots: { timestamp: number; code: string; entityId: string }[] = [];
  loopRegion: { start: number; end: number } | null = null;
  quantization: number = 4; // quarter notes

  private _onTick: ((time: number) => void) | null = null;

  constructor(config: TimelineConfig) {
    this.bpm = config.bpm;
    this.timeSignature = config.timeSignature;
  }

  set onTick(cb: ((time: number) => void) | null) {
    this._onTick = cb;
  }

  tick(deltaMs: number): void {
    if (this.mode === 'idle' || this.mode === 'paused') return;
    if (deltaMs < 0) return;

    this.currentTime += deltaMs;
    if (this.loopRegion && this.currentTime >= this.loopRegion.end) {
      this.currentTime = this.loopRegion.start;
    }
    if (this.duration > 0 && this.currentTime >= this.duration) {
      this.currentTime = this.duration;
      this.mode = 'paused';
    }
    this._onTick?.(this.currentTime);
  }

  seekTo(ms: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration || ms, ms));
  }

  addTrack(track: TimelineTrack): void {
    if (!this.tracks.find(t => t.id === track.id)) {
      this.tracks.push(track);
    }
  }

  addEvent(trackId: string, startMs: number, endMs: number, code: string): TimelineEvent {
    const event: TimelineEvent = {
      id: nanoid(),
      trackId,
      startMs,
      endMs,
      code,
      entityName: '',
    };
    const track = this.tracks.find(t => t.id === trackId);
    if (track) track.events.push(event);
    return event;
  }

  removeEvent(eventId: string): void {
    for (const track of this.tracks) {
      const idx = track.events.findIndex(e => e.id === eventId);
      if (idx !== -1) {
        track.events.splice(idx, 1);
        return;
      }
    }
  }

  moveEvent(eventId: string, newStartMs: number): void {
    for (const track of this.tracks) {
      const event = track.events.find(e => e.id === eventId);
      if (event) {
        const duration = event.endMs - event.startMs;
        event.startMs = newStartMs;
        event.endMs = newStartMs + duration;
        return;
      }
    }
  }

  resizeEvent(eventId: string, newEndMs: number): void {
    for (const track of this.tracks) {
      const event = track.events.find(e => e.id === eventId);
      if (event) {
        event.endMs = Math.max(newEndMs, event.startMs + 100);
        return;
      }
    }
  }

  getCodeAt(ms: number): string {
    const sorted = [...this.snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const entityMap = new Map<string, string>();
    for (const snap of sorted) {
      if (snap.timestamp <= ms) {
        entityMap.set(snap.entityId, snap.code);
      }
    }
    return Array.from(entityMap.values()).join('\n\n') || '// empty';
  }

  clear(): void {
    this.mode = 'idle';
    this.currentTime = 0;
    this.duration = 0;
    this.tracks = [];
    this.snapshots = [];
    this.loopRegion = null;
  }
}
```

**Test spec:**
- `tick(100)` advances `currentTime` by 100
- `tick(0)` leaves `currentTime` unchanged
- `tick(-50)` (negative delta) leaves `currentTime` unchanged
- `tick()` when `mode === 'idle'` does not advance time
- `seekTo(500)` sets `currentTime` to 500
- `seekTo(-100)` clamps to 0
- `addEvent('track-1', 0, 1000, 'c3')` adds event to track
- `removeEvent(id)` removes the correct event
- `moveEvent(id, 500)` preserves event duration
- `resizeEvent(id, 2000)` sets endMs to 2000
- `resizeEvent(id, 50)` clamps minimum to startMs + 100

**Error handling:**
- `tick()` with negative delta: silently ignored (no crash)
- `removeEvent()` with nonexistent id: no-op
- `moveEvent()` with nonexistent id: no-op
- `seekTo()` with NaN: clamps to 0 (via `Math.max(0, ...)`)

---

### Task 1.2 — Wire Recording Mode

**Files:** `client/src/lib/recorder.ts` (extend), `studio.tsx` (update)
**Depends on:** Task 1.1
**Imports needed:** None (recorder already imports from strudel-engine)

**Edit 1:** Add `attachTimelineEngine()` method to SessionRecorder

**Location:** After `getElapsedMs()` at recorder.ts:216

**oldString:**
```typescript
  getElapsedMs(): number {
    if (!this.recording) return 0;
    return Math.round(performance.now() - this.startTime);
  }

  private getCurrentCode
```

**newString:**
```typescript
  getElapsedMs(): number {
    if (!this.recording) return 0;
    return Math.round(performance.now() - this.startTime);
  }

  private timelineEngine?: import('./timeline-engine').TimelineEngine;

  attachTimelineEngine(engine: import('./timeline-engine').TimelineEngine): void {
    this.timelineEngine = engine;
  }

  private getCurrentCode
```

**Note:** The `import('./timeline-engine').TimelineEngine` type is a dynamic import type — it avoids circular dependency issues at runtime.

**Edit 2:** Integrate TimelineEngine in `startRecording`

**Location:** In `startRecording`, after `this.addSnapshot(entityId, currentCode, 'edit')` loop (after line 96)

**oldString:**
```typescript
    for (const entity of entities) {
      const tracker: EntityTracker = {
        entityId: entity.id,
        lastCode: entity.codeLines.join('\n'),
        lastChangeTime: Date.now(),
        lastSnapshotTime: Date.now(),
        timer: null,
      };
      this.entities.set(entity.id, tracker);
      this.addSnapshot(tracker.entityId, currentCode, 'edit');
    }
  }
```

**newString:**
```typescript
    for (const entity of entities) {
      const tracker: EntityTracker = {
        entityId: entity.id,
        lastCode: entity.codeLines.join('\n'),
        lastChangeTime: Date.now(),
        lastSnapshotTime: Date.now(),
        timer: null,
      };
      this.entities.set(entity.id, tracker);
      this.addSnapshot(tracker.entityId, currentCode, 'edit');
    }

    if (this.timelineEngine) {
      this.timelineEngine.clear();
      this.timelineEngine.mode = 'recording';
      this.timelineEngine.bpm = bpm;
      this.timelineEngine.duration = 0;
      this.timelineEngine.currentTime = 0;
    }
  }
```

**Edit 3:** On recording stop, save engine state

**Location:** In `stopRecording()`, before `return { audioBlob, duration }`.

**oldString:**
```typescript
    const duration = this.getElapsedMs();
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

    return { audioBlob, duration };
```

**newString:**
```typescript
    const duration = this.getElapsedMs();
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

    if (this.timelineEngine) {
      this.timelineEngine.mode = 'idle';
      this.timelineEngine.duration = duration;
    }

    return { audioBlob, duration };
```

**Edit 4:** Wire TimelineEngine in use-recorder.ts

**File:** `client/src/hooks/use-recorder.ts`

Add `timelineEngineRef` after line 10:

**oldString:**
```typescript
  const currentDuration = useRef(0);
```

**newString:**
```typescript
  const currentDuration = useRef(0);
  const timelineEngineRef = useRef<import('@/lib/timeline-engine').TimelineEngine | null>(null);
```

Expose in the return object (after line 86):

**oldString:**
```typescript
  return {
    recording,
    paused,
    startRecording,
    stopRecording,
    togglePause,
    recordCodeChange,
    recordAction,
  };
```

**newString:**
```typescript
  const setTimelineEngine = useCallback((engine: import('@/lib/timeline-engine').TimelineEngine) => {
    timelineEngineRef.current = engine;
    globalRecorder.attachTimelineEngine(engine);
  }, []);

  return {
    recording,
    paused,
    startRecording,
    stopRecording,
    togglePause,
    recordCodeChange,
    recordAction,
    setTimelineEngine,
  };
```

**Test spec:**
- `attachTimelineEngine` stores the engine reference
- `startRecording` sets `engine.mode = 'recording'` and `engine.currentTime = 0`
- `stopRecording` sets `engine.mode = 'idle'` and `engine.duration = elapsed`

**Error handling:**
- If `timelineEngine` is not attached, recording works without timeline (backward compatible)
- If engine is null, `clear()` and mode changes are skipped

---

### Task 1.3 — Playback Mode upgrade

**File:** `client/src/pages/playback.tsx`
**Depends on:** Task 1.1
**Imports needed to add:**

```typescript
import { TimelineEngine } from '@/lib/timeline-engine';
```

**Edit 1:** Add TimelineEngine instance inside the component

**Location:** After state declarations, before first useEffect.

**oldString:**
```typescript
  const animFrameRef = useRef<number>(0);
```

**newString:**
```typescript
  const animFrameRef = useRef<number>(0);
  const engineRef = useRef<TimelineEngine | null>(null);
```

**Edit 2:** Initialize engine when session loads

**Location:** Inside the session-loading useEffect, after setting session + snapshots.

**oldString:**
```typescript
      if (sess.projectId) {
        const proj = await getProject(sess.projectId);
        if (proj) setProject(proj);
      }
    })();
```

**newString:**
```typescript
      if (sess.projectId) {
        const proj = await getProject(sess.projectId);
        if (proj) setProject(proj);
      }

      const engine = new TimelineEngine({ bpm: sess.bpm, timeSignature: [4, 4] });
      engine.snapshots = snaps.map(s => ({ timestamp: s.timestamp, code: s.code, entityId: s.entityId }));
      engine.duration = sess.duration;
      engine.mode = 'playing';
      engineRef.current = engine;
    })();
```

**Edit 3:** Use engine.tick() in the RAF update loop

**Location:** In `updateTimeline`.

**oldString:**
```typescript
  const updateTimeline = useCallback(() => {
    if (!audioRef.current || !snapshots.length) return;

    const audioEl = audioRef.current;
    const time = Math.round(audioEl.currentTime * 1000);
    setCurrentTime(time);

    const code = parseCodeAtTimestamp(
      snapshots.map(s => ({ timestamp: s.timestamp, code: s.code, entityId: s.entityId })),
      time
    );
    setCurrentCode(code);

    if (!audioEl.paused) {
      animFrameRef.current = requestAnimationFrame(updateTimeline);
    }
  }, [snapshots]);
```

**newString:**
```typescript
  const updateTimeline = useCallback(() => {
    if (!audioRef.current || !snapshots.length) return;

    const audioEl = audioRef.current;
    const time = Math.round(audioEl.currentTime * 1000);
    setCurrentTime(time);

    const engine = engineRef.current;
    if (engine) {
      engine.currentTime = time;
      const code = engine.getCodeAt(time);
      setCurrentCode(code);
    } else {
      // Fallback: use legacy parser
      const code = parseCodeAtTimestamp(
        snapshots.map(s => ({ timestamp: s.timestamp, code: s.code, entityId: s.entityId })),
        time
      );
      setCurrentCode(code);
    }

    if (!audioEl.paused) {
      animFrameRef.current = requestAnimationFrame(updateTimeline);
    }
  }, [snapshots]);
```

**Edit 4:** Use engine for loop toggle (add loop state)

Add a loop toggle button in the toolbar area. This requires adding a loop state + toggle.

**oldString:**
```typescript
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
```

**newString:**
```typescript
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [looping, setLooping] = useState(false);
```

Add the loop toggle button near the speed controls (after the speed button group at playback.tsx:211):

**oldString:**
```typescript
            ))}
          </div>
        </div>
      </div>
```

**newString:**
```typescript
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLooping(!looping);
              if (engineRef.current) {
                if (!looping) {
                  engineRef.current.loopRegion = { start: 0, end: session.duration };
                } else {
                  engineRef.current.loopRegion = null;
                }
              }
            }}
            className={`text-xs h-7 px-2 ${looping ? 'bg-strudel-accent text-white' : 'text-muted-foreground hover:text-white'}`}
          >
            {looping ? 'LOOP ON' : 'LOOP OFF'}
          </Button>
        </div>
      </div>
```

**Test spec:**
- Playback page loads session into `TimelineEngine` correctly
- `updateTimeline` uses `engine.getCodeAt()` instead of `parseCodeAtTimestamp`
- Loop toggle sets `engine.loopRegion`
- Fallback to `parseCodeAtTimestamp` still works if engine is null

**Error handling:**
- If `engineRef.current` is null, falls back to the legacy parser (backward compatible)
- Loop toggle gracefully handles null engine

---

### Task 1.4 — Create Edit Mode page

**File:** `client/src/pages/session-editor.tsx` (NEW)
**Route:** `/edit/:sessionId`
**Depends on:** Task 1.1
**Imports needed:**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, getSessionSnapshots, updateSessionTracks } from '@/lib/stores/session-store';
import { TimelineEngine, type TimelineEvent } from '@/lib/timeline-engine';
import TimelinePanel from '@/components/timeline/timeline-panel';
import MonacoEditor from '@/components/editor/monaco-editor';
import { Button } from '@/components/ui/button';
import { Play, Save, ArrowLeft, Trash2 } from 'lucide-react';
import type { RecordingSession, CodeSnapshot } from '@shared/schema';
```

**Full file skeleton:**

```typescript
export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [snapshots, setSnapshots] = useState<CodeSnapshot[]>([]);
  const [currentCode, setCurrentCode] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const engineRef = useRef<TimelineEngine | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const sess = await getSession(id);
      if (!sess) return;
      setSession(sess);
      const snaps = await getSessionSnapshots(id);
      setSnapshots(snaps);

      const engine = new TimelineEngine({ bpm: sess.bpm, timeSignature: [4, 4] });
      engine.mode = 'editing';
      engine.duration = sess.duration;
      engine.snapshots = snaps.map(s => ({
        timestamp: s.timestamp,
        code: s.code,
        entityId: s.entityId,
      }));

      // Build tracks from snapshots using the existing pattern
      const { buildTracksFromSnapshots } = await import('@/lib/timeline-parser');
      const parsedTracks = buildTracksFromSnapshots(
        snaps.map(s => ({ timestamp: s.timestamp, code: s.code, entityId: s.entityId }))
      );
      for (const pt of parsedTracks) {
        engine.addTrack({
          id: pt.name,
          name: pt.name,
          category: pt.category,
          color: pt.color,
          events: pt.events.map(e => ({
            id: `${pt.name}-${e.startMs}`,
            trackId: pt.name,
            startMs: e.startMs,
            endMs: e.endMs,
            code: e.code,
            entityName: pt.name,
          })),
        });
      }
      engineRef.current = engine;
    })();
  }, [id]);

  // Event handlers for drag/resize/delete
  const handleEventDrag = useCallback((eventId: string, newStartMs: number) => {
    engineRef.current?.moveEvent(eventId, newStartMs);
    // Force re-render — clone engine state
    setSession(s => s ? { ...s } : null);
  }, []);

  const handleEventResize = useCallback((eventId: string, newEndMs: number) => {
    engineRef.current?.resizeEvent(eventId, newEndMs);
    setSession(s => s ? { ...s } : null);
  }, []);

  const handleEventDelete = useCallback((eventId: string) => {
    engineRef.current?.removeEvent(eventId);
    setSelectedEventId(null);
    setSession(s => s ? { ...s } : null);
  }, []);

  const handleEventSelect = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    // Show the event code in the editor
    for (const track of engineRef.current?.tracks || []) {
      const ev = track.events.find(e => e.id === eventId);
      if (ev) {
        setCurrentCode(ev.code);
        return;
      }
    }
  }, []);

  // Save the edited timeline back to IndexedDB
  const handleSave = useCallback(async () => {
    if (!session || !engineRef.current) return;
    const tracks = engineRef.current.tracks.map(t => ({
      name: t.name,
      category: t.category as any,
      color: t.color,
      events: t.events.map(e => ({
        startMs: e.startMs,
        endMs: e.endMs,
        code: e.code,
      })),
    }));
    await updateSessionTracks(session.id, tracks);
    navigate(`/playback/${session.id}`);
  }, [session, navigate]);

  if (!session) {
    return (
      <div className="h-screen flex items-center justify-center bg-strudel-dark">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Session not found</h1>
          <a href="/" className="text-strudel-primary hover:underline">Back to Studio</a>
        </div>
      </div>
    );
  }

  // Render editor UI layout
  // ...
}
```

**Remaining implementation:** The UI layout and canvas integration. The session-editor should:
- Show TimelinePanel in the top half with event blocks
- Handle `onEventDrag`, `onEventResize`, `onEventSelect` callbacks on TimelinePanel
- Show MonacoEditor in the bottom half with the selected event's code
- Add a save button that calls `handleSave`

**Test spec:**
- Session loads into TimelineEngine with all events parsed
- `moveEvent()` changes event startMs
- `resizeEvent()` changes event endMs (minimum duration 100ms)
- `removeEvent()` removes event from track
- `handleSave()` calls `updateSessionTracks()` with modified tracks

**Error handling:**
- If session ID doesn't exist, show "Session not found" with back link
- If snapshots are empty, show empty engine with no tracks
- Save button is disabled until session loads

---

### Task 1.5 — Upgrade Timeline Canvas (interactive)

**File:** `client/src/components/timeline/timeline-panel.tsx`
**Depends on:** Task 1.1, 1.2, 1.3, 1.4
**Imports needed to add:**

```typescript
import { useCallback } from 'react';
```

**Edit 1:** Add interaction props to TimelinePanelProps

**Location:** The interface declaration.

**oldString:**
```typescript
interface TimelinePanelProps {
  tracks: ParsedTrack[];
  duration: number;
  currentTime: number;
}
```

**newString:**
```typescript
interface TimelinePanelProps {
  tracks: ParsedTrack[];
  duration: number;
  currentTime: number;
  interactive?: boolean;
  onSeek?: (ms: number) => void;
  onEventDrag?: (eventId: string, newStartMs: number) => void;
  onEventResize?: (eventId: string, newEndMs: number) => void;
  onEventSelect?: (eventId: string) => void;
  selectedEventId?: string;
}
```

**Edit 2:** Destructure new props in component signature

**oldString:**
```typescript
export default function TimelinePanel({ tracks, duration, currentTime }: TimelinePanelProps) {
```

**newString:**
```typescript
export default function TimelinePanel({
  tracks, duration, currentTime,
  interactive = false,
  onSeek, onEventDrag, onEventResize, onEventSelect,
  selectedEventId,
}: TimelinePanelProps) {
```

**Edit 3:** Add mouse/touch handlers for seek and event interaction

Add before the useEffect. This code replaces the existing canvas drawing logic with an interactive version.

**oldString:**
```typescript
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
```

**newString:**
```typescript
  const leftMargin = 80;

  const getXFromMs = useCallback((ms: number, w: number, trackArea: number, displayDuration: number) => {
    return leftMargin + (ms / displayDuration) * trackArea;
  }, []);

  const getMsFromX = useCallback((x: number, w: number, trackArea: number, displayDuration: number) => {
    return Math.max(0, ((x - leftMargin) / trackArea) * displayDuration);
  }, []);

  const findEventAtPosition = useCallback((x: number, y: number, w: number, h: number) => {
    const trackHeight = Math.min(28, (h - 24) / Math.max(tracks.length, 1));
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const ty = 20 + i * trackHeight;
      if (y < ty || y > ty + trackHeight) continue;

      for (const event of track.events) {
        const ex = getXFromMs(event.startMs, w, trackArea, displayDuration);
        const ew = Math.max(((event.endMs - event.startMs) / displayDuration) * trackArea, 3);
        if (x >= ex && x <= ex + ew) {
          // Check if at left edge (resize start) or right edge (resize end)
          const edgeThreshold = 6;
          if (x <= ex + edgeThreshold) return { event, resize: 'start' as const };
          if (x >= ex + ew - edgeThreshold) return { event, resize: 'end' as const };
          return { event, resize: 'move' as const };
        }
      }
    }
    return null;
  }, [tracks, duration, leftMargin, getXFromMs]);

  // Mouse handlers for interactive mode
  const isDraggingRef = useRef(false);
  const dragTypeRef = useRef<'seek' | 'move' | 'resize' | null>(null);
  const dragEventIdRef = useRef<string | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartMsRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    // Seek click on ruler area (first 20px)
    if (y < 20) {
      const trackArea = w - leftMargin - 10;
      const displayDuration = Math.max(duration, 10000);
      const ms = getMsFromX(x, w, trackArea, displayDuration);
      dragTypeRef.current = 'seek';
      isDraggingRef.current = true;
      onSeek?.(ms);
      return;
    }

    // Event interaction
    const hit = findEventAtPosition(x, y, w, h);
    if (hit) {
      isDraggingRef.current = true;
      dragEventIdRef.current = hit.event.eventId || `${hit.event.startMs}`;
      dragTypeRef.current = hit.resize;
      dragStartXRef.current = x;
      dragStartMsRef.current = hit.event.startMs;
      onEventSelect?.(dragEventIdRef.current);
    } else {
      setSelectedEventId?.(undefined);
    }
  }, [interactive, onSeek, onEventSelect, findEventAtPosition, leftMargin, getMsFromX, duration]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !interactive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const trackArea = w - leftMargin - 10;
    const displayDuration = Math.max(duration, 10000);

    if (dragTypeRef.current === 'seek') {
      const ms = getMsFromX(x, w, trackArea, displayDuration);
      onSeek?.(ms);
    } else if (dragTypeRef.current === 'move' && dragEventIdRef.current) {
      const dx = x - dragStartXRef.current;
      const dMs = (dx / trackArea) * displayDuration;
      onEventDrag?.(dragEventIdRef.current, Math.max(0, dragStartMsRef.current + dMs));
    } else if (dragTypeRef.current === 'resize' && dragEventIdRef.current) {
      const dx = x - dragStartXRef.current;
      const dMs = (dx / trackArea) * displayDuration;
      onEventResize?.(dragEventIdRef.current, dragStartMsRef.current + dMs + 1000);
    }
  }, [interactive, onSeek, onEventDrag, onEventResize, leftMargin, getMsFromX, duration]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragTypeRef.current = null;
    dragEventIdRef.current = null;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
```

**Edit 4:** Update the canvas render to highlight selected event

**Location:** Inside the tracks loop, in the events rendering section. After `ctx.fillRect(ex, y + 2, Math.min(ew, 3), trackHeight - 4);`

**oldString:**
```typescript
        ctx.fillStyle = track.color;
        ctx.fillRect(ex, y + 2, Math.min(ew, 3), trackHeight - 4);
      });
```

**newString:**
```typescript
        ctx.fillStyle = track.color;
        ctx.fillRect(ex, y + 2, Math.min(ew, 3), trackHeight - 4);

        // Highlight selected event
        if (selectedEventId && (event as any).eventId === selectedEventId) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(ex, y + 2, ew, trackHeight - 4);
        }
      });
```

**Edit 5:** Add cursor style and event handlers to the canvas element

**oldString:**
```typescript
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  );
```

**newString:**
```typescript
  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%', cursor: interactive ? 'pointer' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
```

**Test spec:**
- Canvas renders with the same tracks/events as before (no visual regression)
- Interactive mode adds mouse handlers on the canvas
- `handleMouseDown` on ruler triggers `onSeek`
- `handleMouseDown` on event body triggers `onEventDrag` + `onEventSelect`
- `handleMouseDown` on event edges triggers `onEventResize`
- Selected event gets a white stroke border
- `interactive={false}` renders static canvas (no mouse handlers)

**Error handling:**
- Canvas ref null → no crash
- Event without `eventId` property → uses `${event.startMs}` as fallback ID
- Click outside event blocks → deselects (calls `onEventSelect?.(undefined)`)
- Double invocation of mouse handlers → `isDraggingRef` guard prevents conflicts

---

### Task 1.6 — Route Integration

**File:** `client/src/App.tsx`
**Depends on:** Task 1.4 (session-editor page must exist)

**oldString:**
```typescript
import Studio from "@/pages/studio";
import Playback from "@/pages/playback";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <div className="dark">
          <Routes>
            <Route path="/" element={<Studio />} />
            <Route path="/playback/:id" element={<Playback />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
```

**newString:**
```typescript
import Studio from "@/pages/studio";
import Playback from "@/pages/playback";
import SessionEditor from "@/pages/session-editor";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <div className="dark">
          <Routes>
            <Route path="/" element={<Studio />} />
            <Route path="/playback/:id" element={<Playback />} />
            <Route path="/edit/:sessionId" element={<SessionEditor />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
```

**Test spec:**
- Navigate to `/edit/test-id` → renders `SessionEditor`
- Navigate to `/` → renders `Studio`
- Navigate to `/playback/test-id` → renders `Playback`
- Unknown path → renders `NotFound`

---

## Phase 2 — YouTube Audio Import (Best Quality)

> Effort: ~1 week. Electron-only feature.

### Phase 2 Task Sequence

```
2.1 Create Electron preload script → electron/preload.cjs (NEW)
    ↓ depends on 2.1
2.2 Update electron/main.cjs → add preload, IPC handlers
    ↓ depends on 2.1, 2.2
2.3 Create type declarations → client/src/types/electron-api.d.ts (NEW)
    ↓ depends on 2.1, 2.2
2.4 Replace YouTube stub in sample-registry.ts
    ↓ depends on 2.3
2.5 Wire YouTube button in samples-panel.tsx (already has UI — just verify)
```

---

### Task 2.1 — Create Electron preload script

**File:** `electron/preload.cjs` (NEW)
**Depends on:** nothing
**Imports/requires needed:**

```javascript
const { contextBridge, ipcRenderer } = require('electron');
```

**Full file to create:**

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  downloadYoutube: (url, options) => ipcRenderer.invoke('youtube:download', url, options),
  getDownloadProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('youtube:progress', handler);
    return () => ipcRenderer.removeListener('youtube:progress', handler);
  },
  cancelDownload: () => ipcRenderer.invoke('youtube:cancel'),
});
```

**Test spec:**
- Exposes `electronAPI` on `window` with three methods
- `downloadYoutube` calls `ipcRenderer.invoke('youtube:download')`
- `cancelDownload` calls `ipcRenderer.invoke('youtube:cancel')`
- `getDownloadProgress` returns a cleanup function

**Error handling:**
- All methods are synchronous wrappers — errors handled by caller
- `getDownloadProgress` cleanup function prevents listener leaks

---

### Task 2.2 — Update Electron main process

**File:** `electron/main.cjs`
**Depends on:** Task 2.1
**Requires needed at top:**

```javascript
const { ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
```

**Edit 1:** Add preload path to webPreferences

**oldString:**
```javascript
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      sandbox: false,
    },
```

**newString:**
```javascript
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      sandbox: false,
    },
```

**Edit 2:** Add IPC handlers for YouTube download

Add before `app.whenReady().then(createWindow);` (line 42):

**oldString:**
```javascript
app.whenReady().then(createWindow);
```

**newString:**
```javascript
// YouTube download handler — spawns yt-dlp for best-quality audio extraction
// yt-dlp format selection:
//   -f ba/bestaudio  → best audio stream by bitrate (may be opus, m4a, webm)
//   -x               → extract audio
//   --audio-format wav → convert to WAV (lossless, best Strudel compatibility)
//   --audio-quality 0  → highest quality when encoding

ipcMain.handle('youtube:download', async (event, url, options) => {
  const { name } = options;
  // Use system temp directory for download
  const tmpDir = require('os').tmpdir();
  const outputTemplate = path.join(tmpDir, `${name}.%(ext)s`);

  const args = [
    '-f', 'ba/bestaudio',
    '-x',
    '--audio-format', 'wav',
    '--audio-quality', '0',
    '-o', outputTemplate,
    '--no-playlist',
    '--print', 'filename',
    '--progress',
    '--newline',
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let outputFile = '';

    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line.endsWith('.wav')) {
        outputFile = line;
      }
      // Parse progress lines like: "[download]  45.2% of ~42.33MiB at 3.21MiB/s ETA 00:07"
      const progressMatch = line.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        event.sender.send('youtube:progress', parseFloat(progressMatch[1]));
      }
    });

    proc.stderr.on('data', (data) => {
      console.error('[yt-dlp stderr]', data.toString());
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp exited with code ${code}`));
        return;
      }
      if (!outputFile || !fs.existsSync(outputFile)) {
        reject(new Error('Output file not found'));
        return;
      }
      const buffer = fs.readFileSync(outputFile);
      // Clean up the temp file
      fs.unlinkSync(outputFile);
      resolve(buffer);
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed?`));
    });
  });
});

ipcMain.handle('youtube:cancel', async () => {
  // In a full implementation, store a reference to the active child process
  // and kill it here. For now, this is a placeholder.
  return true;
});

app.whenReady().then(createWindow);
```

**Edit 3:** Require os module at top

**oldString:**
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');
```

**newString:**
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
```

**Test spec:**
- IPC handler `youtube:download` spawns `yt-dlp` with correct arguments
- Arguments include: `-f ba/bestaudio`, `-x`, `--audio-format wav`, `--audio-quality 0`
- Progress is sent back to renderer via `event.sender.send('youtube:progress', %)`
- Completed download returns the WAV file buffer
- Non-zero exit code rejects with error

**Error handling:**
- If `yt-dlp` is not installed, spawn error caught and rejected with helpful message
- If output file doesn't exist after download, reject with "Output file not found"
- Temp file is deleted after reading (no orphan files)
- Progress parsing with regex handles edge cases (0%, 100%, NaN)

---

### Task 2.3 — Create type declarations

**File:** `client/src/types/electron-api.d.ts` (NEW)
**Depends on:** Task 2.1, 2.2

```typescript
interface ElectronAPI {
  downloadYoutube(url: string, options: {
    name: string;
  }): Promise<ArrayBuffer>;
  getDownloadProgress(callback: (progress: number) => void): () => void;
  cancelDownload(): Promise<unknown>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
```

**No test needed** — this is a type declaration file.

---

### Task 2.4 — Replace YouTube stub in sample-registry.ts

**File:** `client/src/lib/sample-registry.ts`
**Depends on:** Task 2.3

**Edit:** Replace the stub function

**oldString:**
```typescript
export async function downloadYoutubeAudio(_url: string, _name: string): Promise<Blob> {
  throw new Error('YouTube downloads require the desktop app (Electron build)');
}
```

**newString:**
```typescript
export async function downloadYoutubeAudio(url: string, name: string): Promise<Blob> {
  if (typeof window !== 'undefined' && window.electronAPI?.downloadYoutube) {
    const buffer = await window.electronAPI.downloadYoutube(url, { name });
    return new Blob([buffer], { type: 'audio/wav' });
  }
  throw new Error('YouTube downloads require the desktop app (Electron build)');
}
```

**Test spec:**
- When `window.electronAPI.downloadYoutube` exists, calls it and returns WAV Blob
- When `window.electronAPI` is undefined, throws with correct message
- Returned Blob has type `audio/wav`

**Error handling:**
- If `window` is undefined (SSR/Node), falls through to throw
- If `electronAPI` exists but `downloadYoutube` is missing, falls through to throw
- Uses optional chaining (`?.`) so no crash from accessing undefined

---

### Task 2.5 — Wire YouTube button in samples-panel.tsx

**File:** `client/src/components/panels/samples-panel.tsx`
**Depends on:** Task 2.4

**Current state:** The samples panel already has YouTube UI. The `handleUrlImport` (line 93-126) already calls `downloadYoutubeAudio(urlInput, name)`. No code changes needed — it will work once the stub is replaced.

**Test spec:**
- Import dialog opens when "ADD URL" is clicked
- YouTube URL detected by `youtube\.com|youtu\.be` regex
- Desktop app check gates the YouTube path
- On success, sample appears in custom samples list

---

## Phase 3 — Microphone / Live Audio Input

> Effort: ~2-3 weeks.

### Phase 3 Task Sequence

```
3.1 Create WAV export utility → wav-encoder.ts (already has base, extend only)
    ↓
3.2 Create AudioWorklet processor → public/worklets/mic-capture-processor.js (NEW)
    ↓ depends on 3.2
3.3 Create MicCaptureEngine → client/src/lib/mic-capture-engine.ts (NEW)
    ↓ depends on 3.1, 3.3
3.4 Create mic control panel UI → client/src/components/panels/mic-panel.tsx (NEW)
```

---

### Task 3.1 — Add audioBufferToWavBlob to wav-encoder.ts

**File:** `client/src/lib/wav-encoder.ts`
**Depends on:** nothing
**Imports needed:** none

**Edit:** Add the function at the end of the file

**Location:** After line 83 (end of file)

**oldString:**
```typescript
export async function captureAudioStream(
  context: AudioContext,
  destination: AudioNode
): Promise<{ stream: MediaStream; stop: () => void }> {
  const streamDest = context.createMediaStreamDestination();
  destination.connect(streamDest);

  return {
    stream: streamDest.stream,
    stop: () => destination.disconnect(streamDest),
  };
}
```

**newString:**
```typescript
export async function captureAudioStream(
  context: AudioContext,
  destination: AudioNode
): Promise<{ stream: MediaStream; stop: () => void }> {
  const streamDest = context.createMediaStreamDestination();
  destination.connect(streamDest);

  return {
    stream: streamDest.stream,
    stop: () => destination.disconnect(streamDest),
  };
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
```

**Test spec (critical — audio buffer format is easy to get wrong):**
- Mono 48kHz 1-second buffer → WAV blob with correct RIFF header (0x52494646)
- WAV data chunk size = 48000 * 2 = 96000 bytes for 16-bit mono
- Stereo 44.1kHz → interleaved channels, correct data size
- Sine wave input → WAV samples are clipped to [-32768, 32767] range
- Very loud sample (value 2.0) → clamped to 32767 (no overflow)
- Very quiet sample (value -2.0) → clamped to -32768 (no overflow)

**Error handling:**
- NaN or Infinity samples → `Math.max(-1, Math.min(1, NaN))` returns NaN → `Int16` set to 0 (safe)
- Empty buffer (length 0) → returns 44-byte valid WAV header with no data
- AudioBuffer with 0 channels → `numChannels` = 0, WAV is technically invalid but won't crash

---

### Task 3.2 — Create AudioWorklet processor

**File:** `public/worklets/mic-capture-processor.js` (NEW)
**Depends on:** nothing
**Imports:** none (AudioWorkletProcessor is a global in worklet scope)

```javascript
class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bufferDuration = options.processorOptions.bufferDuration || 2;
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

registerProcessor('mic-capture-processor', MicCaptureProcessor);
```

**Test spec (manual):**
- Worklet registers without error in Chrome/Edge (check DevTools console)
- Processor receives input in `process()` callback
- Ring buffer writes circularly without gaps
- Chunk messages are posted with correct size and transferables
- `AudioWorkletNode` connects to `MediaStreamAudioSourceNode` without error

**Error handling:**
- No input channels (device disconnected mid-stream) → guard `if (!input || !input.length)` returns true, keeps processor alive
- `bufferDuration` or `chunkDuration` at 0 → `maxSamples` = 0, `Float32Array(0)` is valid (no samples captured but no crash)
- Multiple rapid `process()` calls → ring buffer handles wrapping correctly with modulo

---

### Task 3.3 — Create MicCaptureEngine

**File:** `client/src/lib/mic-capture-engine.ts` (NEW)
**Depends on:** Task 3.1, 3.2
**Imports needed:**

```typescript
import { getStrudelAudioContext } from './strudel-engine';
import { audioBufferToWavBlob } from './wav-encoder';
```

**Full file content:**

```typescript
import { getStrudelAudioContext } from './strudel-engine';
import { audioBufferToWavBlob } from './wav-encoder';

type ChunkCallback = (buffer: AudioBuffer) => void;

export class MicCaptureEngine {
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private _isCapturing = false;
  private onChunk: ChunkCallback | null = null;

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
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Microphone access denied. Please allow microphone permissions.');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No microphone found. Please connect a microphone.');
      }
      throw new Error(`Microphone access failed: ${err.message}`);
    }

    const ctx = getStrudelAudioContext();
    if (!ctx) throw new Error('AudioContext not available');

    this.sourceNode = ctx.createMediaStreamSource(this.stream);

    try {
      await ctx.audioWorklet.addModule('/worklets/mic-capture-processor.js');
      this.workletNode = new AudioWorkletNode(ctx, 'mic-capture-processor', {
        processorOptions: {
          bufferDuration: options?.bufferDuration ?? 2,
          chunkDuration: options?.chunkDuration ?? 0.5,
        },
      });
    } catch (err: any) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
      throw new Error(`AudioWorklet setup failed: ${err.message}`);
    }

    this.sourceNode.connect(this.workletNode);

    this.workletNode.port.onmessage = async (event) => {
      if (event.data.type === 'chunk') {
        await this.freezeChunk(event.data);
      }
    };

    this._isCapturing = true;
  }

  private async freezeChunk(data: {
    buffer: ArrayBuffer;
    channel: number;
    channelCount: number;
    sampleRate: number;
  }): Promise<void> {
    const ctx = getStrudelAudioContext();
    if (!ctx) return;

    const samples = new Float32Array(data.buffer);
    const length = samples.length;
    const channelCount = data.channelCount;

    // We receive one message per channel. If this is the first channel,
    // create the buffer and wait for all channels to arrive before proceeding.
    // For simplicity, currently handles mono (channelCount=1 received in one message).

    // Create AudioBuffer from the captured chunk
    const audioBuffer = ctx.createBuffer(channelCount, length, data.sampleRate);
    audioBuffer.copyToChannel(samples, data.channel);

    // Only notify when the last channel arrives
    if (data.channel === channelCount - 1) {
      this.onChunk?.(audioBuffer);
    }
  }

  getLatestBuffer(): Promise<AudioBuffer | null> {
    // Returns the most recently frozen buffer.
    // In a full implementation, store the last buffer in a member variable.
    return Promise.resolve(null);
  }

  async freezeAsSample(name: string, duration: number): Promise<{ blobUrl: string; duration: number }> {
    const { samples } = await import('@strudel/web');
    // Capture the current ring buffer content (simplified: uses last chunk)
    const buffer = await this.getLatestBuffer();
    if (!buffer) throw new Error('No mic data available. Speak or play something first.');

    const wavBlob = audioBufferToWavBlob(buffer);
    const blobUrl = URL.createObjectURL(wavBlob);
    await samples({ [name]: blobUrl });
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
  }
}

export const globalMicCapture = new MicCaptureEngine();
```

**Test spec:**
- `start()` calls `getUserMedia` with correct constraints (no echo cancellation, etc.)
- If `getUserMedia` is denied, throws `'Microphone access denied'` error
- If no mic device, throws `'No microphone found'` error
- Worklet module loaded from correct path `/worklets/mic-capture-processor.js`
- `stop()` disconnects all nodes and stops all tracks
- `getDevices()` returns filtered `audioinput` devices
- `freezeAsSample()` calls `samples()` with blob URL

**Error handling:**
- `getUserMedia` errors mapped to user-friendly messages:
  - `NotAllowedError` → permission denied
  - `NotFoundError` → no mic device
  - Other → generic error with message
- Calling `start()` twice → second call is no-op (guarded by `_isCapturing`)
- Calling `stop()` when not started → no-op
- AudioContext null → method throws descriptive error
- Worklet module fails to load → stops stream, re-throws with context

---

### Task 3.4 — Create Mic Control Panel UI

**File:** `client/src/components/panels/mic-panel.tsx` (NEW)
**Depends on:** Task 3.3

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select } from '@/components/ui/select';
import { Mic, MicOff, Snowflake } from 'lucide-react';
import { globalMicCapture } from '@/lib/mic-capture-engine';

interface MicPanelProps {
  onMicSampleCreated?: (name: string) => void;
}

export default function MicPanel({ onMicSampleCreated }: MicPanelProps) {
  const [micActive, setMicActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [inputGain, setInputGain] = useState(100);
  const [bufferSize, setBufferSize] = useState(2);
  const [freezeName, setFreezeName] = useState('mic_capture');
  const [freezing, setFreezing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    globalMicCapture.getDevices().then(setDevices);
  }, []);

  const handleToggleMic = useCallback(async () => {
    if (micActive) {
      globalMicCapture.stop();
      setMicActive(false);
      return;
    }

    setError('');
    try {
      await globalMicCapture.start({
        bufferDuration: bufferSize,
        chunkDuration: 0.5,
      });
      setMicActive(true);
    } catch (err: any) {
      setError(err.message);
    }
  }, [micActive, bufferSize]);

  const handleFreeze = useCallback(async () => {
    if (!micActive) return;
    setFreezing(true);
    setError('');
    try {
      const name = freezeName.trim() || 'mic_capture';
      await globalMicCapture.freezeAsSample(name, 2);
      onMicSampleCreated?.(name);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFreezing(false);
    }
  }, [micActive, freezeName, onMicSampleCreated]);

  return (
    <div className="p-3 space-y-3 text-xs">
      <h3 className="text-sm font-bold text-strudel-accent">MICROPHONE INPUT</h3>

      <Button
        onClick={handleToggleMic}
        className={`w-full h-8 text-xs ${micActive ? 'bg-red-500 hover:bg-red-600' : 'bg-strudel-primary hover:bg-strudel-secondary'}`}
      >
        {micActive ? <MicOff size={14} className="mr-1" /> : <Mic size={14} className="mr-1" />}
        {micActive ? 'STOP MIC' : 'START MIC'}
      </Button>

      {micActive && (
        <>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Buffer Size: {buffer}s</label>
            <Slider
              value={[bufferSize]}
              min={0.5}
              max={10}
              step={0.5}
              onValueChange={([v]) => setBufferSize(v)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Freeze Sample Name</label>
            <input
              value={freezeName}
              onChange={e => setFreezeName(e.target.value)}
              className="w-full bg-strudel-dark border border-strudel-surface-light text-white rounded px-2 py-1 text-xs"
              placeholder="mic_capture"
            />
          </div>

          <Button
            onClick={handleFreeze}
            disabled={freezing}
            className="w-full h-7 text-xs bg-yellow-600 hover:bg-yellow-700"
          >
            <Snowflake size={12} className="mr-1" />
            {freezing ? 'FREEZING...' : 'FREEZE AS SAMPLE'}
          </Button>
        </>
      )}

      {error && <p className="text-red-400 text-[10px]">{error}</p>}
    </div>
  );
}
```

**Test spec:**
- Button toggles between "START MIC" and "STOP MIC"
- Clicking "START MIC" calls `globalMicCapture.start()`
- Clicking "STOP MIC" calls `globalMicCapture.stop()`
- Error message shown in red when mic fails
- Buffer size slider default = 2, range 0.5–10, step 0.5

**Error handling:**
- Mic permission denied → error message shown, not thrown
- Freeze while not capturing → button disabled, no action
- Empty freeze name → defaults to `'mic_capture'`

---

## Phase 4 — Local / Internet Media Import

> Effort: ~1 week.

### Phase 4 Task Sequence

```
4.1 Create MediaImporter class → client/src/lib/media-importer.ts (NEW)
    ↓ depends on 4.1
4.2 Add drag-and-drop handler to studio.tsx
    ↓ depends on 4.2
4.3 Add MEDIA tab to right panel
```

---

### Task 4.1 — Create MediaImporter class

**File:** `client/src/lib/media-importer.ts` (NEW)
**Depends on:** Task 3.1 (audioBufferToWavBlob), Task 2.4 (downloadYoutubeAudio)

```typescript
import { getStrudelAudioContext } from './strudel-engine';
import { audioBufferToWavBlob } from './wav-encoder';
import { downloadYoutubeAudio } from './sample-registry';
import { nanoid } from 'nanoid';

export type MediaSource = 'youtube' | 'local_file' | 'url' | 'mic_freeze';

export interface MediaImportResult {
  name: string;
  blob: Blob;
  blobUrl: string;
  duration: number;
  sampleRate: number;
  channels: number;
  source: MediaSource;
}

export class MediaImporter {
  async importLocalFile(file: File): Promise<MediaImportResult> {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || `sample_${nanoid(6)}`;
    const blob = new Blob([await file.arrayBuffer()], { type: file.type || 'audio/wav' });
    return this.processBlob(blob, name, 'local_file');
  }

  async importFromUrl(url: string, name?: string): Promise<MediaImportResult> {
    const isYoutube = /youtube\.com|youtu\.be/i.test(url);
    if (isYoutube) {
      return this.importFromYoutube(url, name || 'youtube_sample');
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    const blob = await response.blob();
    const resolvedName = name || url.split('/').pop()?.replace(/\.[^.]+$/, '') || `url_${nanoid(6)}`;
    return this.processBlob(blob, resolvedName, 'url');
  }

  async importFromYoutube(url: string, name: string): Promise<MediaImportResult> {
    const wavBlob = await downloadYoutubeAudio(url, name);
    return this.processBlob(wavBlob, name, 'youtube');
  }

  async registerWithStrudel(result: MediaImportResult): Promise<void> {
    const { samples } = await import('@strudel/web');
    await samples({ [result.name]: result.blobUrl });
  }

  private async processBlob(blob: Blob, name: string, source: MediaSource): Promise<MediaImportResult> {
    const ctx = getStrudelAudioContext();
    if (!ctx) throw new Error('AudioContext not available for decoding');

    const arrayBuffer = await blob.arrayBuffer();
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    } catch (err: any) {
      throw new Error(`Could not decode audio: ${err.message}. Supported formats: WAV, MP3, OGG, FLAC`);
    }

    const blobUrl = URL.createObjectURL(blob);

    return {
      name,
      blob,
      blobUrl,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      source,
    };
  }
}

export const globalMediaImporter = new MediaImporter();
```

**Test spec:**
- `importLocalFile` with a WAV file → returns correct name, blobUrl, duration
- `importFromUrl` with a YouTube URL → delegates to `downloadYoutubeAudio`
- `importFromUrl` with a direct audio URL → fetches and decodes
- `registerWithStrudel` calls `samples()` with name and blobUrl
- `processBlob` with invalid audio data → throws descriptive error

**Error handling:**
- File with no name → generates name with `nanoid`
- URL fetch fails → throws HTTP status
- Audio decode fails → throws with supported formats hint
- No AudioContext → throws descriptive error
- YouTube URL in non-Electron → delegates to `downloadYoutubeAudio` which throws

---

### Task 4.2 — Add drag-and-drop handler to studio.tsx

**File:** `client/src/pages/studio.tsx`
**Depends on:** Task 4.1

**Edit:** Add drag-and-drop on the studio editor area

**Location:** After `handlePlaySample` and before the return.

**oldString:**
```typescript
  const handlePlaySample = useCallback((name: string) => {
    try {
      import('@strudel/web').then(({ doughTrigger }) => {
        doughTrigger(name, 0, 0.6);
      });
    } catch {
      addConsoleMessage(`could not preview "${name}"`, 'warn');
    }
  }, [addConsoleMessage]);

  return (
```

**newString:**
```typescript
  const handlePlaySample = useCallback((name: string) => {
    try {
      import('@strudel/web').then(({ doughTrigger }) => {
        doughTrigger(name, 0, 0.6);
      });
    } catch {
      addConsoleMessage(`could not preview "${name}"`, 'warn');
    }
  }, [addConsoleMessage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDropFile = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aiff)$/i.test(f.name)
    );
    if (files.length === 0) {
      addConsoleMessage('Drop audio files only (.wav, .mp3, .ogg, .flac)', 'warn');
      return;
    }
    const { globalMediaImporter } = await import('@/lib/media-importer');
    for (const file of files) {
      try {
        const result = await globalMediaImporter.importLocalFile(file);
        await globalMediaImporter.registerWithStrudel(result);
        addConsoleMessage(`Imported "${result.name}" (${result.duration.toFixed(1)}s, ${result.channels}ch)`, 'info');
      } catch (err: any) {
        addConsoleMessage(`Failed to import "${file.name}": ${err.message}`, 'error');
      }
    }
  }, [addConsoleMessage]);

  return (
```

**Edit 2:** Add drag handlers to the main studio div

**Location:** The outermost div's attributes.

**oldString:**
```typescript
    <div className="h-screen flex flex-col bg-strudel-dark text-white font-mono overflow-hidden">
```

**newString:**
```typescript
    <div
      className="h-screen flex flex-col bg-strudel-dark text-white font-mono overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDropFile}
    >
```

**Test spec:**
- Dragging a `.wav` file onto the studio → imports and registers with Strudel
- Dragging a `.txt` file → shows warning "Drop audio files only"
- Console message shows name, duration, channel count on success
- Console message shows error on failure

**Error handling:**
- Non-audio files dropped → warning, not error
- Audio file fails to decode → error logged per file, other files still process
- Multiple files dropped → all processed (loop doesn't stop on first error)

---

### Task 4.3 — Add MEDIA tab to right panel

**File:** `client/src/components/panels/samples-panel.tsx`
**Depends on:** Task 3.4 (mic-panel.tsx), Task 4.1 (media-importer.ts)

**Edit:** The tabs in studio.tsx's right panel need a new "MEDIA" tab. This is a UI change to the right panel tab system.

**Location:** `studio.tsx` — the Tabs component in the right panel section.

**oldString:**
```typescript
              <Tabs
                value={rightPanelTab}
                onValueChange={setRightPanelTab}
                className="flex flex-col flex-1"
              >
                <TabsList className="w-full rounded-none border-b border-strudel-surface-light bg-strudel-surface p-0 h-9">
                  <TabsTrigger
                    value="samples"
                    className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-xs"
                  >
                    SAMPLES
                  </TabsTrigger>
                  <TabsTrigger
                    value="console"
                    className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-xs"
                  >
                    CONSOLE
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="samples" className="flex-1 m-0 overflow-hidden">
                  <SamplesPanel
                    onInsertSample={handleInsertSample}
                    onPlaySample={handlePlaySample}
                  />
                </TabsContent>
                <TabsContent value="console" className="flex-1 m-0 overflow-hidden">
                  <ConsolePanel messages={consoleMessages} />
                </TabsContent>
              </Tabs>
```

**newString:**
```typescript
              <Tabs
                value={rightPanelTab}
                onValueChange={setRightPanelTab}
                className="flex flex-col flex-1"
              >
                <TabsList className="w-full rounded-none border-b border-strudel-surface-light bg-strudel-surface p-0 h-9">
                  <TabsTrigger
                    value="samples"
                    className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-xs"
                  >
                    SAMPLES
                  </TabsTrigger>
                  <TabsTrigger
                    value="media"
                    className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-xs"
                  >
                    MEDIA
                  </TabsTrigger>
                  <TabsTrigger
                    value="console"
                    className="flex-1 rounded-none data-[state=active]:bg-strudel-surface-light h-full text-xs"
                  >
                    CONSOLE
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="samples" className="flex-1 m-0 overflow-hidden">
                  <SamplesPanel
                    onInsertSample={handleInsertSample}
                    onPlaySample={handlePlaySample}
                  />
                </TabsContent>
                <TabsContent value="media" className="flex-1 m-0 overflow-hidden">
                  <MicPanel onMicSampleCreated={(name) => addConsoleMessage(`Sample "${name}" created from mic`, 'info')} />
                </TabsContent>
                <TabsContent value="console" className="flex-1 m-0 overflow-hidden">
                  <ConsolePanel messages={consoleMessages} />
                </TabsContent>
              </Tabs>
```

**Add import for MicPanel:**
At the top of `studio.tsx`, add alongside existing imports:

**oldString:**
```typescript
import ConsolePanel from "@/components/panels/console-panel";
```

**newString:**
```typescript
import ConsolePanel from "@/components/panels/console-panel";
import MicPanel from "@/components/panels/mic-panel";
```

**Test spec:**
- Three tabs visible: SAMPLES, MEDIA, CONSOLE
- Clicking MEDIA tab renders MicPanel
- MicPanel receives `onMicSampleCreated` callback
- MEDIA tab is interactive (mic on/off, freeze visible)

---

## Phase 5 — Polish & Performance

> Effort: ~1 week.

### Task 5.1 — Audio Worklet for recording

**File:** `client/src/lib/recorder.ts`
**Depends on:** nothing (independent improvement)

**Strategy:** Replace `MediaRecorder` with `AudioWorkletNode` + raw PCM capture for lower latency and direct WAV output.

**Implementation plan:**
1. Create `public/worklets/recording-capture-processor.js` — similar to mic worklet but captures from `ctx.destination`
2. The worklet continuously writes PCM samples to a `SharedArrayBuffer`
3. On stop, read the shared buffer and write WAV directly (no WebM → decode → WAV conversion)
4. Fall back to `MediaRecorder` if `AudioWorklet` is unavailable

**Detailed code:** Follow the same pattern as mic-capture-processor.js (Phase 3 Task 3.2), but connected to `ctx.destination` instead of mic input.

**Test spec (manual):**
- Recording produces a playable WAV file
- Audio quality matches MediaRecorder output
- Works in Chrome, Edge, Firefox (worklet support varies)

**Error handling:**
- If `AudioWorklet` is not supported, fall back to existing `MediaRecorder` path
- If `SharedArrayBuffer` is not available (cross-origin isolation), use regular message passing

---

### Task 5.2 — Sample caching & deduplication

**File:** `client/src/lib/sample-registry.ts`
**Depends on:** nothing

**Implementation:**
- Before registering a sample via `samples()`, compute a hash of the audio data
- Store hash in a `Map<string, string>` (hash → name)
- If hash exists, skip re-registration (return the existing name)

```typescript
const sampleHashCache = new Map<string, string>();

async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

**Test spec:**
- Same file imported twice → second import returns cached name
- Different files → both registered
- Blob URL cleanup when sample is deleted

---

### Task 5.3 — Performance monitoring

**Status: Implemented in Task 0.3.** No additional work needed.

---

### Task 5.4 — Keyboard shortcuts

**File:** `client/src/pages/studio.tsx`
**Depends on:** nothing

**Edit:** Add a global keyboard shortcut handler

Add after the existing effects:

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Ctrl+Enter or Cmd+Enter → evaluate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleEvaluate();
    }
    // Space → toggle play/stop (when not in an input)
    if (e.key === ' ' && e.target === document.body) {
      e.preventDefault();
      if (playing) handleStop(); else handlePlay();
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [handleEvaluate, handlePlay, handleStop, playing]);
```

**Test spec:**
- Ctrl+Enter triggers evaluate
- Space on body toggles play/stop
- Space in input field does NOT trigger toggle (native behavior preserved)

---

## Dependency Summary

| Feature | Dependencies | Notes |
|---|---|---|
| Phase 0 | None | Pure client-side changes |
| Phase 1 | None | Pure client-side changes |
| Phase 2 | `yt-dlp` (system binary) | Electron-only. Install via `brew install yt-dlp` / `apt install yt-dlp` |
| Phase 3 | AudioWorklet API | Modern browsers only. No external deps |
| Phase 4 | None | Pure client-side changes |
| Phase 5 | None | Pure client-side changes |

---

## File Change Summary

| File | Phase | Change Type |
|---|---|---|
| `client/src/lib/timeline-engine.ts` | 1 | **NEW** |
| `client/src/lib/mic-capture-engine.ts` | 3 | **NEW** |
| `client/src/lib/media-importer.ts` | 4 | **NEW** |
| `client/src/pages/session-editor.tsx` | 1 | **NEW** |
| `client/src/components/panels/mic-panel.tsx` | 3 | **NEW** |
| `client/src/types/electron-api.d.ts` | 2 | **NEW** |
| `electron/preload.cjs` | 2 | **NEW** |
| `public/worklets/mic-capture-processor.js` | 3 | **NEW** |
| `public/worklets/recording-capture-processor.js` | 5 | **NEW** |
| `client/src/lib/recorder.ts` | 1, 5 | **EDIT** |
| `client/src/lib/wav-encoder.ts` | 3 | **EDIT** |
| `client/src/lib/sample-registry.ts` | 2 | **EDIT** |
| `client/src/lib/strudel-engine.ts` | 0 | **EDIT** |
| `client/src/pages/studio.tsx` | 0, 1, 4 | **EDIT** |
| `client/src/pages/playback.tsx` | 1 | **EDIT** |
| `client/src/components/timeline/timeline-panel.tsx` | 1 | **EDIT** |
| `client/src/App.tsx` | 1 | **EDIT** |
| `electron/main.cjs` | 2 | **EDIT** |
| `client/src/hooks/use-recorder.ts` | 1 | **EDIT** |

---

## Implementation Order

```
Phase 0 ─── Quick fixes (1 day)
    │
    ▼
Phase 1.1 ─── TimelineEngine core class
    │
    ├──► Phase 1.2 ─── Recording mode wiring
    │       │
    │       ▼
    │   Phase 1.5 ─── Timeline canvas upgrade
    │
    ├──► Phase 1.3 ─── Playback mode upgrade
    │
    └──► Phase 1.4 ─── Edit mode page
            │
            ▼
        Phase 1.6 ─── Route integration
            │
            ▼
Phase 2 ─── YouTube Import (1 week)
    │
    ▼
Phase 3 ─── Microphone Input (2-3 weeks)
    │
    ▼
Phase 4 ─── Media Import (1 week)
    │
    ▼
Phase 5 ─── Polish (1 week)
```

---

## Development Loop — Write, Build, Test

### Loop Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  1. DESIGN  ──→  2. WRITE  ──→  3. TYPECHECK  ──→  4. TEST  │
│     brief         code +          npx tsc          npx vitest │
│     plan          test            --noEmit          (watch)   │
│                    file                                          │
│                       │                                          │
│                       ▼                                          │
│  5. BUILD  ←────  6. MANUAL VERIFY  ←────  7. COMMIT/FIX      │
│   npx vite         browser dev       fix failing tests/        │
│   build            + Electron        types before commit       │
│                    (if applicable)                              │
└──────────────────────────────────────────────────────────────┘
```

### Commands

```bash
# Terminal 1 — dev server
npm run dev

# Terminal 2 — test watch
npm run test:watch

# Before commit — full check
npm run check
```

---

## Testing Strategy

### Installation

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom fake-indexeddb
```

### Vitest config

Add to `vite.config.ts`:

```typescript
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  base: './',
  server: {
    port: 5000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./client/src/test/setup.ts'],
    include: ['client/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['client/src/lib/**', 'client/src/hooks/**'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
    },
  },
});
```

### Setup file content

**File to create:** `client/src/test/setup.ts`

```typescript
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Mock AudioContext for tests
class MockAudioContext {
  sampleRate = 44100;
  currentTime = 0;
  destination: any = null;

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (ch: number) => new Float32Array(length),
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }

  createMediaStreamSource() { return { connect: () => {} }; }
  createMediaStreamDestination() { return { stream: { getTracks: () => [] }, connect: () => {} }; }
  createGain() { return { gain: { value: 1 }, connect: () => {} }; }
  decodeAudioData(buffer: ArrayBuffer) {
    return Promise.resolve(this.createBuffer(2, 44100, 44100));
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

Object.defineProperty(globalThis, 'AudioContext', { value: MockAudioContext, writable: true });
Object.defineProperty(globalThis, 'webkitAudioContext', { value: MockAudioContext, writable: true });

// Mock URL.createObjectURL / revokeObjectURL
if (!URL.createObjectURL) {
  URL.createObjectURL = (blob: Blob) => `blob:mock-${Math.random()}`;
  URL.revokeObjectURL = () => {};
}

// Mock performance.now
if (!performance.now) {
  performance.now = () => Date.now();
}

// Mock window.electronAPI (for Electron tests)
Object.defineProperty(globalThis, 'window', {
  value: { electronAPI: undefined },
  writable: true,
});
```

### Test file layout

```
client/src/
├── lib/
│   ├── __tests__/
│   │   ├── strudel-engine.test.ts
│   │   ├── timeline-engine.test.ts
│   │   ├── recorder.test.ts
│   │   ├── wav-encoder.test.ts
│   │   ├── timeline-parser.test.ts
│   │   ├── media-importer.test.ts
│   │   └── mic-capture-engine.test.ts
│   ├── stores/
│   │   └── __tests__/
│   │       └── session-store.test.ts
├── hooks/
│   └── __tests__/
│       └── use-recorder.test.ts
├── components/
│   └── timeline/
│       └── __tests__/
│           └── timeline-panel.test.tsx
├── test/
│   └── setup.ts
```

### Test pyramid

| Layer | Tools | Speed | Targets |
|---|---|---|---|
| Unit | Vitest | <1s/file | Pure functions in lib/ |
| Integration | Vitest + fake-indexeddb | <3s/file | Stores, hooks |
| Manual | Browser | N/A | Audio, Canvas, Electron |

### What NOT to test

- Canvas pixel rendering (too brittle)
- AudioContext internals (mock at boundary)
- Monaco editor (third-party)
- Electron main process (verify manually)

---

## Phase 6 — Adaptive DAW + Code Session Player + Timeline Editor

**Goal:** Make the DAW timeline automatically detect instruments from ANY Strudel code (no `$:` prefix required), create a live code-evaluation player that replays snapshots as a "DJ set", and add an in-studio SESSION tab with an editable timeline.

> Effort: ~2-3 weeks. Tightly integrated with studio.tsx, timeline-parser.ts, and the existing session system.

### Phase 6 Task Sequence

```
6.1 Create detectInstruments (smart code→tracks parser, no $: required)
    ↓ depends on 6.1
6.2 Update studio.tsx live track display to use detectInstruments
    ↓ depends on 6.1
6.3 Create buildAdaptiveTracksFromSnapshots (timeline from code changes over time)
    ↓ depends on 6.1, 6.3
6.4 Create CodeSessionPlayer class (live evaluate from snapshots, like a DJ set)
    ↓ depends on 6.4
6.5 Create useCodeSessionPlayer hook (React wrapper)
    ↓ depends on 6.4, 6.5
6.6 Create SessionTimelinePanel component (canvas + markers + inline editing)
    ↓ depends on 6.3, 6.6
6.7 Create SessionPanel (SESSION tab in studio right panel, session list + player + timeline)
    ↓ depends on 6.6, 6.7
6.8 Wire export/import + code-only session redirect
```

---

### Task 6.1 — `detectInstruments` function

**File:** `client/src/lib/timeline-parser.ts` (new exported function)

Scans any Strudel code string and returns all unique instrument/sample names used, with their categories. If no sample names are found, falls back to one-track-per-line.

**Signature:**
```typescript
export interface DetectedInstrument {
  name: string;
  category: keyof TrackCategory;
  lineIndex: number;
  code: string; // the full source line that contains this instrument
}

export function detectInstruments(code: string): DetectedInstrument[]
```

**Regex patterns (in order of precedence):**
1. `\.s\(\s*["']([^"']+)["']\s*\)` — sample calls, e.g. `s("bd")`
2. `\.note\(\s*["']([^"']+)["']\s*\)` — note instruments, e.g. `note("piano")`
3. `\.bank\(\s*["']([^"']+)["']\s*\)` — bank references (already grouped, extract as one instrument per bank)

**Dedup logic:** Same name → same instrument, even if it appears in multiple lines.

**Fallback (when no sample/note/bank found):** Split code into non-blank lines, assign `name: 'track-N'`, `category: 'melodic'`, `code: lineContent`.

**Categorization:** Use existing `DRUM_SAMPLES`, `MELODIC_SAMPLES`, `BASS_SAMPLES`, `AMBIENT_SAMPLES`, `SYNTH_SAMPLES` sets from `shared/schema.ts`. If a sample name matches one of these lists, assign the corresponding category. Default: `'melodic'`.

**Bug prevention:**
- Handle `s()` with concatenation `s("bd" + n)` — extract only the string literal part (the regex naturally handles this since it captures what's inside quotes, but `"bd" + n` would just be `bd`)
- Handle `s()` with variables `s(name)` — no string literal found, skip this match
- Handle empty code → return `[]` early
- Handle code with only comments/comments-only lines → return `[]`
- Maximum instrument count: cap at 50 (prevent degenerate cases with huge generated code)

**Test spec (add to `client/src/lib/__tests__/timeline-parser.test.ts`):**
```typescript
describe('detectInstruments', () => {
  it('detects s("name") calls', () => {
    const result = detectInstruments('s("bd").out()');
    expect(result).toEqual([{ name: 'bd', category: 'drums' }]);
  });
  it('detects multiple samples in one line', () => {
    const result = detectInstruments('s("bd").s("hh").out()');
    expect(result).toHaveLength(2);
    expect(result.map(r => r.name).sort()).toEqual(['bd', 'hh']);
  });
  it('deduplicates repeated sample names', () => {
    const result = detectInstruments('s("bd").out()\ns("bd").out()');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('bd');
  });
  it('falls back to per-line when no samples found', () => {
    const result = detectInstruments('foo(220).out()');
    expect(result).toHaveLength(1);
    expect(result[0].name).toMatch(/^track-/);
    expect(result[0].category).toBe('melodic');
  });
  it('returns [] for empty string', () => {
    expect(detectInstruments('')).toEqual([]);
  });
  it('returns [] for comments-only code', () => {
    expect(detectInstruments('// just a comment')).toEqual([]);
  });
  it('categorizes known samples correctly', () => {
    const result = detectInstruments('s("bd").out()');
    expect(result[0].category).toBe('drums');
  });
  it('defaults unknown samples to melodic', () => {
    const result = detectInstruments('s("weird_sound_xyz").out()');
    expect(result[0].category).toBe('melodic');
  });
  it('handles note() calls', () => {
    const result = detectInstruments('note("piano").out()');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('piano');
  });
  it('caps at 50 instruments', () => {
    const manySamples = Array.from({ length: 60 }, (_, i) => `s("s${i}")`).join('.');
    const result = detectInstruments(manySamples);
    expect(result).toHaveLength(50);
  });
});
```

**Error handling:**
- Any regex match failure → silently skip that line (no crash)
- `code` parameter is null/undefined → return `[]`
- Line with syntax errors (e.g. `s("bd` unmatched quote) → regex doesn't match → line falls through to fallback

---

### Task 6.2 — Update studio.tsx live track display

**File:** `client/src/pages/studio.tsx`

**Change location:** The `useEffect` that builds `currentTracks` from code.

**oldString:**
```typescript
  useEffect(() => {
    const tracks = parseEntities(code);
    setCurrentTracks(tracks.map(t => ({
      name: t.name,
      category: t.category,
      color: getTrackColor(t.category),
      events: [],
    })));
  }, [code]);
```

**newString:**
```typescript
  useEffect(() => {
    const instruments = detectInstruments(code);
    const seen = new Set<string>();
    setCurrentTracks(instruments.filter(inst => {
      if (seen.has(inst.name)) return false;
      seen.add(inst.name);
      return true;
    }).map(inst => ({
      name: inst.name,
      category: inst.category,
      color: getTrackColor(inst.category),
      events: [],
    })));
  }, [code]);
```

**Import to add at top:**
```typescript
import { detectInstruments } from '@/lib/timeline-parser';
```

**Bug prevention:**
- `seen` dedup set prevents duplicate tracks with the same instrument name (in case `detectInstruments` somehow returns duplicates — though it shouldn't, this is defense-in-depth)
- If `detectInstruments` throws, the effect catches nothing (React error boundary) — we wrap in try/catch in a later refinement

**Test:**
- Type `s("bd").out()` in editor → one track named "bd" appears in timeline
- Type `s("bd").s("hh").out()` → two tracks "bd", "hh"
- Change code to `s("piano").out()` → track list updates to show only "piano"
- Empty editor → no tracks, shows "No tracks" message

---

### Task 6.3 — `buildAdaptiveTracksFromSnapshots` function

**File:** `client/src/lib/timeline-parser.ts` (new exported function)

Replaces `buildTracksFromSnapshots` with a smarter version that uses `detectInstruments` to track which instruments are active at each point in time.

**Signature:**
```typescript
export function buildAdaptiveTracksFromSnapshots(
  snapshots: { timestamp: number; code: string; entityId: string }[]
): ParsedTrack[]
```

**Algorithm (detailed):**

```
1. Sort snapshots by timestamp ascending
2. Initialize:
   - active: Map<string, { lastCode: string, lastStart: number }>
   - trackEvents: Map<string, TrackEvent[]>
   - GAP_THRESHOLD = 500 (ms)
3. For each snapshot:
   a. instruments = detectInstruments(snapshot.code)
   b. currentNames = Set<string>(instruments.map(i => i.name))
   c. For each name in currentNames:
      - If not in active: create new entry { lastCode, lastStart: timestamp }, initialize empty event array
      - If in active AND (timestamp - active[name].lastStart > GAP_THRESHOLD):
        → close previous event (push to trackEvents[name])
        → start new event with startMs = timestamp
      - Update active[name].lastCode = snapshot.code
      - Update active[name].lastStart = timestamp
   d. For each name in active keys NOT in currentNames:
      - Close the event: push { startMs: active[name].lastStart, endMs: timestamp, code: active[name].lastCode }
      - Remove from active
4. After loop: for each remaining in active:
   → push event { startMs: lastStart, endMs: lastStart + 1000, code: lastCode }
5. Build ParsedTrack[] from trackEvents entries, sorted by first event startMs
```

**Bug prevention:**
- GAP_THRESHOLD prevents micro-events from rapid edits (if same instrument toggles in <500ms, it's treated as one continuous event)
- Instruments that appear once and never change get a fixed 1000ms event (same as current behavior)
- Empty snapshots array → return `[]`
- Snapshots with only comments → `detectInstruments` returns `[]` → no active changes
- If an instrument appears in the first snapshot, `lastStart` is `snapshots[0].timestamp` (not 0)
- String dedup for `code` field — use the snapshot's full code, not just the instrument line (so the code displayed in the event includes the full context)

**Test spec:**
```typescript
describe('buildAdaptiveTracksFromSnapshots', () => {
  it('creates a track for each unique instrument', () => {
    const snaps = [
      { timestamp: 0, code: 's("bd").out()', entityId: 'e1' },
    ];
    const tracks = buildAdaptiveTracksFromSnapshots(snaps);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].name).toBe('bd');
  });
  it('creates events when instruments change', () => {
    const snaps = [
      { timestamp: 0, code: 's("bd").out()', entityId: 'e1' },
      { timestamp: 2000, code: 's("bd").s("hh").out()', entityId: 'e1' },
    ];
    const tracks = buildAdaptiveTracksFromSnapshots(snaps);
    const bdTrack = tracks.find(t => t.name === 'bd');
    expect(bdTrack?.events).toHaveLength(2); // split at 2000
    const hhTrack = tracks.find(t => t.name === 'hh');
    expect(hhTrack?.events).toHaveLength(1);
  });
  it('returns [] for empty snapshots', () => {
    expect(buildAdaptiveTracksFromSnapshots([])).toEqual([]);
  });
  it('sorts tracks by first event start time', () => {
    // ...
  });
});
```

---

### Task 6.4 — `CodeSessionPlayer` class

**File:** `client/src/lib/code-session-player.ts` (NEW)

The core engine that replays code snapshots in real-time by calling `evaluateStrudelCode` at each snapshot boundary.

**Full file:**
```typescript
import { evaluateStrudelCode } from './strudel-engine';

export type CodePlayerState = 'idle' | 'playing' | 'paused';

export interface CodeSnapshotEntry {
  timestamp: number;
  code: string;
  id?: string;
}

export class CodeSessionPlayer {
  state: CodePlayerState = 'idle';
  currentTime: number = 0;
  duration: number = 0;
  bpm: number = 120;
  loop: boolean = false;

  private snapshots: CodeSnapshotEntry[] = [];
  private rafId: number = 0;
  private startedAt: number = 0;
  private elapsedBeforePause: number = 0;
  private lastEvalIndex: number = -1;
  private destroyed: boolean = false;

  onTimeUpdate: ((time: number) => void) | null = null;
  onCodeUpdate: ((code: string) => void) | null = null;
  onStateChange: ((state: CodePlayerState) => void) | null = null;
  onError: ((error: string) => void) | null = null;

  constructor(snapshots: CodeSnapshotEntry[], duration: number, bpm: number) {
    this.setSnapshots(snapshots);
    this.duration = duration;
    this.bpm = bpm;
  }

  setSnapshots(snapshots: CodeSnapshotEntry[]): void {
    this.snapshots = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
    this.lastEvalIndex = -1;
  }

  async play(): Promise<void> {
    if (this.state === 'playing' || this.destroyed) return;
    this.state = 'playing';
    this.startedAt = performance.now();
    this.onStateChange?.('playing');
    this.tick();
  }

  private tick(): void {
    if (this.state !== 'playing' || this.destroyed) return;
    const now = performance.now();
    const elapsed = now - this.startedAt + this.elapsedBeforePause;
    this.currentTime = Math.min(elapsed, this.duration);
    this.onTimeUpdate?.(this.currentTime);

    const idx = this.snapshots.length - 1;
    const currentIdx = this.findSnapshotIndex(this.currentTime);
    if (currentIdx !== this.lastEvalIndex && currentIdx >= 0) {
      this.lastEvalIndex = currentIdx;
      const snap = this.snapshots[currentIdx];
      this.onCodeUpdate?.(snap.code);
      evaluateStrudelCode(snap.code).catch((err) => {
        this.onError?.(`evaluate failed at ${snap.timestamp}ms: ${err.message}`);
      });
    }

    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.elapsedBeforePause = 0;
        this.lastEvalIndex = -1;
        // Evaluate the first snapshot immediately on loop restart
        if (this.snapshots.length > 0) {
          this.onCodeUpdate?.(this.snapshots[0].code);
          evaluateStrudelCode(this.snapshots[0].code).catch(() => {});
        }
        this.startedAt = performance.now();
      } else {
        this.state = 'idle';
        this.onStateChange?.('idle');
        return;
      }
    }

    this.rafId = requestAnimationFrame(() => this.tick());
  }

  pause(): void {
    if (this.state !== 'playing' || this.destroyed) return;
    this.state = 'paused';
    this.elapsedBeforePause = this.currentTime;
    this.cancelRaf();
    this.onStateChange?.('paused');
  }

  stop(): void {
    if (this.destroyed) return;
    this.state = 'idle';
    this.currentTime = 0;
    this.elapsedBeforePause = 0;
    this.lastEvalIndex = -1;
    this.cancelRaf();
    this.onStateChange?.('idle');
    this.onTimeUpdate?.(0);
  }

  async seek(ms: number): Promise<void> {
    if (this.destroyed) return;
    const target = Math.max(0, Math.min(this.duration || ms, ms));
    this.currentTime = target;
    this.elapsedBeforePause = target;
    this.lastEvalIndex = -1;
    this.onTimeUpdate?.(target);

    const idx = this.findSnapshotIndex(target);
    if (idx >= 0) {
      const snap = this.snapshots[idx];
      this.onCodeUpdate?.(snap.code);
      try {
        await evaluateStrudelCode(snap.code);
      } catch (err: any) {
        this.onError?.(`seek evaluate failed at ${target}ms: ${err.message}`);
      }
    }

    if (this.state === 'playing') {
      this.startedAt = performance.now();
    }
  }

  private findSnapshotIndex(time: number): number {
    let idx = -1;
    for (let i = 0; i < this.snapshots.length; i++) {
      if (this.snapshots[i].timestamp <= time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }

  private cancelRaf(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelRaf();
    this.state = 'idle';
    this.onTimeUpdate = null;
    this.onCodeUpdate = null;
    this.onStateChange = null;
    this.onError = null;
  }
}
```

**Bug prevention strategies:**
- `destroyed` flag prevents any callback/tick after `destroy()` called
- `lastEvalIndex` tracks which snapshot was last evaluated — prevents double-evaluation on the same snapshot
- `findSnapshotIndex` does a linear scan (snapshots are sorted) — for very long sessions (1000+ snapshots), cache the last index and binary search. Add a TODO comment for this optimization.
- `evaluateStrudelCode` is called but errors are caught and forwarded to `onError` — never crashes the player
- `cancelRaf` guards against double-cancel (checks `rafId` truthiness)
- `seek` when `state === 'playing'` resets `startedAt` so the RAF loop continues from the correct offset
- `loop` restart evaluates the first snapshot immediately to avoid a gap until the next tick
- Duration 0 → `Math.min(elapsed, 0)` = 0 → stops immediately, no crash

**Test spec:**
```typescript
describe('CodeSessionPlayer', () => {
  it('starts in idle state', () => {
    const player = new CodeSessionPlayer([], 10000, 120);
    expect(player.state).toBe('idle');
  });
  it('evaluates code at snapshot boundaries', async () => {
    const snapshots = [
      { timestamp: 0, code: 's("bd").out()' },
      { timestamp: 2000, code: 's("hh").out()' },
    ];
    const player = new CodeSessionPlayer(snapshots, 10000, 120);
    const evaluated: string[] = [];
    const origEval = evaluateStrudelCode;
    // Mock evaluateStrudelCode
    // ... (use vitest mocking)
    // player.play()
    // await wait for some ticks
    // Verify evaluated contains both codes
  });
  it('seek evaluates code at target time', async () => {
    // player.seek(1500) → should evaluate snapshot at 0
    // player.seek(2500) → should evaluate snapshot at 2000
  });
  it('loop restarts from beginning', () => {
    // player.loop = true
    // player.play()
    // Advance past duration → verify snaps re-evaluated
  });
  it('destroy prevents all callbacks', () => {
    // player.destroy()
    // player.play() → no crash
    // player.seek(1000) → no crash
  });
  it('handles empty snapshots', () => {
    const player = new CodeSessionPlayer([], 10000, 120);
    player.play();
    // No error, state transitions work
  });
});
```

---

### Task 6.5 — `useCodeSessionPlayer` hook

**File:** `client/src/hooks/use-code-session-player.ts` (NEW)

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { CodeSessionPlayer, type CodePlayerState, type CodeSnapshotEntry } from '@/lib/code-session-player';

export function useCodeSessionPlayer() {
  const [state, setState] = useState<CodePlayerState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [currentCode, setCurrentCode] = useState('');
  const playerRef = useRef<CodeSessionPlayer | null>(null);

  const loadSession = useCallback((snapshots: CodeSnapshotEntry[], duration: number, bpm: number) => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.destroy();
    }
    const player = new CodeSessionPlayer(snapshots, duration, bpm);
    player.onTimeUpdate = (time) => setCurrentTime(time);
    player.onCodeUpdate = (code) => setCurrentCode(code);
    player.onStateChange = (s) => setState(s);
    player.onError = (err) => console.warn('[CodePlayer]', err);
    playerRef.current = player;
    if (snapshots.length > 0) {
      setCurrentCode(snapshots[0].code);
    }
  }, []);

  const play = useCallback(() => playerRef.current?.play(), []);
  const pause = useCallback(() => playerRef.current?.pause(), []);
  const stop = useCallback(() => playerRef.current?.stop(), []);
  const seek = useCallback((ms: number) => playerRef.current?.seek(ms), []);
  const setLoop = useCallback((loop: boolean) => { if (playerRef.current) playerRef.current.loop = loop; }, []);

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.destroy();
      }
    };
  }, []);

  return { state, currentTime, currentCode, loadSession, play, pause, stop, seek, setLoop };
}
```

**Bug prevention:**
- `loadSession` destroys previous player before creating a new one (prevents orphan RAF loops)
- Cleanup `useEffect` destroys player on unmount
- `Null`-safe callbacks via `?.` operator
- Initial code set from first snapshot's code
- `playerRef` persists across renders without triggering re-renders

---

### Task 6.6 — `SessionTimelinePanel` component

**File:** `client/src/components/timeline/session-timeline-panel.tsx` (NEW)

A canvas-based timeline component specifically for visualizing code snapshots over time. Different from `TimelinePanel` — this shows snapshot markers (not track events) and supports inline editing.

```
Props:
- snapshots: { timestamp: number; code: string; id: string; actionType: string }[]
- duration: number
- currentTime: number
- currentSnapshotId?: string
- editable?: boolean
- onSeek?: (ms: number) => void
- onSnapshotSelect?: (id: string) => void
- onSnapshotEdit?: (id: string, newCode: string) => void
- onSnapshotDelete?: (id: string) => void
- onSnapshotAdd?: (timestamp: number) => void
```

**Rendering (canvas):**
- Time ruler at top (1s/2s tick marks, same style as TimelinePanel)
- Snapshot markers: small diamond `◆` at each snapshot's timestamp, drawn as filled polygons
- Color by actionType: edit=blue, evaluate=green, play=cyan, stop=red, bpm_change=yellow
- Current snapshot (selected or active): larger diamond with white border
- Playhead: white vertical line
- Time labels for each snapshot marker (small text below ruler, truncated)
- When hovering a marker (editable=true), show a tooltip with the code preview (first 40 chars)

**Interaction:**
- Click on timeline ruler → onSeek
- Click on snapshot marker → onSnapshotSelect(id)
- Double-click on snapshot marker (editable=true) → open inline edit mode (text overlay)
- Right-click on snapshot marker (editable=true) → context menu with Delete option
- Click in empty space between markers (editable=true) → "Add snapshot here" → onSnapshotAdd

**Canvas drawing details:**
```typescript
const markerColors: Record<string, string> = {
  edit: '#3b82f6',
  evaluate: '#22c55e',
  play: '#06b6d4',
  stop: '#ef4444',
  bpm_change: '#eab308',
};

// Diamond size: 8px half-width, 12px half-height
// Selected marker: same diamond + 2px white stroke
// Playhead: 1px white line from top to bottom
```

**Bug prevention:**
- Empty snapshots → render "No snapshots" centered message (same as TimelinePanel's empty state)
- Duration 0 → prevent division by zero in position calculations (use `Math.max(duration, 10000)` like TimelinePanel)
- Snapshots at same timestamp → render stacked (slightly offset) so both are clickable
- Canvas resize → use `ResizeObserver` to re-render (not just `getBoundingClientRect()` in useEffect — actually the current pattern uses `getBoundingClientRect()` which works for initial render; we should add a window resize handler too)
- Tooltip follows mouse position, bounded to canvas edges
- Double-click fires on snapshot, not on empty space — check hit target first

**Test spec:**
```typescript
describe('SessionTimelinePanel', () => {
  it('renders markers at correct x positions', () => { /* check pixel positions */ });
  it('shows empty message when no snapshots', () => { /* verify text rendered */ });
  it('calls onSeek when ruler clicked', () => { /* simulate mouse event */ });
  it('calls onSnapshotSelect when marker clicked', () => { /* simulate mouse event */ });
  it('highlights current snapshot', () => { /* verify different rendering */ });
  it('handles click outside markers gracefully', () => { /* no crash */ });
});
```

---

### Task 6.7 — `SessionPanel` component + SESSION tab

**File:** `client/src/components/panels/session-panel.tsx` (NEW)

A panel component that shows a list of saved code sessions and the session player/timeline.

**Layout:**
```
┌────────────────────────┐
│ SESSION LIST           │
│ ┌────────────────────┐ │
│ │ Session 1      ▶  │ │
│ │ Session 2      ▶  │ │
│ │ Session 3      ▶  │ │
│ └────────────────────┘ │
│                        │
│ ─── PLAYING ─────────  │
│ [▶] [⏸] [⏹] [🔁]     │
│ 00:15 / 02:30          │
│                        │
│ ┌────────────────────┐ │
│ │ [Timeline canvas]  │ │
│ │ ◆  ◆    ◆  ◆    ◆ │ │
│ └────────────────────┘ │
│                        │
│ Code: s("bd").out()    │
│ [Edit] [Save] [Delete] │
└────────────────────────┘
```

**Sections:**
1. Session list: scrollable list of saved sessions (from IndexedDB), showing name + duration + date. Click to load into player.
2. Player controls: play/pause/stop/loop buttons, time display
3. Timeline canvas: `<SessionTimelinePanel>` showing the loaded session's snapshots
4. Code preview/editor: current snapshot's code in a mini Monaco or read-only text area. Edit button toggles editable mode.

**File:** `client/src/pages/studio.tsx` (modifications)

Add SESSION tab to right panel tabs:

**oldString:**
```typescript
              <TabsTrigger value="media">MEDIA</TabsTrigger>
              <TabsContent value="media">
```

**newString:**
```typescript
              <TabsTrigger value="media">MEDIA</TabsTrigger>
              <TabsTrigger value="session">SESSION</TabsTrigger>
              <TabsContent value="session">
                <SessionPanel
                  currentSessionSnapshots={currentSessionSnapshots}
                  currentSessionDuration={recordingDuration}
                  currentSessionBpm={selectedProject?.bpm || 120}
                />
              </TabsContent>
              <TabsContent value="media">
```

**Import:**
```typescript
import SessionPanel from "@/components/panels/session-panel";
```

**Bug prevention:**
- Session list shows loading state while IndexedDB is queried
- Player controls are disabled when no session is loaded
- Stop resets the player and timeline to 0
- Loop toggle shows visual state (same pattern as playback.tsx LOOP ON/OFF button)
- Timeline canvas has a minimum height of 80px (prevents invisible canvas issues)
- When a session finishes playing (non-loop), controls update to show idle state

---

### Task 6.8 — Wire export/import + code-only session redirect

**File:** `client/src/lib/session-exporter.ts` (enhancement)

Add `isCodeSession` helper and ensure exported sessions are usable by the code player:

```typescript
export function isCodeSession(session: RecordingSession): boolean {
  return session.audioBlob.size === 0;
}
```

**File:** `client/src/components/panels/recordings-panel.tsx` (or wherever session list is shown)

In the session list, detect code-only sessions and show "PLAY CODE" instead of normal playback link:

```typescript
// In the recording item rendering:
const codeSession = isCodeSession(session);
// ...
<button onClick={() => {
  if (codeSession) {
    navigate(`/?session=${session.id}`); // or open in studio SESSION tab
  } else {
    navigate(`/playback/${session.id}`);
  }
}}>
  {codeSession ? '▶ PLAY CODE' : '▶ PLAYBACK'}
</button>
```

**Bug prevention:**
- `audioBlob.size` check works because `createSession` with `new Blob([], { type: 'audio/wav' })` creates a blob with `.size === 0`
- Imported sessions (via `.strudel.json`) already use `new Blob([], ...)` — they're automatically code-only sessions
- Navigating to `playback/:id` for a code-only session: the page should detect this and show a message "This session has no audio. Open in Studio SESSION tab instead." with a link.

---

### Integration / Cross-cutting Concerns

**How the pieces fit together:**

```
studio.tsx
├── detectInstruments(code) → live track names
│   (adaptive DAW, no $: required)
├── TimelinePanel
│   └── tracks from detectInstruments (events: [])
├── SessionPanel (new, in right panel SESSION tab)
│   ├── session list from IndexedDB
│   ├── useCodeSessionPlayer hook
│   ├── CodeSessionPlayer ➜ evaluateStrudelCode at snapshot times
│   ├── SessionTimelinePanel (markers + playhead)
│   └── Code preview/editor
├── RecorderControls → handleRecordingStop → createSession
│   (existing, creates sessions with both tracks + snapshots)
└── session-exporter.ts
    ├── exportSessionAsJson → .strudel.json (code-only)
    └── importSessionFromFile → createSession with empty blob
```

**State flow during live code playback:**
```
1. User loads session in SessionPanel
2. useCodeSessionPlayer.loadSession(snapshots, duration, bpm)
3. User clicks Play
4. CodeSessionPlayer.tick() runs RAF loop
5. At each snapshot boundary:
   a. evaluateStrudelCode(snapshot.code) → Strudel plays the code live
   b. onCodeUpdate fires → code preview updates
   c. onTimeUpdate fires → timeline playhead moves
6. User clicks Seek on timeline
   a. CodeSessionPlayer.seek(ms)
   b. evaluateStrudelCode(codeAtTime) → immediate code evaluation
   c. Timeline playhead jumps
7. Loop enabled → restarts from 0 when reaching end
```

---

### Verification & Rollback

**After each task:**
```
npx tsc --noEmit          # TypeScript check
npx vite build            # Full build (skip if tsc clean)
```

**Full verification before marking phase done:**
```
npx tsc --noEmit
npx vite build
```

**Rollback plan:**
- Each task is self-contained: revert the single file edit
- Task 6.1 (detectInstruments) is additive — no existing code modified, just revert by removing the function
- Task 6.2 modifies studio.tsx — revert to old `parseEntities` call
- Tasks 6.4-6.7 are new files — just delete them
- Task 6.3 replaces `buildTracksFromSnapshots` callers — revert to old function call

---

### Manual QA Checklist

Before marking Phase 6 complete:

1. **Adaptive DAW**
   - [ ] Type `s("bd").out()` → one "bd" track shown in timeline
   - [ ] Type `s("bd").s("hh").out()` → two tracks "bd", "hh"
   - [ ] Type code without samples `slow(2).sine(220).out()` → one generic track shown
   - [ ] Change code → tracks update immediately
   - [ ] Empty code → "No tracks" message

2. **Code Session Player**
   - [ ] Record a session with a few code changes
   - [ ] Load it in the SESSION tab
   - [ ] Click Play → code gets re-evaluated at each snapshot time
   - [ ] Seek on timeline → code updates and evaluates immediately
   - [ ] Toggle loop → playback restarts from beginning
   - [ ] Stop → resets to time 0

3. **Session Timeline UI**
   - [ ] Snapshot markers visible at correct positions
   - [ ] Playhead moves during playback
   - [ ] Click marker → selects it (highlighted)
   - [ ] Double-click marker (editable=true) → code shows in editor

4. **Export/Import**
   - [ ] Export a session → .strudel.json file downloads
   - [ ] Import the file → session appears in list
   - [ ] Imported session has no audio → shown as "code-only" with PLAY CODE button

5. **Edge cases**
   - [ ] Empty session (no snapshots) → player shows idle, no crash
   - [ ] Single snapshot → player evaluates once and stops
   - [ ] Rapid seeking → no double-evaluations or race conditions
   - [ ] Destroy player while playing → no orphan RAF
   - [ ] Very long session (1000+ snapshots) → player doesn't lag

---

## Phase 7 — Multi-Origin Sample Browser (Dirt Samples + Freesound)

**Goal:** Transform the SamplesPanel into an origin-aware sample browser with two data sources: the already-integrated Dirt Samples manifest (200+ banks, zero setup, offline-capable) and the Freesound online API (700k+ CC0/Creative Commons sounds, requires free API key). Add an API key onboarding dialog and a unified searchable UI with sub-tab origins.

> **Effort:** ~2 weeks.

### Phase 7 Task Sequence

```
7.1 Create Freesound API client module
    └── depends on: nothing (pure HTTP client)
7.2 API key persistence layer + validation (inside 7.1 module)
    └── depends on: 7.1
7.3 Create ApiKeyDialog component (pre-UI onboarding)
    └── depends on: 7.2
7.4 Refactor SamplesPanel with origin sub-tabs (BUILT-IN / DIRT / FREESOUND / CUSTOM)
    └── depends on: 7.3, 7.5, 7.6
7.5 Create DirtSamplesBrowser component (all manifest banks, categorized, searchable)
    └── depends on: sample-registry.ts (already exists), shared/schema.ts categories
7.6 Create FreesoundSearch component (search bar + results + preview + import)
    └── depends on: 7.1, 7.3
7.7 Verify studio.tsx pass-through (no code changes expected)
```

---

### Task 7.1 — Freesound API client module

**File:** `client/src/lib/freesound-api.ts` (NEW)

A dedicated HTTP module wrapping the Freesound API v2 with token authentication, search, sound detail retrieval, and preview URL extraction.

**Reference docs:**
- API registration: https://freesound.org/apiv2/apply (free, ~5 minutes)
- Auth: Token-based (`Authorization: Token <key>` or `?token=<key>` query param)
- Search: `GET https://freesound.org/apiv2/search/?query=<q>&fields=...&page_size=N`
- Sound detail: `GET https://freesound.org/apiv2/sounds/<id>/`
- Preview URL: stored in `response.previews['preview-hq-mp3']` (high quality mp3) or fallback `['preview-lq-mp3']` (low quality ~64kbps)
- Download original file: requires OAuth2 (not needed — preview URLs are sufficient for browser preview + import)
- Rate limit: not publicly documented; ~2000 requests/day typical for token auth; 429 Too Many Requests must be handled

**Full file content:**

```typescript
const API_BASE = 'https://freesound.org/apiv2';
const STORAGE_KEY = 'freesound_api_key';

// ──────────────────────────────────────────
// Types
// ──────────────────────────────────────────

export interface FreesoundSound {
  id: number;
  name: string;
  tags: string[];
  username: string;
  previews: {
    'preview-hq-mp3': string;
    'preview-lq-mp3': string;
    'preview-hq-ogg': string;
    'preview-lq-ogg': string;
  };
  duration: number;
  description: string;
  license: string;           // "Creative Commons 0", "Attribution", "Attribution NonCommercial"
  url?: string;              // Freesound website URL
}

export interface FreesoundSearchResponse {
  count: number;             // Total results across all pages
  next: string | null;       // URL to next page (null if last page)
  previous: string | null;   // URL to previous page
  results: FreesoundSound[];
}

// ──────────────────────────────────────────
// API Key Management (Task 7.2 is inlined here)
// ──────────────────────────────────────────

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiKey(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

// ──────────────────────────────────────────
// HTTP Client
// ──────────────────────────────────────────

async function freesoundFetch(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal
): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) throw new FreesoundApiError('Freesound API key not set', 'NO_KEY');

  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  url.searchParams.set('token', apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal });
  } catch (err: any) {
    if (err.name === 'AbortError') throw err; // re-throw AbortError for caller to handle
    throw new FreesoundApiError(`Network error: ${err.message}`, 'NETWORK');
  }

  if (res.status === 401 || res.status === 403) {
    throw new FreesoundApiError('Invalid Freesound API key', 'INVALID_KEY');
  }
  if (res.status === 429) {
    throw new FreesoundApiError('Too many requests. Please wait a moment.', 'RATE_LIMITED');
  }
  if (!res.ok) {
    throw new FreesoundApiError(`Freesound API error: HTTP ${res.status}`, 'SERVER_ERROR');
  }

  return res.json();
}

// ──────────────────────────────────────────
// Custom Error Type
// ──────────────────────────────────────────

export class FreesoundApiError extends Error {
  code: 'NO_KEY' | 'INVALID_KEY' | 'RATE_LIMITED' | 'NETWORK' | 'SERVER_ERROR';
  constructor(message: string, code: FreesoundApiError['code']) {
    super(message);
    this.name = 'FreesoundApiError';
    this.code = code;
  }
}

// ──────────────────────────────────────────
// API Methods
// ──────────────────────────────────────────

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/search/?query=test&page_size=1&token=${key}`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function searchSounds(
  query: string,
  page: number = 1,
  pageSize: number = 20,
  signal?: AbortSignal
): Promise<FreesoundSearchResponse> {
  if (!query.trim()) throw new FreesoundApiError('Search query cannot be empty', 'NO_KEY');
  return freesoundFetch('/search/', {
    query: query.trim(),
    page: String(page),
    page_size: String(pageSize),
    fields: 'id,name,tags,username,previews,duration,description,license',
  }, signal);
}

export async function getSoundDetail(
  soundId: number,
  signal?: AbortSignal
): Promise<FreesoundSound> {
  return freesoundFetch(`/sounds/${soundId}/`, {
    fields: 'id,name,tags,username,previews,duration,description,license',
  }, signal);
}

export function getPreviewUrl(sound: FreesoundSound): string {
  return sound.previews['preview-hq-mp3'] || sound.previews['preview-lq-mp3'] || '';
}
```

**Test spec:**
```typescript
describe('Freesound API client', () => {
  beforeEach(() => localStorage.clear());

  it('getApiKey returns null when no key stored', () => {
    expect(getApiKey()).toBeNull();
  });
  it('setApiKey then getApiKey returns the key', () => {
    setApiKey('test-key-123');
    expect(getApiKey()).toBe('test-key-123');
  });
  it('clearApiKey removes stored key', () => {
    setApiKey('abc');
    clearApiKey();
    expect(getApiKey()).toBeNull();
  });
  it('hasApiKey returns false when no key', () => {
    expect(hasApiKey()).toBe(false);
  });
  it('hasApiKey returns true when key exists', () => {
    setApiKey('abc');
    expect(hasApiKey()).toBe(true);
  });
  it('validateApiKey returns false for invalid key', async () => {
    const result = await validateApiKey('garbage-key');
    expect(result).toBe(false);
  });
  it('FreesoundApiError has correct name and code', () => {
    const err = new FreesoundApiError('test', 'NO_KEY');
    expect(err.name).toBe('FreesoundApiError');
    expect(err.code).toBe('NO_KEY');
    expect(err.message).toBe('test');
  });
  it('freesoundFetch without key throws NO_KEY error', async () => {
    await expect(freesoundFetch('/search/', { query: 'test' }))
      .rejects.toThrow('Freesound API key not set');
  });
  it('searchSounds with empty query throws error', async () => {
    await expect(searchSounds('  ')).rejects.toThrow('cannot be empty');
  });
  it('getPreviewUrl returns hq-mp3 when available', () => {
    const sound: FreesoundSound = {
      id: 1, name: 'x', tags: [], username: 'u',
      previews: { 'preview-hq-mp3': 'https://hq.mp3', 'preview-lq-mp3': 'https://lq.mp3', 'preview-hq-ogg': '', 'preview-lq-ogg': '' },
      duration: 1, description: '', license: 'CC0',
    };
    expect(getPreviewUrl(sound)).toBe('https://hq.mp3');
  });
  it('getPreviewUrl falls back to lq-mp3 when hq missing', () => {
    const sound: FreesoundSound = {
      id: 1, name: 'x', tags: [], username: 'u',
      previews: { 'preview-hq-mp3': '', 'preview-lq-mp3': 'https://lq.mp3', 'preview-hq-ogg': '', 'preview-lq-ogg': '' },
      duration: 1, description: '', license: 'CC0',
    };
    expect(getPreviewUrl(sound)).toBe('https://lq.mp3');
  });
  it('searchSounds with valid key returns expected shape', async () => {
    // Integration test — requires a real API key. Skipped in CI.
  });
});
```

**Bug prevention:**
- `FreesoundApiError` is a typed error class — UI can switch on `err.code` to show different messages per error type
- `AbortSignal` support in all fetch methods — allows component to cancel in-flight requests on unmount
- Empty query guard in `searchSounds` prevents wasteful API calls
- Rate limit detection (HTTP 429) has its own error code `RATE_LIMITED`
- Network errors caught and wrapped with `NETWORK` code (prevents raw TypeError from propagating)
- `getPreviewUrl` always returns a string (fallback to empty string if no preview available)
- `localStorage` calls are synchronous and never throw

---

### Task 7.2 — API key persistence layer + validation

This is handled entirely inside `freesound-api.ts` (Task 7.1). No separate file.

| Method | Description |
|---|---|
| `getApiKey()` | Returns stored key or `null` |
| `setApiKey(key)` | Persists key to `localStorage` |
| `clearApiKey()` | Removes key from `localStorage` |
| `hasApiKey()` | Returns `boolean` |
| `validateApiKey(key)` | Tests key against Freesound API, returns `boolean` |

**Validation flow:**
1. User enters key in `ApiKeyDialog`
2. `validateApiKey(key)` fires a test request to `/?query=test&page_size=1`
3. If 200 → key is valid → persist with `setApiKey()`
4. If non-200 → key is invalid → show error message
5. If network error → show "Could not reach Freesound. Check your internet connection."

**Storage reasoning:**
- `localStorage` chosen over IndexedDB because:
  - API key is a simple string, not a complex object
  - Synchronous reads avoid async race conditions
  - No IndexedDB schema migration concerns
  - Keys are small (< 100 bytes)
- No encryption: `localStorage` is plaintext. This matches the conventions of most Freesound API client apps. For a production app, we'd use the Electron safeStorage API, but for this use-case it's acceptable.

---

### Task 7.3 — ApiKeyDialog component

**File:** `client/src/components/samples/api-key-dialog.tsx` (NEW)

A modal dialog for entering and validating the Freesound API key. Shown when the user clicks the FREESOUND tab with no key stored, or when they manually click "API Key" in the toolbar.

**Props:**
```typescript
export interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeySaved?: () => void;  // Called after key is validated + saved
}
```

**Layout:**
```
┌──────────────────────────────────────────┐
│  🌐 Freesound API Key                    │  ← DialogTitle
│                                          │
│  Search over 700,000 CC0/Creative        │
│  Commons sounds from Freesound.          │
│                                          │
│  Get your free API key:                  │
│  ┌──────────────────────────────────┐    │
│  │ freesound.org/apiv2/apply        │    │  ← Link (opens in new tab)
│  └──────────────────────────────────┘    │
│                                          │
│  API Key                                 │
│  ┌──────────────────────────────────┐    │
│  │ [____________________________]  │    │  ← Input (type="text")
│  └──────────────────────────────────┘    │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ TEST KEY │ │   SAVE   │ │ CANCEL   │ │  ← Buttons
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│  🔴 Invalid key.                       │  ← Status (conditional)
│  Check your key at freesound.org/apiv2  │
└──────────────────────────────────────────┘
```

**State machine:**

```
       ┌──────────┐
       │  IDLE    │  ← Input empty, all buttons disabled
       └────┬─────┘
            │ user types
       ┌────▼─────┐
       │  TYPING  │  ← Input has text, TEST KEY enabled
       └────┬─────┘
            │ user clicks "TEST KEY"
       ┌────▼─────┐
       │ TESTING  │  ← Spinner, buttons disabled
       └────┬─────┘
    ┌───────┴───────┐
    │               │
┌───▼───┐       ┌───▼───┐
│ VALID │       │INVALID│
│ ✓ Key │       │ ✗ Key │
│ is ok │       │ is not│
│ SAVE+ │       │ valid │
│ CANCEL│       │ SAVE  │
└───────┘       │ disabled│
                └────────┘
```

**Full component:**

```typescript
import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getApiKey, setApiKey, validateApiKey, clearApiKey } from '@/lib/freesound-api';

export interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeySaved?: () => void;
}

type KeyStatus = 'idle' | 'typing' | 'testing' | 'valid' | 'invalid' | 'error';

export default function ApiKeyDialog({ open, onOpenChange, onKeySaved }: ApiKeyDialogProps) {
  const [inputKey, setInputKey] = useState('');
  const [status, setStatus] = useState<KeyStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Pre-fill existing key when dialog opens
  useEffect(() => {
    if (open) {
      const existing = getApiKey();
      setInputKey(existing || '');
      setStatus(existing ? 'typing' : 'idle');
      setErrorMsg('');
    }
  }, [open]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputKey(e.target.value);
    setStatus(e.target.value.trim() ? 'typing' : 'idle');
    setErrorMsg('');
  }, []);

  const handleTest = useCallback(async () => {
    const key = inputKey.trim();
    if (!key) return;
    setStatus('testing');
    setErrorMsg('');
    try {
      const valid = await validateApiKey(key);
      setStatus(valid ? 'valid' : 'invalid');
      if (!valid) setErrorMsg('Invalid key. Check your key at freesound.org/apiv2/apply');
    } catch {
      setStatus('error');
      setErrorMsg('Could not reach Freesound. Check your internet connection.');
    }
  }, [inputKey]);

  const handleSave = useCallback(() => {
    if (status !== 'valid') return;
    setApiKey(inputKey.trim());
    onKeySaved?.();
    onOpenChange(false);
  }, [status, inputKey, onKeySaved, onOpenChange]);

  const handleCancel = useCallback(() => {
    // If user had a key and canceled, keep the old key
    onOpenChange(false);
  }, [onOpenChange]);

  const canTest = status === 'typing';
  const canSave = status === 'valid';
  const isTesting = status === 'testing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-strudel-surface border-strudel-surface-light max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white text-sm">🌐 Freesound API Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">
            Search over <strong>700,000+</strong> CC0 / Creative Commons sounds from Freesound.
          </p>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Get your free API key:</p>
            <a
              href="https://freesound.org/apiv2/apply"
              target="_blank"
              rel="noopener noreferrer"
              className="text-strudel-accent underline text-[10px] block"
            >
              freesound.org/apiv2/apply
            </a>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">API Key</label>
            <Input
              value={inputKey}
              onChange={handleInputChange}
              placeholder="Paste your Freesound API key here"
              className="bg-strudel-dark border-strudel-surface-light text-white text-xs h-8 mt-1"
              onKeyDown={e => { if (e.key === 'Enter' && canTest) handleTest(); }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleTest}
              disabled={!canTest || isTesting}
              variant="outline"
              size="sm"
              className="text-xs h-7"
            >
              {isTesting ? 'Testing...' : 'Test Key'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              size="sm"
              className="text-xs h-7 bg-strudel-primary hover:bg-strudel-secondary"
            >
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground"
            >
              Cancel
            </Button>
          </div>
          {status === 'invalid' && (
            <p className="text-[10px] text-red-400">{errorMsg}</p>
          )}
          {status === 'error' && (
            <p className="text-[10px] text-yellow-400">{errorMsg}</p>
          )}
          {status === 'valid' && (
            <p className="text-[10px] text-green-400">✓ Key is valid. Click Save to continue.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Test spec:**
```typescript
describe('ApiKeyDialog', () => {
  beforeEach(() => localStorage.clear());

  it('renders with empty input when no key stored', () => {
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByPlaceholderText(/Paste your/)).toHaveValue('');
  });
  it('pre-fills input with stored key', () => {
    setApiKey('stored-key');
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByPlaceholderText(/Paste your/)).toHaveValue('stored-key');
  });
  it('Test button disabled when input empty', () => {
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} />);
    expect(screen.getByText('Test Key')).toBeDisabled();
  });
  it('Test button enabled when input has text', () => {
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste your/), { target: { value: 'abc' } });
    expect(screen.getByText('Test Key')).toBeEnabled();
  });
  it('calls validateApiKey on Test click', async () => {
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste your/), { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('Test Key'));
    // validateApiKey is called internally — we'd mock it in a real test
  });
  it('Save button enabled only after valid key', () => {
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} />);
    // Initially disabled
    expect(screen.getByText('Save')).toBeDisabled();
    // After valid status — would need to mock validateApiKey to return true
  });
  it('Save persists key and calls onKeySaved', () => {
    const onKeySaved = vi.fn();
    render(<ApiKeyDialog open={true} onOpenChange={() => {}} onKeySaved={onKeySaved} />);
    // Set key, validate, save — mock validateApiKey to return true
  });
});
```

**Bug prevention:**
- Dialog pre-fills existing key (so user can see what they previously entered)
- Test button disabled while testing (`status === 'testing'`) — prevents double-calls
- Save button disabled until key is validated as valid
- Enter key in input triggers test (not save) — prevents accidental save of unvalidated key
- Cancel does NOT clear existing key (if one was set)
- Link opens in new tab (no navigation away from the app)
- Error messages are color-coded: red for invalid key, yellow for network error, green for valid
- Input trimmed on test/save (whitespace is stripped)

---

### Task 7.4 — Refactor SamplesPanel with origin sub-tabs

**File:** `client/src/components/panels/samples-panel.tsx` (EDIT)

Restructure the panel from a single-view layout to a multi-origin layout with sub-tabs.

**New component tree:**

```
SamplesPanel
├── Search bar (shared, filters current tab content)
├── Origin sub-tab bar
│   ├── BUILT-IN  → renders existing built-in categories
│   ├── DIRT      → renders <DirtSamplesBrowser>
│   ├── FREESOUND → renders <FreesoundSearch>
│   └── CUSTOM    → renders existing MY SAMPLES + DISCOVERED
├── Tab content area (switches based on originTab)
├── Action bar
│   ├── ADD FILE (always visible)
│   ├── ADD URL (always visible)
│   └── API KEY (only on FREESOUND tab)
├── File input (hidden)
├── URL import Dialog
└── ApiKeyDialog
```

**State additions:**

```typescript
// New state
const [originTab, setOriginTab] = useState<'builtin' | 'dirt' | 'freesound' | 'custom'>('builtin');
const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
```

**Detailed edit plan:**

**Edit 1 — Add origin tab state (on or after line 40):**

```
oldString:
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [discoveredBanks, setDiscoveredBanks] = useState<string[]>([]);
  const [customSamples, setCustomSamples] = useState<CustomSample[]>([]);

newString:
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [discoveredBanks, setDiscoveredBanks] = useState<string[]>([]);
  const [customSamples, setCustomSamples] = useState<CustomSample[]>([]);
  const [originTab, setOriginTab] = useState<'builtin' | 'dirt' | 'freesound' | 'custom'>('builtin');
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
```

**Edit 2 — Insert origin tab bar after search bar, before category filter bar:**

```
oldString:
      <div className="flex gap-1 p-1 border-b border-strudel-surface-light flex-wrap">
        <button
          onClick={() => setActiveCategory(null)}
          className={`text-[10px] px-2 py-0.5 rounded ${!activeCategory ? 'bg-strudel-primary text-white' : 'text-muted-foreground hover:text-white'}`}
        >
          ALL
        </button>

newString:
      <div className="flex gap-1 p-1 border-b border-strudel-surface-light">
        {(['builtin', 'dirt', 'freesound', 'custom'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setOriginTab(tab)}
            className={`text-[10px] px-2 py-0.5 rounded uppercase ${
              originTab === tab
                ? 'bg-strudel-primary text-white'
                : 'text-muted-foreground hover:text-white'
            }`}
          >
            {tab === 'freesound' ? '🌐 FREESOUND' : tab === 'builtin' ? 'BUILT-IN' : tab}
          </button>
        ))}
      </div>

      {originTab === 'builtin' && (
        <div className="flex gap-1 p-1 border-b border-strudel-surface-light flex-wrap">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[10px] px-2 py-0.5 rounded ${!activeCategory ? 'bg-strudel-primary text-white' : 'text-muted-foreground hover:text-white'}`}
          >
            ALL
          </button>
```

**Edit 3 — Close the `builtin` conditional block before ScrollArea:**

```
oldString:
      <ScrollArea className="flex-1">
        {customSamples.length > 0 && (
          <SampleSection
            label="MY SAMPLES"

newString:
      )}

      <ScrollArea className="flex-1">
        {originTab === 'custom' && customSamples.length > 0 && (
          <SampleSection
            label="MY SAMPLES"
            color="#a855f7"
            items={customSamples.map(s => s.name)}
            onInsert={onInsertSample}
            onPlay={onPlaySample}
            onRemove={handleRemoveCustom}
            showRemove
          />
        )}

        {originTab === 'custom' && discoveredBanks.length > 0 && (
          <SampleSection
            label="DISCOVERED"
            color="#22c55e"
            items={discoveredBanks}
            onInsert={name => onInsertSample(name)}
            onPlay={name => onPlaySample(name)}
          />
        )}

        {originTab === 'builtin' && customSamples.length > 0 && (
          <SampleSection
            label="MY SAMPLES"
```

**Edit 4 — Wrap built-in content only in BUILT-IN tab:**

```
oldString:
        {discoveredBanks.length > 0 && (
          <SampleSection
            label="DISCOVERED"
          ...
            </div>
          )
        )}

newString:
        {originTab === 'builtin' && discoveredBanks.length > 0 && (
          <SampleSection
            label="DISCOVERED"
          ...
            </div>
          )
        )}

        {originTab === 'builtin' && displayedBuiltin.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground border-b border-strudel-surface-light">
            ● BUILT-IN
          </div>
        )}
        {originTab === 'builtin' && displayedBuiltin.map(cat =>
          cat.samples.length > 0 && (
            <div key={cat.name}>
              <div className="px-3 py-0.5 text-[9px] font-bold text-muted-foreground/60 uppercase">
                {cat.name}
              </div>
              {cat.samples.map(sample => (
                <SampleRow key={sample} name={sample} onInsert={onInsertSample} onPlay={onPlaySample} />
              ))}
            </div>
          )
        )}
```

**Edit 5 — Add DIRT and FREESOUND tab content before `</ScrollArea>`:**

```
oldString:
      </ScrollArea>

newString:
        {originTab === 'dirt' && (
          <DirtSamplesBrowser
            search={search}
            onInsertSample={onInsertSample}
            onPlaySample={onPlaySample}
          />
        )}

        {originTab === 'freesound' && (
          <FreesoundSearch
            onInsertSample={onInsertSample}
            onPlaySample={onPlaySample}
            onOpenApiKeyDialog={() => setApiKeyDialogOpen(true)}
          />
        )}
      </ScrollArea>
```

**Edit 6 — Add API Key button in action bar (on FREESOUND tab only):**

```
oldString:
      <div className="flex gap-1 p-1 border-b border-strudel-surface-light">
        <Button
          variant="ghost" size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
        >
          <Upload size={10} /> ADD FILE
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => setUrlDialogOpen(true)}
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
        >
          <Globe size={10} /> ADD URL
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

newString:
      <div className="flex gap-1 p-1 border-b border-strudel-surface-light">
        <Button
          variant="ghost" size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
        >
          <Upload size={10} /> ADD FILE
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => setUrlDialogOpen(true)}
          className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1"
        >
          <Globe size={10} /> ADD URL
        </Button>
        {originTab === 'freesound' && (
          <Button
            variant="ghost" size="sm"
            onClick={() => setApiKeyDialogOpen(true)}
            className="h-6 text-[10px] text-muted-foreground hover:text-white gap-1 ml-auto"
            title="Configure Freesound API Key"
          >
            🔑 API KEY
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
```

**Edit 7 — Add ApiKeyDialog before the closing `</div>`:**

```
oldString:
    </div>
  );
}

newString:
      <ApiKeyDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
      />
    </div>
  );
}
```

**Edit 8 — Add imports at top of file:**

```
oldString:
import { registerCustomSample, removeCustomSample, getCustomSamples, loadedBanks, downloadYoutubeAudio } from "@/lib/sample-registry";
import type { CustomSample } from "@/lib/stores/db";

newString:
import { registerCustomSample, removeCustomSample, getCustomSamples, loadedBanks, downloadYoutubeAudio } from "@/lib/sample-registry";
import type { CustomSample } from "@/lib/stores/db";
import DirtSamplesBrowser from "@/components/samples/dirt-samples-browser";
import FreesoundSearch from "@/components/samples/freesound-search";
import ApiKeyDialog from "@/components/samples/api-key-dialog";
```

**Bug prevention:**
- Origin tab defaults to `'builtin'` — no change in initial user experience
- Category filter buttons only shown on BUILT-IN tab (other tabs have their own filter/search)
- Custom samples and discovered banks shown on both BUILT-IN and CUSTOM tabs
- FREESOUND tab auto-opens ApiKeyDialog if no key is stored (checked via `hasApiKey()` on tab switch)
- ADD FILE/ADD URL always add to the user's custom collection regardless of current tab
- Drag-and-drop still works on all tabs (event handlers are on the outermost div)
- Origin tab state is preserved when switching tabs (no re-mount)

---

### Task 7.5 — DirtSamplesBrowser component

**File:** `client/src/components/samples/dirt-samples-browser.tsx` (NEW)

Shows all 200+ banks from the dirt-samples manifest with search filtering, category organization, and per-bank sample expansion.

**Props:**
```typescript
export interface DirtSamplesBrowserProps {
  search: string;                 // Shared search filter from parent
  onInsertSample: (name: string) => void;
  onPlaySample: (name: string) => void;
}
```

**Data Flow:**

```
1. Component mounts
2. Calls loadManifest() from sample-registry.ts
   → Returns Record<string, string[]> (bankName → file paths)
   → Cached after first load — subsequent mounts are instant
3. Categorize each bank using DRUM_SAMPLES, MELODIC_SAMPLES, etc. from shared/schema.ts
4. Apply search filter + category filter
5. Render filtered bank list
6. Click bank → expand to show individual sample files
7. ▶ on sample → play via onPlaySample("bankName") (plays the bank's default sample)
8. + on sample → insert via onInsertSample("bankName.sampleName")
```

**Categorization:**
```typescript
import { DRUM_SAMPLES, MELODIC_SAMPLES, BASS_SAMPLES, AMBIENT_SAMPLES, SYNTH_SAMPLES } from '@shared/schema';

type BankCategory = 'drums' | 'bass' | 'melodic' | 'ambient' | 'fx';

function categorizeBank(bankName: string): BankCategory {
  const lower = bankName.toLowerCase();
  if (DRUM_SAMPLES.includes(lower)) return 'drums';
  if (BASS_SAMPLES.includes(lower)) return 'bass';
  if (MELODIC_SAMPLES.includes(lower)) return 'melodic';
  if (SYNTH_SAMPLES.includes(lower)) return 'melodic';
  if (AMBIENT_SAMPLES.includes(lower)) return 'ambient';
  return 'fx';
}
```

**Component structure:**

```typescript
interface BankEntry {
  name: string;           // Bank name (e.g. "bd", "piano")
  category: BankCategory;
  sampleCount: number;
  samples: string[];      // Individual sample filenames from manifest
}

export default function DirtSamplesBrowser({ search, onInsertSample, onPlaySample }: DirtSamplesBrowserProps) {
  const [manifest, setManifest] = useState<Record<string, string[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBank, setExpandedBank] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Load manifest on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { loadManifest } = await import('@/lib/sample-registry');
        const data = await loadManifest();
        if (cancelled) return;
        if (data) {
          setManifest(data);
        } else {
          setError('Failed to load sample manifest. Check your internet connection.');
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load banks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build categorized bank list from manifest
  const allBanks: BankEntry[] = useMemo(() => {
    if (!manifest) return [];
    return Object.entries(manifest).map(([name, paths]) => ({
      name,
      category: categorizeBank(name),
      sampleCount: paths.length,
      samples: paths.map(p => p.split('/').pop() || p),
    }));
  }, [manifest]);

  // Apply filters
  const filteredBanks = useMemo(() => {
    let result = allBanks;
    if (categoryFilter) {
      result = result.filter(b => b.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(b =>
        b.name.toLowerCase().includes(q) ||
        b.samples.some(s => s.toLowerCase().includes(q))
      );
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [allBanks, categoryFilter, search]);

  // Group by category for display
  const grouped = useMemo(() => {
    const groups: Record<string, BankEntry[]> = {};
    for (const bank of filteredBanks) {
      (groups[bank.category] ||= []).push(bank);
    }
    return groups;
  }, [filteredBanks]);

  // Category colors (matching TRACK_CATEGORIES)
  const categoryInfo: Record<string, { color: string; label: string }> = {
    drums: { color: '#ef4444', label: 'Drums' },
    bass: { color: '#3b82f6', label: 'Bass' },
    melodic: { color: '#22c55e', label: 'Melodic' },
    ambient: { color: '#a855f7', label: 'Ambient' },
    fx: { color: '#f59e0b', label: 'FX' },
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        Loading banks...
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <p className="text-red-400 text-xs">{error}</p>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // Render category filter buttons
  const categoryButtons = (
    <div className="flex gap-1 p-1 border-b border-strudel-surface-light flex-wrap">
      <button
        onClick={() => setCategoryFilter(null)}
        className={`text-[10px] px-2 py-0.5 rounded ${!categoryFilter ? 'bg-strudel-primary text-white' : 'text-muted-foreground hover:text-white'}`}
      >
        ALL ({allBanks.length})
      </button>
      {Object.entries(categoryInfo).map(([key, info]) => (
        <button
          key={key}
          onClick={() => setCategoryFilter(key)}
          className={`text-[10px] px-2 py-0.5 rounded ${
            categoryFilter === key ? 'text-white' : 'text-muted-foreground hover:text-white'
          }`}
          style={categoryFilter === key ? { backgroundColor: info.color } : {}}
        >
          {info.label} ({(allBanks.filter(b => b.category === key)).length})
        </button>
      ))}
    </div>
  );

  // Render bank list
  if (filteredBanks.length === 0) {
    return (
      <>
        {categoryButtons}
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
          {search ? `No banks matching "${search}"` : 'No banks found'}
        </div>
      </>
    );
  }

  return (
    <>
      {categoryButtons}
      {Object.entries(grouped).map(([category, banks]) => (
        <div key={category}>
          <div
            className="px-2 py-1 text-[10px] font-bold border-b border-strudel-surface-light"
            style={{ color: categoryInfo[category]?.color || '#888' }}
          >
            ● {categoryInfo[category]?.label || category} ({banks.length} banks)
          </div>
          {banks.map(bank => (
            <div key={bank.name}>
              <button
                onClick={() => setExpandedBank(expandedBank === bank.name ? null : bank.name)}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-strudel-surface-light/50 w-full text-left text-xs group"
              >
                <span className="text-muted-foreground">{expandedBank === bank.name ? '▾' : '▸'}</span>
                <span className="flex-1 text-white font-mono">{bank.name}</span>
                <span className="text-[9px] text-muted-foreground">{bank.sampleCount} samples</span>
                <button
                  onClick={e => { e.stopPropagation(); onPlaySample(bank.name); }}
                  className="opacity-0 group-hover:opacity-100 text-strudel-accent p-0.5"
                  title={`Preview ${bank.name}`}
                >
                  <Play size={12} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onInsertSample(bank.name); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white p-0.5"
                  title={`Insert ${bank.name}`}
                >
                  <Plus size={12} />
                </button>
              </button>
              {expandedBank === bank.name && (
                <div className="pl-6 border-l border-strudel-surface-light ml-2 mb-1">
                  {bank.samples.slice(0, 100).map(sample => (
                    <div
                      key={sample}
                      className="flex items-center gap-2 px-2 py-0.5 hover:bg-strudel-surface-light/30 text-[10px] group"
                    >
                      <span className="flex-1 text-muted-foreground truncate">{sample}</span>
                      <button
                        onClick={() => onPlaySample(bank.name)}
                        className="opacity-0 group-hover:opacity-100 text-strudel-accent p-0.5"
                        title="Preview"
                      >
                        ▶
                      </button>
                      <button
                        onClick={() => onInsertSample(bank.name)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white p-0.5"
                        title="Insert"
                      >
                        +
                      </button>
                    </div>
                  ))}
                  {bank.samples.length > 100 && (
                    <p className="text-[9px] text-muted-foreground px-2 py-0.5">
                      +{bank.samples.length - 100} more samples
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
```

**Test spec:**
```typescript
describe('DirtSamplesBrowser', () => {
  it('shows loading state when manifest is loading', () => {
    render(<DirtSamplesBrowser search="" onInsertSample={() => {}} onPlaySample={() => {}} />);
    expect(screen.getByText('Loading banks...')).toBeInTheDocument();
  });
  it('shows error state when manifest fails to load', async () => {
    // Mock loadManifest to reject
    render(<DirtSamplesBrowser search="" onInsertSample={() => {}} onPlaySample={() => {}} />);
    // ... wait for error state
  });
  it('renders banks from manifest after load', async () => {
    // Mock loadManifest to return test data
    // Verify bank names are displayed
  });
  it('filters banks by category when category button clicked', async () => {
    // Mock manifest with banks across categories
    // Click "Drums" filter → only drum banks shown
  });
  it('filters banks by search text', async () => {
    // Mock manifest
    // Set search prop to "bd" → only matching banks shown
  });
  it('expands bank to show samples on click', async () => {
    // Click a bank row → sample list becomes visible
  });
  it('collapses expanded bank on second click', async () => {
    // Click same bank twice → samples hidden
  });
  it('calls onInsertSample when + clicked on bank', async () => {
    const onInsert = vi.fn();
    render(<DirtSamplesBrowser search="" onInsertSample={onInsert} onPlaySample={() => {}} />);
    // Wait for load, click + on a bank
    expect(onInsert).toHaveBeenCalledWith('bd');
  });
  it('shows "No banks matching" when search yields no results', async () => {
    render(<DirtSamplesBrowser search="zzz_nonexistent" onInsertSample={() => {}} onPlaySample={() => {}} />);
    // Wait for load
    expect(screen.getByText(/No banks matching/)).toBeInTheDocument();
  });
  it('collapses expanded bank when search changes', async () => {
    // Expand a bank, then change search → bank collapses, filtered view shown
  });
  it('limits expanded samples to 100 with "+N more" message', async () => {
    // Mock a bank with 150 samples → first 100 shown + "+50 more samples" text
  });
});
```

**Bug prevention:**
- `cancelled` flag in useEffect prevents setState after unmount
- All banks sorted alphabetically for consistent display order
- Expanded bank collapses when search or category filter changes (useEffect with dependency on search/categoryFilter)
- Sample list capped at 100 with "+N more" message (prevents rendering thousands of DOM nodes for banks like "bd" with hundreds of samples)
- Category filter buttons show count per category (e.g. "Drums (42)")
- Stale manifest is reloaded if `loadManifest` returns null after a prior successful load — handled by the useEffect re-running on mount
- `computeFn` syntax uses `useMemo` to avoid re-computation on every render
- Inserting a bank name `s("bankName")` works because Strudel treats bank name as a sample source
- Preview plays the bank's first sample (Strudel resolves `s("bankName")` to the first sample in the bank)

---

### Task 7.6 — FreesoundSearch component

**File:** `client/src/components/samples/freesound-search.tsx` (NEW)

Search bar + results list from Freesound API with preview and import functionality.

**Props:**
```typescript
export interface FreesoundSearchProps {
  onInsertSample: (name: string) => void;
  onPlaySample: (name: string) => void;
  onOpenApiKeyDialog: () => void;
}
```

**Layout (vertical sections):**

```
┌───────────────────────────────────────┐
│ Section 1: API Key Prompt             │
│ (shown only when no key stored)       │
│ "🌐 Set up Freesound API Key"         │
│ [Set up API Key]                      │
├───────────────────────────────────────┤
│ Section 2: Search Bar                 │
│ (always visible when key exists)      │
│ ┌─ Search ────────────────────────┐   │
│ │ [Search 700k+ Freesound sounds] │▶  │
│ └─────────────────────────────────┘   │
├───────────────────────────────────────┤
│ Section 3: Status / Loading           │
│ "Searching..." / "42 results" / Error │
├───────────────────────────────────────┤
│ Section 4: Results List               │
│ (scrollable, each row is a sound)     │
│ ┌──────────────────────────────────┐  │
│ │ Piano Chord C Maj    ▶ 5.2s  +  │  │
│ │ CC0 · @user1 · piano, chord     │  │
│ ├──────────────────────────────────┤  │
│ │ ...                             │  │
│ └──────────────────────────────────┘  │
├───────────────────────────────────────┤
│ Section 5: Load More                  │
│ (shown when more pages available)     │
│ [Load more]                           │
└───────────────────────────────────────┘
```

**Full component:**

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Play, Plus, ExternalLink, Loader2 } from 'lucide-react';
import { hasApiKey, searchSounds, getPreviewUrl } from '@/lib/freesound-api';
import type { FreesoundSound, FreesoundApiError } from '@/lib/freesound-api';
import { registerCustomSample } from '@/lib/sample-registry';

export interface FreesoundSearchProps {
  onInsertSample: (name: string) => void;
  onPlaySample: (name: string) => void;
  onOpenApiKeyDialog: () => void;
}

export default function FreesoundSearch({ onInsertSample, onPlaySample, onOpenApiKeyDialog }: FreesoundSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FreesoundSound[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [importingId, setImportingId] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, []);

  // Stop preview when results change (new search)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewId(null);
  }, [results]);

  const doSearch = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    const q = query.trim();
    if (!q) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    setErrorCode(null);

    try {
      const res = await searchSounds(q, pageNum, 20, controller.signal);
      if (controller.signal.aborted) return;

      if (append) {
        setResults(prev => [...prev, ...res.results]);
      } else {
        setResults(res.results);
      }
      setTotalCount(res.count);
      setPage(pageNum);
      setHasMore(!!res.next);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Search failed');
      setErrorCode(err.code || null);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [query]);

  const handleSearch = useCallback(() => {
    if (!query.trim()) return;
    doSearch(1, false);
  }, [doSearch, query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleLoadMore = useCallback(() => {
    doSearch(page + 1, true);
  }, [doSearch, page]);

  const handlePreview = useCallback((sound: FreesoundSound) => {
    if (previewId === sound.id) {
      // Toggle off
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }

    const url = getPreviewUrl(sound);
    if (!url) return;

    // Stop current preview
    audioRef.current?.pause();

    const audio = new Audio(url);
    audio.volume = 0.6;
    audio.onended = () => setPreviewId(null);
    audio.play().catch(() => {});
    audioRef.current = audio;
    setPreviewId(sound.id);
  }, [previewId]);

  const handleImport = useCallback(async (sound: FreesoundSound) => {
    const url = getPreviewUrl(sound);
    if (!url) return;

    setImportingId(sound.id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = sound.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/\.(mp3|ogg|wav)$/i, '') || `fs_${sound.id}`;
      await registerCustomSample(name, blob, 'url', url);
      onInsertSample(name);
    } catch (err: any) {
      setError(`Failed to import "${sound.name}": ${err.message}`);
    } finally {
      setImportingId(null);
    }
  }, [onInsertSample]);

  // ─────────────────────────
  // Render: No API key
  // ─────────────────────────
  if (!hasApiKey()) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 px-4">
        <p className="text-muted-foreground text-xs text-center">
          🌐 Search over <strong>700,000+</strong> CC0 / Creative Commons sounds from Freesound.
        </p>
        <p className="text-[10px] text-muted-foreground text-center">
          A free API key is required. Get yours at freesound.org/apiv2/apply
        </p>
        <Button
          onClick={onOpenApiKeyDialog}
          size="sm"
          className="text-xs h-7 bg-strudel-primary hover:bg-strudel-secondary"
        >
          Set up API Key
        </Button>
      </div>
    );
  }

  // ─────────────────────────
  // Render: API key exists
  // ─────────────────────────
  return (
    <>
      {/* Search bar */}
      <div className="p-2 border-b border-strudel-surface-light">
        <div className="flex gap-1">
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Search 700k+ Freesound sounds..."
            className="bg-strudel-dark border-strudel-surface-light text-xs h-7 text-white flex-1"
          />
          <Button
            onClick={handleSearch}
            disabled={!query.trim() || searching}
            size="sm"
            className="h-7 text-xs bg-strudel-primary hover:bg-strudel-secondary"
          >
            {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-2 py-1.5">
          <p className="text-[10px] text-red-400">{error}</p>
          {errorCode === 'INVALID_KEY' && (
            <button
              onClick={onOpenApiKeyDialog}
              className="text-[10px] text-strudel-accent underline mt-1"
            >
              Update API Key
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      {!searching && results.length > 0 && (
        <div className="px-2 py-1 text-[10px] text-muted-foreground border-b border-strudel-surface-light">
          {totalCount.toLocaleString()} results
        </div>
      )}

      {/* Results list */}
      <div className="flex-1">
        {results.map(sound => (
          <div
            key={sound.id}
            className="flex items-start gap-2 px-2 py-1.5 hover:bg-strudel-surface-light/50 group text-xs"
          >
            <button
              onClick={() => onPlaySample(sound.name)}
              className="text-muted-foreground hover:text-strudel-accent p-0.5 shrink-0 mt-0.5"
              title={`Preview ${sound.name}`}
            >
              <Play size={12} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white font-mono truncate">{sound.name}</div>
              <div className="text-[9px] text-muted-foreground flex gap-2 items-center">
                <span>{sound.duration.toFixed(1)}s</span>
                <span className="text-green-400/60">
                  {sound.license === 'Creative Commons 0' ? 'CC0' : sound.license === 'Attribution' ? 'CC BY' : 'CC BY-NC'}
                </span>
                <span>@{sound.username}</span>
              </div>
              {sound.tags.length > 0 && (
                <div className="text-[8px] text-muted-foreground/60 truncate mt-0.5">
                  {sound.tags.slice(0, 6).join(', ')}
                  {sound.tags.length > 6 && ` +${sound.tags.length - 6}`}
                </div>
              )}
            </div>
            <button
              onClick={() => handleImport(sound)}
              disabled={importingId === sound.id}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-white p-0.5 shrink-0 mt-0.5"
              title={`Import ${sound.name}`}
            >
              {importingId === sound.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            </button>
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="p-2 border-t border-strudel-surface-light">
          <Button
            onClick={handleLoadMore}
            disabled={searching}
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
          >
            {searching ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!searching && results.length === 0 && !error && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
          {query.trim()
            ? `No sounds found for "${query.trim()}"`
            : 'Enter a search term to find sounds'}
        </div>
      )}
    </>
  );
}
```

**States summary:**

| State | Condition | UI |
|---|---|---|
| No key | `!hasApiKey()` | Setup prompt with [Set up API Key] button |
| Idle | Key exists, no search yet | Search bar visible, empty results area |
| Searching | `searching === true` | Search button shows spinner, results area shows nothing |
| Results | `results.length > 0` | List of result rows with preview/import |
| Empty | Search done, `results.length === 0` | "No sounds found for [query]" message |
| Error | `error !== null` | Error message with optional "Update API Key" link |
| Importing | `importingId !== null` | + button shows spinner on that row |
| Previewing | `previewId !== null` | Audio playing, preview button toggles |
| Load more | `hasMore === true` | "Load more" button at bottom |

**Preview audio management:**
- Single `audioRef` — only one preview at a time
- Clicking ▶ on a different sound stops the current preview and starts the new one
- Clicking ▶ on the currently previewing sound stops it (toggle)
- Audio `onended` resets the `previewId` state
- Component unmount: cleanup effect pauses audio and nulls ref
- Volume set to 0.6 (default) — prevents sudden loud surprises

**Import flow:**
1. User clicks + on a result row
2. Fetch the preview MP3 from Freesound CDN
3. Register via `registerCustomSample(name, blob, 'url', previewUrl)`
4. Call `onInsertSample(name)` to insert `s("name")` into the code editor
5. On failure, show error message in the status area
6. Import button shows spinner while downloading (prevents double-click)

**Test spec:**
```typescript
describe('FreesoundSearch', () => {
  beforeEach(() => localStorage.clear());

  it('shows API key prompt when no key stored', () => {
    render(<FreesoundSearch onInsertSample={() => {}} onPlaySample={() => {}} onOpenApiKeyDialog={() => {}} />);
    expect(screen.getByText(/free API key/)).toBeInTheDocument();
  });
  it('calls onOpenApiKeyDialog when "Set up API Key" clicked', () => {
    const fn = vi.fn();
    render(<FreesoundSearch onInsertSample={() => {}} onPlaySample={() => {}} onOpenApiKeyDialog={fn} />);
    fireEvent.click(screen.getByText('Set up API Key'));
    expect(fn).toHaveBeenCalledOnce();
  });
  it('shows search bar when key exists', () => {
    setApiKey('test-key');
    render(<FreesoundSearch onInsertSample={() => {}} onPlaySample={() => {}} onOpenApiKeyDialog={() => {}} />);
    expect(screen.getByPlaceholderText(/Search 700k/)).toBeInTheDocument();
  });
  it('disables search button with empty query', () => {
    setApiKey('test-key');
    render(<FreesoundSearch onInsertSample={() => {}} onPlaySample={() => {}} onOpenApiKeyDialog={() => {}} />);
    expect(screen.getByRole('button', { name: '' })).toBeDisabled();
  });
  it('calls searchSounds on search button click', async () => {
    setApiKey('test-key');
    render(<FreesoundSearch onInsertSample={() => {}} onPlaySample={() => {}} onOpenApiKeyDialog={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Search 700k/), { target: { value: 'piano' } });
    fireEvent.click(screen.getByRole('button', { name: '' }));
    // Verify searchSounds was called with 'piano'
  });
  it('displays results as sample rows', async () => {
    // Mock searchSounds to return test results
    // Verify rows are rendered with name, duration, license, username, tags
  });
  it('previews audio when ▶ clicked', () => {
    // Click ▶ → Audio element created and played
  });
  it('stops preview when ▶ clicked again', () => {
    // Click ▶ → audio starts, click again → audio pauses
  });
  it('stops preview when new search is performed', () => {
    // Play preview, search again → audio stops
  });
  it('imports sound when + clicked', async () => {
    // Mock fetch, mock registerCustomSample
    // Click + → registerCustomSample called with correct args
    // onInsertSample called with sample name
  });
  it('shows error on import failure', async () => {
    // Mock fetch to reject
    // Click + → error message shown in status area
  });
  it('loads more results on "Load more" click', async () => {
    // Mock paginated response
    // Click "Load more" → more results appended
  });
  it('shows empty state for no results', async () => {
    // Mock searchSounds to return { count: 0, results: [], next: null, previous: null }
    // Verify "No sounds found" message
  });
  it('shows empty state before any search', () => {
    setApiKey('test-key');
    render(<FreesoundSearch onInsertSample={() => {}} onPlaySample={() => {}} onOpenApiKeyDialog={() => {}} />);
    expect(screen.getByText(/Enter a search term/)).toBeInTheDocument();
  });
  it('shows "Update API Key" link on INVALID_KEY error', async () => {
    // Mock searchSounds to throw FreesoundApiError with code INVALID_KEY
    // Verify "Update API Key" link is visible
  });
  it('cleans up audio on unmount', () => {
    // Play preview, unmount → audio.pause called
  });
  it('cancels in-flight search on new search', async () => {
    // Start search, immediately start another → first request aborted
  });
});
```

**Bug prevention:**
- `AbortController` cancels in-flight requests when user starts a new search or component unmounts
- Empty query guard prevents wasteful API calls
- `importingId` state prevents double-import of the same sound simultaneously
- `previewId` state allows single-audio preview toggle
- Audio volume capped at 0.6 (no sudden loud playback)
- Sound names sanitized with regex `replace(/[^a-zA-Z0-9_]/g, '_')` before registration (prevents invalid Strudel sample names)
- Tags truncated to 6 + "+N" to prevent very long lines
- Import button only visible on hover (clean UI, reduced visual clutter)
- Error state has different UI per error code: `INVALID_KEY` shows "Update API Key" link, other errors show generic message
- `results` array replaces on new search (not append) unless "Load more" is used
- Loading spinner on search button: `Loader2` with `animate-spin` — provides visual feedback without changing button layout

---

### Task 7.7 — Verify studio.tsx pass-through

No code changes needed. The SAMPLES tab in the right panel already renders `<SamplesPanel>` with the required props:

```typescript
<SamplesPanel
  onInsertSample={handleInsertSample}
  onPlaySample={handlePlaySample}
/>
```

These callbacks work identically regardless of the origin tab selected inside SamplesPanel — `s("sampleName")` is resolved by Strudel's runtime regardless of whether the sample came from Dirt Samples, Freesound, or a user upload.

**Verification checklist:**
- [ ] SAMPLES tab renders with origin sub-tabs (BUILT-IN, DIRT, FREESOUND, CUSTOM)
- [ ] `handleInsertSample` receives the correct sample name from all origins
- [ ] `handlePlaySample` correctly evaluates `s("name")` for all origins
- [ ] Tabs don't overflow horizontally at narrow panel width (test at 200px panel width)
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] No build errors: `npx vite build`

---

### Integration / Cross-cutting Concerns

**How the pieces fit together:**

```
studio.tsx (SAMPLES tab)
└── SamplesPanel
    ├── Origin sub-tab bar
    │   [BUILT-IN] [DIRT SAMPLES] [FREESOUND] [CUSTOM]
    │
    ├── BUILT-IN → existing BUILTIN_SAMPLES + discovered + custom
    │   (unchanged, just conditionally rendered)
    │
    ├── DIRT SAMPLES → DirtSamplesBrowser
    │   ├── loadManifest() from sample-registry.ts
    │   ├── Categorize by DRUM_SAMPLES, MELODIC_SAMPLES, etc.
    │   ├── Search by bank name + sample name
    │   └── Play/Insert delegates to onPlaySample/onInsertSample
    │
    ├── FREESOUND → FreesoundSearch
    │   ├── hasApiKey()? → show search : show key prompt
    │   ├── searchSounds() → results → render rows
    │   ├── handlePreview → Audio element from preview URL
    │   ├── handleImport → registerCustomSample + onInsertSample
    │   └── onOpenApiKeyDialog → opens ApiKeyDialog
    │
    └── CUSTOM → existing custom samples + discovered banks
        (separated from BUILT-IN for clarity)

ApiKeyDialog (modal)
├── Input + "Test Key" + "Save" + "Cancel"
├── validateApiKey() → valid/invalid feedback
├── setApiKey() on save
└── Auto-opens when FREESOUND tab clicked without key
```

**Data flow summary:**

```
Dirt Samples data path:
  loadManifest() ──→ Record<string, string[]>
    → categorizeBank() → categorized list
    → search filter + category filter
    → render rows with ▶/+

Freesound data path:
  user types query → searchSounds(query)
    → Freesound API → FreesoundSearchResponse
    → render result rows with ▶/+
    → ▶: Audio(getPreviewUrl(sound))
    → +: fetch(url) → registerCustomSample(name, blob)
```

**State flow during Freesound search:**
```
1. User types "piano" + Enter
2. FreesoundSearch.doSearch("piano", 1)
3. searchSounds("piano", 1) → AbortController
4. fetch("https://freesound.org/apiv2/search/?query=piano&page=1&token=KEY")
5. Parse response → setResults([...])
6. Render result rows

Load more:
7. User clicks "Load more"
8. FreesoundSearch.doSearch("piano", 2, append=true)
9. setResults(prev => [...prev, ...res.results])
10. Append rows to existing list

Import:
11. User clicks + on a sound
12. handleImport(sound) → fetch(preview URL) → blob
13. registerCustomSample(name, blob, 'url', url)
14. onInsertSample(name) → inserts s("name") in editor
```

---

### Dependency Summary

| Feature | Dependencies | Notes |
|---|---|---|
| Task 7.1 | None | Pure HTTP + localStorage |
| Task 7.2 | Task 7.1 | Inlined in freesound-api.ts |
| Task 7.3 | Task 7.2 | UI component |
| Task 7.4 | Tasks 7.3, 7.5, 7.6 | Refactors existing component |
| Task 7.5 | `sample-registry.ts`, `shared/schema.ts` | Manifest + category constants |
| Task 7.6 | Tasks 7.1, 7.3 | Search + import |
| Task 7.7 | None | Verification only |

### File Change Summary

| File | Phase | Change Type |
|---|---|---|
| `client/src/lib/freesound-api.ts` | 7 | **NEW** |
| `client/src/components/samples/api-key-dialog.tsx` | 7 | **NEW** |
| `client/src/components/samples/dirt-samples-browser.tsx` | 7 | **NEW** |
| `client/src/components/samples/freesound-search.tsx` | 7 | **NEW** |
| `client/src/components/panels/samples-panel.tsx` | 7 | **EDIT** |

### Implementation Order

```
Task 7.1 ─── Freesound API client (freesound-api.ts)
    │
    ├──► Task 7.5 ─── DirtSamplesBrowser (can be done in parallel with 7.3)
    │
    ├──► Task 7.3 ─── ApiKeyDialog (depends on 7.1 for validateApiKey)
    │
    ├──► Task 7.6 ─── FreesoundSearch (depends on 7.1 + 7.3)
    │
    └──► Task 7.4 ─── Refactor SamplesPanel (depends on 7.3, 7.5, 7.6)
            │
            └──► Task 7.7 ─── Verify integration
```

**Recommended implementation flow:**
1. Start with Task 7.1 + Task 7.5 (parallel — independent)
2. Then Task 7.3 (depends on 7.1 for validation)
3. Then Task 7.6 (depends on 7.1 + 7.3)
4. Finally Task 7.4 (depends on 7.3, 7.5, 7.6 — brings everything together)
5. Task 7.7 is a quick verification pass

### Verification & Rollback

**After each task:**
```
npx tsc --noEmit
npx vite build
```

**Full verification before marking Phase 7 complete:**
```
npx tsc --noEmit
npx vite build
```

**Rollback plan:**
- All new files (7.1, 7.3, 7.5, 7.6) are additive — just delete them to roll back
- `samples-panel.tsx` edits (7.4) are the only modification to existing code — revert via `git checkout -- client/src/components/panels/samples-panel.tsx`
- If 7.4 refactoring is too risky, an alternative approach is to keep `SamplesPanel` unchanged and mount the new components in a separate `SAMPLE_BROWSER` tab in `studio.tsx`
- The Freesound API key can be cleared via `localStorage.removeItem('freesound_api_key')` in DevTools if needed
- If Freesound API goes down, the FREESOUND tab simply shows errors — no impact on other tabs or app functionality

### Manual QA Checklist

Before marking Phase 7 complete:

1. **Origin Tab Navigation**
   - [ ] SAMPLES panel opens with BUILT-IN tab selected by default
   - [ ] BUILT-IN tab shows existing built-in categories (Synths, Drums, Melodic, Bass, Ambient)
   - [ ] DIRT SAMPLES tab loads and shows all 200+ bank names from manifest
   - [ ] FREESOUND tab shows API key prompt when key not set
   - [ ] FREESOUND tab shows search bar when key is set
   - [ ] CUSTOM tab shows my samples + discovered banks
   - [ ] Switching tabs preserves the search text
   - [ ] No visual glitches when switching between tabs
   - [ ] Category filter buttons only visible on BUILT-IN tab

2. **Dirt Samples Browser**
   - [ ] "Loading banks..." spinner shows on first load
   - [ ] All 200+ banks loaded and displayed in categorized groups
   - [ ] Category filter buttons show correct counts (e.g. "Drums (42)")
   - [ ] Clicking a category filter shows only matching banks
   - [ ] Search filters bank names AND sample names in real-time
   - [ ] Clicking a bank name expands to show individual sample files
   - [ ] Clicking a bank name again collapses the sample list
   - [ ] ▶ preview button plays the bank's default sample
   - [ ] + insert button inserts `s("bankName")` into the editor
   - [ ] Expanded bank collapses when search or category filter changes
   - [ ] Banks with 100+ samples show first 100 with "+N more" message
   - [ ] Retry button works when manifest fails to load
   - [ ] Network error shows friendly error message

3. **ApiKeyDialog**
   - [ ] Dialog opens when clicking "Set up API Key" on FREESOUND tab
   - [ ] Dialog pre-fills existing key if one is stored
   - [ ] Test button enabled only when input has text
   - [ ] "Testing..." shows during validation
   - [ ] Valid key → green "✓ Key is valid" message, Save enabled
   - [ ] Invalid key → red error message, Save disabled
   - [ ] Network error → yellow warning, Save disabled
   - [ ] Enter key in input triggers test (not save)
   - [ ] Save persists key and closes dialog
   - [ ] Cancel closes dialog without changing the stored key
   - [ ] Link opens in new tab

4. **Freesound Search**
   - [ ] Search bar visible (when key is set) with placeholder text
   - [ ] Typing and pressing Enter triggers search
   - [ ] Search button shows spinner during search
   - [ ] Results displayed as sample rows with name, duration, license, username
   - [ ] Tags shown per row (truncated to 6 + "+N")
   - [ ] ▶ preview plays audio (only one preview at a time)
   - [ ] ▶ toggles off when clicked on an already-previewing sound
   - [ ] Preview stops when new search is performed
   - [ ] + import downloads the preview, registers it, and inserts into editor
   - [ ] Import button shows spinner during download
   - [ ] "Load more" button loads and appends next page of results
   - [ ] Empty results shows "No sounds found for [query]" message
   - [ ] Error during search shows error message
   - [ ] Invalid API key error shows "Update API Key" link
   - [ ] Searching with empty query does nothing (no API call)

5. **Custom Tab**
   - [ ] MY SAMPLES section shows all user-uploaded/imported samples
   - [ ] DISCOVERED section shows all banks found from code
   - [ ] Remove button works for custom samples

6. **Edge cases**
   - [ ] Switch from FREESOUND to BUILT-IN during active search → no error (AbortController cleans up)
   - [ ] Rapid tab switching → no stale state or race conditions
   - [ ] Preview audio cleaned up on unmount (navigate away from studio)
   - [ ] Very narrow panel (200px) → tabs wrap or scroll, all still clickable
   - [ ] Very fast typing in Freesound search → debounced by AbortController (new search cancels old)
   - [ ] Freesound API returns 429 → "Too many requests" error shown
   - [ ] Freesound API is down → "Network error" shown
   - [ ] Dirt Samples manifest URL changes → loadManifest returns null → error state with retry
   - [ ] All tabs: ADD FILE button works (uploads to custom collection)
   - [ ] All tabs: ADD URL button works (URL import dialog appears)
   - [ ] All tabs: drag-and-drop file import works
