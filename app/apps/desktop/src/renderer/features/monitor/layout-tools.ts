import {
  monitorSchema, placedPanels, type Frame, type Monitor, type MonitorPanel, type StreamRef
} from "@sage/contracts/monitor";
import type { StreamDeclaration } from "@sage/contracts/observability";

/** A stream as the layout generator sees it. */
export interface LayoutStream extends StreamRef {
  type: string;
  declaration?: StreamDeclaration | undefined;
}

type NewPanel = Omit<MonitorPanel, "settings" | "frame"> & { settings: Record<string, unknown>; frame: Frame };

/**
 * A layout made from the data: measured analog streams on one waveform, every scalar in a values table, the
 * lines of every bits stream as lamps, a terminal per serial port and a frame table per bus — each in the
 * first free spot of the canvas. Only displays: what operates the hardware is bound by hand.
 */
export function generatedLayout(streams: readonly LayoutStream[]): NewPanel[] {
  const ref = ({ hardwareId, streamId }: LayoutStream): StreamRef => ({ hardwareId, streamId });
  const of = (test: (stream: LayoutStream) => boolean) => streams.filter(test);
  const analog = of((item) => item.type === "block" || item.type === "scalar");
  const measured = analog.filter((item) => item.declaration?.kind !== "setpoint");
  const name = (item: LayoutStream) => item.declaration?.label || item.streamId;
  const panels: Omit<NewPanel, "frame">[] = [
    { id: "scope", type: "scope", title: "波形", sources: measured.map(ref), settings: {} },
    { id: "values", type: "values", title: "数值表", sources: analog.map(ref), settings: {} },
    ...of((item) => item.type === "bits").map((item, index): Omit<NewPanel, "frame"> => ({
      id: `lamp-${index + 1}`, type: "lamp", title: name(item), sources: [ref(item)], settings: {}
    })),
    ...of((item) => item.type === "bytes").map((item, index): Omit<NewPanel, "frame"> => ({
      id: `terminal-${index + 1}`, type: "terminal", title: name(item), sources: [ref(item)], settings: {}
    })),
    ...of((item) => item.type === "frames").map((item, index): Omit<NewPanel, "frame"> => ({
      id: `trace-${index + 1}`, type: "trace", title: name(item), sources: [ref(item)], settings: {}
    }))
  ];
  return placedPanels(panels.filter((panel) => panel.sources.length));
}

/** A saved arrangement of the canvas, kept on this computer and usable in any project. */
export interface LayoutPreset {
  name: string;
  savedAt: string;
  monitor: Monitor;
}

const PRESETS_KEY = "sage.monitor.presets";

export function readPresets(): LayoutPreset[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(PRESETS_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const { name, savedAt, monitor } = item as Record<string, unknown>;
      const parsed = monitorSchema.safeParse(monitor);
      return typeof name === "string" && parsed.success
        ? [{ name, savedAt: typeof savedAt === "string" ? savedAt : "", monitor: parsed.data }] : [];
    });
  } catch {
    return [];
  }
}

function writePresets(presets: readonly LayoutPreset[]): void {
  try { globalThis.localStorage?.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { /* not kept */ }
}

/** Saves (or replaces by name) a preset. */
export function savePreset(name: string, monitor: Monitor, now = new Date()): LayoutPreset[] {
  const next = [...readPresets().filter((item) => item.name !== name), { name, savedAt: now.toISOString(), monitor }];
  writePresets(next);
  return next;
}

export function deletePreset(name: string): LayoutPreset[] {
  const next = readPresets().filter((item) => item.name !== name);
  writePresets(next);
  return next;
}

/** The file a workspace is exported as. */
export function exportText(monitor: Monitor): string {
  return JSON.stringify({ kind: "sage.monitor", formatVersion: 1, monitor }, null, 2);
}

/** A workspace from an exported file, or why it is not one. */
export function importText(text: string): Monitor | string {
  try {
    const value = JSON.parse(text) as { kind?: unknown; monitor?: unknown };
    if (value.kind !== "sage.monitor") return "不是 SAGE 上位机画布的布局文件";
    const parsed = monitorSchema.safeParse(value.monitor);
    return parsed.success ? parsed.data : `布局文件内容不正确：${parsed.error.issues[0]?.message ?? ""}`;
  } catch (cause) {
    return `无法读取布局文件：${cause instanceof Error ? cause.message : String(cause)}`;
  }
}
