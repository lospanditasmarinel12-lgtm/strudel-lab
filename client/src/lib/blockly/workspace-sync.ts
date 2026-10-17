import * as Blockly from 'blockly/core';
import { codeToSerialization } from './ast-to-blocks';
import type { StrudelGenerator } from './strudel-generator';

/** Fired on the workspace when a user edit changes the generated code. */
export const WORKSPACE_EVENT = 'strudel:workspace-change';

type LoadState = Parameters<typeof Blockly.serialization.workspaces.load>[0];

/** Replace the workspace contents from source code, without emitting events. */
export function loadCodeIntoWorkspace(workspace: Blockly.Workspace, code: string): void {
  const state = codeToSerialization(code);
  Blockly.Events.disable();
  try {
    workspace.clear();
    Blockly.serialization.workspaces.load(state as unknown as LoadState, workspace);
  } finally {
    Blockly.Events.enable();
  }
}

/** Generate canonical Strudel source from the workspace. */
export function workspaceToStrudel(workspace: Blockly.Workspace, generator: StrudelGenerator): string {
  return normalizeGenerated(generator.workspaceToCode(workspace));
}

function normalizeGenerated(code: string): string {
  const trimmed = code
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
  return trimmed ? `${trimmed}\n` : '';
}
