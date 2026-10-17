/**
 * Tiny cross-component event bus for tour signals Studio cannot own directly
 * (e.g. exports triggered inside the Session panel).
 */
export type TourEvent = 'sample-inserted' | 'exported';

type Listener = (event: TourEvent) => void;

const listeners = new Set<Listener>();

export function emitTourEvent(event: TourEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* a bad listener must not break the emitter */
    }
  });
}

export function onTourEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
