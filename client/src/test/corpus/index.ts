/**
 * Real-world corpus of Strudel patterns used as golden inputs.
 *
 * Sources:
 *  1. A curated fixture set (always available, deterministic).
 *  2. The repo's downloaded docs (`docs/reference/strudel/*.html`), best-effort —
 *     extraction failures never fail a test, they just contribute nothing.
 *
 * The docs are pulled in with Vite's `import.meta.glob` (raw text, eager) so no
 * filesystem/Node globals are required and the module stays type-checkable.
 * No network access is required.
 */

export interface CorpusEntry {
  id: string;
  source: 'curated' | 'docs';
  code: string;
}

/** Hand-picked patterns exercising factories, methods, structure, comments, raw. */
export const CURATED_PATTERNS: string[] = [
  's("bd")',
  's("bd ~ bd ~")',
  's("bd*4").fast(2).room(0.5)',
  '$: s("bd ~ sd ~")\n$: s("~ hh ~ hh")',
  '$: note("c3 e3 g3 b3").s("sawtooth").lpf(800).gain(0.3)',
  'note("c3 e3 g3").s("piano")',
  'setcps(0.5)',
  's("bd").speed(sine.range(200,2000))',
  '// intro\n$: s("bd ~ bd ~")\n',
  's("bd").wobble(3, 0.5)',
  'const bpm = 120\ns("bd")',
  '// [muted] $: s("bd ~")',
  's("bd").gain(0.5).lpf(800).delay(0.3).room(0.4)',
  'note("c2 ~ c2 g1").s("bass")',
  's("[bd sd] [hh hh]")',
  's("bd(3,8)")',
  's("<bd sd>")',
  's("bd").bank("RolandTR909")',
  'stack(s("bd"), s("hh"))',
];

// Eagerly load the downloaded docs as raw strings. Missing files -> empty map.
const DOCS = import.meta.glob('../../../../docs/reference/strudel/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function looksLikeStrudel(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('//')) return false;
  return /[$A-Za-z_][\w$]*\s*\(/.test(t) || t.startsWith('$:');
}

/**
 * Best-effort: pull plausible Strudel snippets out of the downloaded HTML docs.
 * Returns at most `limit` distinct multi-line snippets.
 */
export function extractDocsPatterns(limit = 60): string[] {
  const found = new Set<string>();
  for (const html of Object.values(DOCS)) {
    const codeBlocks = html.match(/<code[^>]*>([\s\S]*?)<\/code>/gi) ?? [];
    for (const raw of codeBlocks) {
      const inner = decodeEntities(raw.replace(/<[^>]+>/g, ''));
      const lines = inner
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => looksLikeStrudel(l));
      if (lines.length === 0) continue;
      const snippet = lines.slice(0, 6).join('\n');
      if (snippet.length > 4 && snippet.length < 400) found.add(snippet);
      if (found.size >= limit) break;
    }
    if (found.size >= limit) break;
  }
  return Array.from(found);
}

export function corpus(includeDocs = true): CorpusEntry[] {
  const entries: CorpusEntry[] = CURATED_PATTERNS.map((code, i) => ({
    id: `curated-${i}`,
    source: 'curated' as const,
    code,
  }));
  if (includeDocs) {
    extractDocsPatterns().forEach((code, i) => {
      entries.push({ id: `docs-${i}`, source: 'docs', code });
    });
  }
  return entries;
}
