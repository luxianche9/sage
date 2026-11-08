/**
 * Calls `tick` at most every `ms`, on animation frames. Drawing that follows frames stops while the
 * window produces none (minimised, covered, hidden): a canvas drawn on a plain timer then records
 * its draw commands with nothing to present them, and the renderer's memory grows by hundreds of MB
 * a minute until it crashes.
 */
export function everyFrame(ms: number, tick: () => void): () => void {
  let last = 0;
  let frame = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (now - last < ms) return;
    last = now;
    tick();
  };
  frame = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(frame);
}
