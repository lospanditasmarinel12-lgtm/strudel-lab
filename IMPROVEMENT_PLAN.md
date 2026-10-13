# Strudel Lab — Improvement Plan

> **Status:** Phases 1–4 implemented. Phase 5 (architecture & quality) remains
> optional/outstanding. `npm run typecheck`, `npm run lint`, and `npm test`
> (355 tests) all pass.
>
> Delivered: unified superdough output-gain accessor (fixes silent recordings +
> master volume), `getLatency` output-latency, `createSilentWav` params, studio
> memo fix, single-source snapshot storage; coverage provider + CI coverage job,
> Prettier, `engines`/`.nvmrc`, tsconfig test exclusion, `check` script;
> `.gitignore` expansion, removed stray `console.log` + Tauri deps, cleaned
> preload logs, implemented `youtube:cancel`, added `LICENSE`, gated dev logs;
> README rewritten, planning docs annotated.

**Goal:** Fix correctness bugs, repair tooling/CI, clean up repository hygiene, and align documentation with the actual codebase.

This plan is derived from a full review of the repository. Phases are ordered by risk-reduction ROI: correctness first, then tooling that catches regressions, then hygiene, then docs.

> **Conventions used below**
> - Line numbers are current as of this review and will drift; use the surrounding code as the source of truth.
> - Each task has: **Files**, **Change**, **Why**, **Verify**.
> - Run `npm run typecheck && npm run lint` after every phase.

---

## Table of Contents

