import * as Blockly from 'blockly/core';
import { BLOCK_COLOUR } from './registry';

/**
 * Catch-all statement blocks for calls the catalog does not model. Arguments are
 * stored verbatim so the code round-trips even when we don't understand it.
 */

export const GENERIC_METHOD_TYPE = 'strudel_generic_method';
export const GENERIC_FACTORY_TYPE = 'strudel_generic_factory';

function defineIfAbsent(type: string, def: Record<string, unknown>): void {
  if (!Blockly.Blocks[type]) {
    (Blockly.Blocks as Record<string, unknown>)[type] = def;
  }
}

export function defineCoreBlocks(): void {
  defineIfAbsent(GENERIC_FACTORY_TYPE, {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldTextInput('fn'), 'NAME')
        .appendField('(')
        .appendField(new Blockly.FieldTextInput(''), 'ARGS')
        .appendField(')');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(BLOCK_COLOUR.value);
      this.setTooltip('Any Strudel call (arguments emitted verbatim)');
    },
  });

  defineIfAbsent(GENERIC_METHOD_TYPE, {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('.')
        .appendField(new Blockly.FieldTextInput('method'), 'NAME')
        .appendField('(')
        .appendField(new Blockly.FieldTextInput(''), 'ARGS')
        .appendField(')');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(BLOCK_COLOUR.value);
      this.setTooltip('Any chained Strudel method (arguments emitted verbatim)');
    },
  });
}

/** Exposed for tests: whether a block type has a definition. */
export function hasBlock(type: string): boolean {
  return Boolean(Blockly.Blocks[type]);
}

// ---------------------------------------------------------------------------
// Passthrough text (comments / unrepresentable code) attached to a block
// ---------------------------------------------------------------------------

export interface PassthroughCarrier {
  preamble?: string;
  postamble?: string;
}

export function getPreamble(block: Blockly.Block): string {
  return (block as unknown as PassthroughCarrier).preamble ?? '';
}

export function getPostamble(block: Blockly.Block): string {
  return (block as unknown as PassthroughCarrier).postamble ?? '';
}

export function setPassthrough(block: Blockly.Block, preamble: string, postamble: string): void {
  const carrier = block as unknown as PassthroughCarrier;
  carrier.preamble = preamble;
  carrier.postamble = postamble;
}

/** Registers a JSON block definition with preamble/postamble extra-state. */
export function defineWithPassthrough(def: Record<string, unknown>): void {
  const type = def.type as string;
  if (Blockly.Blocks[type]) return;
  (Blockly.Blocks as Record<string, unknown>)[type] = {
    init(this: Blockly.Block & PassthroughCarrier) {
      (this as unknown as { jsonInit: (d: unknown) => void }).jsonInit(def);
      this.preamble = '';
      this.postamble = '';
    },
    saveExtraState(this: Blockly.Block & PassthroughCarrier) {
      const state: PassthroughCarrier = {};
      if (this.preamble) state.preamble = this.preamble;
      if (this.postamble) state.postamble = this.postamble;
      return Object.keys(state).length ? state : null;
    },
    loadExtraState(this: Blockly.Block & PassthroughCarrier, state: PassthroughCarrier | null) {
      this.preamble = state?.preamble ?? '';
      this.postamble = state?.postamble ?? '';
    },
  };
}
