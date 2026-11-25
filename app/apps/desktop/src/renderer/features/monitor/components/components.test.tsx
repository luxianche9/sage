// @vitest-environment jsdom

import type { ReactNode } from "react";
import type { ToolCatalogItem } from "@sage/contracts/devices";
import type { MonitorPanel, PanelType, StreamRef } from "@sage/contracts/monitor";
import type { LiveFrame, StreamInfo, StreamPoint } from "@sage/contracts/observability";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { takes } from "../component-model.js";
import type { MonitorTime } from "../monitor-time.js";
import { MonitorContext, MonitorTimeContext, type MonitorStaticContextValue } from "../panel-kit.js";
import { Properties } from "../Properties.js";
import type { ManualControl } from "../use-manual-control.js";
import type { MonitorWorkspace } from "../use-monitor-workspace.js";
import { COMPONENTS } from "./index.js";

function tool(remoteName: string, kind: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    remoteName, externalName: `x_${remoteName}`, deviceId: "CARD", kind: "hardware", description: "",
    inputSchema: { type: "object", properties: { hardwareId: { type: "string" }, ...properties }, required },
    contractMetadata: { operationSemantics: { kind } }
  } as unknown as ToolCatalogItem;
}

const TOOLS = [
  tool("card_set_relay", "actuate",
    { channel: { type: "integer", minimum: 0, maximum: 15 }, closed: { type: "boolean" } }, ["channel", "closed"]),
  tool("card_read_bit", "read", { channel: { type: "integer" } })
];

const DECLARED: Record<string, { type: string; declaration?: StreamInfo["declaration"] }> = {
  relay: { type: "bits", declaration: { bitLabels: ["K0", "K1", "K2", "K3"] } },
  ai0: { type: "scalar", declaration: { unit: "V", label: "电源电压" } }
};

function info(ref: StreamRef): StreamInfo {
  return {
    key: `${ref.hardwareId}__${ref.streamId}`, hardwareId: ref.hardwareId, streamId: ref.streamId,
    type: DECLARED[ref.streamId]?.type ?? "scalar", clock: null, count: 0, first: null, last: null, lastI: null,
    watermark: null, watermarkTb: null, gaps: 0, states: [],
    ...(DECLARED[ref.streamId]?.declaration ? { declaration: DECLARED[ref.streamId]!.declaration } : {})
  } as StreamInfo;
}

const call = vi.fn();
const updatePanel = vi.fn();
const show = vi.fn();
let points: Record<string, StreamPoint[]>;
let tools: ToolCatalogItem[];
let locked: string | undefined;

/** A live source that delivers the latest points of every stream asked for, once, on subscribing. */
function live(query: { keys: string[] }, onFrame: (frame: LiveFrame) => void) {
  const now = Date.now();
  onFrame({
    t: now, colMs: 10,
    streams: Object.fromEntries(query.keys.filter((key) => points[key]).map((key) => [key, {
      key, type: key.endsWith("relay") ? "bits" : "scalar", t0: now - 1000, t1: now, colMs: 10,
      watermarkTb: now, lastI: null, gaps: [], state: { tb: now, state: "live" }, points: points[key]!, reset: true
    }]))
  } as unknown as LiveFrame);
  return () => undefined;
}

const workspace = {
  monitor: { panels: [] },
  devices: [{
    hardwareId: "CARD", label: "继电器卡", known: true,
    streams: [{ id: "relay", type: "bits" }, { id: "ai0", type: "scalar", label: "电源电压" }]
  }],
  streamsOf: (panel: MonitorPanel) => panel.sources.map(info).filter((item) => takes(panel.type, String(item.type))),
  typeOf: (ref: StreamRef) => DECLARED[ref.streamId]?.type,
  updatePanel, show, removeFrom: vi.fn(), removePanel: vi.fn(), duplicate: vi.fn()
} as unknown as MonitorWorkspace;

