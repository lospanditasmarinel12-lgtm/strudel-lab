import type { StepTree } from './visual-model';

/**
 * Tiered parser/serializer for a subset of Strudel mini-notation.
 *
 * Supported (tier 1–2):
 *   tokens, rests `~`, groups `[ ]`, alternation `< >`, stack `,`,
 *   speed `*n` `/n`, euclid `(k,n[,r])`, repeat `!n`, elongate `@n`, probability `?p`.
 *
 * Anything else should cause the caller to fall back to a `raw` node. The
 * serializer emits a canonical form so that `parse(serialize(parse(s)))` is
 * idempotent.
 */

const ATOM_STOP = new Set(['[', ']', '<', '>', '(', ')', ',', '*', '/', '!', '@', '?']);

export class MiniNotationError extends Error {}

class Parser {
  private readonly s: string;
  private i = 0;

  constructor(s: string) {
    this.s = s;
  }

  private peek(): string {
    return this.s[this.i] ?? '';
  }

  private eof(): boolean {
    return this.i >= this.s.length;
  }

  private skipWs(): void {
    while (!this.eof() && /\s/.test(this.s[this.i])) this.i++;
  }

  private expect(ch: string): void {
    if (this.peek() !== ch) throw new MiniNotationError(`expected "${ch}" at ${this.i}`);
    this.i++;
  }

  private readNumber(): number {
    const start = this.i;
    while (!this.eof() && /[0-9.]/.test(this.peek())) this.i++;
    const raw = this.s.slice(start, this.i);
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n)) throw new MiniNotationError(`expected number at ${start}`);
    return n;
  }

  private parseAtom(): StepTree {
    this.skipWs();
    const c = this.peek();
    if (c === '') throw new MiniNotationError('unexpected end of input');
    if (c === '~') {
      this.i++;
      return { t: 'rest' };
    }
    if (c === '[') {
      this.i++;
      const children = this.parseSeq([']']);
      this.expect(']');
      return { t: 'group', op: 'seq', children };
    }
    if (c === '<') {
      this.i++;
      const children = this.parseSeq(['>']);
      this.expect('>');
      return { t: 'group', op: 'alt', children };
    }
    const start = this.i;
    while (!this.eof()) {
      const ch = this.peek();
      if (/\s/.test(ch) || ATOM_STOP.has(ch)) break;
      this.i++;
    }
    const value = this.s.slice(start, this.i);
    if (value === '') throw new MiniNotationError(`expected token at ${start}`);
    if (value === '-' || value === '~') return { t: 'rest' };
    return { t: 'token', value };
  }

  private parseTerm(): StepTree {
    let node = this.parseAtom();
    for (;;) {
      const c = this.peek();
      if (c === '*') {
        this.i++;
        node = { t: 'group', op: 'fast', factor: this.readNumber(), children: [node] };
      } else if (c === '/') {
        this.i++;
        node = { t: 'group', op: 'slow', factor: this.readNumber(), children: [node] };
      } else if (c === '!') {
        this.i++;
        node = { t: 'repeat', count: this.readNumber(), child: node };
      } else if (c === '@') {
        this.i++;
        node = { t: 'elongate', weight: this.readNumber(), child: node };
      } else if (c === '?') {
        this.i++;
        // Bare `?` defaults to 0.5 probability.
        const value = /[0-9.]/.test(this.peek()) ? this.readNumber() : 0.5;
        node = { t: 'prob', value, child: node };
      } else if (c === '(') {
        this.i++;
        const fill = this.readNumber();
        this.expect(',');
        const steps = this.readNumber();
        let rotate: number | undefined;
        if (this.peek() === ',') {
          this.i++;
          rotate = this.readNumber();
        }
        this.expect(')');
        node = { t: 'euclid', fill, steps, rotate, child: node };
      } else {
        break;
      }
    }
    return node;
  }

  parseSeq(stop: string[]): StepTree[] {
    const cells: StepTree[] = [];
    for (;;) {
      this.skipWs();
      if (this.eof()) break;
      const c = this.peek();
      if (stop.includes(c)) break;
      if (c === ',') break;
      cells.push(this.parseTerm());
    }
    return cells;
  }

  parseTop(): StepTree[] {
    const cells = this.parseSeq([]);
    this.skipWs();
    if (!this.eof()) throw new MiniNotationError(`unexpected trailing input at ${this.i}`);
    return cells;
  }
}

/** Split `text` on `sep` at bracket depth 0. */
export function splitTopLevel(text: string, sep = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '[' || c === '<' || c === '(') depth++;
    else if (c === ']' || c === '>' || c === ')') depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Parse a mini-notation string into top-level cells. A top-level `,` (stack)
 * becomes a single `stack` group cell so the row round-trips faithfully.
 */
export function parseMiniNotation(text: string): StepTree[] {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return [];

  const parts = splitTopLevel(trimmed, ',');
  if (parts.length === 1) {
    return new Parser(trimmed).parseTop();
  }

  const children: StepTree[] = parts.map((part) => {
    const cells = new Parser(part.trim()).parseTop();
    return { t: 'group', op: 'seq', children: cells } as StepTree;
  });
  return [{ t: 'group', op: 'stack', top: true, children }];
}

function fmt(n: number | undefined): string {
  return n === undefined ? '0' : String(n);
}

function serializeStackChild(t: StepTree): string {
  // Top-level sequences inside a stack are emitted without brackets.
  if (t.t === 'group' && t.op === 'seq') return t.children.map(serializeTree).join(' ');
  return serializeTree(t);
}

function serializeGroup(t: Extract<StepTree, { t: 'group' }>): string {
  switch (t.op) {
    case 'seq':
      return `[${t.children.map(serializeTree).join(' ')}]`;
    case 'alt':
      return `<${t.children.map(serializeTree).join(' ')}>`;
    case 'stack': {
      const inner = t.children.map(serializeStackChild).join(', ');
      return t.top ? inner : `[${inner}]`;
    }
    case 'fast':
      return `${serializeTree(t.children[0])}*${fmt(t.factor)}`;
    case 'slow':
      return `${serializeTree(t.children[0])}/${fmt(t.factor)}`;
  }
}

export function serializeTree(t: StepTree): string {
  switch (t.t) {
    case 'rest':
      return '~';
    case 'token':
      return t.value;
    case 'group':
      return serializeGroup(t);
    case 'euclid':
      return `${serializeTree(t.child)}(${t.fill},${t.steps}${t.rotate !== undefined ? `,${t.rotate}` : ''})`;
    case 'repeat':
      return `${serializeTree(t.child)}!${t.count}`;
    case 'elongate':
      return `${serializeTree(t.child)}@${fmt(t.weight)}`;
    case 'prob':
      return `${serializeTree(t.child)}?${fmt(t.value)}`;
  }
}

export function serializeCells(cells: StepTree[]): string {
  return cells.map(serializeTree).join(' ');
}
