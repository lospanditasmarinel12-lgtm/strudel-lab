# Deep Analysis: Scratch vs Strudel vs Strudel Lab's Visual Editor

**Scope:** Compare how the original Scratch (`scratch-gui` / `scratch-blocks` / `scratch-vm`) builds
a visual programming environment, how the Strudel language is structured, and how Strudel Lab's
current visual editor measures up — then quantify how much we could improve.

**Sources:** `scratchfoundation/scratch-gui`, `scratchfoundation/scratch-blocks`,
`scratchfoundation/scratch-vm`, `RaspberryPiFoundation/blockly`, the Strudel docs
(`strudel.cc/learn/mini-notation`), the Strudel Technical Manual, plus a full audit of this repo.

---

## Executive summary

- **Scratch's power comes from four architectural choices**, not from its blocks per se:
  1. a **block definition registry** that generates the palette,
  2. **typed inputs with shadow blocks** for defaults,
  3. a **connection/nesting model** (statement stacks + value/boolean inputs),
  4. an **AST kept separate from rendering** (the VM listens to workspace change events).
  Scratch Blocks 2.0 is now literally a thin layer over **Blockly v12** — it does **not** use code
  generators; the VM executes the block tree directly.
- **Strudel is a functional, declarative pattern language** with two layers: a JS-expression layer
  (method chains, `$:` labels, `stack`/`cat`, function-valued args, signals) and a **mini-notation
  PEG grammar** for rhythm. Internally Strudel parses JS via **shift → AST → sugar transform →
  codegen**, and mini-notation via a **peggy-generated PEG parser → AST → pattern API**. Patterns
  are "values in time."
- **Our current implementation is a solid start but shallow on fidelity.** We built a genuine
  `code ⇄ model` codec (Phase 1) and a Monaco-embedded block layer with drag/drop and a step grid.
  But our parser is **hand-rolled and covers only a small slice** of Strudel, and our interaction
  model has **no connection/nesting, no typed inputs, no shadows, no accessibility, no canvas**.
- **The single highest-leverage change:** reuse Strudel's own parsers — `@strudel/mini` already
  exports `mini2ast`, `parse`, `patternifyAST`, `getLeaves` (authoritative mini-notation AST), and
  `@strudel/transpiler` exports `transpiler`/`evaluate`. They are **already installed dependencies**.
  This would take model fidelity from ~30% → ~85–90% with far less custom code.

---

## Part A — How the original Scratch does it

### Ecosystem
- **`scratch-gui`** — React UI. Uses a **finite state machine** for the project lifecycle
  (`src/reducers/project-state.js`: `NOT_LOADED → FETCHING_WITH_ID → LOADING_VM_WITH_ID →
  SHOWING_WITH_ID`). License: **AGPL-3.0**. *(Now migrated into the `scratch-editor` monorepo; the
  standalone repo is archived.)*
- **`scratch-blocks`** — the block canvas. **Since v2.0 it depends on Blockly v12 as a library**
  (no longer a fork). License: **Apache-2.0**. Key line from the README: *"Unlike Blockly, Scratch
  Blocks does not use code generators, but rather leverages the Scratch Virtual Machine to create
  highly dynamic, interactive programming environments."*
- **`scratch-vm`** — the runtime. Builds an **AST by listening to workspace changes** via
  `blockListener`; each target (sprite) keeps its own AST (`vm.runtime.targets[...].blocks`).
  License: **AGPL-3.0**.
- Plus `scratch-render`, `scratch-svg-renderer`, `scratch-paint`, `scratch-audio`, `scratch-parser`,
  `scratch-storage`.

### The block data model (from the VM README)
```json
{
  "_blocks": {
    "Q]PK~yJ@BTV8Y~FfISeo": {
      "id": "Q]PK~yJ@BTV8Y~FfISeo",
      "opcode": "event_whenkeypressed",
      "inputs": {},
      "fields": { "KEY_OPTION": { "name": "KEY_OPTION", "value": "space" } },
      "next": null,
      "topLevel": true,
      "parent": null,
      "shadow": false,
      "x": -69.333333333333,
      "y": 174
    }
  },
  "_scripts": ["Q]PK~yJ@BTV8Y~FfISeo"]
}
```

