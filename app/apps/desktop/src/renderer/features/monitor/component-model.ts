import type { ToolCatalogItem } from "@sage/contracts/devices";
import {
  PANEL_SIZES, PANEL_SOURCE_TYPES, PANEL_WIDGETS, type Frame, type MonitorControl, type MonitorPanel,
  type PanelType
} from "@sage/contracts/monitor";
import type { StreamDeclaration } from "@sage/contracts/observability";

/** The components of the canvas as the library lists them (docs/decisions 0008). */
export const COMPONENT_GROUPS: readonly { title: string; types: readonly PanelType[] }[] = [
  { title: "显示", types: ["scope", "number", "values", "lamp", "terminal", "trace"] },
  { title: "操作", types: ["button", "switch", "slider", "select"] },
  { title: "测试与版面", types: ["results", "label", "group"] }
];

export const PANEL_LABELS: Readonly<Record<PanelType, string>> = {
  scope: "波形",
  number: "数值",
  values: "数值表",
  lamp: "指示灯",
  terminal: "终端",
  trace: "报文表",
  button: "按钮",
  switch: "开关",
  slider: "滑块",
  select: "选择",
  results: "结果表",
  label: "文字",
  group: "分组框"
};

export const PANEL_HINTS: Readonly<Record<PanelType, string>> = {
  scope: "多条曲线随时间变化；开关量画成高低电平",
  number: "一个数加单位：数字、条形或表盘，超限变红",
  values: "很多信号排成表：当前值、最小、最大、平均",
  lamp: "一位一个灯；数值到了阈值也能点灯",
  terminal: "串口或总线的原始数据，文本或十六进制",
  trace: "一帧一行，点一行看每个字节",
  button: "点一下执行一个动作",
  switch: "两个状态，显示设备读回的状态",
  slider: "调一个数值参数，松手才发送",
  select: "从几个预设值里挑一个",
  results: "本次运行每一项判定的结果",
  label: "标题或说明文字",
  group: "把相关组件框在一起"
};

export function panelTitle(panel: Pick<MonitorPanel, "type" | "title">): string {
  return panel.title || PANEL_LABELS[panel.type];
}

/** Components that show one stream: a new one replaces it. */
export const SINGLE_SOURCE: ReadonlySet<PanelType> = new Set([
  "number", "terminal", "trace", "switch", "slider", "select"
]);

/** Whether a component of `type` draws a stream of `streamType`. */
export function takes(type: PanelType, streamType: string | undefined): boolean {
  const types = PANEL_SOURCE_TYPES[type];
  return types.length > 0 && (!streamType || types.includes(streamType));
}

/**
 * The display a stream dropped on the canvas becomes. Only displays: a component that operates the hardware
 * is bound by hand (docs/decisions 0007).
 */
export function defaultTypeFor(streamType: string): PanelType | undefined {
  if (streamType === "scalar") return "number";
  if (streamType === "block") return "scope";
  if (streamType === "bits") return "lamp";
  if (streamType === "bytes") return "terminal";
  if (streamType === "frames") return "trace";
  return undefined;
}

// --- settings ---------------------------------------------------------------------------------------------

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function numberSetting(panel: MonitorPanel, key: string): number | undefined {
  const value = panel.settings[key];
  return isNumber(value) ? value : undefined;
}

export function textSetting<T extends string>(panel: MonitorPanel, key: string, allowed: readonly T[], fallback: T): T {
  const value = panel.settings[key];
  return allowed.includes(value as T) ? value as T : fallback;
}

/** The lamps of a bits stream: the bits picked in the settings, else every line it declares. */
export function lampBits(panel: MonitorPanel, declaration: StreamDeclaration | undefined): number[] {
  const picked = panel.settings.bits;
  if (Array.isArray(picked)) {
    const bits = picked.filter((bit): bit is number => Number.isInteger(bit) && bit >= 0 && bit < 53);
    if (bits.length) return bits;
  }
  const width = declaration?.width ?? declaration?.bitLabels?.length ?? 8;
  return Array.from({ length: Math.max(1, Math.min(53, width)) }, (_, bit) => bit);
}

