import { GRID_PX, type Frame, type PanelType } from "@sage/contracts/monitor";

/** Pixels → whole grid cells (never below 0). */
export function cells(px: number): number {
  return Math.max(0, Math.round(px / GRID_PX));
}

/** A frame moved by a drag of `dx`, `dy` pixels, snapped to the grid and kept on the canvas. */
export function moved(frame: Frame, dx: number, dy: number): Frame {
  const x = Math.max(0, frame.x + Math.round(dx / GRID_PX));
  return { ...frame, x, y: Math.max(0, frame.y + Math.round(dy / GRID_PX)) };
}

/** The smallest a panel can be resized to, in cells (a one-row button or lamp). */
export const MIN_CELLS: readonly [number, number] = [2, 1];

/** A frame resized by a drag of its corner, snapped to the grid, at least `min` cells each way. */
export function resized(frame: Frame, dx: number, dy: number, min: readonly [number, number] = [2, 2]): Frame {
  return {
    ...frame,
    w: Math.max(min[0], frame.w + Math.round(dx / GRID_PX)),
    h: Math.max(min[1], frame.h + Math.round(dy / GRID_PX))
  };
}

/** How far the canvas reaches: past the furthest panel, with room to drop more below and to the right. */
export function canvasExtent(frames: readonly Frame[], margin = 8): { width: number; height: number } {
  const right = Math.max(0, ...frames.map((frame) => frame.x + frame.w));
  const bottom = Math.max(0, ...frames.map((frame) => frame.y + frame.h));
  return { width: (right + margin) * GRID_PX, height: (bottom + margin) * GRID_PX };
}

/** Widgets that are small enough to need no title bar of their own. */
export const BARE_TYPES: ReadonlySet<PanelType> = new Set(["number", "lamp", "switch", "slider", "button", "label"]);