### Design principles worth stealing
1. **Block definition registry** → opcode + message template + typed args → auto-generated
   toolbox/palette.
2. **Shadow blocks** = default/fallback values embedded in an input socket (so a number field is
   itself a block you can replace).
3. **Typed connection sockets**: *statement* (stack via `next`/`parent`), *value* (nested reporter),
   *boolean* (hexagonal). This is what makes Scratch feel like "puzzle pieces."
4. **AST decoupled from rendering** — the GUI can be swapped without touching execution.
5. **Serialization decoupled** (`.sb3` = `project.json`).
6. **Undo/redo, keyboard accessibility (WCAG 2.2 AA), and a plugin/extension system** are
   first-class (Blockly provides these).

### Why Scratch can't be copied wholesale
Scratch is *imperative and event-driven* (hat blocks, sprites, `next` stacks). Strudel is
*declarative and functional* (patterns are values; composition via method chains and combinators).
The mapping is partial — best on the **structure** layer, weakest on **rhythm**.

---

## Part B — How Strudel's language works

### Two layers

**1. JS-expression layer** — method chaining and combinators:
- Factories: `s()`, `sound()`, `note()`, `n()`, `stack()`, `cat()`, `arrange()`.
- `$:` labels; multiple `$:` blocks **stack** (play together) — which matches our "rows/sections"
  mental model.
- Methods: `.s()`, `.bank()`, `.sound()`, `.scale()`, `.gain()`, `.lpf()`, `.room()`, `.delay()`,
  `.adsr()`, `.rev()`, `.jux()`, `.ply()`, `.off()`, `.add()`, `.slow()`, `.color()`,
  `.degradeBy()`, …
- **Function-valued arguments**: `.jux(rev)`, `.off(1/16, x=>x.add(4))`, `.sometimesBy(0.75, rev)`.
- **Pattern-valued arguments**: `.add("<0 <1 -1>>")`, `.slow("0.5,1,1.5")`.
- **Signals**: `.speed(perlin.range(.8,.9))`, `sine`, `saw`.
- Globals: `setcps()`, `setcpm()`, `samples()`.

**2. Mini-notation** (the PEG grammar) — the full construct set:
- Sequences (space), multiplication `*n` (incl. decimals), division `/n`, angle brackets `<>`,
  nesting `[]`, rests `~` **or `-`**, polyphony/chords `,`, elongation `@n`, replication `!n`,
  randomness `?` / `?0.1`, random choice `|`, Euclidean `(beats,segments[,offset])`, `_`
  (elongate/hold), multi-line via backticks. Double quotes = mini-notation; single quotes = plain
  string.

### Strudel internals (from the Technical Manual)
- User JS is parsed with **shift → AST → sugar transform → `shift-codegen`**.
- Mini-notation is a **PEG grammar (peggyjs)** producing an AST → pattern API. Patterns "represent
  just values in time" and are suitable for any time-based output.

### Crucial discovery for us
`@strudel/mini` (installed, v1.2.6) exports:
```
mini, mini2ast, parse, patternifyAST, getLeaves, getLeafLocations,
h, m, minify, miniAllStrings, StartRules, SyntaxError
```
and `@strudel/transpiler` exports:
```
evaluate, transpiler, registerLanguage, registerWidgetType, getWidgetID
```
So we can get the **authoritative mini-notation AST** via `mini2ast`/`parse` instead of our
hand-rolled parser — no reimplementation needed.

---

## Part C — Audit of our current implementation

### What we have (good)
| Area | Status | Files |
|---|---|---|
| `code ⇄ model` codec, source ranges, invariants | ✅ Phase 1 | `client/src/lib/visual/{codec,structure,mini-notation,edit-ops,visual-model}.ts` |
| AST separate from rendering | ✅ (partial) | model + codec |
| Serialization decoupled | ✅ | `parse`/`serialize` |
| Block definitions → palette | 🟡 partial | `client/src/lib/modifier-registry.ts`, `client/src/components/blocks/block-palette.tsx` |
| Default values ("shadows") | 🟡 partial | `defaultEffectValue()` in `visual-model.ts` |
| Drag/drop + reorder + wrap | 🟡 flat only | `client/src/lib/blocks/drag-controller.ts` |
| Undo/redo | ✅ (via Monaco) | `block-layer.tsx` (`pushUndoStop`/`executeEdits`) |
| Inline Strudel visuals + live highlight | ✅ | `client/src/components/editor/{visual-registry,visual-feedback-manager}.ts(x)` |

