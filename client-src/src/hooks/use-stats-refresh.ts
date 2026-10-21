import { useEffect, useState } from 'react';

let version = 0;
const listeners = new Set<(v: number) => void>();

function notify(): void {
  for (const listener of listeners) {
    listener(version);
  }
}

export function invalidateStats(): void {
  version += 1;
  notify();
}

export function useStatsRefresh(): number {
  const [v, setV] = useState<number>(version);
  useEffect(() => {
    const listener = (nv: number): void => setV(nv);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return v;
}
