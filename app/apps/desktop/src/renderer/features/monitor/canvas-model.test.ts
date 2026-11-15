import { describe, expect, it } from "vitest";
import { canvasExtent, cells, MIN_CELLS, moved, resized } from "./canvas-model.js";

const frame = { x: 2, y: 3, w: 6, h: 4 };

describe("canvas", () => {
  it("snaps drags to the 20 px grid and keeps panels on the canvas", () => {
    expect(cells(29)).toBe(1);
    expect(cells(-40)).toBe(0);
    expect(moved(frame, 41, -9)).toEqual({ x: 4, y: 3, w: 6, h: 4 });
    expect(moved(frame, -500, -500)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
    expect(resized(frame, 30, -200)).toEqual({ x: 2, y: 3, w: 8, h: 2 });
    expect(canvasExtent([frame, { x: 10, y: 0, w: 5, h: 2 }])).toEqual({ width: 460, height: 300 });
  });

  it("resizes down to a one-row widget but no smaller", () => {
    expect(resized(frame, -500, -500, MIN_CELLS)).toEqual({ x: 2, y: 3, w: 2, h: 1 });
  });

});