### Where we diverge from Scratch's principles
| Scratch principle | Ours |
|---|---|
| Block registry w/ typed args | Ad-hoc legos + a modifier list; no typed inputs |
| Shadow/default inputs | Just a number heuristic; not a block |
| Connection/nesting model | **None** — blocks are flat line ranges |
| Free canvas + positioning | **None** — Monaco view zones only |
| Extension system | **None** |
| Keyboard a11y | **None** for visual mode |
| Palette from definitions | Hardcoded `PATTERN_LEGOS` + modifier categories |

### Where we fall short on Strudel coverage
- Our `mini-notation.ts` supports tokens, `~`, `[]`, `<>`, top-level `,`, `*n`/`/n`, `(k,n[,r])`,
  `!n`, `@n`, `?p`.
- **Missing:** `-` rest alias, `|` random choice, **chords (`,` inside `[]` — currently throws →
  raw)**, `_`, bare `?` (default 0.5), multi-line backticks, and the entire JS layer beyond
  `s("…")`/`note("…").s("…")` + simple `.name(number|string)` effects.
- Everything else becomes a locked `raw` node — safe, but real Strudel examples (e.g. `.jux(rev)`,
  `.off(1/16, x=>x.add(4))`, `perlin.range(...)`, `arrange([...])`) are **not visually editable**.

### Rough coverage estimate
- Visual model represents ~**30%** of idiomatic Strudel.
- Scratch-like interaction parity ~**15–20%**.

---

## Part D — Gap matrix (quantified)

| Dimension | Us now | Scratch/Strudel "full" | Headroom |
|---|---|---|---|
| Mini-notation fidelity | ~55% of constructs | 100% (PEG) | +45% |
| JS-layer fidelity | ~10% | high | +80% |
| Block/connection model | ~10% | 100% | +90% |
| Canvas/nesting | 0% | 100% | +100% |
| Palette from registry | ~40% | 100% | +60% |
| Undo/redo | ~70% (Monaco) | 100% | +30% |
| Accessibility | ~0% | WCAG 2.2 AA | +100% |
| Live feedback | ~60% | 100% | +40% |
| **Overall "visual authoring"** | **~30%** | **100%** | **+70%** |

---

## Part E — Substrate decision: why not Blockly / Morphic / CodeMirror

The hard constraint is: **keep the Monaco inline visuals** (Strudel `_pianoroll`/`_scope`/`_spectrum`
etc., playing-code highlighting) **and** fuse text + blocks in one surface. That constraint decides
the substrate.

### What Morphic Blocks actually is
Morphic is a **presentation/mode layer on top of Blockly**, not a new engine. Its own docs state:
*"Underneath, there is always exactly one Blockly block model."* Blockly owns the **model**,
connections/nesting, drag mechanics, shadow blocks, connection checks and serialization; Morphic
adds modes/elements/presets/CSS, a **CodeMirror** codespace, selection sync, and codegen.

- The Morphic **codespace is CodeMirror** and is *"not free-text editing; every change is a model
  operation"* — the **Blockly model stays authoritative**, not the text.
- True bidirectional text→blocks is still on Morphic's **Upcoming** list (*"AST parsing converts
  text back to blocks (future)"*).
- License Apache-2.0; very new (single maintainer, created Aug 2026).

⇒ Adopting Morphic = adopting **Blockly's model + canvas + CodeMirror**, which would **replace
Monaco and lose our inline visuals**.

### Option A — Adopt Blockly / Morphic (rejected)
- ✅ Scratch-like puzzle pieces; a11y, undo, serialization for free.
- ❌ **Replaces Monaco → loses the inline visuals**; Blockly model becomes authoritative (not the
  text); Morphic codespace isn't free text; Strudel's functional model maps awkwardly to imperative
  stacks.

