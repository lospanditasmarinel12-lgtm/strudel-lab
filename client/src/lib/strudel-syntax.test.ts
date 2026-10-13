import { describe, it, expect } from 'vitest';
import { checkBalancedSyntax } from './strudel-syntax';

describe('checkBalancedSyntax', () => {
  it('returns ok for empty string', () => {
    expect(checkBalancedSyntax('').ok).toBe(true);
  });

  it('returns ok for code with balanced parens', () => {
    expect(checkBalancedSyntax('s("bd")').ok).toBe(true);
  });

  it('returns ok for balanced brackets', () => {
    expect(checkBalancedSyntax('[1, 2, 3]').ok).toBe(true);
  });

  it('returns ok for balanced braces', () => {
    expect(checkBalancedSyntax('stack({ a: 1 })').ok).toBe(true);
  });

  it('returns ok for nested balanced pairs', () => {
    expect(checkBalancedSyntax('stack(\n  s("bd"),\n  note("c3 e3")\n)').ok).toBe(true);
  });

  it('returns error for unclosed paren', () => {
    const result = checkBalancedSyntax('s("bd"');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error for unexpected closing paren', () => {
    const result = checkBalancedSyntax('s("bd"))');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unexpected');
  });

  it('returns error for unclosed bracket', () => {
    const result = checkBalancedSyntax('[1, 2');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unclosed');
  });

  it('returns error for unclosed brace', () => {
    const result = checkBalancedSyntax('{ a: 1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unclosed');
  });

  it('returns error for mismatched close', () => {
    const result = checkBalancedSyntax('(]');
    expect(result.ok).toBe(false);
  });

  it('handles code with only operators and numbers', () => {
    expect(checkBalancedSyntax('1 + 2 * 3').ok).toBe(true);
  });

  it('handles code with strings containing parens', () => {
    expect(checkBalancedSyntax('s("foo(bar)")').ok).toBe(true);
  });
});
