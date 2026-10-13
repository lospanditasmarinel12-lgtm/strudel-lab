# Strudel Lab — Visual Editor Implementation Plan

**Goal:** Let users author Strudel patterns **either by typing code or by direct manipulation
(mouse/clicks) in the same surface** — a **fused, Droplet-style editor built on Monaco**:
- keep the existing **inline Strudel visuals** (pianoroll/scope/highlighting),
- render a **block tile per pattern** inline (step grid + effect chips),
- keep a **step grid** for rhythmic/drum/note layers, and
- optionally add a **structure canvas pane** for arranging sections and `stack`/`cat` containers.

Kept in sync through a **lossless, round-trippable model**.

This document is the detailed spec to implement later. It assumes the current codebase (see
"Current state") and is written to be executed phase by phase. Substrate rationale lives in
`SCRATCH_COMPARISON_REPORT.md`.

---

## 0. Decisions (locked)

| Question | Decision |
|---|---|
| Visual metaphor | **Hybrid** — inline block tiles for patterns; **optional** canvas pane for structure |
| Substrate | **Monaco-inline** (keep Monaco + inline visuals). **Not** Blockly / Morphic / CodeMirror — see §0.5 and the comparison report. |
| Code vs visual coexistence | **Fused in one Monaco surface**; the canvas pane is a toggle |
| Source of truth | **The code string.** The visual model is a lossless *projection*; visual edits patch exact source ranges. |
| Round-trip strictness | **Canonical/idempotent for modeled nodes; byte-exact for `raw` nodes** |
| Mini-notation parsing | **Reuse `@strudel/mini` `mini2ast`/`parse`** (authoritative); keep a structural parser for the JS layer |
| Block model | **Registry with typed inputs + shadow defaults** driving palette + inspector |
| Drag UX | **Borrowed from Morphic/Droplet**: grip reorder, drop indicator, value-slot drops, selection sync |
| First deliverable | **Richer model + faithful round-trip** (Phase 1) — *already implemented* |
| Legacy `pattern-visualizer.tsx` | **Deprecate in Phase 5** (kept until the new grid has parity) |

---

## 0.5 Substrate & approach (from the comparison report)

**Decision: build on Monaco; do not adopt Blockly / Morphic / CodeMirror.**

- **Morphic = Blockly + a presentation layer.** Its own docs: *"Underneath, there is always exactly
  one Blockly block model."* Blockly owns the model/connections/drag/shadows/serialization; Morphic
  adds modes, CSS, and a **CodeMirror** codespace. Adopting it would **replace Monaco → lose the
  inline visuals**, and its codespace is *structure-editing only, not free text*.
- **CodeMirror is possible but a lateral move.** The visuals are editor-agnostic (a `<canvas>` +
  `pattern.onPaint`); only the anchoring layer is Monaco-specific. Port map: `addContentWidget` →
  CM6 block widget; `createDecorationsCollection` → CM6 `Decoration.mark`/`line`; `getPositionAt` →
  `doc.lineAt`; the MutationObserver hack becomes unnecessary. Cost: rewrite the editor integration
  and lose Monaco completions/theme/overview ruler — for no net gain.
- **Monaco content widgets are line-anchored**, not a free canvas → great for "one tile per block,"
  weaker for deep nesting. Deep nesting, if ever needed, is the **optional canvas pane** (our model →
  custom canvas or React Flow), never Blockly.

**Patterns to borrow (design only, no external code):**

| From | Pattern |
|---|---|
| Scratch / Blockly | block **registry** with typed inputs → palette; **shadow/default** value blocks; drop only where connections fit |
| Morphic | **modes** (iconic/lexical/syntactic/code) as one model, many representations; grip reorder; drop indicator; value-slot drops; inline value edit; **selection sync** |
| Droplet | text-as-source-of-truth; blocks as tiles over text; 100% fidelity text⇄blocks toggle |

**Licensing:** all reference projects are AGPL-3.0 / Apache-2.0 / MIT / BSD-3 — compatible with our
AGPL-3.0-or-later; we adopt none as a substrate.

---

## 1. Current state (what already exists)

