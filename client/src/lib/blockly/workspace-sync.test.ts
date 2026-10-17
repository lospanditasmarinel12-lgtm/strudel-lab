import { describe, it, expect, beforeAll } from 'vitest';
import * as Blockly from 'blockly/core';
import { initBlockly } from './index';
import { StrudelGenerator, installGenerators } from './strudel-generator';
import { loadCodeIntoWorkspace, workspaceToStrudel } from './workspace-sync';

function makeWorkspace() {
  const workspace = new Blockly.Workspace();
  const generator = new StrudelGenerator();
  installGenerators(generator);
  return { workspace, generator };
}

beforeAll(() => initBlockly());

describe('workspace sync', () => {
  it('loads code and regenerates it unchanged', () => {
    const { workspace, generator } = makeWorkspace();
    const code = 'note("c3 e3 g3").s("piano").gain(0.5)\n';
    loadCodeIntoWorkspace(workspace, code);
    expect(workspaceToStrudel(workspace, generator)).toBe(code);
  });

  it('does not emit change events while loading', () => {
    const { workspace } = makeWorkspace();
    let events = 0;
    workspace.addChangeListener(() => {
      events += 1;
    });
    loadCodeIntoWorkspace(workspace, '$: s("bd ~ bd ~")\n');
    expect(events).toBe(0);
  });

  it('preserves a raw statement through a reload', () => {
    const { workspace, generator } = makeWorkspace();
    const code = 'const bpm = 120\ns("bd")\n';
    loadCodeIntoWorkspace(workspace, code);
    expect(workspaceToStrudel(workspace, generator)).toBe(code);
  });
});
