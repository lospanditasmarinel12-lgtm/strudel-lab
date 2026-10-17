import * as Blockly from 'blockly/core';
import { STRUDEL_FUNCTIONS } from './strudel-functions';
import {
  EXPR_TYPE,
  NUMBER_TYPE,
  PLAY_TYPE,
  TEXT_TYPE,
  argField,
  factoryType,
  formatArg,
  isFactoryType,
  isMethodType,
  methodType,
  settingType,
  signalType,
} from './registry';
import {
  GENERIC_FACTORY_TYPE,
  GENERIC_METHOD_TYPE,
  getPostamble,
  getPreamble,
} from './core-blocks';

/** Precedence constant (smaller binds tighter). All our values are calls. */
const ORDER_ATOMIC = 0;

const asString = (code: string | [string, number] | null): string =>
  Array.isArray(code) ? code[0] : (code ?? '');

/** Statement blocks that continue the same expression chain (source/method). */
function isChainBlock(block: Blockly.Block): boolean {
  return (
    isFactoryType(block.type) ||
    isMethodType(block.type) ||
    block.type === GENERIC_FACTORY_TYPE ||
    block.type === GENERIC_METHOD_TYPE
  );
}

/** Emit a block's preserved preamble/postamble (comments, unrepresentable code). */
function withPassthrough(block: Blockly.Block, code: string): string {
  const pre = getPreamble(block);
  const post = getPostamble(block);
  const preStr = pre ? (pre.endsWith('\n') ? pre : `${pre}\n`) : '';
  const postStr = post ? (post.startsWith('\n') ? post : `\n${post}`) : '';
  return preStr + code + postStr;
}

/**
 * Custom Blockly code generator that emits canonical Strudel source.
 *
 * Chain blocks (`note(…).s(…).gain(…)`) are joined with no separator; separate
 * top-level statements are joined with newlines.
 */
export class StrudelGenerator extends Blockly.CodeGenerator {
  constructor() {
    super('Strudel');
    this.INDENT = '  ';
  }

  override scrub_(block: Blockly.Block, code: string, thisOnly?: boolean): string {
    const next = block.nextConnection?.targetBlock();
    if (!next || thisOnly) return code;
    const nextStr = asString(this.blockToCode(next));
    const sep = isChainBlock(block) && isChainBlock(next) ? '' : '\n';
    return code + sep + nextStr;
  }
}

export function installGenerators(gen: StrudelGenerator): void {
  // --- core blocks ---------------------------------------------------------
  gen.forBlock[PLAY_TYPE] = (block, g) => {
    const first = block.getInputTargetBlock('PATTERN');
    // An empty play block with preserved text emits only that text (no `silence`).
    const chain = first ? asString(g.blockToCode(first)) : getPreamble(block) ? '' : 'silence';
    const label = String(block.getFieldValue('LABEL') ?? '');
    const muted = block.getFieldValue('MUTED') === 'TRUE';
    const prefix = muted ? '// [muted] ' : '';
    const lab = label ? `${label}: ` : '';
    return withPassthrough(block, prefix + lab + chain);
  };

  gen.forBlock[NUMBER_TYPE] = (block) => [String(block.getFieldValue('VALUE')), ORDER_ATOMIC];

  gen.forBlock[TEXT_TYPE] = (block) => [
    JSON.stringify(String(block.getFieldValue('VALUE') ?? '')),
    ORDER_ATOMIC,
  ];

  gen.forBlock[EXPR_TYPE] = (block) => [String(block.getFieldValue('VALUE') ?? ''), ORDER_ATOMIC];

  gen.forBlock[GENERIC_FACTORY_TYPE] = (block) =>
    `${String(block.getFieldValue('NAME') ?? '')}(${String(block.getFieldValue('ARGS') ?? '')})`;

  gen.forBlock[GENERIC_METHOD_TYPE] = (block) =>
    `.${String(block.getFieldValue('NAME') ?? '')}(${String(block.getFieldValue('ARGS') ?? '')})`;

  // --- generated catalog blocks -------------------------------------------
  for (const fn of STRUDEL_FUNCTIONS) {
    const args = fn.args;
    const readAll = (block: Blockly.Block) =>
      args.map((arg, i) => formatArg(arg, block.getFieldValue(argField(i)))).join(', ');

    gen.forBlock[factoryType(fn.name)] = (block) => `${fn.name}(${readAll(block)})`;

    gen.forBlock[methodType(fn.name)] = (block) => `.${fn.name}(${readAll(block)})`;

    gen.forBlock[signalType(fn.name)] = () => [fn.name, ORDER_ATOMIC];

    gen.forBlock[settingType(fn.name)] = (block) =>
      withPassthrough(block, `${fn.name}(${readAll(block)})`);
  }
}
