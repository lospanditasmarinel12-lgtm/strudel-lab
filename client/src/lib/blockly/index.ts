import * as Blockly from 'blockly/core';
import * as En from 'blockly/msg/en';
import { PLAY_TYPE, buildBlockDefinitions, buildToolbox, isSettingType } from './registry';
import { defineCoreBlocks, defineWithPassthrough } from './core-blocks';
import { StrudelGenerator, installGenerators } from './strudel-generator';
import { getStrudelTheme } from './theme';

export { buildToolbox, buildBlockDefinitions } from './registry';
export { getStrudelTheme } from './theme';
export { StrudelGenerator } from './strudel-generator';
export { codeToSerialization } from './ast-to-blocks';
export { loadCodeIntoWorkspace, workspaceToStrudel, WORKSPACE_EVENT } from './workspace-sync';

let initialized = false;

/** One-time Blockly setup: locale, blocks, generators. Safe to call often. */
export function initBlockly(): void {
  if (initialized) return;
  Blockly.setLocale(En as unknown as Record<string, string>);

  const defs = buildBlockDefinitions();
  for (const def of defs) {
    const type = def.type as string;
    if (Blockly.Blocks[type]) continue;
    if (type === PLAY_TYPE || isSettingType(type)) {
      defineWithPassthrough(def);
    } else {
      Blockly.common.defineBlocksWithJsonArray([def]);
    }
  }
  defineCoreBlocks();

  initialized = true;
}

/** Create a fully configured, generator-bound Blockly workspace. */
export function createWorkspace(container: Element): {
  workspace: Blockly.WorkspaceSvg;
  generator: StrudelGenerator;
} {
  initBlockly();
  const generator = new StrudelGenerator();
  installGenerators(generator);
  const workspace = Blockly.inject(container, {
    toolbox: buildToolbox() as unknown as Blockly.utils.toolbox.ToolboxDefinition,
    theme: getStrudelTheme(),
    renderer: 'zelos',
    media: './blockly-media/',
    grid: { spacing: 24, length: 3, colour: '#1A2622', snap: false },
    zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.4, maxScale: 2 },
    trashcan: true,
    move: { scrollbars: true, drag: true, wheel: true },
  });
  return { workspace, generator };
}
