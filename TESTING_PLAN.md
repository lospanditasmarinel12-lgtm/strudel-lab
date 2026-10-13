# Strudel Lab Testing Plan

> **Status: historical planning doc.** The vitest infrastructure described here
> is now in place (`vitest.config.ts`, `client/src/test/**`, 29 test files).
> `file.ts:NN` references may be stale — use function/component names as the
> source of truth. See `IMPROVEMENT_PLAN.md` for current work.

## Overview

Phased implementation of vitest unit tests across the codebase. Each phase:
1. Write tests for a module
2. Run them — some will fail, revealing bugs
3. Fix the discovered bugs
4. Verify all tests pass
5. Move to next phase

The phases are ordered by bug-finding ROI (recorder and session-exporter are the most bug-prone modules from recent history).

---

## Phase 0 — Test Infrastructure

### Goal
Install vitest, configure it to match the Vite/TypeScript setup, create shared mocks.

### Steps

1. **Install dependencies**

   ```bash
   cd /home/alejanky/Downloads/StrudelLive-main
   npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/node
   ```

2. **Create `vitest.config.ts`** at project root:

   ```ts
   import { defineConfig } from 'vitest/config';
   import path from 'path';

   export default defineConfig({
     test: {
       environment: 'jsdom',
       globals: true,
       setupFiles: ['./client/src/test/setup.ts'],
       include: ['client/src/**/*.test.{ts,tsx}'],
     },
     resolve: {
       alias: {
         '@': path.resolve(__dirname, './client/src'),
         '@shared': path.resolve(__dirname, './shared'),
       },
     },
   });
   ```

3. **Create `client/src/test/setup.ts`**:

   ```ts
   import '@testing-library/jest-dom/vitest';
   ```

4. **Create `client/src/test/mocks/audio.ts`** — shared fake AudioContext:

   ```ts
   export class FakeAudioContext {
     state = 'running';
     sampleRate = 48000;
     baseLatency = 0.01;
     destination = new FakeAudioNode();
     private nodes: FakeAudioNode[] = [];

     createGain(): FakeAudioNode {
       const node = new FakeAudioNode();
       this.nodes.push(node);
       return node;
     }

     createMediaStreamDestination(): FakeMediaStreamDestination {
       return new FakeMediaStreamDestination();
     }

     resume(): Promise<void> { return Promise.resolve(); }
     close(): Promise<void> { return Promise.resolve(); }
   }

   export class FakeAudioNode {
     gain = { value: 1 };
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
   }
   ```

5. **Create `client/src/test/mocks/strudel-web.ts`** — shared mock for `@strudel/web`:

   ```ts
   import { vi } from 'vitest';
   import { FakeAudioNode } from './audio';

   export const mockDestinationGain = new FakeAudioNode();
   mockDestinationGain.gain.value = 1;

   export const mockStrudel = {
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
   ```

6. **Add test script to `package.json`**:

   ```json
   "scripts": {
     "test": "vitest run",
     "test:watch": "vitest"
   }
   ```

7. **Verify it works**: create a trivial `client/src/lib/utils.test.ts` and run `npm test`.

### Success Criteria
- `npm test` runs without crashing (even if 0 tests pass — just the framework is alive).

---

## Phase 1 — Recorder Tests (`client/src/lib/recorder.ts`)

### Goal
Catch bugs in the recording state machine: EntityTracker snapshot deduplication, duration calculation, commit-on-stop behavior, edge cases around entity lifecycle.

### Test file
`client/src/lib/recorder.test.ts`

### What to test