function control(): ManualControl {
  return {
    tools, running: false, history: [], safeAll: vi.fn(), findTool: vi.fn(),
    toolsOf: (hardwareId: string) => (hardwareId === "CARD" ? tools : []),
    lockOf: () => locked,
    call
  } as unknown as ManualControl;
}

const time = {
  follow: true, canRun: true, divMs: 1000, spanMs: 10_000, from: undefined, range: undefined, marker: undefined
} as unknown as MonitorTime;

function Canvas({ children, readOnly = false }: { children: ReactNode; readOnly?: boolean }) {
  const value = {
    workspace, source: { live }, bench: { mode: readOnly ? "replay" : "live", view: {}, runId: undefined }, rows: [],
    pick: vi.fn(), zoomStep: vi.fn(), notify: { error: vi.fn(), success: vi.fn() }, control: control(), readOnly
  } as unknown as MonitorStaticContextValue;
  return (
    <MonitorTimeContext.Provider value={time}>
      <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>
    </MonitorTimeContext.Provider>
  );
}

function panel(type: PanelType, sources: string[], settings: Record<string, unknown> = {}, title?: string):
  MonitorPanel {
  return {
    id: "p", type, settings, sources: sources.map((streamId) => ({ hardwareId: "CARD", streamId })),
    ...(title ? { title } : {})
  };
}

function show13(item: MonitorPanel, readOnly = false) {
  const Component = COMPONENTS[item.type];
  return render(<Canvas readOnly={readOnly}><Component panel={item} /></Canvas>);
}

const RELAY = { hardwareId: "CARD", tool: "card_set_relay", widget: "toggle", param: "closed", fixed: { channel: 3 } };
const now = () => Date.now();