### 1.1 Bidirectional visual model — `client/src/lib/visual/`
- `visual-model.ts` — `VisualModel { stepsPerCycle, rows }`; `GridVisualRow` (drum/note with
  `source`, `steps[]`, `effects[]`, `muted`, `color`), `RawVisualRow` (verbatim code).
  Helpers: `createDrumRow`, `createNoteRow`, `emptySteps`, `resizeSteps`, `setRowStepOn`,
  `defaultEffectValue`, `createDefaultVisualModel`.
- `code-to-visual.ts` — `codeToVisual(code): VisualModel`. Best-effort; unsupported blocks
  become `raw`. Only handles single-source `s("…")` and `note("…")[.s("…")]` with simple
  method chains.
- `visual-to-code.ts` — `visualToCode(model)`, `visualRowToCode(row)`, `MUTED_PREFIX`.

### 1.2 Draggable "lego" blocks — `client/src/lib/blocks/` + `components/blocks/`
- `parse-blocks.ts` — `parseBlocks(code)` splits into blocks by blank line / `$:` / muted prefix,
  each with exact `startLine`/`endLine`, classified `pattern | raw | comment`; `barBlocks`,
  `findBlockAtLine`, `blocksSignature`.
- `drag-controller.ts` — pointer-based `blockDrag` manager; pure document ops:
  `insertBlock`, `removeBlockAt`, `replaceBlock`, `appendToBlock`, `wrapBlock`,
  `snapToBlockBoundary`, `serializeBlocks`, `applyDrop`.
- `block-layer.tsx` — renders one `BlockBar` per block as **Monaco view zones**; handles palette
  drops; writes edits back to Monaco with `pushUndoStop()` / `executeEdits()`.
- `block-bar.tsx` — per-block bar: drag handle, mute, grid popover, remove.
- `block-palette.tsx` — draggable legos: Patterns / Effects / Transforms / Combinators.
- `block-grid-popover.tsx` — `StepGrid` + `RowInspector` for one block.

### 1.3 Grid + inspector — `client/src/components/visual/`
- `step-grid.tsx` — paintable step grid (drag-paint), per-row mute/remove.
- `row-inspector.tsx` — name, source/sample (datalist), effect sliders/text.
- `effect-palette.tsx` — add-effect list.

### 1.4 Modifier registry — `client/src/lib/modifier-registry.ts`
- `ModifierDef { name, detail, syntax, category: 'audio'|'pattern'|'combinator'|'value',
  controlType: 'slider'|'none'|'text', defaultMin/Max/Step }`; `ALL_MODIFIERS`,
  `MODIFIERS_BY_CATEGORY`, `getModifierDef`, `isSliderModifier`, `getModifierCategory`.

### 1.5 Inline Strudel visuals + live feedback — `client/src/components/editor/`
- `visual-registry.ts` registers `_pianoroll`, `_punchcard`, `_spiral`, `_scope`, `_fscope`,
  `_spectrum`, `_pitchwheel`, `_animate` on `Pattern.prototype`.
- `visual-feedback-manager.tsx` + `line-widget-canvas.ts` + `location-highlighter.ts` render
  inline canvases and highlight the currently-playing code ranges.
- Engine state hook: `onStrudelStateUpdate(cb)` in `strudel-engine.ts` exposes
  `miniLocations`, `activeCode`, `started`, `widgets`.

### 1.6 Wiring
- `studio.tsx:50` `showVisual`; toggled by **BLOCKS** (`top-bar.tsx:114`); renders
  `BlockLayer` + `BlockPalette` over Monaco (`studio.tsx:420-421`).
- Legacy `pattern-visualizer.tsx` — separate hardcoded 16-step display with its own regex
  parser + fake timer (inconsistent with the model; to be deprecated).

### 1.7 Testing infrastructure already present
- Vitest (`vitest.config.ts`), Testing Library, `fast-check` (property-based), `fake-indexeddb`.
- Existing visual/blocks tests: `code-to-visual.test.ts`, `visual-to-code.test.ts`,
  `parse-blocks.test.ts`, `drag-controller.test.ts`, `step-grid.test.tsx`.
