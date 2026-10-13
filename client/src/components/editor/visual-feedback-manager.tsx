import * as monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import { LocationHighlighter, type LocationRange } from './location-highlighter';
import { LineWidgetCanvas } from './line-widget-canvas';
import { registerInlineVisuals } from './visual-registry';
import { onStrudelStateUpdate, setFps, type StrudelVisualState } from '@/lib/strudel-engine';
import { getTime, getPattern } from '@strudel/web';
import { getDrawContext } from '@strudel/draw';

interface VisualFeedbackManagerProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  isPlaying: boolean;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
}

export default function VisualFeedbackManager({ editor, isPlaying, editorContainerRef }: VisualFeedbackManagerProps) {
  const highlighterRef = useRef<LocationHighlighter | null>(null);
  const lineWidgetsRef = useRef<LineWidgetCanvas | null>(null);
  const widgetLinesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!editor) return;

    const hl = new LocationHighlighter(editor);
    const widgets = new LineWidgetCanvas(editor);
    highlighterRef.current = hl;
    lineWidgetsRef.current = widgets;

    registerInlineVisuals(
      (id, line) => widgets.getCanvas(id, line),
      (id) => widgetLinesRef.current.get(id),
    );

    const disposable = editor.onDidChangeModelContent(() => {
      hl.setMiniLocations([]);
    });

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLCanvasElement && !node.dataset.strudelMoved) {
            node.dataset.strudelMoved = '1';
            const container = editorContainerRef.current;
            if (container) {
              container.appendChild(node);
              node.style.position = 'absolute';
              node.style.top = '0';
              node.style.left = '0';
              node.style.width = '100%';
              node.style.height = '100%';
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposable.dispose();
      observer.disconnect();
      hl.dispose();
      widgets.dispose();
      highlighterRef.current = null;
      lineWidgetsRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    onStrudelStateUpdate((state: StrudelVisualState) => {
      const hl = highlighterRef.current;
      if (!hl) return;
      hl.setMiniLocations(state.miniLocations);
      if (!state.started) hl.stopFrameLoop();
    });
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const hl = highlighterRef.current;
    if (!hl) return;

    let frameId = 0;
    let frameCount = 0;
    let fpsFrames = 0;
    let fpsLast = performance.now();
    const options = { painters: [] as any[] };

    const tick = () => {
      const now = performance.now();
      fpsFrames++;
      if (now - fpsLast >= 500) {
        setFps(Math.round(fpsFrames * 2 * 1000 / (now - fpsLast)));
        fpsFrames = 0;
        fpsLast = now;
      }
      if (document.hidden) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      frameCount++;
      if (frameCount % 2 !== 0) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      try {
        const pattern = getPattern();
        if (!pattern) {
          frameId = requestAnimationFrame(tick);
          return;
        }
        const now = getTime();
        const painters: any[] = [];
        options.painters = painters;
        const haps = pattern.queryArc(Math.max(0, now - 0.1), now + 0.05, options);

        const ranges: LocationRange[] = [];
        for (const hap of haps) {
          const locs = hap.context?.locations;
          const markcss = hap.context?.markcss || hap.value?.markcss;
          if (locs && Array.isArray(locs)) {
            for (const loc of locs) {
              if (typeof loc === 'object' && loc.start !== undefined && loc.end !== undefined) {
                ranges.push({
                  from: loc.start,
                  to: loc.end,
                  color: hap.value?.color || undefined,
                  markcss: markcss || undefined,
                });
              }
            }
          }
        }
        hl.setActiveRanges(ranges);

        if (painters.length > 0) {
          painters.forEach((p: any) => p(getDrawContext(), now, haps, [-1, 0.1]));
        }
      } catch {
        // ignore visual errors
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      hl.stopFrameLoop();
    };
  }, [isPlaying]);

  return null;
}