beforeEach(() => {
  points = {};
  tools = TOOLS;
  locked = undefined;
  call.mockResolvedValue({ output: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("canvas components", () => {
  it("shows the state a switch reads back, and sends the other one when clicked", async () => {
    points.CARD__relay = [{ t: now(), tb: now(), mask: 0b1000 }];
    show13(panel("switch", ["relay"], { bit: 3, control: RELAY }, "K3"));
    const knob = await screen.findByRole("switch", { name: "K3" });
    await waitFor(() => expect(knob.getAttribute("aria-checked")).toBe("true"));
    await userEvent.click(knob);
    expect(call).toHaveBeenCalledWith("CARD", "card_set_relay", { channel: 3, closed: false });
    // The knob still shows what the device reports: nothing new was read back.
    expect(knob.getAttribute("aria-checked")).toBe("true");
  });

  it("shows a switch with no data as unknown, and one with nothing to read back as a setpoint", async () => {
    show13(panel("switch", ["relay"], { bit: 3, control: RELAY }, "K3"));
    const knob = await screen.findByRole("switch", { name: "K3" });
    expect(knob.getAttribute("aria-checked")).toBe("mixed");
    expect(screen.getByText("还没有数据")).toBeTruthy();
    cleanup();
    show13(panel("switch", [], { control: RELAY }, "K3"));
    expect(screen.getByText("设定值，没有读回")).toBeTruthy();
    await userEvent.click(screen.getByRole("switch", { name: "K3" }));
    expect(call).toHaveBeenCalledWith("CARD", "card_set_relay", { channel: 3, closed: true });
    await waitFor(() => expect(screen.getByRole("switch", { name: "K3" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("refuses to operate in a replay, while a test holds the device, or with a broken binding", () => {
    show13(panel("switch", ["relay"], { control: RELAY }, "K3"), true);
    expect((screen.getByRole("switch", { name: "K3" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("回放中不能操作")).toBeTruthy();
    cleanup();
    locked = "测试运行中";
    show13(panel("switch", ["relay"], { control: RELAY }, "K3"));
    expect((screen.getByRole("switch", { name: "K3" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("测试运行中，结束后才能手动操作")).toBeTruthy();
    cleanup();
    locked = undefined;
    // A plugin update renamed the tool: the component says so, in red.
    tools = [tool("card_relay_write", "actuate", { channel: { type: "integer" }, closed: { type: "boolean" } })];
    show13(panel("button", [], { control: { ...RELAY, widget: "button" } }, "吸合"));
    expect(screen.getByRole("alert").textContent).toBe("绑定失效：设备没有动作 card_set_relay");
    expect((screen.getByRole("button", { name: "吸合" }) as HTMLButtonElement).disabled).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it("shows a value with its unit, and says so when there is none yet", async () => {
    points.CARD__ai0 = [{ t: now(), tb: now(), v: 12.5 }];
    show13(panel("number", ["ai0"], { lo: 0, hi: 10, decimals: 2 }));
    const value = await screen.findByText("12.50");
    expect(value.className).toContain("text-fail");
    expect(screen.getByText("电源电压")).toBeTruthy();
    expect(screen.getByText("V")).toBeTruthy();
    cleanup();
    points = {};
    show13(panel("number", ["ai0"]));
    expect(await screen.findByText("—")).toBeTruthy();
    expect(screen.getByText("还没有数据")).toBeTruthy();
    cleanup();
    // A bar needs a range: without one it says so instead of drawing a made-up scale.
    show13(panel("number", ["ai0"], { display: "bar" }));
    expect(screen.getByText("在属性里设置量程")).toBeTruthy();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("lights one lamp per line of a bits stream, by the plugin's names", async () => {
    points.CARD__relay = [{ t: now(), tb: now(), mask: 0b0101 }];
    show13(panel("lamp", ["relay"]));
    expect(await screen.findByLabelText("K0 亮")).toBeTruthy();
    expect(screen.getByLabelText("K1 灭")).toBeTruthy();
    expect(screen.getByLabelText("K2 亮")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    cleanup();
    show13(panel("lamp", ["relay"], { bits: [3] }));
    expect(await screen.findByLabelText("K3 灭")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("binding a component by hand", () => {
  it("lists the device's own tools and parameters, and applies the binding once it is complete", async () => {
    const item = panel("switch", ["relay"], {}, "K3");
    render(<Properties panel={item} workspace={workspace} control={control()} onRemoved={vi.fn()} />);
    const apply = screen.getByRole("button", { name: "应用绑定" }) as HTMLButtonElement;
    expect(screen.getByRole("status").textContent).toBe("还差：选设备");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "设备" }), "CARD");
    const action = screen.getByRole("combobox", { name: "动作" });
    // Only tools that change the hardware are offered; a read is not.
    expect(within(action).queryByRole("option", { name: "read_bit" })).toBeNull();
    await userEvent.selectOptions(action, "card_set_relay");
    expect(screen.getByRole("status").textContent).toBe("还差：选值填进哪个参数");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "值填进哪个参数" }), "closed");
    expect(screen.getByRole("status").textContent).toBe("还差：参数 channel 的值不对");
    expect(apply.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "固定参数 channel" }), { target: { value: "3" } });
    expect(screen.getByRole("status").textContent).toBe("有没应用的修改");
    await userEvent.click(apply);
    expect(updatePanel).toHaveBeenCalledWith("p", {
      settings: { control: RELAY }
    });
  });

  it("offers the streams the component can read back, and its bit", async () => {
    const item = panel("switch", [], { control: RELAY }, "K3");
    render(<Properties panel={item} workspace={workspace} control={control()} onRemoved={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("已绑定");
    const streams = screen.getByRole("combobox", { name: "选择数据流" });
    expect(within(streams).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "添加数据流…", "继电器卡 / relay", "继电器卡 / 电源电压（ai0）"
    ]);
    await userEvent.selectOptions(streams, "0");
    expect(show).toHaveBeenCalledWith(item, { hardwareId: "CARD", streamId: "relay" });
  });
});
