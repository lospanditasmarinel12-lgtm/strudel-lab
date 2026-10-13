import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as monaco from "monaco-editor";
import VisualFeedbackManager from "./visual-feedback-manager";
import { registerStrudelCompletions, registerStrudelHover } from "@/lib/monaco-completions";

export interface MonacoEditorRef {
  insertAtCursor: (text: string) => void;
  getCode: () => string;
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null;
}

export type MonacoEditorInstance = monaco.editor.IStandaloneCodeEditor;

interface MonacoEditorProps {
  code: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  onEvaluate?: () => void;
  isPlaying?: boolean;
  onEditorReady?: (editor: MonacoEditorInstance | null) => void;
}

const MonacoEditor = forwardRef<MonacoEditorRef, MonacoEditorProps>(
  function MonacoEditor({ code, onChange, readOnly = false, onEvaluate, isPlaying = false, onEditorReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRefInternal = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const outerRef = useRef<HTMLDivElement>(null);
    const [editorReady, setEditorReady] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
    const onEditorReadyRef = useRef(onEditorReady);
    onEditorReadyRef.current = onEditorReady;

    useImperativeHandle(ref, () => ({
      insertAtCursor(text: string) {
        const editor = editorRefInternal.current;
        if (!editor) return;
        const selection = editor.getSelection();
        if (!selection) return;
        editor.executeEdits("samples-insert", [{
          range: selection,
          text,
        }]);
        editor.focus();
      },
      getCode() {
        return editorRefInternal.current?.getValue() ?? "";
      },
      getEditor() {
        return editorRefInternal.current;
      },
    }), []);

    useEffect(() => {
      if (!containerRef.current) return;

      monaco.languages.register({ id: "strudel" });
      monaco.languages.setMonarchTokensProvider("strudel", {
        tokenizer: {
          root: [
            [/\b(s|note|n|stack|samples|setcps|hush|panic|all|xfade|arrange|cat|sound|bank|gain|lpf|hpf|delay|room|rsize|begin|end|loop|clip|mask|cpm|scale|attack|decay|sustain|release|add|sub|fast|slow|rev|jux|ply|off|sometimes|often|rarely|almostNever|almostAlways|every|when|degradeBy|superimpose|voicings|n)\b/, "keyword"],
            [/\b(bd|sd|hh|oh|cp|rim|crash|ride|clap|tom|cb|cy|sh|piano|sawtooth|sine|square|triangle|bass|subbass|reese|wobble|pad|lead|pluck|bell|arp|organ|vox)\b/, "type"],
            [/\.\w+/, "function"],
            [/"([^"\\]|\\.)*"/, "string"],
            [/'([^'\\]|\\.)*'/, "string"],
            [/\/\/.*$/, "comment"],
            [/\/\*[\s\S]*?\*\//, "comment"],
            [/[$:^]/, "operator"],
            [/\b(\d+(?:\.\d+)?)\b/, "number"],
          ],
        },
      });

      monaco.editor.defineTheme("strudel-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "keyword", foreground: "8B5CF6", fontStyle: "bold" },
          { token: "type", foreground: "00D4AA" },
          { token: "function", foreground: "F59E0B" },
          { token: "string", foreground: "34D399" },
          { token: "comment", foreground: "6B7280", fontStyle: "italic" },
          { token: "operator", foreground: "818CF8" },
          { token: "number", foreground: "FBBF24" },
        ],
        colors: {
          "editor.background": "#0a0a14",
          "editor.foreground": "#E5E7EB",
          "editor.lineHighlightBackground": "#1E1B4B22",
          "editor.selectionBackground": "#3730A344",
          "editorCursor.foreground": "#8B5CF6",
        },
      });

      const editor = monaco.editor.create(containerRef.current, {
        value: code,
        language: "strudel",
        theme: "strudel-dark",
        fontSize: 14,
        fontFamily: "'JetBrains Mono', monospace",
        minimap: { enabled: false },
        lineNumbers: "on",
        readOnly,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        matchBrackets: 'always',
      });

      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        if (!readOnly) onChange(value);
      });

      editor.addAction({
        id: "evaluate-strudel",
        label: "Evaluate Strudel Code",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          if (onEvaluate && !readOnly) onEvaluate();
        },
      });

      editorRefInternal.current = editor;
      setEditorReady(editor);
      onEditorReadyRef.current?.(editor);

      const completionDisposable = registerStrudelCompletions();
      const hoverDisposable = registerStrudelHover();

      return () => {
        completionDisposable.dispose();
        hoverDisposable.dispose();
        onEditorReadyRef.current?.(null);
        editor.dispose();
      };
    }, []);

    useEffect(() => {
      const editor = editorRefInternal.current;
      if (!editor) return;
      const currentVal = editor.getValue();
      if (currentVal !== code) {
        const pos = editor.getPosition();
        editor.setValue(code);
        if (pos) editor.setPosition(pos);
      }
    }, [code]);

    useEffect(() => {
      editorRefInternal.current?.updateOptions({ readOnly });
    }, [readOnly]);

    return (
      <div ref={outerRef} className="relative w-full h-full overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
        <VisualFeedbackManager
          editor={editorReady}
          isPlaying={isPlaying}
          editorContainerRef={outerRef}
        />
      </div>
    );
  });

export default MonacoEditor;
