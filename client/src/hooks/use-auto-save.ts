import { useState, useCallback, useEffect, useRef } from 'react';
import { updateProject } from '@/lib/stores/project-store';
import type { Project } from '@shared/schema';

export function useAutoSave(project: Project | null, code: string, enabled: boolean) {
  const [autoSaveOn, setAutoSaveOn] = useState(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(code);

  const triggerSave = useCallback((newCode: string) => {
    if (!autoSaveOn) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (newCode !== lastSaved.current) {
        lastSaved.current = newCode;
        if (project) {
          await updateProject(project.id, { code: newCode });
        } else {
          localStorage.setItem('strudel_unsaved_code', newCode);
        }
      }
    }, 2000);
  }, [autoSaveOn, project]);

  useEffect(() => {
    if (!autoSaveOn) return;
    triggerSave(code);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, autoSaveOn, triggerSave]);

  return { autoSaveOn, setAutoSaveOn, triggerSave };
}