| Test scenario | What it catches |
|---|---|
| `getElapsedMs()` returns 0 before recording starts | Regression of the `startTime === 0` guard |
| `getElapsedMs()` returns non-zero after recording starts | Basic sanity |
| `getElapsedMs()` returns non-zero after `stopRecording()` | **THE BUG**: `recording = false` moved after `getElapsedMs()` |
| `startRecording` creates EntityTracker entries for each entity | Entity tracking initialization |
| Each EntityTracker has `lastSnapshottedCode` set | **THE BUG**: missing `lastSnapshottedCode` field on init |
| `handleCodeChange` with unchanged code produces 0 new snapshots | Snapshot deduplication |
| `handleCodeChange` with changed code produces 1 snapshot after inactivity timer | Normal operation |
| `handleCodeChange` then same code again produces no duplicate | **THE BUG**: `commitAllEntities` comparing against full code |
| `stopRecording` calls `commitAllEntities` — pending changes are flushed | Commit-on-stop |
| `handleCodeChange` with 3 rapid changes within debounce window creates only 1 snapshot | Debounce coalescing |
| Entity removed from code and re-added is tracked correctly | Entity lifecycle |
| `pauseRecording` + `resumeRecording` cycle doesn't create extra snapshots | Pause/resume |
| `handleAction('evaluate')` records an action snapshot | Action recording |
| `startRecording` with empty string `''` doesn't crash | Edge case: empty code |
| `startRecording` with code containing 10+ entities is performant | Stress test |
| `stopRecording` returns valid `{ audioBlob, duration }` shape | Output contract |
| Two consecutive `stopRecording` calls without start in between are safe | Idempotency |
| `reset()` clears all state | Cleanup |

### Mocks needed

- `@strudel/web` → use shared mock from Phase 0
- `getStrudelAudioContext` → return `FakeAudioContext` from `audio.ts`
- `MediaRecorder` → vitest + jsdom provides a stub, but you may need:
  ```ts
  vi.stubGlobal('MediaRecorder', vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    state: 'inactive',
  })));
  ```

### Run
```bash
npx vitest run client/src/lib/recorder.test.ts
```

### Expected discoveries
- **Duration always 0**: `getElapsedMs()` will return 0 after `stopRecording` because `this.recording = false` is checked before the math. **Fix already applied**, but this test prevents regression.
- **Duplicate snapshots**: Entity code vs full-code comparison in `commitAllEntities` creates duplicate snapshots. **Fix already applied** (`lastSnapshottedCode`).
- **Entity tracker missing `lastSnapshottedCode`**: New entities added via `handleCodeChange` won't have the field, so their next commit creates a duplicate. **Fix already applied**.
- **Possible remaining**: The inactivity timer snapshot may still compare against wrong snapshot if `lastSnapshottedCode` isn't updated in the timeout callback. Verify the test catches this.

### Success Criteria
All recorder tests pass with the current fixed code.

---

## Phase 2 — Session Exporter + Timeline Parser Tests

### Goal
Catch null-safety bugs in `session-exporter` and parsing bugs in `timeline-parser`.

### Test files
- `client/src/lib/session-exporter.test.ts`
- `client/src/lib/timeline-parser.test.ts`

### 2a. Session Exporter Tests

| Test scenario | What it catches |
|---|---|
| `isCodeSession({ audioBlob: new Blob(['data']) })` returns `false` | Session with audio → false |
| `isCodeSession({ audioBlob: new Blob([]) })` returns `true` | Empty blob = code-only session |
| `isCodeSession({ audioBlob: null })` returns `true` | **THE BUG**: null crash on `.size` |
| `isCodeSession({})` on malformed object doesn't crash | Defensive |
| `exportSessionAsJson` produces valid JSON with all fields | Export format |
| `importSessionFromFile` parses a valid JSON file correctly | Import format |
| `importSessionFromFile` with missing fields rejects with descriptive error | Validation |

### 2b. Timeline Parser Tests

| Test scenario | What it catches |
|---|---|
| `parseEntities("a\n\nb")` returns 2 entities | Multi-block parsing |
| `parseEntities("")` returns empty array | Empty input |
| `parseEntities("// comment\n\ncode")` ignores comment-only blocks | Comment handling |
| Entity ids are deterministic for same code | ID stability |
| `detectInstruments("note('bd sd').s('hh')")` finds `bd`, `sd`, `hh` | Sample detection |
| `detectInstruments("")` returns `[]` | Empty input |
| `detectInstruments("// nothing")` returns `[]` | Comment-only |
| `buildTracksFromSnapshots(snapshots)` produces correct event structure | Track building |
| `buildTracksFromSnapshots([])` returns `[]` | Empty snapshots |
| `buildTracksFromSnapshots` merges overlapping events from same entity | Event merging |
| `parseCodeAtTimestamp(snapshots, t)` returns the right code for a given timestamp | Time-based code reconstruction |

### Mock needs
None — pure functions, no browser APIs needed for `timeline-parser.ts`.
For `session-exporter`, mock `document.createElement('a')` and `URL.createObjectURL`.

---

