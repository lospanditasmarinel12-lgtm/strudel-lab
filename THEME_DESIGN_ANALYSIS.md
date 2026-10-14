# Strudel Lab — Theme & Design Analysis

**Goal:** Determine the best visual design/theme for Strudel Lab, grounded in the product's
subject matter, using two installed design skills.

---

## 1. Installed skills

Installed via `npx skills add https://github.com/anthropics/skills` (skills.sh, by Vercel):

| Skill | Purpose | Location | License |
|---|---|---|---|
| `theme-factory` | 10 preset font/color themes + custom theme generation; enforces contrast | `.agents/skills/theme-factory/` | Apache-2.0 |
| `frontend-design` | Aesthetic direction, typography, layout, self-critique process | `.agents/skills/frontend-design/` | Apache-2.0 |

- Source: [anthropics/skills](https://github.com/anthropics/skills) · recorded in `skills-lock.json`.
- opencode discovers project `.agents/skills/*/SKILL.md` automatically (restart the session to load
  them into the `skill` tool). Security audits: Safe / 0 alerts / Low Risk.
- Attribution: both skills are Apache-2.0 — add to `THIRD-PARTY-NOTICES` (or `NOTICE`).

---

## 2. Subject grounding (per frontend-design)

- **Product:** a live-coding **music** studio — Strudel patterns (cycles, rhythms, signal) with code,
  a visual/block editor, and live visualizers.
- **Audience:** live coders / algorave musicians / learners — technical, terminal-native, performing
  under low light, valuing speed, legibility, and low distraction.
- **Primary job:** write/evaluate patterns fast, *see what is playing*, stay in flow.
- **Vernacular:** oscilloscope, spectrum, step sequencer, waveform, cycle, loop, "code → sound".

The most characteristic artifact of this world is the **oscilloscope / phosphor display** and the
**step grid**. Those are where the design should come from — not a generic dark dashboard.

---

## 3. Current theme audit

Centralized in `client/src/index.css` (`:root` + `.dark` + `@layer utilities`) and
`client/src/components/editor/monaco-editor.tsx`.

| Token | Current value |
|---|---|
| `--strudel-dark` (bg) | `hsl(235,39%,7%)` ≈ `#0d0b16` |
| `--strudel-surface` | `hsl(244,39%,15%)` ≈ `#1c1733` |
| `--strudel-surface-light` | `hsl(244,32%,24%)` |
| `--strudel-primary` | `hsl(244,76%,63%)` ≈ `#8B5CF6` (violet) |
| `--strudel-accent` | `hsl(158,64%,52%)` ≈ `#00D4AA` (teal) |
| Font | JetBrains Mono everywhere |

**Strengths:** cohesive dark terminal feel; monospace suits code; recognizable "cyberpunk" pairing.
**Measured contrast:** muted text 7.09:1, teal 10.2:1, violet **4.61:1** (barely AA for small text),
muted-on-surface 6.26:1. Functional but not generous.

**Critique against frontend-design's "AI-default tells":**
- Matches tell **#2** — *"a near-black background with a single bright acid-green or vermilion accent"*
  (teal `#00D4AA` on near-black).
- Matches tell **#5** — *"a monospace face for small data labels"* + **ALL-CAPS** labels everywhere.
- Violet `#8B5CF6` is one of the commonest tech/AI accent defaults.
- Hardcoded colors scattered (`shared/schema.ts` `TRACK_CATEGORIES`, `visual-model.ts` `ROW_COLORS`,
  `studio.tsx` `getTrackColor`, `pattern-visualizer.tsx`) → drift risk.

**Verdict:** not broken, but **generic** — it reads as the default "dark tech app," not as *this*
product. That is exactly the gap the brief wants closed.

---

## 4. theme-factory presets — evaluation

| Preset | Fit for a live-coding music tool |
|---|---|
| Midnight Galaxy (deep purple/cosmic) | Closest to current; still generic purple |
| Tech Innovation (electric blue / neon cyan) | Generic "tech" — same tells |
| Modern Minimalist (grayscale) | Calm/legible but characterless for a performance tool |
| Ocean/Arctic/Forest/Sunset/Desert/Golden/Botanical | Off-subject |

None is *specific to music/live-coding*, so per the skill we **generate a custom theme** grounded in
the subject rather than adopt a preset.

---

## 5. Recommended direction — "Phosphor / Oscilloscope"

**Concept:** a CRT-oscilloscope identity. A near-black panel with a faint green undertone; **amber**
for controls/chrome (like a hardware instrument's markings) and **phosphor green** for the *live
signal* (the scope, the playhead, active steps). This maps the theme to the product's meaning:
**amber = what you control, green = what is playing.** It keeps the terminal/mono DNA the audience
expects while replacing the purple/teal cliché with a subject-specific duotone.

### Token system (contrast-verified, all WCAG AA)

| Role | Hex | Notes |
|---|---|---|
| Base (bg) | `#0A0C0B` | near-black, faint green undertone (not neutral `#0B0B0B`) |
| Surface | `#121816` | panels |
| Surface-light | `#1E2A26` | borders / elevated |
| Foreground | `#E6EFE9` | soft phosphor white — **16.7:1** |
| Muted foreground | `#93A69E` | **7.7:1** on bg, 7.0:1 on surface |
| Primary (controls) | `#FFB000` | phosphor amber — **10.7:1**; dark text on it 10.7:1 |
| Accent (live signal) | `#4BE38A` | phosphor green — **11.8:1** |
| Warning | `#F5A524` | |
| Error | `#FF5C57` | **6.5:1** |

### Type

- **Code:** keep **JetBrains Mono** (characterful, purpose-built, not Inter/Roboto) — it is the
  product's native texture.
- **Headings / chrome labels:** introduce **one distinct display face** instead of mono-everywhere —
  e.g. a condensed grotesque or a technical stencil (candidates: *Archivo Expanded*, *Chakra Petch*,
  *Saira Condensed*). Use it for the wordmark, section titles, and the top bar; keep small labels in
  the mono but **sentence case**, not ALL-CAPS.
- **Type scale:** deliberate steps (e.g. 12/13/16/20/28/40) with intentional tracking; avoid accenting
  single words.

### Layout / structure

- Keep the dense multi-panel performance layout (it is correct for the domain).
- Make the **step grid** the signature element: amber/green ramp, clear playhead, beat grouping.
- Use structure as information: a subtle "cycle" ruler in the timeline; the transport styled like
  hardware (transport buttons, a scope-style level meter).

### Principles

1. Spend boldness in one place — the oscilloscope/step-grid motif; keep the rest quiet.
2. Amber = control, green = live signal. Never mix the meaning.
3. Mono is texture, not decoration; no ALL-CAPS labels.
4. Motion only for real events (playhead, eval flash, record pulse) — no scattered hovers.

### Alternative direction — "Algorave" (indigo + hot pink)

If you want to lean into rave-poster energy: bg `#0B0A12`, surface `#16142A`, text `#F2F0FF`, muted
`#A9A3C4`, primary **hot pink** `#FF3D9A` (6.0:1), accent **amber** `#FFC24B` (12.3:1). More
"underground flyer," less "instrument." Contrast verified AA.

---

## 6. Implementation map (small, centralized)

| File | Change |
|---|---|
| `client/src/index.css` | replace `:root`/`.dark` shadcn tokens + `--strudel-*` values; body gradient; add display-font import |
| `client/src/components/editor/monaco-editor.tsx` | restyle `defineTheme("strudel-dark", …)` (bg, comment, keyword, string, number) to the new palette |
| `shared/schema.ts` `TRACK_CATEGORIES` | recolor category accents (drums/bass/melodic/ambient/fx) |
| `client/src/lib/visual/visual-model.ts` `ROW_COLORS`, `studio.tsx` `getTrackColor`, `structure-canvas.tsx`, `block-registry.ts` | align row/category colors to the palette |
| `client/src/index.css` `.strudel-mini-atom` / `.strudel-active-atom` | swap the purple rgba for amber/green signal |
| `client/index.html` | (optional) font preconnect |

Because components read `strudel-*` utility classes and CSS variables, most of the app recolors from
`index.css` alone; the Monaco theme and the hardcoded category colors are the only extra edits.

---

## 7. Recommendation

Adopt **"Phosphor / Oscilloscope"** (Direction A): it is grounded in the product's subject matter,
distinctive without being loud, keeps the terminal/mono identity the audience expects, maps color to
meaning (amber = control, green = live signal), and passes WCAG AA across the board.

**Next step:** confirm the direction (A, B, or a theme-factory preset), and whether to keep JetBrains
Mono as the sole face or add a display face. Then implement the token changes above and verify with
`typecheck / lint / test / build` plus a visual smoke test.
