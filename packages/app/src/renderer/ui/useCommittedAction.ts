import { useEffect, useRef, useState } from 'react';

/**
 * Returns a function that runs `action` after the field currently being typed in has been committed.
 * It blurs that field (which commits it), then runs the action on the next render, when state is current.
 */
export function useCommittedAction(action: () => void | Promise<void>): () => void {
  const [tick, setTick] = useState(0);
  const latest = useRef(action);
  latest.current = action;
  useEffect(() => {
    if (tick > 0) void latest.current();
  }, [tick]);
  return () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    setTick((t) => t + 1);
  };
}