- Fuzz precedent: `client/src/test/fuzz/*.fuzz.test.ts`.
- e2e: `client/e2e/blocks.spec.ts` (Playwright).

---

## 2. Gap analysis

| Capability | Now | Target |
|---|---|---|
| Code → visual | simple `s()`/`note()` only; else `raw` | tier 1–2 mini-notation + `stack`/`cat` |
| Visual → code | simple rows | full codec with idempotence |
| Drag & drop | flat blocks, reorder, effects, wrap | + nested containers on a canvas |
| Step grid | paint/mute/remove | + row add/dup/clear, step length, sub-pattern badges, live playhead |
| Structure arrangement | none (raw) | sections + `stack`/`cat` canvas |
| Mode UX | BLOCKS overlay | Code ⇄ Visual toggle |
| Live playhead | fake timer (legacy) | real engine (`miniLocations`) |

**Primary bottleneck:** model fidelity (the model can't represent most Strudel).

---

## 3. Architecture

Keep **code as the source of truth**. Two model layers, one codec, range-based patching.

```
                 ┌───────────────────────────── code (string) ─────────────────────────────┐
                 │                                                                            │
   parse(code)   │                                                     serialize(model)       │
        ┌────────▼─────────┐                                    ┌────────────────────────────┐
        │   StructureModel  │  = canvas                         │   edit → patch range       │
        │  sections[], ...  │  ───────────────────────────────► │   (smallest enclosing src) │
        └────────┬─────────┘                                    └────────────────────────────┘
                 │ each SectionNode references
        ┌────────▼─────────┐
        │   PatternModel    │  = grid (per section)
        │  rows[], StepTree │
        └──────────────────┘
```

- **StructureModel** = top-level arrangement (sections + `stack`/`cat` containers). Edited by the
  **canvas**.
- **PatternModel** = per-section grid (drum/note rows + step trees + effects). Edited by the
  **grid**.
- **Codec** = `parse` / `serialize` with invariants and source ranges.
- **Edits** rewrite the **smallest enclosing source range** (preserves comments/raw code/format).
  Reuse Monaco undo stops.

---

## 4. Data model

### 4.1 Source ranges

```ts
/** 1-based inclusive line range, plus optional character offsets within the model. */
export interface SrcRange {
  startLine: number;
  endLine: number;
  /** byte/char offsets into the full source, if known (for precise patching). */
  startOffset?: number;
  endOffset?: number;
}

interface NodeBase {
  id: string;          // stable within a parse; derived from position for stability
  src?: SrcRange;      // where this node came from in the source
}
```

### 4.2 Structure layer

```ts
export type StructureNode = SectionNode | ContainerNode | RawNode;

export interface SectionNode extends NodeBase {
  kind: 'section';
  /** `$:` label if present, else undefined. */
  label?: string;
  pattern: PatternNode;
  muted: boolean;              // `// [muted] ` prefix
}

export interface ContainerNode extends NodeBase {
  kind: 'container';
  op: 'stack' | 'cat';
  children: StructureNode[];
}

/** Anything the model cannot represent, preserved byte-exact. */
export interface RawNode extends NodeBase {
  kind: 'raw';
  code: string;
}

export interface StructureModel {
  nodes: StructureNode[];
}
```

### 4.3 Pattern layer

```ts
export type PatternNode = GridPatternNode | RawPatternNode;

export interface GridPatternNode extends NodeBase {
  kind: 'grid';
  rowKind: 'drum' | 'note';
  /** `.s("…")` sound/synth for note rows, or the sample for drum rows. */
  sound?: string;
  /** `.scale("…")` when present. */
  scale?: string;
  /** Top-level cells; length is the cycle length (stepsPerCycle). */
  steps: StepTree[];
  effects: VisualEffect[];
}

export interface RawPatternNode extends NodeBase {
  kind: 'raw-pattern';
  code: string;
}
```

### 4.4 Step tree (mini-notation)

```ts
export type StepTree =
  | { t: 'rest' }                                              // ~
  | { t: 'token'; value: string }                             // bd, c3, sd, 0, etc.
  | { t: 'group'; op: 'seq'|'slow'|'fast'|'alt'|'stack';
      factor?: number; children: StepTree[] }                 // [ ]  /n  *n  < >  ,
  | { t: 'euclid'; fill: number; steps: number; rotate?: number; child: StepTree } // bd(3,8[,r])
  | { t: 'repeat'; count: number; child: StepTree }           // !n
  | { t: 'elongate'; weight: number; child: StepTree }        // @n
  | { t: 'prob'; value: number; child: StepTree };            // ?p
