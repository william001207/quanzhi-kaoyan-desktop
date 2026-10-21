type WeakRefreshListener = () => void;

const listeners = new Set<WeakRefreshListener>();

export function emitWeakMarkChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore individual listener errors
    }
  });
}

export function onWeakMarkChanged(fn: WeakRefreshListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
