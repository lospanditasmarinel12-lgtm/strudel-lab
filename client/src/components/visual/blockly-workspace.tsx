import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as Blockly from 'blockly/core';
import { createWorkspace, loadCodeIntoWorkspace, workspaceToStrudel } from '@/lib/blockly';
import type { StrudelGenerator } from '@/lib/blockly';
import { PLAY_TYPE, argField, factoryType, methodType } from '@/lib/blockly/registry';
import { resolveFunction } from '@/lib/blockly/strudel-functions';
import { GENERIC_METHOD_TYPE } from '@/lib/blockly/core-blocks';
import type { SerializedBlock } from '@/lib/blockly/ast-to-blocks';

export interface BlocklyApi {
  addSampleBlock: (name: string, n?: number) => void;
  setSelectedSample: (name: string) => boolean;
  addEffectToSelection: (method: string) => boolean;
  highlightSample: (name: string) => boolean;
}

interface BlocklyWorkspaceProps {
  code: string;
  onChange: (code: string) => void;
  onError?: (message: string) => void;
}

const SAMPLE_BLOCK_TYPES = new Set([factoryType('s'), factoryType('sound'), methodType('s'), methodType('sound')]);

function splitTopLevel(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let quote: string | null = null;
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseCall(text: string): { name: string; args: string[] } | null {
  const t = text.trim().replace(/^\./, '');
  const call = t.match(/^([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/);
  if (call) return { name: call[1], args: splitTopLevel(call[2]) };
  const bare = t.match(/^([A-Za-z_$][\w$]*)$/);
  if (bare) return { name: bare[1], args: [] };
  return null;
}

/**
 * Mounts a Blockly workspace and keeps it in sync with the canonical code, and
 * exposes an imperative API so the right-hand panels can drive the canvas.
 */
const BlocklyWorkspace = forwardRef<BlocklyApi, BlocklyWorkspaceProps>(function BlocklyWorkspace(
  { code, onChange, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const generatorRef = useRef<StrudelGenerator | null>(null);
  const lastEmittedRef = useRef<string>(code);
  const codeRef = useRef(code);
  codeRef.current = code;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let cleanup: () => void = () => {};
    try {
      const { workspace, generator } = createWorkspace(container);
      workspaceRef.current = workspace;
      generatorRef.current = generator;
      (window as unknown as { __strudelBlockly?: unknown }).__strudelBlockly = { workspace, generator, Blockly };

      const initial = codeRef.current;
      lastEmittedRef.current = initial;
      loadCodeIntoWorkspace(workspace, initial);

      const listener = (event: Blockly.Events.Abstract) => {
        if (!Blockly.Events.isEnabled()) return;
        if ((event as { isUiEvent?: boolean }).isUiEvent) return;
        if (event.type === Blockly.Events.VIEWPORT_CHANGE) return;
        const next = workspaceToStrudel(workspace, generator);
        if (next === lastEmittedRef.current) return;
        lastEmittedRef.current = next;
        onChangeRef.current(next);
      };
      workspace.addChangeListener(listener);

      const resize = new ResizeObserver(() => {
        try {
          Blockly.svgResize(workspace);
        } catch {
          /* disposed */
        }
      });
      resize.observe(container);

      cleanup = () => {
        resize.disconnect();
        workspace.dispose();
        workspaceRef.current = null;
        generatorRef.current = null;
        delete (window as unknown as { __strudelBlockly?: unknown }).__strudelBlockly;
        delete (window as unknown as { __strudelBlocklyApi?: unknown }).__strudelBlocklyApi;
      };
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
    return () => cleanup();
  }, []);

  // Reload blocks when the canonical code changes from outside (text editor).
  useEffect(() => {
    if (code === lastEmittedRef.current) return;
    const ws = workspaceRef.current;
    if (!ws) return;
    lastEmittedRef.current = code;
    loadCodeIntoWorkspace(ws, code);
  }, [code]);

  const apiRef = useRef<BlocklyApi | null>(null);

  useImperativeHandle(
    ref,
    (): BlocklyApi => {
      const api: BlocklyApi = {
      addSampleBlock(name, n) {
        const ws = workspaceRef.current;
        if (!ws) return;
        const chain: SerializedBlock[] = [{ type: factoryType('s'), fields: { [argField(0)]: name } }];
        if (n !== undefined) chain.push({ type: methodType('n'), fields: { [argField(0)]: n } });
        for (let i = 0; i < chain.length - 1; i++) chain[i].next = { block: chain[i + 1] };
        const tops = ws.getTopBlocks(false);
        let bottom = 40;
        for (const t of tops) {
          const hw = t.getHeightWidth();
          bottom = Math.max(bottom, t.getRelativeToSurfaceXY().y + hw.height + 40);
        }
        const play: SerializedBlock = {
          type: PLAY_TYPE,
          fields: { LABEL: '', MUTED: 'FALSE' },
          inputs: { PATTERN: { block: chain[0] } },
          x: 30,
          y: bottom,
        };
        try {
          Blockly.serialization.blocks.append(
            play as unknown as Parameters<typeof Blockly.serialization.blocks.append>[0],
            ws,
          );
        } catch (err) {
          onErrorRef.current?.(err instanceof Error ? err.message : String(err));
        }
      },

      setSelectedSample(name) {
        const ws = workspaceRef.current;
        if (!ws) return false;
        const sel = Blockly.getSelected();
        const block = sel && 'type' in sel ? (sel as Blockly.BlockSvg) : null;
        if (!block || !SAMPLE_BLOCK_TYPES.has(block.type)) return false;
        if (!block.getField(argField(0))) return false;
        block.setFieldValue(name, argField(0));
        return true;
      },

      addEffectToSelection(method) {
        const ws = workspaceRef.current;
        if (!ws) return false;
        const parsed = parseCall(method);
        if (!parsed) return false;
        const sel = Blockly.getSelected();
        const selected = sel && 'type' in sel ? (sel as Blockly.BlockSvg) : null;
        if (!selected) return false;
        let root: Blockly.Block = selected.getRootBlock();
        while (root.type !== PLAY_TYPE) {
          const parent = root.getSurroundParent();
          if (!parent) break;
          root = parent;
        }
        if (root.type !== PLAY_TYPE) return false;

        const spec = resolveFunction(parsed.name);
        const argsFit = Boolean(spec) && spec!.args.length === parsed.args.length;
        const block = ws.newBlock(argsFit && spec ? methodType(spec.name) : GENERIC_METHOD_TYPE);
        if (argsFit && spec) {
          spec.args.forEach((argSpec, i) => {
            const raw = parsed.args[i];
            if (argSpec.type === 'number') block.setFieldValue(Number(raw), argField(i));
            else if (argSpec.type === 'text') block.setFieldValue(raw.replace(/^["']|["']$/g, ''), argField(i));
            else block.setFieldValue(raw, argField(i));
          });
        } else {
          block.setFieldValue(parsed.name, 'NAME');
          block.setFieldValue(parsed.args.join(', '), 'ARGS');
        }
        block.initSvg();
        block.render();

        const first = root.getInputTargetBlock('PATTERN');
        let end: Blockly.Block | null = first;
        while (end?.nextConnection?.targetBlock()) end = end.nextConnection.targetBlock();
        const target = end?.nextConnection ?? root.getInput('PATTERN')?.connection;
        if (target && block.previousConnection) target.connect(block.previousConnection);
        return true;
      },

      highlightSample(name) {
        const ws = workspaceRef.current;
        if (!ws) return false;
        const match = ws
          .getAllBlocks(false)
          .find((b) => SAMPLE_BLOCK_TYPES.has(b.type) && b.getFieldValue(argField(0)) === name);
        if (!match) return false;
        ws.highlightBlock(match.id);
        ws.centerOnBlock(match.id, true);
        return true;
      },
      };
      apiRef.current = api;
      (window as unknown as { __strudelBlocklyApi?: unknown }).__strudelBlocklyApi = api;
      return api;
    },
    [],
  );

  const handleDrop = (e: React.DragEvent) => {
    const name =
      e.dataTransfer.getData('application/x-strudel-sample') || e.dataTransfer.getData('text/plain');
    if (!name) return;
    e.preventDefault();
    const ws = workspaceRef.current;
    if (!ws) return;
    try {
      const point = Blockly.utils.svgMath.screenToWsCoordinates(
        ws,
        new Blockly.utils.Coordinate(e.clientX, e.clientY),
      );
      const target = ws
        .getAllBlocks(false)
        .find((b) => SAMPLE_BLOCK_TYPES.has(b.type) && b.getBoundingRectangle().contains(point.x, point.y));
      if (target) {
        target.setFieldValue(name, argField(0));
        return;
      }
    } catch {
      /* fall through to adding a block */
    }
    // dropped on empty canvas → new sound block
    apiRef.current?.addSampleBlock(name);
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      data-testid="blockly-workspace"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-strudel-sample')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={handleDrop}
    />
  );
});

export default BlocklyWorkspace;
