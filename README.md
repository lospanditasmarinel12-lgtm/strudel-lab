# Strudel Lab

A desktop + web environment for live-coding algorithmic music with the [Strudel](https://strudel.cc) pattern language. Built for live performance, experimentation, and recording/replaying sessions.

> Based on the [StrudelLive](https://github.com/IAmSpring/StrudelLive) project by [IAmSpring](https://github.com/IAmSpring). See [Credits](#credits).

![Live Coding Interface](https://img.shields.io/badge/Live%20Coding-Strudel-00D4AA)
![Electron](https://img.shields.io/badge/Desktop-Electron-06B6D4)
![Tests](https://img.shields.io/badge/tests-vitest-8B5CF6)

## What is it?

Strudel is a pattern language for live coding music. This studio wraps it in a
full-featured workspace: a Monaco editor, a sample browser, a timeline, session
recording/replay, and export/import of songs and live sets.

Everything runs locally. There is **no backend server**: audio is produced with
the Web Audio API via `@strudel/web`, and all projects, recordings, and settings
are persisted in the browser's IndexedDB (Dexie).

## Features

### Live coding engine
- Real-time evaluation with `Ctrl+Enter`; edit patterns while they play.
- **Live mode**: auto-evaluate after you stop typing (syntax-checked).
- Balanced-syntax check before evaluation.
- Balanced master-gain routing so the volume control affects the whole output.

### Recording & replay
- Record a session to a WAV file (via a `MediaStreamDestination` tap on the Strudel output).
- Snapshot every code change, with a line-diff patch chain + periodic keyframes to keep storage small.
- Replay a session by re-enacting the exact code edits over time (code mode) or by playing the recorded audio.
- Export/import **Songs** (single runnable `.strudel` script) and **Live Sets** (`.strudel.live.json` timeline, including bundled custom samples).

### Samples
- Built-in banks plus the Dirt Samples manifest (GitHub) with on-demand bank discovery.
- Custom sample upload (drag-and-drop) persisted to IndexedDB and rehydrated on startup.
- Freesound search (requires your own API key, stored locally).
- YouTube audio import in the desktop build (via a bundled `yt-dlp`).

### Interface
- Monaco editor with Strudel snippets/completions.
- Visual feedback: waveform display, pattern visualizer, step grid, code blocks.
- Timeline with track controls and scrubbable playhead.
- Panels: Samples, Media/Mic, Console, MIDI, Session.
- MIDI input support with note mapping.
- Microphone capture to create samples.
- Projects + recordings sidebar, auto-save, focus mode, status bar (BPM, latency, FPS).

## Getting started

### Prerequisites
- Node.js `>=22` (see `.nvmrc`).
- For desktop builds: an environment capable of running Electron and
  `electron-builder` for your target OS.

### Install & run (web)
```bash
npm install
npm run dev          # http://localhost:5000
```

### Run as a desktop app (Electron)
```bash
npm run electron:dev
```

### Build
```bash
npm run build                 # web bundle -> dist/
npm run electron:build        # desktop installer (also downloads yt-dlp)
npm run electron:build:linux  # or :win / :mac
```

## Using Strudel patterns

```javascript
// Four-on-the-floor
s("bd*4")

// Breakbeat with hats
s("bd*2 ~ bd", "~ sd ~ sd", "hh*8")

// Bassline
note("c2 ~ c2 g1").s("bass")

// Chords + filter + space
note("c'maj7 f'maj7 g'7 c'maj7").s("piano").lpf(800).room(0.5)
```

Press `Ctrl+Enter` to evaluate, `Space` to toggle play/stop (when the editor
isn't focused), and `Ctrl+F` to toggle focus mode.

## Architecture

Client-only React + TypeScript application, optionally wrapped in Electron.

| Layer | Technology |
|---|---|
| UI | React 18, TypeScript, Tailwind CSS, shadcn/ui (Radix) |
| Build/dev | Vite |
| Editor | Monaco Editor |
| Audio / patterns | `@strudel/web`, `@strudel/soundfonts` (Web Audio API) |
| Persistence | IndexedDB via Dexie (`client/src/lib/stores/db.ts`) |
| Desktop shell | Electron (`electron/main.cjs`, `electron/preload.cjs`) |
| Tests | Vitest (unit), Playwright (e2e) |

There is no Express/WebSocket/PostgreSQL/OpenAI backend — earlier docs
mentioned these, but they were never part of this codebase.

### Key modules
- `client/src/lib/strudel-engine.ts` — init, evaluate, master gain, latency.
- `client/src/lib/recorder.ts` — session recording state machine + diff snapshots.
- `client/src/lib/timeline-parser.ts` — entity/track parsing, snapshot resolution.
- `client/src/lib/session-exporter.ts` — Song / Live Set export & import.
- `client/src/lib/sample-registry.ts` — bank discovery, custom sample registry.
- `client/src/lib/stores/*` — Dexie schema and project/session stores.
- `shared/schema.ts` — shared types and track categories.

## Development

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest unit tests
npm run test:coverage # unit tests + coverage report
npm run test:e2e      # playwright (starts the dev server)
npm run format        # prettier --write
npm run check         # typecheck + lint + test
```

- Node version is pinned via `.nvmrc` / `engines`.
- YouTube import requires the Electron build and a `yt-dlp` binary
  (`scripts/download-yt-dlp.mjs` fetches it; it is not committed).
- Freesound search requires your own API key (entered in-app, stored in local storage).

## Credits

- **Original base project:** [StrudelLive](https://github.com/IAmSpring/StrudelLive)
  by [IAmSpring](https://github.com/IAmSpring) — MIT licensed (declared in its `package.json`).
  Strudel Lab is a derivative work built on it.
- **Strudel:** the live-coding pattern language and libraries this app is built on
  ([strudel.cc](https://strudel.cc), [tidalcycles/strudel](https://github.com/tidalcycles/strudel)),
  by Alex McLean and contributors (AGPL-3.0).

## License

Strudel Lab is licensed under the **GNU Affero General Public License v3.0 or later**
(AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for
attribution of the upstream base and the Strudel project.

Because the app is built on the AGPL-3.0 Strudel libraries and distributed as a
network-accessible application, the complete corresponding source is available at this
repository (AGPL §13). Third-party dependency notices and license texts are listed in
[THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt), regenerable via `npm run licenses`.
