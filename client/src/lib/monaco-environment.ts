import type { Environment } from "monaco-editor/esm/vs/editor/editor.api";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment?: Environment;
  }
}

const createWorker = (_moduleId: string, label?: string) => {
  switch (label) {
    case "json":
      return new JsonWorker();
    case "typescript":
    case "javascript":
      return new TsWorker();
    default:
      return new EditorWorker();
  }
};

if (typeof window !== "undefined") {
  if (!window.MonacoEnvironment) {
    window.MonacoEnvironment = { getWorker: createWorker };
  } else if (!window.MonacoEnvironment.getWorker) {
    window.MonacoEnvironment.getWorker = createWorker;
  }
}