### Option B — Switch to CodeMirror 6 and port the visuals (rejected)
Our Strudel rendering is **editor-agnostic** (a `<canvas>` + `pattern.onPaint(...)`); only the
*anchoring* layer is Monaco-specific. The visuals are therefore portable:

| Our piece | Monaco mechanism | CodeMirror 6 equivalent |
|---|---|---|
| `line-widget-canvas.ts` | `editor.addContentWidget(IContentWidget)` at `{line, column}` | **Block widget** — `Decoration.widget({ widget, block: true, side: 1 })` in a `StateField` |
| `location-highlighter.ts` | `createDecorationsCollection` + `inlineClassName`/`className`/`after` | **`Decoration.mark({ class })`** / `Decoration.line` via `StateField`/`ViewPlugin` |
| `model.getPositionAt(offset)` / `getValueLength()` | Monaco text model | `view.state.doc.lineAt(pos)` / `state.doc.length` (offsets are native) |
| `overviewRuler` lane | Monaco overview ruler | none built-in — custom minimap/ruler or drop it |
| MutationObserver moving `<canvas>` into the editor | content-widget workaround | **not needed** — CM6 widgets return DOM directly |

- ❌ **Lateral move**: rewrite of the editor integration (`monaco-editor`, `monaco-completions`,
  `block-layer`, `visual-feedback-manager`, the two files above), lose Monaco completions/theme/
  overview ruler, for **no net feature gain**. Morphic's CM6 codespace still isn't free text.

### Option C — Node-graph with React Flow (optional, not substrate)
Nodes = pattern generators / effects; edges = dataflow. Maps *naturally* to Strudel's functional
chains. Good as an **optional canvas pane**, but rhythms still need the grid and it's another dep.

### Option D — Extend Monaco-inline (recommended)
Keep Monaco + all visuals; extend the existing block layer into a **Droplet-style fused editor**
(text = source of truth, block tiles over the text, drag splices the text). No heavy deps; we are
already ~60% of the way (`codec` + view-zone block bars + pointer `drag-controller` + step grid).

### Patterns to borrow (design only, no Blockly/Morphic code)
| From | Pattern |
|---|---|
| **Scratch / Blockly** | block **registry** with typed inputs → drives the palette; **shadow/default** value blocks; drop only where connections fit ("never syntactically broken") |
| **Morphic** | **modes** (iconic / lexical / syntactic / code) as one model, many representations; grip reorder; drop-position indicator; value-slot drops; inline value edit; **selection sync** across views |
| **Droplet** | text-as-source-of-truth; blocks as tiles over text; 100% fidelity text⇄blocks toggle; drag splices text |

### Licensing check
- `scratch-gui` / `scratch-vm` = **AGPL-3.0**; `scratch-blocks` / `Blockly` / **Morphic** =
  **Apache-2.0**; **Droplet** = MIT; **StrudelBlock-IDE** = BSD-3-Clause. All compatible with our
  **AGPL-3.0-or-later** project — safe to *reference*; we adopt none of them as a substrate.

### Recommendation — layered, Monaco-inline
1. **Fidelity first (highest ROI):** swap our hand-rolled mini-notation parser for
   `@strudel/mini`'s `mini2ast`/`parse`; keep a structural parser for the JS layer (or evaluate
   `@strudel/transpiler`).
