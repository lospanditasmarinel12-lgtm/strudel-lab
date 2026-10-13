const PAIRS: [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
];

const OPEN = new Set(PAIRS.map(p => p[0]));
const CLOSE = new Map(PAIRS.map(p => [p[1], p[0]]));

export function checkBalancedSyntax(code: string): { ok: boolean; error?: string } {
  const stack: string[] = [];
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (OPEN.has(ch)) {
      stack.push(ch);
    } else if (CLOSE.has(ch)) {
      const expected = CLOSE.get(ch);
      if (stack.length === 0 || stack[stack.length - 1] !== expected) {
        return { ok: false, error: `unexpected '${ch}' at position ${i}` };
      }
      stack.pop();
    }
  }
  if (stack.length > 0) {
    return { ok: false, error: `unclosed '${stack[stack.length - 1]}'` };
  }
  return { ok: true };
}
