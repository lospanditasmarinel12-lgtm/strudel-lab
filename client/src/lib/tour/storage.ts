/**
 * Onboarding persistence (localStorage — shared by web and Electron).
 */
const TOUR_KEY = 'strudel_tour_v1';
const CHECKLIST_KEY = 'strudel_checklist_v1';

export interface TourState {
  done: boolean;
  step: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — degrade to no persistence */
  }
}

export function loadTourState(): TourState {
  return read<TourState>(TOUR_KEY) ?? { done: false, step: 0 };
}

export function saveTourState(state: TourState): void {
  write(TOUR_KEY, state);
}

export interface ChecklistState {
  completed: string[];
  dismissed: boolean;
}

export function loadChecklist(): ChecklistState {
  return read<ChecklistState>(CHECKLIST_KEY) ?? { completed: [], dismissed: false };
}

export function saveChecklist(state: ChecklistState): void {
  write(CHECKLIST_KEY, state);
}

export function resetTour(): void {
  try {
    localStorage.removeItem(TOUR_KEY);
  } catch {
    /* ignore */
  }
}

export function resetAllOnboarding(): void {
  try {
    localStorage.removeItem(TOUR_KEY);
    localStorage.removeItem(CHECKLIST_KEY);
  } catch {
    /* ignore */
  }
}