2. **Interaction second:** add a **block registry with typed inputs + shadow defaults** (Scratch
   patterns #1/#2), which immediately improves the palette and inspector.
3. **Fusion third:** extend the **Monaco-inline** block layer into a Droplet-style fused editor,
   borrowing Morphic's drag UX (grip reorder, drop indicator, value-slot drops, selection sync).
4. **Optional later:** a **separate, toggleable canvas pane** (our model → custom canvas or React
   Flow) for true free-form/nested puzzle pieces, sharing the same codec. Not Blockly.

---

## Part F — Prioritized roadmap

| # | Improvement | Effort | Impact | Notes |
|---|---|---|---|---|
| 1 | Use `@strudel/mini` `mini2ast`/`parse` for mini-notation | M | ⭐⭐⭐⭐⭐ | Kills our coverage gap; authoritative AST; one parser |
| 2 | Full mini-notation cells: chords, `\|`, `-`, `_`, bare `?`, backticks | S | ⭐⭐⭐⭐ | Falls out of #1 |
| 3 | Parse the JS layer (chains, `stack`/`cat`, function args) | L | ⭐⭐⭐⭐⭐ | Unlocks `.jux(rev)`, `.off(...)`, signals |
| 4 | Block registry with typed inputs + shadows | M | ⭐⭐⭐⭐ | Drives palette + inspector; "drop only where it fits" |
| 5 | **Monaco-inline fusion** — inline block tiles in `block-layer.tsx` | L | ⭐⭐⭐⭐⭐ | Text + blocks in one surface (Droplet-style) |
| 6 | Drag UX — grip reorder, drop indicator, value-slot drops | M | ⭐⭐⭐⭐ | Borrowed from Morphic/Droplet |
| 7 | Selection sync (text ⇄ tile ⇄ grid) | M | ⭐⭐⭐ | Borrowed from Morphic |
| 8 | Keyboard accessibility + Monaco undo integration | M | ⭐⭐⭐ | WCAG parity |
| 9 | **Optional** canvas pane (our model → custom canvas or React Flow) | L | ⭐⭐⭐ | Free-form/nested puzzle pieces only if needed |
| 10 | Deprecate legacy `pattern-visualizer.tsx` | S | ⭐⭐ | Consistency |

---

## Part G — How much could we improve?

- **Model fidelity:** ~30% → **~85–90%** by reusing `@strudel/mini` + `@strudel/transpiler` (the big
  win — and it's *less* code, not more).
- **Interaction parity:** ~15–20% → **~70%** with a block registry + typed inputs/shadows + the
  Monaco-inline fused editor.
- **Overall "author from either code or blocks":** from a **good prototype** to a **credible
  Scratch-like environment** — roughly **+70%** of the remaining distance.

### Risks
- JS-layer AST parsing: Strudel does **not** export a clean AST for the JS layer (only the mini AST
  is directly exposed), so #3 may need the shift parser or the transpiler's transform output.
- Monaco content widgets/view zones are **line-anchored**, not a free canvas — good for "one tile per
  block," weaker for deep nesting (that is what the optional canvas pane is for).
- Scope creep — mini-notation is deep.
- **Substrate is decided:** Monaco-inline. Blockly/Morphic (Blockly + presentation) and CodeMirror
  are evaluated and **rejected** — see Part E.

---

## Appendix — Key references

- Scratch GUI (React UI, project state machine): https://github.com/scratchfoundation/scratch-gui
- Scratch Blocks (Blockly-based, no code generators): https://github.com/scratchfoundation/scratch-blocks
- Scratch VM (AST via `blockListener`): https://github.com/scratchfoundation/scratch-vm
- Blockly (visual editor, a11y, plugins): https://github.com/RaspberryPiFoundation/blockly
- Strudel mini-notation: https://strudel.cc/learn/mini-notation/
- Strudel Technical Manual (shift parser, PEG mini-notation): https://github.com/tidalcycles/strudel/wiki/Technical-Manual
- Morphic Blocks (Blockly + presentation modes; CodeMirror codespace): https://github.com/morphicblocks/morphic-blocks
- Droplet (fused text⇄blocks editor, MIT): https://github.com/PencilCode/droplet
- Prior art — node-based Strudel (React Flow): https://github.com/xyflow/strudel-flow
- Prior art — drag/drop Strudel blocks: https://github.com/nicsaiart1/strudelview
- Prior art — Blockly → Strudel code IDE (BSD-3): https://github.com/Strudelcode/StrudelBlock-IDE

**Installed packages we can reuse:** `@strudel/mini` (`mini2ast`, `parse`, `patternifyAST`,
`getLeaves`), `@strudel/transpiler` (`transpiler`, `evaluate`).

**Substrate (decided):** Monaco-inline fused editor. Blockly / Morphic / CodeMirror are
reference-only — see Part E.

---

*Report generated from a full review of the visual/blocks layer plus web research. Companion
implementation plan: `VISUAL_EDITOR_PLAN.md`.*
