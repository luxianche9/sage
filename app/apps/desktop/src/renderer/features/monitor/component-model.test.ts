import type { ToolCatalogItem } from "@sage/contracts/devices";
import type { MonitorControl, MonitorPanel } from "@sage/contracts/monitor";
import { describe, expect, it } from "vitest";
import {
  bindable, bindingProblem, controlOf, defaultTypeFor, incrementedCopy, lampBits, parseBits, parseParam,
  sliderRange, switchValues, takes
} from "./component-model.js";

function tool(remoteName: string, kind: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    remoteName, externalName: `x_${remoteName}`, deviceId: "CARD", kind: "hardware", description: "",
    inputSchema: { type: "object", properties: { hardwareId: { type: "string" }, ...properties }, required },
    contractMetadata: { operationSemantics: { kind } }
  } as unknown as ToolCatalogItem;
}

const setRelay = tool("card_set_relay", "actuate",
  { channel: { type: "integer", minimum: 0, maximum: 15 }, closed: { type: "boolean" } }, ["channel", "closed"]);
const setVolts = tool("card_set_voltage", "actuate",
  { channel: { type: "integer" }, volts: { type: "number", minimum: -10, maximum: 10 } }, ["channel", "volts"]);
const readBit = tool("card_read_bit", "read", { channel: { type: "integer" } });
const safe = tool("card_safe_state", "safe", {});
const tools = [setRelay, setVolts, readBit, safe];

const relay: MonitorControl = {
  hardwareId: "CARD", tool: "card_set_relay", widget: "toggle", param: "closed", fixed: { channel: 3 }
};

function panel(type: MonitorPanel["type"], settings: Record<string, unknown> = {}, title?: string): MonitorPanel {
  return { id: "p", type, sources: [], settings, ...(title ? { title } : {}) };
}

describe("canvas components", () => {
  it("turns a dropped stream into the display of its type, never into something that operates", () => {
    expect(["scalar", "block", "bits", "bytes", "frames", "blob"].map(defaultTypeFor))
      .toEqual(["number", "scope", "lamp", "terminal", "trace", undefined]);
    expect(takes("lamp", "bits")).toBe(true);
    expect(takes("number", "bits")).toBe(false);
    expect(takes("button", "scalar")).toBe(false);
  });

  it("lights the bits picked, or every line the stream declares", () => {
    expect(lampBits(panel("lamp"), { width: 4 })).toEqual([0, 1, 2, 3]);
    expect(lampBits(panel("lamp"), { bitLabels: ["K0", "K1"] })).toEqual([0, 1]);
    expect(lampBits(panel("lamp", { bits: [3, 5] }), { width: 16 })).toEqual([3, 5]);
    expect(parseBits("0, 3 5-7")).toEqual([0, 3, 5, 6, 7]);
    expect(parseBits("7-5")).toBeUndefined();
    expect(parseBits("k3")).toBeUndefined();
  });

  it("lets only tools that change the hardware be bound, and a safe-state tool only to a button", () => {
    expect(bindable(setRelay, "switch")).toBe(true);
    expect(bindable(readBit, "switch")).toBe(false);
    expect(bindable(safe, "switch")).toBe(false);
    expect(bindable(safe, "button")).toBe(true);
  });

  it("says why a binding cannot be used instead of doing nothing when clicked", () => {
    expect(bindingProblem(undefined, tools, "switch")).toMatch(/^未绑定/);
    expect(bindingProblem(relay, tools, "switch")).toBeUndefined();
    // The device's short tool name works too.
    expect(bindingProblem({ ...relay, tool: "set_relay" }, tools, "switch")).toBeUndefined();
    // A plugin update renamed the tool, or one of its parameters.
    expect(bindingProblem({ ...relay, tool: "card_relay" }, tools, "switch")).toBe("绑定失效：设备没有动作 card_relay");
    expect(bindingProblem({ ...relay, fixed: { line: 3 } }, tools, "switch"))
      .toBe("绑定失效：动作 card_set_relay 没有参数 line");
    expect(bindingProblem({ ...relay, param: undefined } as unknown as MonitorControl, tools, "switch"))
      .toMatch(/还没选值填进哪个参数/);
    // An offline device reports no tools: that is not the binding's fault.
    expect(bindingProblem(relay, [], "switch")).toBe("设备离线");
    const safeState: MonitorControl = { hardwareId: "CARD", tool: "card_safe_state", widget: "button", fixed: {} };
    expect(bindingProblem(safeState, tools, "button")).toBeUndefined();
  });

  it("reads the binding out of a component's settings", () => {
    expect(controlOf(panel("switch", { control: { hardwareId: "CARD", tool: "t" } })))
      .toEqual({ hardwareId: "CARD", tool: "t", widget: "toggle", fixed: {} });
    expect(controlOf(panel("switch", { control: { tool: "t" } }))).toBeUndefined();
    expect(controlOf(panel("switch"))).toBeUndefined();
  });

  it("sends a switch's bound values, else true / false or 1 / 0 by the parameter's type", () => {
    expect(switchValues(relay, setRelay)).toEqual({ on: true, off: false });
    expect(switchValues({ ...relay, param: "channel" }, setRelay)).toEqual({ on: 1, off: 0 });
    expect(switchValues({ ...relay, on: "CLOSE", off: "OPEN" }, setRelay)).toEqual({ on: "CLOSE", off: "OPEN" });
  });

  it("takes a slider's range from the binding, else from the parameter itself", () => {
    const volts: MonitorControl = {
      hardwareId: "CARD", tool: "card_set_voltage", widget: "slider", param: "volts", fixed: {}
    };
    expect(sliderRange(volts, setVolts)).toEqual({ min: -10, max: 10, step: 0.1 });
    expect(sliderRange({ ...volts, min: 0, max: 5, step: 0.5 }, setVolts)).toEqual({ min: 0, max: 5, step: 0.5 });
    expect(sliderRange({ ...volts, param: "channel" }, setVolts)).toBeUndefined();
    expect(sliderRange({ ...relay, param: "channel" }, setRelay)).toEqual({ min: 0, max: 15, step: 1 });
  });

  it("reads a typed argument by the parameter's type", () => {
    expect(parseParam("3", { type: "integer" })).toBe(3);
    expect(parseParam("3.5", { type: "integer" })).toBeUndefined();
    expect(parseParam("2.5", { type: "number" })).toBe(2.5);
    expect(parseParam("true", { type: "boolean" })).toBe(true);
    expect(parseParam("yes", { type: "boolean" })).toBeUndefined();
    expect(parseParam(" a b ", { type: "string" })).toBe(" a b ");
    expect(parseParam("[1, 2]", {})).toEqual([1, 2]);
  });

  it("copies a bound component to the next channel", () => {
    const k3 = { ...panel("switch", { bit: 3, control: relay }, "继电器 K3"), frame: { x: 2, y: 4, w: 8, h: 2 } };
    const copy = incrementedCopy(k3);
    expect(copy.title).toBe("继电器 K4");
    expect(copy.settings.bit).toBe(4);
    expect((copy.settings.control as MonitorControl).fixed).toEqual({ channel: 4 });
    // A wide component stacks downwards; the original is untouched.
    expect(copy.frame).toEqual({ x: 2, y: 6, w: 8, h: 2 });
    expect(k3.settings.bit).toBe(3);
    expect(relay.fixed).toEqual({ channel: 3 });
    const tall = { ...panel("number", {}, "温度"), frame: { x: 0, y: 0, w: 8, h: 6 } };
    expect(incrementedCopy(tall)).toMatchObject({ title: "温度", frame: { x: 8, y: 0, w: 8, h: 6 } });
  });
});
