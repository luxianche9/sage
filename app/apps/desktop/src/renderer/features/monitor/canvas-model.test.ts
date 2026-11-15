import { describe, expect, it } from "vitest";
import { canvasExtent, cells, MIN_CELLS, moved, resized } from "./canvas-model.js";
import { bigDigits, lit, latestKeys, recordValue } from "./panels/Widgets.js";

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

  it("reads a sample block as its mean and shows few digits", () => {
    expect(recordValue({ v: 2 })).toBe(2);
    expect(recordValue({ samples: [1, 2, 3] })).toBe(2);
    expect(recordValue({ mask: 0b101 })).toBe(5);
    expect(recordValue({ samples: [] })).toBeUndefined();
    expect(bigDigits(-0.000151669)).toBe("-1.52e-4");
    expect(bigDigits(2.5100000000000002)).toBe("2.51");
  });

  it("lights a lamp for a value that is not 0, or for one bit of a mask", () => {
    expect(lit(0, undefined)).toBe(false);
    expect(lit(2.5, undefined)).toBe(true);
    expect(lit(0b100, 2)).toBe(true);
    expect(lit(0b100, 1)).toBe(false);
    expect(lit(true, 3)).toBe(true);
    expect(lit(undefined, undefined)).toBeUndefined();
  });

  it("polls the first stream of each small widget once", () => {
    const ref = { hardwareId: "D", streamId: "v" };
    expect(latestKeys([
      { id: "a", type: "number", sources: [ref], settings: {} },
      { id: "b", type: "lamp", sources: [ref], settings: {} },
      { id: "c", type: "scope", sources: [{ hardwareId: "D", streamId: "w" }], settings: {} },
      { id: "d", type: "switch", sources: [], settings: {} }
    ])).toEqual(["D__v"]);
  });
});
