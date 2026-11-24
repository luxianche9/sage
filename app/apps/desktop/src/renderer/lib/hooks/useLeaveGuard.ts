import { useEffect, useRef } from "react";

/**
 * Keeps the operator from losing unsaved work when they leave the project or open settings: the shell asks
 * every guard first (`sage:before-navigation`); a dirty one cancels the move and asks whether to drop the
 * changes, after which the operator repeats the move.
 */
export function useLeaveGuard(dirty: boolean, ask: () => Promise<boolean>, discard: () => void | Promise<void>) {
  const state = useRef({ dirty, ask, discard });
  state.current = { dirty, ask, discard };
  useEffect(() => {
    const guard = (event: Event) => {
      const current = state.current;
      if (!current.dirty) return;
      event.preventDefault();
      void current.ask().then((ok) => { if (ok) void current.discard(); });
    };
    window.addEventListener("sage:before-navigation", guard);
    return () => window.removeEventListener("sage:before-navigation", guard);
  }, []);
}
