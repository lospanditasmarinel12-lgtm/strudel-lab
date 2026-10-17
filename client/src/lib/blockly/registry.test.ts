import { describe, it, expect } from 'vitest';
import {
  buildBlockDefinitions,
  buildToolbox,
  factoryType,
  methodType,
  signalType,
  settingType,
  formatValueArg,
  formatArg,
  resolveBlock,
} from './registry';
import { STRUDEL_FUNCTIONS } from './strudel-functions';

function collectToolboxTypes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectToolboxTypes(n, out));
    return out;
  }
  if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'block' && typeof rec.type === 'string') out.push(rec.type);
    if (rec.contents) collectToolboxTypes(rec.contents, out);
  }
  return out;
}

describe('block registry', () => {
  it('defines a block for every catalog function and role', () => {
    const types = new Set(buildBlockDefinitions().map((d) => d.type as string));
    for (const fn of STRUDEL_FUNCTIONS) {
      const expected =
        fn.role === 'signal'
          ? [signalType(fn.name)]
          : fn.role === 'setting'
            ? [settingType(fn.name)]
            : [factoryType(fn.name), methodType(fn.name)];
      for (const t of expected) expect(types.has(t), `${fn.name} missing ${t}`).toBe(true);
    }
  });

  it('exposes every catalog block in the toolbox', () => {
    const toolboxTypes = new Set(collectToolboxTypes(buildToolbox()));
    expect(toolboxTypes.has('strudel_play')).toBe(true);
    expect(toolboxTypes.has(factoryType('s'))).toBe(true);
    expect(toolboxTypes.has(methodType('gain'))).toBe(true);
    expect(toolboxTypes.has(signalType('sine'))).toBe(true);
    // Raw-code and comment blocks are intentionally gone.
    expect(toolboxTypes.has('strudel_raw')).toBe(false);
    expect(toolboxTypes.has('strudel_comment')).toBe(false);
  });

  it('resolves block types back to specs', () => {
    expect(resolveBlock(methodType('fast'))?.spec.name).toBe('fast');
    expect(resolveBlock(factoryType('note'))?.spec.name).toBe('note');
    expect(resolveBlock(signalType('sine'))?.spec.name).toBe('sine');
    expect(resolveBlock('strudel_made_up')?.spec).toBeUndefined();
  });

  it('formats value arguments safely', () => {
    expect(formatValueArg('3')).toBe('3');
    expect(formatValueArg('0.5')).toBe('0.5');
    expect(formatValueArg('-2')).toBe('-2');
    expect(formatValueArg('rev')).toBe('rev');
    expect(formatValueArg('perlin.range(0,1)')).toBe('perlin.range(0,1)');
    expect(formatValueArg('bd sd')).toBe('"bd sd"');
    expect(formatValueArg('"already"')).toBe('"already"');
    expect(formatValueArg('x=>x.add(4)')).toBe('x=>x.add(4)');
  });

  it('formats typed arguments', () => {
    expect(formatArg({ name: 'n', type: 'number', default: 0 }, 2)).toBe('2');
    expect(formatArg({ name: 's', type: 'text', default: '' }, 'piano')).toBe('"piano"');
    expect(formatArg({ name: 's', type: 'text', default: 'bd' }, '')).toBe('"bd"');
    expect(formatArg({ name: 'fn', type: 'value', default: 'rev()' }, 'rev')).toBe('rev');
  });
});