/** `"0, 3, 5-7"` → `[0, 3, 5, 6, 7]`; undefined when the text names no bit. */
export function parseBits(text: string): number[] | undefined {
  const bits = new Set<number>();
  for (const part of text.split(/[,，\s]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) return undefined;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (to < from || to >= 53) return undefined;
    for (let bit = from; bit <= to; bit += 1) bits.add(bit);
  }
  return bits.size ? [...bits].sort((a, b) => a - b) : undefined;
}

// --- binding ----------------------------------------------------------------------------------------------

type Schema = Record<string, unknown>;

function schemaOf(value: unknown): Schema {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Schema : {};
}

/** The parameters a tool takes, with their schemas, in declaration order. */
export function toolParams(tool: ToolCatalogItem | undefined): { name: string; schema: Schema; required: boolean }[] {
  const properties = schemaOf(tool?.inputSchema.properties);
  const required = Array.isArray(tool?.inputSchema.required) ? tool.inputSchema.required as unknown[] : [];
  return Object.entries(properties)
    .filter(([name]) => name !== "hardwareId")
    .map(([name, schema]) => ({ name, schema: schemaOf(schema), required: required.includes(name) }));
}

export function paramKind(schema: Schema): "boolean" | "integer" | "number" | "string" | "other" {
  const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type;
  return type === "boolean" || type === "integer" || type === "number" || type === "string" ? type : "other";
}

/** Whether an operating component may call the tool: it must change something, and only a button may call
 *  a device's safe-state tool. */
export function bindable(tool: ToolCatalogItem, type: PanelType): boolean {
  const kind = tool.contractMetadata?.operationSemantics?.kind;
  return kind === "actuate" || kind === "configure" || (type === "button" && kind === "safe");
}

/** The binding stored in a component's settings, when it is one. */
export function controlOf(panel: MonitorPanel): MonitorControl | undefined {
  const value = panel.settings.control;
  if (!value || typeof value !== "object") return undefined;
  const control = value as Partial<MonitorControl>;
  if (typeof control.hardwareId !== "string" || typeof control.tool !== "string") return undefined;
  const widget = control.widget ?? PANEL_WIDGETS[panel.type] ?? "button";
  return { ...control, fixed: schemaOf(control.fixed), widget } as MonitorControl;
}

/** The tool a binding names among the device's tools: by its full name, or without the device's prefix. */
export function boundTool(control: MonitorControl, tools: readonly ToolCatalogItem[]): ToolCatalogItem | undefined {
  return tools.find((tool) => tool.remoteName === control.tool)
    ?? tools.find((tool) => tool.remoteName.replace(/^[a-z0-9]+_/, "") === control.tool);
}

/**
 * Why a binding cannot be used, or undefined when it can. A binding is kept by name, so a plugin update that
 * renames a tool or a parameter breaks it; the component must say so instead of doing nothing when clicked.
 * `tools` is empty while the device is offline or was never connected: that is not the binding's fault.
 */
export function bindingProblem(control: MonitorControl | undefined, tools: readonly ToolCatalogItem[],
  type: PanelType): string | undefined {
  if (!control) return "未绑定：在属性里选设备和动作";
  if (!tools.length) return "设备离线";
  const tool = boundTool(control, tools);
  if (!tool) return `绑定失效：设备没有动作 ${control.tool}`;
  const names = new Set(toolParams(tool).map((item) => item.name));
  const used = [...Object.keys(control.fixed), ...(control.param ? [control.param] : [])];
  const missing = used.filter((name) => !names.has(name));
  if (missing.length) return `绑定失效：动作 ${control.tool} 没有参数 ${missing.join("、")}`;
  if (type !== "button" && !control.param) return "未绑定：还没选值填进哪个参数";
  if (type === "select" && !control.presets?.length) return "未绑定：还没填预设值";
  return undefined;
}

