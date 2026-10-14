import * as monaco from 'monaco-editor';

export interface LocationRange {
  from: number;
  to: number;
  color?: string;
  markcss?: string;
}

export class LocationHighlighter {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private staticDeco: monaco.editor.IEditorDecorationsCollection;
  private activeDeco: monaco.editor.IEditorDecorationsCollection;
  private _miniLocations: number[][] = [];
  private _lastActiveRanges: LocationRange[] = [];
  private _rafId = 0;
  private _fadeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
    this.staticDeco = editor.createDecorationsCollection();
    this.activeDeco = editor.createDecorationsCollection();
  }

  setMiniLocations(locations: number[][]): void {
    this._miniLocations = locations;
    this.updateStaticDecorations();
  }

  setActiveRanges(ranges: LocationRange[]): void {
    this._lastActiveRanges = [...ranges];
    this.applyActiveDecorations();

    if (this._fadeTimeout) clearTimeout(this._fadeTimeout);
    this._fadeTimeout = setTimeout(() => {
      this._lastActiveRanges = [];
      this.applyActiveDecorations();
    }, 300);
  }

  startFrameLoop(getActiveRanges: () => LocationRange[]): void {
    const loop = () => {
      if (this._rafId !== 0) {
        const ranges = getActiveRanges();
        if (ranges.length > 0) {
          this.setActiveRanges(ranges);
        }
        this._rafId = requestAnimationFrame(loop);
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stopFrameLoop(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    this._lastActiveRanges = [];
    this.applyActiveDecorations();
  }

  dispose(): void {
    this.stopFrameLoop();
    if (this._fadeTimeout) clearTimeout(this._fadeTimeout);
    this.staticDeco.clear();
    this.activeDeco.clear();
  }

  private updateStaticDecorations(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    for (const [from, to] of this._miniLocations) {
      if (from < 0 || to > model.getValueLength()) continue;
      const range = this.offsetRangeToMonacoRange(model, from, to);
      if (!range) continue;

      decorations.push({
        range,
        options: {
          inlineClassName: 'strudel-mini-atom',
          overviewRuler: {
            color: 'rgba(75, 227, 138, 0.4)',
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      });
    }

    this.staticDeco.set(decorations);
  }

  private applyActiveDecorations(): void {
    const model = this.editor.getModel();
    if (!model) return;

    if (this._lastActiveRanges.length === 0) {
      this.activeDeco.clear();
      return;
    }

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];

    for (const { from, to, color, markcss } of this._lastActiveRanges) {
      if (from < 0 || to > model.getValueLength()) continue;
      const range = this.offsetRangeToMonacoRange(model, Math.max(0, from), Math.min(to, model.getValueLength()));
      if (!range) continue;

      const hexColor = color || '#FFB000';

      const options: monaco.editor.IModelDecorationOptions = {
        className: 'strudel-active-atom',
        inlineClassName: 'strudel-active-atom-inline',
        overviewRuler: {
          color: hexColor,
          position: monaco.editor.OverviewRulerLane.Right,
        },
      };

      if (markcss) {
        const styles = markcss.trim();
        if (styles) {
          options.after = {
            content: '',
            inlineClassName: 'strudel-active-atom',
            ...(styles.includes('text-decoration') || styles.includes('underline')
              ? { inlineClassName: undefined } : {}),
          };
        }
      }

      decorations.push({ range, options });
    }

    this.activeDeco.set(decorations);
  }

  private offsetRangeToMonacoRange(
    model: monaco.editor.ITextModel,
    from: number,
    to: number
  ): monaco.IRange | null {
    const minPos = model.getPositionAt(Math.max(0, from));
    const maxPos = model.getPositionAt(Math.min(to, model.getValueLength()));
    if (!minPos || !maxPos) return null;
    return {
      startLineNumber: minPos.lineNumber,
      startColumn: minPos.column,
      endLineNumber: maxPos.lineNumber,
      endColumn: maxPos.column,
    };
  }
}
