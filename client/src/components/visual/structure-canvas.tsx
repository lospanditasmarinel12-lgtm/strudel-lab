import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Layers, Trash2 } from 'lucide-react';
import { duplicateNode, moveNode, removeNode, setMuted, wrapInContainer } from '@/lib/visual/edit-ops';
import { pickRowColor, type StructureModel, type StructureNode } from '@/lib/visual/visual-model';

interface StructureCanvasProps {
  model: StructureModel;
  onChange: (next: StructureModel) => void;
}

function nodeLabel(node: StructureNode): string {
  if (node.kind === 'container') return `${node.op}(${node.children.length})`;
  if (node.kind === 'raw') return node.code.split('\n')[0]?.slice(0, 32) || 'code';
  const p = node.pattern;
  if (p.kind === 'raw-pattern') return p.code.split('\n')[0]?.slice(0, 32) || 'code';
  const first = p.steps.find((s) => s.t === 'token');
  const sample = first && first.t === 'token' ? first.value : p.sound ?? p.rowKind;
  return `${p.rowKind === 'note' ? '♪' : '▦'} ${sample}`;
}

function nodeColor(node: StructureNode, index: number): string {
  if (node.kind === 'container') return '#3B82F6';
  if (node.kind === 'raw') return '#6b7280';
  if (node.kind === 'section' && node.pattern.kind === 'raw-pattern') return '#6b7280';
  return pickRowColor(index);
}

export default function StructureCanvas({ model, onChange }: StructureCanvasProps) {
  const canWrap = model.nodes.length > 1;

  return (
    <div data-testid="structure-canvas" className="flex items-stretch gap-2 overflow-x-auto px-3 py-2 bg-strudel-surface border-b border-strudel-surface-light">
      {model.nodes.length === 0 && (
        <span className="text-[10px] text-muted-foreground self-center">No blocks — add a pattern in the code editor.</span>
      )}

      {model.nodes.map((node, index) => {
        const color = nodeColor(node, index);
        const isSection = node.kind === 'section';
        return (
          <div
            key={node.id}
            data-testid={`canvas-node-${node.id}`}
            className="min-w-[120px] rounded border border-strudel-surface-light bg-strudel-dark px-2 py-1.5 flex flex-col gap-1"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-center gap-1">
              <Layers size={11} style={{ color }} />
              <span className="text-[10px] font-mono text-white truncate" title={nodeLabel(node)}>
                {nodeLabel(node)}
              </span>
            </div>

            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                type="button"
                data-testid={`canvas-up-${node.id}`}
                title="Move left"
                disabled={index === 0}
                onClick={() => onChange(moveNode(model, node.id, index - 1))}
                className="hover:text-white disabled:opacity-30"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                data-testid={`canvas-down-${node.id}`}
                title="Move right"
                disabled={index === model.nodes.length - 1}
                onClick={() => onChange(moveNode(model, node.id, index + 1))}
                className="hover:text-white disabled:opacity-30"
              >
                <ArrowDown size={11} />
              </button>
              {isSection && (
                <button
                  type="button"
                  data-testid={`canvas-mute-${node.id}`}
                  title={node.muted ? 'Unmute' : 'Mute'}
                  onClick={() => onChange(setMuted(model, node.id, !node.muted))}
                  className={node.muted ? 'text-red-400' : 'hover:text-white'}
                >
                  {node.muted ? <EyeOff size={11} /> : <Eye size={11} />}
                </button>
              )}
              <button
                type="button"
                data-testid={`canvas-duplicate-${node.id}`}
                title="Duplicate"
                onClick={() => onChange(duplicateNode(model, node.id))}
                className="hover:text-white"
              >
                <Copy size={11} />
              </button>
              <button
                type="button"
                data-testid={`canvas-remove-${node.id}`}
                title="Remove"
                onClick={() => onChange(removeNode(model, node.id))}
                className="hover:text-red-400"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        );
      })}

      {canWrap && (
        <button
          type="button"
          data-testid="canvas-wrap-stack"
          onClick={() => onChange(wrapInContainer(model, model.nodes.map((n) => n.id), 'stack'))}
          className="self-center text-[10px] px-2 py-1 rounded border border-strudel-surface-light text-muted-foreground hover:text-white"
        >
          stack all
        </button>
      )}
    </div>
  );
}