## Phase 3 — Timeline Engine Tests

### Goal
Catch bugs in the timeline state machine: event CRUD, mode transitions, edge cases.

### Test file
`client/src/lib/timeline-engine.test.ts`

### What to test

| Test scenario | What it catches |
|---|---|
| `new TimelineEngine({ bpm: 120 })` initializes with correct defaults | Constructor |
| `addTrack({ id: 't1', ... })` adds a track and it appears in `getTracks()` | Track CRUD |
| `removeTrack('t1')` removes track and its events | Track cleanup |
| `addEvent(trackId, event)` adds event to correct track | Event CRUD |
| `removeEvent(eventId)` removes event | Event deletion |
| `moveEvent(eventId, 500)` changes event start time | Event move |
| `resizeEvent(eventId, 2000)` extends event end | Event resize |
| Moving event past track duration clamps or throws | Boundary |
| Setting `mode = 'recording'` disables certain mutations | Mode guard |
| Setting `mode = 'playing'` allows seek via `currentTime` | Playback mode |
| Setting `bpm = 140` updates all timing | BPM change |
| `clear()` removes all tracks and events | Reset |
| `addEvent` to non-existent track returns error | Error handling |
| `currentTime` getter/setter works correctly | Time tracking |
| `duration` setter clamps to 0 minimum | Input validation |

### Mock needs
None — pure logic, no browser APIs.

---

## Phase 4 — Strudel Engine + useStrudel Tests

### Goal
Catch bugs in the audio engine initialization, master gain routing, error propagation, and the hook layer.

### Test files
- `client/src/lib/strudel-engine.test.ts`
- `client/src/hooks/use-strudel.test.ts`

### 4a. Strudel Engine Tests

| Test scenario | What it catches |
|---|---|
| `initStrudelEngine()` creates `_masterGainNode` | Master gain initialization |
| Master gain is connected to `ctx.destination` | Signal path: master → destination |
| Superdough `destinationGain` is disconnected from `ctx.destination` | **THE BUG**: master gain not in path |
| Superdough `destinationGain` is connected to `_masterGainNode` | Correct routing: superdough → master |
| `setMasterVolume(0.5)` sets `gain.value` to `0.5` | Volume control |
| `setMasterVolume(-1)` clamps to `0` | Clamp lower |
| `setMasterVolume(2)` clamps to `1` | Clamp upper |
| `setMasterVolume(1)` before master gain exists is safe | Defensive |
| `evaluateStrudelCode("bad code")` rejects with original error | **THE BUG**: error swallowed |
| `stopStrudel()` calls `hush()` | Stop works |
| `getStrudelAudioContext()` returns null before init | Safe uninit state |
| `getLatency()` returns correct value | Latency calc |
| `initStrudelEngine()` called twice doesn't re-init | Idempotency |

### 4b. useStrudel Hook Tests

| Test scenario | What it catches |
|---|---|
| `evaluate("code")` resolves when strudel evaluate resolves | Happy path |
| `evaluate("bad")` rejects when strudel evaluate rejects | **THE BUG**: error swallowed |
| `stop()` doesn't throw before init | Defensive |
| `latency` updates on interval | Polling |
| `initError` is set when init fails | Error state |

### Mocks needed

- `@strudel/web` → shared mock (mockDestinationGain must be the same object returned by `getSuperdoughAudioController`)
- `getStrudelAudioContext` returns FakeAudioContext
- For hooks: wrap the component in a test harness with `renderHook` from `@testing-library/react`

### Key mock detail for master gain routing test

```ts
// This is the critical test that would have caught the bug:
test('master gain is in the signal path', async () => {
  const ctx = new FakeAudioContext();
  vi.mocked(getStrudelAudioContext).mockReturnValue(ctx as any);

  await initStrudelEngine();

  // destinationGain should be disconnected from ctx.destination
  expect(mockDestinationGain.connections).not.toContain(ctx.destination);

  // destinationGain should be connected to master gain
  const masterGain = ctx.nodes.find(n => n.gain.value === 1);
  expect(mockDestinationGain.connections).toContain(masterGain);

  // master gain should be connected to ctx.destination
  expect(masterGain!.connections).toContain(ctx.destination);
});
```

---

## Phase 5 — React Component Tests

