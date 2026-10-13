import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as monaco from 'monaco-editor';
import type { MonacoEditorInstance } from '@/components/editor/monaco-editor';
import { parseBlocks, barBlocks, findBlockAtLine, type ParsedBlock } from '@/lib/blocks/parse-blocks';
import {
  applyDrop,
  blockDrag,
  insertBlock,
  removeBlockAt,
  replaceBlock,
  snapToBlockBoundary,
  type DragEventInfo,
} from '@/lib/blocks/drag-controller';
import { visualRowToCode } from '@/lib/visual/visual-to-code';
import type { GridVisualRow } from '@/lib/visual/visual-model';
import BlockBar from './block-bar';

interface BlockLayerProps {
  editor: MonacoEditorInstance | null;
  code: string;
  enabled: boolean;
}

const BAR_HEIGHT = 26;

const BLOCK_LAYER_CSS = `
.strudel-block-zone { box-sizing: border-box; padding: 1px 8px 1px 0; overflow: visible; z-index: 4; }
.strudel-block-drop { background: linear-gradient(to bottom, #8B5CF6 0 2px, transparent 2px 100%); }
`;

export default function BlockLayer({ editor, code, enabled }: BlockLayerProps) {
  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const domMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const zoneIdsRef = useRef<string[]>([]);
  const zonesSigRef = useRef('');
  const blocksRef = useRef<ParsedBlock[]>([]);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const dropLineRef = useRef<number | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Selection sync: highlight the block whose line range contains the cursor.
  useEffect(() => {
    if (!editor) return;
    const sub = editor.onDidChangeCursorPosition((e) => {
      const block = findBlockAtLine(blocksRef.current, e.position.lineNumber);
      setActiveBlockId(block?.id ?? null);
    });
    return () => sub.dispose();
  }, [editor]);

  const clearIndicator = useCallback(() => {
    decorationsRef.current?.clear();
  }, []);

  const showIndicator = useCallback(
    (line: number) => {
      if (!editor) return;
      if (!decorationsRef.current) decorationsRef.current = editor.createDecorationsCollection();
      decorationsRef.current.set([
        {
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: 'strudel-block-drop' },
        },
      ]);
    },
    [editor],
  );

  const applyCode = useCallback(
    (newCode: string) => {
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;
      const scrollTop = editor.getScrollTop();
      editor.pushUndoStop();
      editor.executeEdits('block-layer', [{ range: model.getFullModelRange(), text: newCode, forceMoveMarkers: true }]);
      editor.pushUndoStop();
      editor.setScrollTop(scrollTop);
    },
    [editor],
  );

  // Build/refresh the inline lego bars as Monaco view zones.
  useEffect(() => {
    if (!editor) return;

    if (!enabled) {
      try {
        editor.changeViewZones((accessor) => {
          zoneIdsRef.current.forEach((id) => accessor.removeZone(id));
        });
      } catch {
        /* editor disposed */
      }
      zoneIdsRef.current = [];
      domMapRef.current = new Map();
      zonesSigRef.current = '';
      blocksRef.current = [];
      setBlocks([]);
      return;
    }

    const parsed = parseBlocks(code);
    blocksRef.current = parsed;
    const visible = barBlocks(parsed);
    setBlocks(visible);

    const zonesSig = visible.map((b, i) => `${i}:${b.kind}:${b.startLine}-${b.endLine}`).join('|');
    if (zonesSig === zonesSigRef.current) return;
    zonesSigRef.current = zonesSig;

    domMapRef.current = new Map();
    try {
      editor.changeViewZones((accessor) => {
        zoneIdsRef.current.forEach((id) => accessor.removeZone(id));
        zoneIdsRef.current = [];
        for (const block of visible) {
          const dom = document.createElement('div');
          dom.className = 'strudel-block-zone';
          domMapRef.current.set(block.id, dom);
          const id = accessor.addZone({
            afterLineNumber: Math.max(0, block.startLine - 1),
            heightInPx: BAR_HEIGHT,
            domNode: dom,
            suppressMouseDown: true,
          });
          zoneIdsRef.current.push(id);
        }
      });
    } catch {
      /* editor disposed */
    }
  }, [editor, code, enabled]);

  // Handle palette/block drags.
  useEffect(() => {
    if (!editor || !enabled) return;

    const handle = (info: DragEventInfo) => {
      const domNode = editor.getDomNode();
      if (!domNode) return;
      const rect = domNode.getBoundingClientRect();
      const inside = info.x >= rect.left && info.x <= rect.right && info.y >= rect.top && info.y <= rect.bottom;

      if (info.type === 'move') {
        if (!inside) {
          clearIndicator();
          dropLineRef.current = null;
          return;
        }
        const target = editor.getTargetAtClientPoint(info.x, info.y);
        let rawLine: number | null = target?.position?.lineNumber ?? null;
        if (rawLine == null && target && 'detail' in target) {
          const after = (target.detail as { afterLineNumber?: number } | undefined)?.afterLineNumber;
          if (typeof after === 'number') rawLine = after + 1;
        }
        const line = rawLine ?? editor.getPosition()?.lineNumber ?? 1;
        const snapped = snapToBlockBoundary(blocksRef.current, line);
        dropLineRef.current = snapped;
        showIndicator(snapped);
        return;
      }

      if (info.type === 'drop') {
        const line = dropLineRef.current ?? editor.getPosition()?.lineNumber ?? 1;
        clearIndicator();
        dropLineRef.current = null;
        if (!inside) return;
        const newCode = applyDrop(codeRef.current, blocksRef.current, info.payload, line);
        if (newCode != null && newCode !== codeRef.current) applyCode(newCode);
        return;
      }

      // cancel: a click on a palette lego inserts at the cursor.
      clearIndicator();
      dropLineRef.current = null;
      if (info.payload.kind === 'pattern') {
        const line = editor.getPosition()?.lineNumber ?? 1;
        const at = snapToBlockBoundary(blocksRef.current, line);
        applyCode(insertBlock(codeRef.current, at, info.payload.code));
      }
    };

    blockDrag.setHandler(handle);
    return () => blockDrag.setHandler(null);
  }, [editor, enabled, applyCode, clearIndicator, showIndicator]);

  const handleDragStart = useCallback((block: ParsedBlock, x: number, y: number) => {
    blockDrag.start(
      {
        kind: 'reorder',
        label: block.row?.source ?? 'block',
        blockId: block.id,
        startLine: block.startLine,
        endLine: block.endLine,
      },
      x,
      y,
    );
  }, []);

  const handleRemove = useCallback(
    (block: ParsedBlock) => {
      applyCode(removeBlockAt(codeRef.current, block.startLine, block.endLine));
    },
    [applyCode],
  );

  const handleGridChange = useCallback(
    (block: ParsedBlock, row: GridVisualRow) => {
      applyCode(replaceBlock(codeRef.current, block.startLine, block.endLine, visualRowToCode(row)));
    },
    [applyCode],
  );

  return (
    <>
      <style>{BLOCK_LAYER_CSS}</style>
      {blocks.map((block) => {
        const dom = domMapRef.current.get(block.id);
        if (!dom) return null;
        return createPortal(
          <BlockBar
            block={block}
            active={block.id === activeBlockId}
            onDragStart={handleDragStart}
            onRemove={handleRemove}
            onGridChange={handleGridChange}
          />,
          dom,
          block.id,
        );
      })}
    </>
  );
}
