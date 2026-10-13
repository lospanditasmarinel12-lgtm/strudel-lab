import * as monaco from 'monaco-editor';

interface WidgetEntry {
  canvas: HTMLCanvasElement;
  widget: monaco.editor.IContentWidget;
  container: HTMLDivElement;
  lineNumber: number;
}

export class LineWidgetCanvas {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private widgets: Map<string, WidgetEntry> = new Map();
  private nextWidgetIndex = 0;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
  }

  getCanvas(
    id: string,
    lineNumber?: number,
    width = 600,
    height = 120
  ): HTMLCanvasElement | null {
    const existing = this.widgets.get(id);
    if (existing) {
      existing.canvas.width = width * (window.devicePixelRatio || 1);
      existing.canvas.height = height * (window.devicePixelRatio || 1);
      if (lineNumber && existing.lineNumber !== lineNumber) {
        existing.lineNumber = lineNumber;
        this.editor.removeContentWidget(existing.widget);
        this.editor.addContentWidget(existing.widget);
      }
      return existing.canvas;
    }

    const line = lineNumber ?? this.estimateWidgetLine();

    const container = document.createElement('div');
    container.style.cssText = 'position:relative;overflow:hidden;';

    const canvas = document.createElement('canvas');
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.cssText += ';display:block;background:rgba(10,10,20,0.85);border-radius:4px;';
    container.appendChild(canvas);

    const widgetId = `strudel-visual-${id}`;
    const widget: monaco.editor.IContentWidget = {
      getId: () => widgetId,
      getDomNode: () => container,
      getPosition: () => ({
        position: { lineNumber: line, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }),
    };

    this.editor.addContentWidget(widget);

    const entry: WidgetEntry = { canvas, widget, container, lineNumber: line };
    this.widgets.set(id, entry);
    this.nextWidgetIndex++;

    return canvas;
  }

  removeWidget(id: string): void {
    const entry = this.widgets.get(id);
    if (entry) {
      this.editor.removeContentWidget(entry.widget);
      this.widgets.delete(id);
    }
  }

  removeAll(): void {
    for (const id of this.widgets.keys()) this.removeWidget(id);
  }

  dispose(): void {
    this.removeAll();
  }

  private estimateWidgetLine(): number {
    const model = this.editor.getModel();
    if (!model) return 1;
    const baseLine = model.getLineCount();
    return baseLine + this.nextWidgetIndex;
  }
}