### Goal
Catch reactivity bugs: `MonacoEditor` readOnly not updating, `MicPanel` resource leaks, `SessionPanel` recording indicator, `TopBar` button state.

### Test files
- `client/src/components/editor/monaco-editor.test.tsx`
- `client/src/components/panels/mic-panel.test.tsx`
- `client/src/components/panels/session-panel.test.tsx`
- `client/src/components/layout/top-bar.test.tsx`

### 5a. MonacoEditor Tests

| Test scenario | What it catches |
|---|---|
| Renders with initial code | Basic render |
| `readOnly={false}` allows editing | ReadOnly false |
| `readOnly={true}` sets editor to read-only | **THE BUG**: readOnly prop not propagated |
| Toggling `readOnly` from true→false updates editor | **THE BUG**: no reactivity |
| `onChange` fires when code changes | Change callback |
| `onEvaluate` fires on Ctrl+Enter | Evaluate shortcut |
| `insertAtCursor` inserts text at cursor position | Ref API |
| `getCode` returns current editor content | Ref API |
| VisualFeedbackManager is rendered | Integration |

### 5b. MicPanel Tests

| Test scenario | What it catches |
|---|---|
| Shows START MIC button initially | Initial state |
| Shows STOP MIC button after clicking | Toggle state |
| `globalMicCapture.stop()` is called on unmount | **THE BUG**: stream leak |
| Error message is displayed when mic fails | Error display |
| Freeze button is disabled when not recording | Freeze guard |

### 5c. Misc Component Tests

| Component | Key scenarios |
|---|---|
| `TopBar` | Recording button shows/hides correctly, evaluate button removed |
| `SessionPanel` | Recording indicator pulsing dot + elapsed time display |
| `SamplesPanel` | Add and Remove buttons shown simultaneously (`!eitherOr`) |

### Mocks needed
- `monaco-editor`: Heavy to mock — use `vi.mock('monaco-editor', () => ({ ... }))` or integration-test the actual Monaco (slow). For unit tests, mock the `create`/`dispose` surface.
- `@strudel/web`: shared mock
- `globalMicCapture`: mock with `vi.fn()` stubs

---

## Phase 6 — Store Integration Tests (Optional Advanced)

### Goal
Catch persistence bugs in Dexie-backed stores using `fake-indexeddb`.

### Test files
- `client/src/lib/stores/project-store.test.ts`
- `client/src/lib/stores/session-store.test.ts`

### What to test

| Store | Test scenario | What it catches |
|---|---|---|
| project-store | Create project, read it back | CRUD |
| project-store | Update project code | Update |
| project-store | Delete project cascades to sessions? | Delete |
| project-store | `getAllProjects()` returns sorted by `updatedAt` desc | **THE BUG**: sort order for auto-select |
| project-store | `getAllProjects()` on empty DB returns `[]` | Empty state |
| session-store | Create session with snapshots | CRUD |
| session-store | `saveSession(id, snapshots)` persists snapshots to DB | **THE BUG**: snapshots not persisted |
| session-store | Load session, snapshots are included | Read-back |
| session-store | Delete session removes snapshots | Cascade delete |
| session-store | `getSessionSnapshots(id)` returns correct snapshots for session id | Query |

### Mocks needed
- `fake-indexeddb` npm package
- Import `'fake-indexeddb/auto'` in test setup to shim `indexedDB` globally before Dexie loads

---

## Expected Bug Yield by Phase

| Phase | Module | Likely finds | Priority |
|---|---|---|---|
| 1 | recorder.ts | 3-5 entity tracking edge cases | Critical |
| 2a | session-exporter.ts | 1-2 null-safety issues | High |
| 2b | timeline-parser.ts | 2-3 parsing edge cases | Medium |
| 3 | timeline-engine.ts | 2-3 boundary bugs | Medium |
| 4a | strudel-engine.ts | Master gain routing regression | High |
| 4b | use-strudel.ts | Error propagation regression | High |
| 5 | Components | 3-5 reactivity/render bugs | Medium |
| 6 | Stores | 2-3 persistence bugs | High |

---

## Running Tests

```bash
# All tests
npm test

# Single phase
npx vitest run client/src/lib/recorder.test.ts

# Watch mode (re-runs on file change)
npx vitest client/src/lib/recorder.test.ts

# Coverage
npx vitest run --coverage
```

---

## CI Integration (future)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
```
