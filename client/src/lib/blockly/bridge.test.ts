import { describe, it, expect, beforeAll } from 'vitest';
import * as Blockly from 'blockly/core';
import { initBlockly, StrudelGenerator } from './index';
import { installGenerators } from './strudel-generator';
import { codeToSerialization } from './ast-to-blocks';

function roundTrip(code: string): string {
  const ws = new Blockly.Workspace();
  const gen = new StrudelGenerator();
  installGenerators(gen);
  Blockly.serialization.workspaces.load(
    codeToSerialization(code) as unknown as Parameters<typeof Blockly.serialization.workspaces.load>[0],
    ws,
  );
  const out = gen.workspaceToCode(ws);
  ws.dispose();
  return out.trim();
}

beforeAll(() => {
  initBlockly();
});

describe('blockly bridge round-trip', () => {
  const cases = [
    's("bd")',
    's("bd ~ bd ~")',
    '$: s("bd ~ sd ~")',
    'note("c3 e3 g3")',
    'note("c3 e3 g3").s("piano")',
    'note("c3 e3 g3").s("piano").gain(0.5)',
    's("bd*4").fast(2).room(0.5)',
    's("hh hh hh hh").lpf(800).delay(0.3)',
    'note("c2 ~ c2 g1").s("bass")',
  ];

  for (const code of cases) {
    it(`round-trips ${code}`, () => {
      expect(roundTrip(code)).toBe(code);
    });
  }

  it('is idempotent', () => {
    for (const code of cases) {
      const once = roundTrip(code);
      expect(roundTrip(once)).toBe(once);
    }
  });

  it('preserves unknown methods via the generic block', () => {
    expect(roundTrip('s("bd").wobble(3, 0.5)')).toBe('s("bd").wobble(3, 0.5)');
  });

  it('preserves unparseable statements verbatim', () => {
    const code = 'const bpm = 120';
    expect(roundTrip(code)).toBe(code);
  });

  it('demotes unknown root calls to a raw statement', () => {
    const code = 'someUnknownThing(1, 2, 3)';
    expect(roundTrip(code)).toBe(code);
  });

  it('round-trips multiple sections and comments', () => {
    const code = ['// a comment', '$: s("bd ~ bd ~")', '$: s("~ sd ~ sd")'].join('\n');
    expect(roundTrip(code)).toBe(code);
  });

  it('marks muted sections', () => {
    const code = '// [muted] $: s("bd ~")';
    expect(roundTrip(code)).toBe(code);
  });

  it('evaluates a setting statement without a play wrapper', () => {
    expect(roundTrip('setcps(0.5)')).toBe('setcps(0.5)');
  });

  it('round-trips a signal argument verbatim', () => {
    expect(roundTrip('s("bd").speed(sine.range(200,2000))')).toBe(
      's("bd").speed(sine.range(200,2000))',
    );
  });

  it('lays a pattern out as a vertical chain under play', () => {
    const state = codeToSerialization('s("bd").gain(0.5).lpf(800)');
    const play = state.blocks.blocks[0];
    expect(play.type).toBe('strudel_play');
    const first = play.inputs?.PATTERN?.block;
    expect(first?.type).toBe('strudel_f_s');
    expect(first?.next?.block.type).toBe('strudel_m_gain');
    expect(first?.next?.block.next?.block.type).toBe('strudel_m_lpf');
  });

  it('preserves comments as passthrough without comment blocks', () => {
    const state = codeToSerialization('// intro\n$: s("bd")\n');
    const play = state.blocks.blocks[0];
    expect(play.type).toBe('strudel_play');
    expect(play.extraState?.preamble).toBe('// intro\n');
    expect(JSON.stringify(state)).not.toContain('strudel_comment');
    expect(JSON.stringify(state)).not.toContain('strudel_raw');
  });
});
