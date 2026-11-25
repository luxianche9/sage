// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { deletePreset, exportText, generatedLayout, importText, readPresets, savePreset } from "./layout-tools.js";

const s = (streamId: string, type: string, declaration?: Record<string, unknown>) =>
  ({ hardwareId: "D", streamId, type, declaration });

describe("layout tools", () => {
  beforeEach(() => globalThis.localStorage?.clear());

  it("generates displays by stream type, each in the next free spot", () => {
    const panels = generatedLayout([
      s("ai0", "block", { kind: "measured" }), s("ao0", "scalar", { kind: "setpoint" }),
      s("do", "bits", { label: "数字输出" }), s("serial0", "bytes"), s("can0", "frames")
    ]);
    expect(panels.map((panel) => [panel.id, panel.type, panel.title, panel.sources.map((item) => item.streamId)]))
      .toEqual([
        ["scope", "scope", "波形", ["ai0"]],
        ["values", "values", "数值表", ["ai0", "ao0"]],
        ["lamp-1", "lamp", "数字输出", ["do"]],
        ["terminal-1", "terminal", "serial0", ["serial0"]],
        ["trace-1", "trace", "can0", ["can0"]]
      ]);
    // None overlaps another.
    const frames = panels.map((panel) => panel.frame);
    for (const [index, first] of frames.entries()) {
      for (const second of frames.slice(index + 1)) {
        expect(first.x + first.w <= second.x || second.x + second.w <= first.x
          || first.y + first.h <= second.y || second.y + second.h <= first.y).toBe(true);
      }
    }
    // Nothing that operates the hardware is generated: that is bound by hand.
    expect(panels.some((panel) => ["button", "switch", "slider", "select"].includes(panel.type))).toBe(false);
  });

  it("leaves out panels without streams", () => {
    expect(generatedLayout([s("serial0", "bytes")]).map((panel) => panel.id)).toEqual(["terminal-1"]);
  });

  it("keeps presets by name and round-trips exported workspaces", () => {
    const frame = { x: 0, y: 0, w: 4, h: 4 };
    const monitor = { panels: [{ id: "a", type: "scope" as const, sources: [], settings: {}, frame }] };
    savePreset("台架", monitor, new Date("2026-10-12T00:00:00Z"));
    savePreset("台架", { panels: [{ ...monitor.panels[0]!, frame: { ...frame, x: 3 } }] });
    expect(readPresets().map((item) => [item.name, item.monitor.panels[0]?.frame?.x])).toEqual([["台架", 3]]);
    expect(deletePreset("台架")).toEqual([]);
    expect(importText(exportText(monitor))).toEqual(monitor);
    expect(importText("{}")).toBe("不是 SAGE 上位机画布的布局文件");
    expect(importText("nope")).toMatch(/^无法读取布局文件/);
  });
});