```

Notes:
- The **grid shows the top-level `steps`**. A non-trivial cell (group/euclid/repeat/elongate/prob)
  renders a **badge** and opens a **sub-editor** for that subtree.
- Effects remain `VisualEffect { name: string; value: number|string }` (from `visual-model.ts`).

### 4.5 Backwards compatibility

During migration, keep the current `VisualModel`/`GridVisualRow`/`codeToVisual`/`visualToCode`
exports working as **adapters** onto the new model, so existing tests and the block layer keep
functioning until Phase 2 swaps the UI.

---

## 5. Mini-notation spec (tiered)

### 5.1 Tiers

| Tier | Constructs | Visual |
|---|---|---|
| 1 | tokens, rests `~`, whitespace separation | paintable cells |
| 2 | `[seq]`, `<alt>`, `,` (stack inside a string), `*n`, `/n`, `(k,n[,r])`, `!n`, `@n`, `?p` | badges + sub-editor |
| 3 | `struct`, `choose`, JS expressions, variables, `setcps`, function-call args we don't model | `raw` |

### 5.2 Grammar (informal EBNF)

```
pattern   := seq
seq       := term ( WS term )*                       // top-level cells
term      := postfix
postfix   := atom ( '*' NUMBER | '/' NUMBER | '!' NUMBER | '@' NUMBER | '?' NUMBER | '(' euclid ')' )*
atom      := '~' | TOKEN | '[' pattern ']' | '<' pattern '>'
euclid    := NUMBER ',' NUMBER ( ',' NUMBER )?
TOKEN     := [A-Za-z0-9_#:.'"-]+                      // sample/note/word (no spaces/operators)
```

- **`seq`** = the grid row (cells separated by spaces).
- **`,` at top level** = stack (multiple simultaneous sub-sequences) — represented as a
  `group` with `op:'stack'` spanning the row, or split into multiple rows if it maps cleanly to
  distinct samples. **Decision for Phase 1:** treat a top-level `,` as a `group op:'stack'` cell
  (single badge) to guarantee round-trip; richer splitting is Phase 3.

### 5.3 Round-trip rules
- **Canonical re-emission:** tokens/rests separated by single spaces; operators with no spaces;
  quotes normalized to double quotes; groups `[a b]`, `<a b>`; euclid `(k,n)` / `(k,n,r)`.
- **Idempotence invariant:** `parse(serialize(parse(code)))` ≡ `parse(code)` (structurally equal).
- **`raw` fallback:** on any parse failure or tier-3 construct, the smallest enclosing region
  becomes a `RawNode`/`RawPatternNode` with **byte-exact** `code`.

---

## 6. Structure spec

### 6.1 Parsing top level
- Split the source into top-level **sections** by:
  - each `$:` line starts a new section (its `pattern` is the line/chain that follows),
  - blank lines separate sections,
  - a leading `// [muted] ` marks `muted: true`.
- Detect top-level `stack(...)` / `cat(...)` wrappers and build `ContainerNode`s with children.
- Pure comment blocks are preserved (as `raw` or a `comment` node) so reordering can keep them.

### 6.2 Serialization
- Sections joined by a blank line; `$:` prefix emitted for each section; muted prefix restored.
- Containers emit `stack(\n  <child>,\n  <child>\n)` / `cat(...)` with 2-space indentation.

### 6.3 Mapping to the canvas
- Each top-level node is a **card** on the canvas.
- Cards can be reordered (drag), grouped into a `stack`/`cat` container (drop into a container
  card), duplicated, muted, deleted.
- Opening a `SectionNode` card shows the **grid** (if its pattern is a `GridPatternNode`) or a
  read-only code view (if `raw`).

---

## 7. Codec & edit model

### 7.1 API

```ts
// client/src/lib/visual/codec.ts
export function parse(code: string): StructureModel;
export function serialize(model: StructureModel): string;
```

### 7.2 Invariants (must hold; enforced by tests)
1. **Idempotence:** `serialize(parse(serialize(parse(code)))) === serialize(parse(code))`.
2. **Raw fidelity:** every `RawNode.code` appears byte-for-byte in the output.
3. **Order preservation:** node order matches source order (except after explicit reorders).
4. **No silent loss:** every source line is covered by exactly one node's `src` range
   (modeled or raw).

### 7.3 Range-based edits
- Visual edits compute the new serialized text for the **smallest enclosing node**, then replace
  `[src.startOffset, src.endOffset]` (fallback: line range) in the code.
- Apply through Monaco `executeEdits` with `pushUndoStop()` (existing pattern in
  `block-layer.tsx:61-73`) so Ctrl+Z works.
- After an edit, **re-parse** the code to refresh the model.

### 7.4 Pure edit operations (reuse/extend `drag-controller.ts`)
- `insertNode`, `removeNode`, `replaceNode`, `moveNode`, `wrapInContainer`, `unwrapContainer`,
  `setStep`, `addRow`, `removeRow`, `setEffect`, `addEffect`, `removeEffect`.
- All operate on `StructureModel` and return a new model; the caller serializes + patches.

---

## 8. UI plan

### 8.1 Editor modes
- Keep **Monaco as the single editor** (preserves all inline visuals).
- Add a **fused-blocks** toggle (`fusedBlocks: boolean`, default on) that renders inline block tiles.
- Add an **optional** Canvas toggle for the structure pane.
- `top-bar.tsx`: segmented **CODE | BLOCKS** (fused) plus an optional **CANVAS** button (replaces the
  old BLOCKS overlay toggle at `top-bar.tsx:114`).

### 8.2 Fused layout (primary — Droplet-style, one surface)
```
Monaco editor  (text + existing Strudel visuals: pianoroll/scope/highlighting)
  ▸ each pattern block renders an inline BLOCK TILE (view zone) under its line:
      [⋮⋮ grip] kick  [mini step grid]  [gain ▸]  [grid ▾] [mute] [✕]
  ▸ clicking the tile expands the existing StepGrid popover (block-grid-popover)
```
- Text and tiles share the same surface; edits **splice the code range** (text = source of truth).

### 8.3 Optional structure canvas (secondary, toggleable)
```
┌───────────────────────────────────────────────┐
│  STRUCTURE CANVAS  (sections + stack/cat)      │  ← optional
│  [ kick ] [ snare ] [ hats ]  → stack(…)       │
└───────────────────────────────────────────────┘
```
- Same `codec` model. Canvas on top or side-by-side (layout prop). Custom canvas or React Flow.
- Only needed for free-form/nested puzzle pieces (Monaco tiles are line-anchored).

### 8.4 Grid upgrades
- Add/duplicate/clear rows; step-length selector (8/16/32 — already modeled).
- Badge cells for tier-2 subtrees; click opens a sub-editor.
- **Live playhead** from the real engine: subscribe to `onStrudelStateUpdate` and map
  `miniLocations`/current time to the active step (replaces the legacy fake timer).

### 8.5 Drag UX (borrowed from Morphic/Droplet) + palette
- Grip reorder, drop-position indicator, **value-slot drops** (effect → block, sample → row),
  **selection sync** (text cursor ⇄ tile ⇄ grid).
- Palette: Patterns/Effects/Transforms/Combinators from the **block registry**; sample drag from the
  Samples panel into a row.

---

## 9. File-by-file plan

### Delivered in Phase 1
- `client/src/lib/visual/visual-model.ts` — `SrcRange`, `StepTree`, `StructureModel`,
  `SectionNode`/`ContainerNode`/`RawNode`, `GridPatternNode`/`RawPatternNode`.
- `client/src/lib/visual/mini-notation.ts` — tiered `parseMiniNotation`/`serializeTree`/`serializeCells`.
- `client/src/lib/visual/structure.ts` — `parseStructure`/`serializeStructure`, effects, containers.
- `client/src/lib/visual/codec.ts` — `parse`/`serialize` + invariants + `toLegacyVisualModel`.
- `client/src/lib/visual/edit-ops.ts` — pure model operations.

### New (Phases 2–5)
- `client/src/lib/visual/strudel-mini-adapter.ts` — wrap `@strudel/mini` `mini2ast`/`parse` into our
  `StepTree` (authoritative mini-notation parsing).
- `client/src/lib/blocks/block-registry.ts` — block definitions with **typed inputs + shadow
  defaults**; drives palette + inspector.
- `client/src/components/blocks/block-tile.tsx` — inline **fused** block tile (mini grid + effect
  chips + grip + drop targets).
- `client/src/components/visual/structure-canvas.tsx` — **optional** canvas pane (sections + stack/cat).
- `client/src/components/visual/note-editor.tsx`, `sub-pattern-editor.tsx` — tier-2 cell editors.

### Modify
- `client/src/components/blocks/block-layer.tsx` — render **inline tiles** (fused) instead of bars
  only; keep view-zone plumbing.
- `client/src/lib/blocks/drag-controller.ts` — **value-slot drops**, grip reorder, drop indicator.
- `client/src/lib/modifier-registry.ts` — feed `block-registry.ts`.
- `client/src/components/visual/step-grid.tsx` / `row-inspector.tsx` — new controls + badges.
- `client/src/pages/studio.tsx`, `client/src/components/layout/top-bar.tsx` — fused toggle + optional
  canvas toggle.

### Deprecate
- `client/src/components/visualizers/pattern-visualizer.tsx` — remove in the final phase.

### Tests
- Extend `code-to-visual.test.ts`, `visual-to-code.test.ts`.
- New `mini-notation.test.ts`, `structure.test.ts`, `codec.test.ts`, `edit-ops.test.ts` (delivered).
- New `client/src/test/fuzz/visual-codec.fuzz.test.ts` (delivered).
- New adapter/registry/fusion tests; extend `client/e2e/blocks.spec.ts` (or add `fused-mode.spec.ts`).

---

## 10. Phased milestones

### Phase 1 — Richer model + faithful round-trip ✅ (delivered)
Extended model + `mini-notation`/`structure`/`codec`/`edit-ops` + unit & fuzz tests. See the status
section at the end of this file.

### Phase 2 — Fidelity: reuse `@strudel/mini`
- Add `@strudel/mini` as a **direct** dependency.
- `strudel-mini-adapter.ts`: convert `mini2ast`/`parse` output → our `StepTree` (fall back to our
  parser only if needed).
- Extend the structural parser for the JS layer (chains, `stack`/`cat`, function-valued args) — the
  biggest fidelity unlock.
- Acceptance: chords, `|`, `-`, `_`, bare `?`, backticks all round-trip; fuzz stays green.

### Phase 3 — Block registry + shadows
- `block-registry.ts`: blocks with named elements, **typed `inputSlots`**, `fields`, and
  **shadow/default** values (Scratch pattern, no Blockly).
- Palette + `row-inspector` generated from the registry; drops validate against slot types
  ("never syntactically broken").

### Phase 4 — Monaco-inline fusion
- `block-tile.tsx`: inline block tile per pattern (mini grid + effect chips) as a Monaco view zone.
- Drag UX: **grip reorder**, **drop-position indicator**, **value-slot drops** (effect → block,
  sample → row).
- **Selection sync**: text cursor ⇄ tile ⇄ grid.
- Acceptance: text and blocks coexist in one surface; edits splice code ranges; Monaco undo works;
  **inline Strudel visuals untouched**.

### Phase 5 — Optional canvas pane + polish
- `structure-canvas.tsx` (our model → custom canvas or React Flow) for free-form/nested arrangement.
- Row add/dup/clear, step length, tier-2 badges, live playhead from the engine.
- Keyboard a11y; deprecate `pattern-visualizer.tsx`; docs; e2e coverage.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mini-notation scope creep | Reuse `@strudel/mini` (authoritative); `raw` fallback; ship incrementally |
| Round-trip fidelity | Canonical normalization + idempotence invariant + fuzz; raw byte-exact |
| Breaking existing visual tests | Keep legacy exports as adapters; migrate tests gradually |
| Nested edits clobbering code | Smallest-enclosing-range patching + Monaco undo stops |
| Performance on large files | Parse lazily per visible section; memoize by `blocksSignature` |
| **Monaco tiles are line-anchored** | Fine for "one tile per block"; deep nesting → optional canvas pane |
| **Scope: two renderers if canvas added** | Keep canvas optional; share one `codec` model |
| Losing inline visuals | Substrate is Monaco-inline; **do not** swap to Blockly/Morphic/CodeMirror |

---

## 12. Open questions (with recommended defaults)

1. **Round-trip strictness** — canonical for modeled, byte-exact for raw. *(recommended; assumed)*
2. **Fusion scope** — Monaco-inline tiles first; canvas pane only if free-form nesting is needed.
   *(recommended; assumed)*
3. **Canvas tech (if added)** — custom canvas first; React Flow if a graph feel is preferred.
   *(Blockly rejected.)*
4. **Legacy `pattern-visualizer.tsx`** — keep until Phase 5, then remove. *(assumed)*

---

## 13. Appendix — key existing APIs to reuse

- Blocks/ops: `parseBlocks`, `barBlocks`, `findBlockAtLine`, `blocksSignature`,
  `insertBlock`, `removeBlockAt`, `replaceBlock`, `appendToBlock`, `wrapBlock`,
  `snapToBlockBoundary`, `serializeBlocks`, `applyDrop`, `blockDrag`.
- Visual: `codeToVisual`, `visualToCode`, `visualRowToCode`, `MUTED_PREFIX`,
  `createDrumRow`, `createNoteRow`, `setRowStepOn`, `defaultEffectValue`, `resizeSteps`.
- Modifiers: `ALL_MODIFIERS`, `MODIFIERS_BY_CATEGORY`, `getModifierDef`.
- Engine/state: `onStrudelStateUpdate`, `StrudelVisualState`, `getPattern`, `getTime`.
- Monaco edit pattern: `editor.executeEdits` + `pushUndoStop` (see `block-layer.tsx`).

---

*Generated from a full review of the visual/blocks layer. Update the status line below as phases land.*

**Status:** Phase 1 implemented. Phases 2–5 outstanding.

**Plan revision (post comparison report):** substrate is **Monaco-inline fusion** — Blockly, Morphic
(Blockly + presentation), and CodeMirror are evaluated and **rejected** (see §0.5 and
`SCRATCH_COMPARISON_REPORT.md` Part E). The roadmap now prioritizes (2) reusing `@strudel/mini`,
(3) a block registry with typed inputs/shadows, (4) Monaco-inline fused tiles + borrowed drag UX,
(5) an optional canvas pane + polish.

### Phase 1 — delivered
- `client/src/lib/visual/visual-model.ts` — added `SrcRange`, `StepTree`, `StructureModel`,
  `SectionNode`/`ContainerNode`/`RawNode`, `GridPatternNode`/`RawPatternNode`.
- `client/src/lib/visual/mini-notation.ts` — tiered `parseMiniNotation`/`serializeTree`/`serializeCells`.
- `client/src/lib/visual/structure.ts` — `parseStructure`/`serializeStructure`, effects, containers.
- `client/src/lib/visual/codec.ts` — `parse`/`serialize` + invariants (`isIdempotent`,
  `rawCodesPreserved`, `canonicalize`) + `toLegacyVisualModel` adapter.
- `client/src/lib/visual/edit-ops.ts` — pure model operations.
- Tests: `mini-notation.test.ts`, `structure.test.ts`, `codec.test.ts`, `edit-ops.test.ts`,
  `client/src/test/fuzz/visual-codec.fuzz.test.ts`.
- Result: `typecheck` clean, `lint` 0 errors, `test` **423 passing** (was 355).

**Note:** the legacy `code-to-visual.ts` / `visual-to-code.ts` are kept unchanged (behavior
preserved) and exposed to Phase 2 via `codec.toLegacyVisualModel`; the UI swap to the new codec
happens in Phase 2 to avoid regressing the current block layer.

Last reviewed against commit `6130cae`.