/** What a switch sends for each state: the bound values, else true / false (1 / 0 for a numeric parameter). */
export function switchValues(control: MonitorControl, tool: ToolCatalogItem | undefined):
  { on: unknown; off: unknown } {
  const schema = toolParams(tool).find((item) => item.name === control.param)?.schema ?? {};
  const numeric = paramKind(schema) === "integer" || paramKind(schema) === "number";
  return { on: control.on ?? (numeric ? 1 : true), off: control.off ?? (numeric ? 0 : false) };
}

/** A slider's range: the binding's, else the parameter's own minimum and maximum. */
export function sliderRange(control: MonitorControl, tool: ToolCatalogItem | undefined):
  { min: number; max: number; step: number } | undefined {
  const schema = toolParams(tool).find((item) => item.name === control.param)?.schema ?? {};
  const min = control.min ?? (isNumber(schema.minimum) ? schema.minimum : undefined);
  const max = control.max ?? (isNumber(schema.maximum) ? schema.maximum : undefined);
  if (min === undefined || max === undefined || max <= min) return undefined;
  const whole = paramKind(schema) === "integer";
  const step = control.step ?? (whole ? 1 : niceStep((max - min) / 200));
  return { min, max, step };
}

/** The power of ten (times 1, 2 or 5) at or below `value`. */
function niceStep(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const lead = value / power;
  return (lead >= 5 ? 5 : lead >= 2 ? 2 : 1) * power;
}

/** A parameter's value from what the operator typed, by the parameter's type; undefined when it does not fit. */
export function parseParam(text: string, schema: Schema): unknown {
  const kind = paramKind(schema);
  const trimmed = text.trim();
  if (kind === "boolean") return trimmed === "true" ? true : trimmed === "false" ? false : undefined;
  if (kind === "integer" || kind === "number") {
    if (!trimmed) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) && (kind === "number" || Number.isInteger(value)) ? value : undefined;
  }
  if (kind === "string") return text;
  try { return JSON.parse(trimmed) as unknown; } catch { return trimmed || undefined; }
}

export function paramText(value: unknown): string {
  return value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);
}

// --- copy and increment -------------------------------------------------------------------------------------

function bumpTrailingNumber(text: string): string {
  const match = /^(.*?)(\d+)(\D*)$/.exec(text);
  return match ? `${match[1]}${Number(match[2]) + 1}${match[3]}` : text;
}

/**
 * 复制并递增: the next component of a row of alike ones — a card's relays K0, K1, K2 … bound once and copied.
 * The copy sits beside the original; its bit, its first whole-number fixed argument (the channel) and the
 * number its title ends in are each one higher.
 */
export function incrementedCopy(panel: MonitorPanel & { frame: Frame }): {
  type: PanelType; title?: string; sources: MonitorPanel["sources"]; settings: Record<string, unknown>; frame: Frame;
} {
  const settings: Record<string, unknown> = { ...panel.settings };
  if (Number.isInteger(settings.bit)) settings.bit = (settings.bit as number) + 1;
  const control = controlOf(panel);
  if (control) {
    const fixed = { ...control.fixed };
    const channel = Object.keys(fixed).find((name) => Number.isInteger(fixed[name]));
    if (channel) fixed[channel] = (fixed[channel] as number) + 1;
    settings.control = { ...control, fixed, ...(control.label ? { label: bumpTrailingNumber(control.label) } : {}) };
  }
  const wide = panel.frame.w >= panel.frame.h * 2;
  const frame = wide
    ? { ...panel.frame, y: panel.frame.y + panel.frame.h }
    : { ...panel.frame, x: panel.frame.x + panel.frame.w };
  return {
    type: panel.type,
    sources: panel.sources,
    settings,
    frame,
    ...(panel.title ? { title: bumpTrailingNumber(panel.title) } : {})
  };
}

/** The frame a component dropped at `point` (cells) gets. */
export function frameAt(type: PanelType, point: { x: number; y: number }): Frame {
  return { ...point, w: PANEL_SIZES[type][0], h: PANEL_SIZES[type][1] };
}
