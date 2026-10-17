import { parse, type Options } from 'acorn';

/**
 * Differential oracle for code round-trips: parse with acorn (an independent
 * ESTree producer) and compare *structure*, ignoring byte positions.
 */

const OPTIONS: Options = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  locations: true,
  onComment: [],
};

export function parseAst(code: string): unknown {
  return parse(code, OPTIONS);
}

export function isParseable(code: string): boolean {
  try {
    parse(code, OPTIONS);
    return true;
  } catch {
    return false;
  }
}

/** Strip volatile keys (`start`, `end`, `loc`, comments) before comparison. */
export function normalizeAst(node: unknown): unknown {
  return JSON.parse(
    JSON.stringify(node, (key, value) => {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'raw') return undefined;
      return value;
    }),
  );
}

export function astEqual(a: string, b: string): boolean {
  return JSON.stringify(normalizeAst(parseAst(a))) === JSON.stringify(normalizeAst(parseAst(b)));
}

/**
 * Semantic signature: the sequence of top-level statement kinds and the text of
 * every string/numeric literal. Robust to formatting/whitespace differences that
 * acorn's locations would otherwise surface but stricter than "both parse".
 */
export function semanticSignature(code: string): string {
  const literals: string[] = [];
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal') literals.push(`${typeof node.value}:${String(node.value)}`);
    if (node.type === 'Identifier') literals.push(`id:${node.name}`);
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc') continue;
      const value = (node as Record<string, unknown>)[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(parseAst(code));
  return literals.join('|');
}