- [Phase 0 — Baseline Verification](#phase-0--baseline-verification)
- [Phase 1 — Correctness Bugs](#phase-1--correctness-bugs)
- [Phase 2 — Tooling & CI](#phase-2--tooling--ci)
- [Phase 3 — Repository Hygiene](#phase-3--repository-hygiene)
- [Phase 4 — Documentation](#phase-4--documentation)
- [Phase 5 — Architecture & Quality (Optional)](#phase-5--architecture--quality-optional)
- [Appendix A — Verification Matrix](#appendix-a--verification-matrix)

---

## Phase 0 — Baseline Verification

> Effort: ~15 min. Do this before touching anything so we know the starting state.

### Task 0.1 — Capture the current baseline

**Commands**

```bash
npm run typecheck
npm run lint
npm test
```

**Expected:** note any failures/warnings *before* changes so regressions are attributable.

**Success criteria:** a written/recorded list of current failures (if any). If `npm test` already fails, fix or quarantine those first.

---

## Phase 1 — Correctness Bugs

> Effort: ~0.5–1 day. These are real functional defects.

### Task 1.1 — Unify the superdough `destinationGain` path (recorder tap)

**Files:** `client/src/lib/recorder.ts`, `client/src/lib/strudel-engine.ts`, `client/src/test/mocks/strudel-web.ts`

**Problem:** The tap that routes audio into the `MediaStreamDestination` uses two different access paths:

- **Start** (`recorder.ts:100-104`):
  ```ts
  const controller = getSuperdoughAudioController();
  if (controller?.destinationGain) {
    controller.destinationGain.connect(this.streamDest);
  }
  ```
- **Stop** (`recorder.ts:143-152`):
  ```ts
  const controller = getSuperdoughAudioController();
  if (controller?.output?.destinationGain) {
    controller.output.destinationGain.disconnect(this.streamDest);
  }
  ```
- `strudel-engine.ts:73` uses `controller.destinationGain` (no `.output`).
- The test mock (`client/src/test/mocks/strudel-web.ts:11`) exposes `{ output: { destinationGain } }`.

**At least one of these is wrong.** If the real shape is `output.destinationGain`, the recorder never connects a tap (recordings are silent) and disconnects nothing. If the real shape is `destinationGain`, the disconnect in `stopRecording` is a no-op (node leak per recording).

**Change:**

1. Determine the real shape. Verify against the installed `@strudel/web` bundle:
   ```bash
   rg -n "destinationGain" node_modules/@strudel/web/dist/*.js | head
   ```
2. Introduce a single accessor in `strudel-engine.ts` and use it everywhere:
   ```ts
   // strudel-engine.ts
   type SuperdoughController = {
     destinationGain?: GainNode;
     output?: { destinationGain?: GainNode };
   };

   /** Returns superdough's output gain node regardless of bundle shape. */
   export function getSuperdoughDestination(): GainNode | null {
     try {
       // @ts-expect-error runtime export not in type declarations
       const controller = getSuperdoughAudioController?.() as SuperdoughController | undefined;
       return controller?.output?.destinationGain ?? controller?.destinationGain ?? null;
     } catch {
       return null;
     }
   }
   ```
3. Replace **all** controller accesses (both files) with `getSuperdoughDestination()`.
4. Update the mock in `client/src/test/mocks/strudel-web.ts` to match the real shape, and keep both shapes covered by a test (see Task 1.6).

**Why:** Prevents silent recordings and per-recording audio-node leaks.

**Verify:**
- `npm test` (recorder tests) passes.
- Manually: start recording, play a pattern, stop, then re-record — confirm the tap is re-established and no duplicate audio after repeated cycles.

---

### Task 1.2 — Fix `studio.tsx` live-timeline memo

**File:** `client/src/pages/studio.tsx` (`currentTracks` at line 79; `deriveTracks` at line 571)

**Problem:**
```ts
const currentTracks = useMemo(() => deriveTracks(code, recordingDuration), [code]);
```
- `recordingDuration` is read but missing from the dependency array (stale closure; `react-hooks/exhaustive-deps` warning).
- `deriveTracks` ignores its second argument and always returns `events: []`, so the timeline never shows events in the studio view.

**Change (minimal — deps only):**
```ts
const currentTracks = useMemo(() => deriveTracks(code), [code]);
```
and drop the unused parameter from the signature:
```ts
function deriveTracks(code: string): ParsedTrack[] { ... }
```

**Change (complete — if live events are desired):** feed real events from the recorder/timeline engine instead of `[]`. If live events are out of scope, keep the minimal fix and add a comment noting the timeline is populated on playback via `buildTracksFromSnapshots`.

**Why:** Removes a stale-closure bug and a misleading unused parameter.

**Verify:** `npm run lint` shows no `exhaustive-deps` warning for this line; timeline still renders.

---

### Task 1.3 — Fix `createSilentWav` to honor parameters

**File:** `client/src/lib/wav-encoder.ts:18-41`

**Problem:** `createSilentWav(numChannels, sampleRate)` hardcodes `numChannels = 1` and `sampleRate = 44100` in the header, ignoring its arguments.

**Change:** Use the arguments (and compute derived fields from them):
```ts
function createSilentWav(numChannels: number, sampleRate: number): Blob {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = 0;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, 0, true);
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
```

Also add a log to the `webmToWav` catch so silent fallbacks are visible:
```ts
} catch (err) {
  console.warn('[wav-encoder] decodeAudioData failed; returning silent WAV', err);
  return createSilentWav(2, 48000);
}
```
(Use a sensible default that matches the export path.)

**Why:** Correctness for multichannel/other sample rates; silence fallbacks become debuggable.

**Verify:** `client/src/lib/wav-encoder.test.ts` passes; add a case asserting header fields match the passed `numChannels`/`sampleRate`.

---

### Task 1.4 — Restore `getLatency()` output-latency calculation

**File:** `client/src/lib/strudel-engine.ts:150-156`

**Problem:** Current implementation returns only `baseLatency`. `TESTING_PLAN.md` documents the intended `baseLatency + outputLatency`.

**Change:**
```ts
export function getLatency(): number {
  try {
    const ctx = getStrudelAudioContext();
    if (!ctx) return 0;
    const output = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((ctx.baseLatency + output) * 1000) || 0;
  } catch {
    return 0;
  }
}
```

**Why:** Accurate latency reporting; matches documented behavior.

**Verify:** `client/src/lib/strudel-engine.test.ts` passes (or add a case with a mocked `outputLatency`).

---

### Task 1.5 — De-duplicate snapshot storage in `session-store`

**File:** `client/src/lib/stores/session-store.ts:54-62`

**Problem:** `createSession` writes snapshots to the `codeSnapshots` table, then also embeds a copy on the session record and `update()`s the session. Two sources of truth.

**Change:** Pick one strategy and be consistent:
- **Preferred:** keep snapshots only in the `codeSnapshots` table (already indexed by `sessionId`). Store `snapshots: []` on the session record and drop the `update()` call.
  ```ts
  const session: RecordingSession = {
    ...,
    snapshots: [], // canonical copy lives in the codeSnapshots table
    ...
  };
  await db.sessions.put(session);
  const snapshots: CodeSnapshot[] = data.snapshots.map(s => ({ ...s, sessionId: id }));
  await db.codeSnapshots.bulkPut(snapshots);
  return session;
  ```
- Ensure any readers (`playback.tsx`, `getSessionSnapshots`) use `getSessionSnapshots(id)`.

**Why:** Eliminates divergence and halves write cost for long sessions.

**Verify:** `client/src/lib/stores/session-store.test.ts` passes; playback still resolves snapshots.

---

### Task 1.6 — Add regression tests for the above

**Files:** `client/src/lib/recorder.test.ts`, `client/src/lib/strudel-engine.test.ts`, `client/src/lib/wav-encoder.test.ts`

**Change — add cases:**

| Test | Asserts |
|---|---|
| recorder tap connect/disconnect uses the same node | `getSuperdoughDestination()` returns the same object at start and stop; connect and disconnect target it |
| `getLatency()` includes outputLatency | With mock `outputLatency = 0.02`, returns `(0.01 + 0.02) * 1000` |
| `createSilentWav(2, 48000)` header | Bytes 22/24/28/32 encode 2ch @ 48000 Hz |

**Why:** Locks in the fixes so they don't regress.

**Verify:** `npm test` green.

---

## Phase 2 — Tooling & CI

> Effort: ~0.5 day.

### Task 2.1 — Fix CI coverage job

**File:** `.github/workflows/test.yml:34-50`, `package.json`

**Problem:** The `unit` job runs `npm test` (no coverage), then uploads `coverage/` which is never produced. Additionally `@vitest/coverage-v8` is not installed, so `npm run test:coverage` would fail.

**Change:**

1. Add the provider to devDependencies:
   ```bash
   npm install -D @vitest/coverage-v8
   ```
2. In `vitest.config.ts`, add a coverage block:
   ```ts
   test: {
     ...,
     coverage: {
       provider: 'v8',
       reporter: ['text', 'html', 'lcov'],
       reportsDirectory: './coverage',
       include: ['client/src/**/*.{ts,tsx}'],
       exclude: ['client/src/**/*.test.{ts,tsx}', 'client/src/test/**'],
     },
   }
   ```
3. Change the CI step to run coverage:
   ```yaml
   - run: npm run test:coverage
   ```

**Why:** The artifact step currently uploads nothing; coverage becomes meaningful.

**Verify:** `npm run test:coverage` creates `coverage/` locally and in CI.

---

### Task 2.2 — Add Prettier dependency and format script

**Files:** `package.json`, `.prettierrc`, optionally `.prettierignore`

**Problem:** `.prettierrc` exists but `prettier` is not installed and there is no `format` script, so formatting is unenforced and inconsistent (e.g. `studio.tsx` uses double quotes while `.prettierrc` specifies single quotes).

**Change:**

1. Install:
   ```bash
   npm install -D prettier
   ```
2. Add scripts:
   ```json
   "format": "prettier --write \"client/src/**/*.{ts,tsx,css}\" \"shared/**/*.ts\" \"electron/**/*.cjs\"",
   "format:check": "prettier --check \"client/src/**/*.{ts,tsx,css}\" \"shared/**/*.ts\""
   ```
3. Add `.prettierignore`:
   ```
   node_modules
   dist
   release
   coverage
   playwright-report
   test-results
   extraResources
   *.md
   ```
4. Run `npm run format` once (as a separate, clearly-communicated commit) — it will touch many files.

**Why:** Consistency and a checkable format gate.

**Verify:** `npm run format:check` passes after the format commit. Optionally add a `format:check` CI job.

---

### Task 2.3 — Add `engines` field and align Node versions

**File:** `package.json`, `.github/workflows/test.yml`

**Problem:** CI uses Node 20; dev machine Node 26; `@types/node` is `^26`, Electron 43. Risk of version-skew failures.

**Change:**

1. Add to `package.json`:
   ```json
   "engines": { "node": ">=20.19.0" }
   ```
2. Add `.nvmrc` with the chosen version (e.g. `20` or `22`).
3. Align either by bumping CI Node or pinning `@types/node` to the supported line.
   - If CI stays on Node 20, set `@types/node` to `^20` to avoid type/runtime drift.
   - If upgrading, update `.github/workflows/*` `node-version` accordingly.

**Why:** Reproducible builds; avoids "works on my machine".

**Verify:** `npm ci` on the CI Node version installs and typechecks.

---

### Task 2.4 — Make tsconfig test exclusion consistent

**File:** `tsconfig.json:3`

**Problem:** `"exclude": ["node_modules", "dist", "**/*.test.ts"]` excludes `.test.ts` but not `.test.tsx`, so `.tsx` tests are type-checked while `.ts` tests are not.

**Change:**
```json
"exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
```

**Why:** Consistent handling. (If the intent is to type-check tests, instead create a `tsconfig.test.json` and include both — but pick one deliberately.)

**Verify:** `npm run typecheck` behaves the same as before for source; tests no longer produce type errors from tsconfig.

---

### Task 2.5 — Add a `check` script

**File:** `package.json`

**Problem:** `STRUDEL_FEATURES_PLAN.md` references a `check` script that does not exist.

**Change:**
```json
"check": "npm run typecheck && npm run lint && npm test"
```

**Why:** One command for local pre-commit / future CI.

**Verify:** `npm run check` runs all three.

---

## Phase 3 — Repository Hygiene

> Effort: ~0.5 day. Low risk, high tidiness.

### Task 3.1 — Remove the stray root `console.log`

**File:** `console.log` (2,207 lines of captured runtime logs at repo root)

**Change:**
- Delete the file.
- Add to `.gitignore`: `*.log` and `console.log`.

**Verify:** file gone; `git status` clean (once the repo is initialized).

---

### Task 3.2 — Expand `.gitignore`

**File:** `.gitignore`

**Problem:** Build artifacts are not ignored: `release/` (895 MB observed), `playwright-report/`, `test-results/`, `coverage/`, `attached_assets/`, and `extraResources/yt-dlp` (3 MB binary).

**Change — full recommended `.gitignore`:**
```
node_modules
dist
coverage
release
playwright-report
test-results
attached_assets
*.log
.DS_Store
server/public
vite.config.ts.*
*.tar.gz

# Downloaded binary (fetched by scripts/download-yt-dlp.mjs)
extraResources/yt-dlp
extraResources/yt-dlp.exe
```
> Decide deliberately whether `extraResources/yt-dlp` should be committed. If releases depend on a pre-vendored binary, keep it but document it. Otherwise ignore and rely on the download script. `electron:build*` already runs `scripts/download-yt-dlp.mjs`.

**Verify:** after `git init` + commit, `release/` and logs are untracked.

---

### Task 3.3 — Remove dead Tauri dependencies and config

**Files:** `package.json:60-63`, `vite.config.ts:29-31`

**Problem:** `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-shell` are declared but the app is Electron-only. `vite.config.ts` ignores `**/src-tauri/**`.

**Change:**
```bash
npm uninstall @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-shell
```
Remove the `watch.ignored: ["**/src-tauri/**"]` block from `vite.config.ts`.

**Why:** Smaller install, clearer intent.

**Verify:** `npm run build` and `npm run typecheck` succeed; `rg -i tauri` returns nothing.

---

### Task 3.4 — Remove debug logging from `preload.cjs`

**File:** `electron/preload.cjs:2-4,16`

**Problem:** Debug `console.log` statements from troubleshooting remain in the shipped preload script.

**Change:** Remove lines 2–4 and 16, keeping the `try/catch` and the failure log:
```js
const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    downloadYoutube: (url, options) => ipcRenderer.invoke('youtube:download', url, options),
    getDownloadProgress: (callback) => {
      const handler = (_event, progress) => callback(progress);
      ipcRenderer.on('youtube:progress', handler);
      return () => ipcRenderer.removeListener('youtube:progress', handler);
    },
    cancelDownload: () => ipcRenderer.invoke('youtube:cancel'),
  });
} catch (err) {
  console.error('[preload] contextBridge.exposeInMainWorld FAILED:', err.message);
}
```

**Verify:** YouTube import still works in the Electron build (manual smoke test).

---

### Task 3.5 — Implement or remove `youtube:cancel`

**File:** `electron/main.cjs:117-121`

**Problem:** `youtube:cancel` is a placeholder no-op, but the preload and UI expose it.

**Change (implement):** track the active child process and kill it:
```js
let activeDownload = null;

ipcMain.handle('youtube:download', async (event, url, options) => {
  // ...inside Promise:
  activeDownload = proc;
  proc.on('close', (code) => { activeDownload = null; /* existing logic */ });
});

ipcMain.handle('youtube:cancel', async () => {
  if (activeDownload) {
    activeDownload.kill('SIGTERM');
    activeDownload = null;
    return true;
  }
  return false;
});
```
**Alternative:** remove the IPC channel and the preload/renderer references if cancel is not needed yet.

**Why:** Avoids a misleading dead API.

**Verify:** start a long download and cancel it; process terminates.

---

### Task 3.6 — Add a LICENSE file

**File:** `LICENSE` (missing)

**Problem:** `package.json` declares `AGPL-3.0` and the README says "See LICENSE file", but no LICENSE exists.

**Change:** Add the full AGPL-3.0 text (or change `package.json` license to match whatever you intend).

**Verify:** LICENSE file present and consistent with `package.json`.

---

### Task 3.7 — Reduce production console noise

**Files:** `client/src/lib/sample-registry.ts`, `client/src/lib/stores/db.ts`, `client/src/lib/strudel-engine.ts`, others

**Problem:** Module-level `console.log`/`console.warn` remain in shipped code (`no-console` is off).

**Change:** Route diagnostic logs through a tiny gated logger, e.g.:
```ts
// client/src/lib/logger.ts
export const debugLog = import.meta.env.DEV
  ? (...args: unknown[]) => console.log(...args)
  : () => {};
```
Replace non-critical `console.log` calls with `debugLog`. Keep genuine `console.warn`/`console.error` for failures.

**Why:** Clean console in production without losing dev diagnostics.

**Verify:** Production build console is quiet during normal use.

---

## Phase 4 — Documentation

> Effort: ~0.5 day.

### Task 4.1 — Rewrite README to match reality

**File:** `README.md`

**Problem:** The README claims a backend that does not exist:
- "**Express.js** REST API", "**WebSocket** real-time communication", "**PostgreSQL** with Drizzle ORM", "**OpenAI GPT-4o** for AI features".
None of these are in the codebase. The app is a client-only Electron/React app with IndexedDB (Dexie) persistence and local Strudel/Web Audio.

**Change:** Rewrite the "Technical Architecture" and feature sections to reflect:
- React 18 + TypeScript + Vite
- Electron shell (`electron/main.cjs`, `electron/preload.cjs`)
- Monaco editor
- Web Audio / Strudel (`@strudel/web`, `@strudel/soundfonts`)
- Persistence: IndexedDB via Dexie (`client/src/lib/stores/db.ts`)
- AI/remote features actually present (e.g. Freesound search if shipped)
Remove or clearly mark "(not implemented)" any aspirational claims.

**Why:** Contributor trust and accurate onboarding.

**Verify:** Every architecture claim maps to a file/feature that exists.

---

### Task 4.2 — Reconcile planning docs with current code

**Files:** `STRUDEL_FEATURES_PLAN.md`, `TESTING_PLAN.md`

**Problem:** Doc drift. Example: `STRUDEL_FEATURES_PLAN.md:57` references `recorder.ts:213-216`, but the real `getElapsedMs` is at `recorder.ts:268-271`. Many described tasks are already done.

**Change:**
- Either move completed content to a `docs/archive/` or mark sections **DONE**.
- Update line references or, preferably, remove brittle line numbers and reference function names.
- Add a "Last verified against" date + commit at the top.

**Why:** Prevents wasted work chasing already-completed tasks.

**Verify:** No stale `file:line` references to code that has moved.

---

### Task 4.3 — Document environment/tooling prerequisites

**File:** `README.md` (or `CONTRIBUTING.md`)

**Change:** Add a short "Development" section covering:
- Node version (from `engines`/`.nvmrc`)
- `npm ci`
- `npm run dev` (web) vs `npm run electron:dev` (desktop)
- Test/typecheck/lint/format commands
- Note that YouTube import requires the Electron build and a vendored/downloaded `yt-dlp`.

**Verify:** A new contributor can go from clone → running app using only the README.

---

## Phase 5 — Architecture & Quality (Optional)

> Effort: larger, incremental. Tackle only if desired.

### Task 5.1 — Centralize duplicated helpers

**Files:** `client/src/pages/studio.tsx`, `client/src/pages/playback.tsx`, `shared/schema.ts`

**Problem:** `formatDuration`/`formatTime` are duplicated, and track colors are defined in both `studio.tsx` (`getTrackColor`) and `shared/schema.ts` (`TRACK_CATEGORIES`).

**Change:** Move `formatDuration` into `client/src/lib/utils.ts` and have `getTrackColor` read from `TRACK_CATEGORIES`.

**Verify:** Single definition; imports updated; `typecheck` + tests green.

---

### Task 5.2 — Consolidate timeline systems

**Files:** `client/src/lib/timeline-engine.ts`, `client/src/hooks/use-code-session-player.ts`, `client/src/pages/playback.tsx`

**Problem:** `TimelineEngine` and `useCodeSessionPlayer` both drive playback state; `playback.tsx` uses both, risking divergence.

**Change:** Choose one as the source of truth for code-mode playback and have the other delegate. Document the chosen model.

**Verify:** Playback seek/play/pause/loop all consistent across code and audio modes.

---

### Task 5.3 — Code-split heavy UI

**Files:** `client/src/pages/studio.tsx`, `client/src/App.tsx`

**Problem:** `dist/` is ~13 MB; Monaco and all panels load eagerly.

**Change:** `React.lazy` + `Suspense` for Monaco editor, visualizers, and secondary panels.

**Verify:** Initial JS bundle shrinks; app still functions with a fallback UI.

---

### Task 5.4 — Secure the Freesound API key

**Files:** `client/src/lib/freesound-api.ts:1-49`, `client/src/components/samples/api-key-dialog.tsx`

**Problem:** API key stored in plaintext `localStorage` (`STORAGE_KEY = 'freesound_api_key'`).

**Change:** For the Electron build, store via a secure mechanism (e.g. OS keychain through an IPC handler). For web, document the limitation. At minimum, avoid ever logging the key.

**Verify:** Key no longer in `localStorage` in the desktop build; Freesound search still works.

---

### Task 5.5 — Audit silent catch blocks

**Files:** `client/src/lib/sample-registry.ts`, `client/src/lib/strudel-engine.ts`, `client/src/lib/recorder.ts`, others

**Problem:** Many `catch {}` blocks swallow errors, making failures invisible.

**Change:** At minimum log via `debugLog`/`console.warn` in catches; add actionable context. Keep intentional best-effort catches but annotate them.

**Verify:** No empty catch blocks remain without a comment or log.

---

## Appendix A — Verification Matrix

| Phase | Command(s) | Success criterion |
|---|---|---|
| 1 | `npm run typecheck`, `npm test` | Recorder/latency/wav tests pass; no silent-tap regression |
| 2 | `npm run test:coverage`, `npm run format:check`, `npm ci` on CI Node | CI uploads real coverage; format check passes |
| 3 | `npm run build`, `rg -i tauri` | No Tauri refs; no stray logs/artifacts tracked |
| 4 | manual doc read-through | README claims all map to real code |
| 5 | `npm run build`, `npm test` | Bundle smaller; tests green |

---

## Suggested Commit Sequence

1. `fix(recorder): unify superdough destination gain path + tests`
2. `fix(wav-encoder): honor channel/rate params; log decode fallback`
3. `fix(strudel-engine): include outputLatency in getLatency`
4. `fix(studio): correct currentTracks memo deps`
5. `refactor(session-store): single source of truth for snapshots`
6. `ci: run coverage, add provider, fix artifact`
7. `chore: add prettier + format scripts; format codebase`
8. `chore: add engines/.nvmrc; align node versions`
9. `chore: remove tauri deps; clean preload logs; implement youtube:cancel`
10. `chore: expand .gitignore; remove stray console.log`
11. `docs: rewrite README to match implementation; reconcile plans`
12. *(optional)* `refactor: centralize helpers; code-split; secure api key`

---

*Generated from a full repository review. Update the "last verified" note after each phase lands.*
