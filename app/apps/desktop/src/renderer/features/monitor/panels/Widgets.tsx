import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import type { MonitorControl, MonitorPanel, StreamRef } from "@teststand/contracts/monitor";
import { SettingsIcon } from "lucide-react";
import { cn } from "../../../ui/index.js";
import type { LatestEntry } from "../../variables/use-latest-values.js";
import { formatValue } from "../../variables/variable-model.js";
import { isNumber, isString, PanelFrame, settingOf, streamName, usePanel, type PanelProps } from "../panel-kit.js";
import { streamKey } from "../use-monitor-workspace.js";
import { AddControlDialog, Control } from "./ControlPanel.js";

/** The newest value of every stream the canvas's small widgets show, polled once for all of them. */
export const LatestValuesContext = createContext<ReadonlyMap<string, LatestEntry>>(new Map());

/** Streams whose newest value a widget of this panel shows (its first source). */
export function latestKeys(panels: readonly MonitorPanel[]): string[] {
  return [...new Set(panels.filter((panel) => LATEST_TYPES.has(panel.type) && panel.sources[0])
    .map((panel) => streamKey(panel.sources[0] as StreamRef)))];
}

const LATEST_TYPES = new Set(["number", "lamp", "switch", "slider"]);

function useFirst(panel: MonitorPanel | undefined):
  { value: unknown; entry: LatestEntry | undefined; ref?: StreamRef } {
  const values = useContext(LatestValuesContext);
  const ref = panel?.sources[0];
  const entry = ref ? values.get(streamKey(ref)) : undefined;
  return { value: recordValue(entry?.record), entry, ...(ref ? { ref } : {}) };
}

/** A record's value: `v`, a bits record's `mask`, or for a sample block (`samples`) the mean of its samples. */
export function recordValue(record: { v?: unknown; [key: string]: unknown } | null | undefined): unknown {
  if (!record) return undefined;
  if (record.v !== undefined) return record.v;
  if (typeof record.mask === "number") return record.mask;
  const samples = record.samples;
  if (!Array.isArray(samples) || !samples.length) return undefined;
  const numbers = samples.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : undefined;
}

/** The bit `bit` of a mask, or whether a value is not 0. */
export function lit(value: unknown, bit: number | undefined): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (bit !== undefined) return Math.floor(value / 2 ** bit) % 2 === 1;
  return value !== 0;
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="truncate text-2xs text-fg-3">{children}</span>;
}

/** What a small widget is about: its title, else the name of the stream it shows. */
function useCaption(panel: MonitorPanel | undefined): string {
  const [{ workspace }] = usePanel(panel?.id ?? "");
  if (!panel) return "";
  if (panel.title) return panel.title;
  const info = panel.sources[0] ? workspace.streamsOf(panel)[0] : undefined;
  return info ? streamName(info) : panel.sources[0]?.streamId ?? "";
}

/** A value for large digits: 5 significant figures, or scientific notation below 0.001. */
export function bigDigits(value: number): string {
  if (value !== 0 && Math.abs(value) < 1e-3) return value.toExponential(2);
  return String(Number(value.toPrecision(5)));
}

/** Text that grows and shrinks with the widget (container query units of the widget's body). */
const FIT: CSSProperties = { containerType: "size" };

/** 数值: a value in digits sized to the widget, its unit, and what it is in small type above. */
export function NumberWidget({ api }: PanelProps) {
  const [{ workspace }, panel] = usePanel(api.id);
  const { value, entry, ref } = useFirst(panel);
  const caption = useCaption(panel);
  if (!panel) return null;
  const info = ref ? workspace.streamsOf(panel)[0] : undefined;
  const decimals = settingOf(panel, "decimals", undefined as number | undefined, isNumber);
  const unit = typeof info?.declaration?.unit === "string" ? info.declaration.unit : "";
  const text = typeof value === "number" && decimals !== undefined ? value.toFixed(decimals)
    : typeof value === "number" && !Number.isInteger(value) ? bigDigits(value)
      : formatValue(value, entry?.type ?? "scalar");
  return (
    <PanelFrame panel={panel} className="flex flex-col px-2 py-1">
      <span className="truncate text-2xs leading-4 text-fg-3" title={caption}>{caption || "数值"}</span>
      {ref ? (
        <div style={FIT} className="min-h-0 flex-1">
          <span aria-label={`${caption || ref.streamId} 的值`}
            className={cn("flex h-full items-center justify-end gap-1 truncate font-mono leading-none tabular-nums",
              entry?.record ? "text-fg" : "text-fg-3")}
            style={{ fontSize: "clamp(12px, min(80cqh, 22cqw), 64px)" }}>
            {text}{unit && <span className="text-[0.4em] text-fg-3">{unit}</span>}
          </span>
        </div>
      ) : <span className="flex flex-1 items-center"><Hint>在属性里选信号</Hint></span>}
    </PanelFrame>
  );
}

const LAMP_COLORS: Record<string, string> = {
  pass: "bg-pass shadow-[0_0_6px] shadow-pass/70", fail: "bg-fail shadow-[0_0_6px] shadow-fail/70",
  run: "bg-run shadow-[0_0_6px] shadow-run/70", signal: "bg-signal shadow-[0_0_6px] shadow-signal/70"
};

/** 指示灯: a lamp and its name; on when the value (or one bit of it) is not 0. */
export function LampWidget({ api }: PanelProps) {
  const [, panel] = usePanel(api.id);
  const { value, ref } = useFirst(panel);
  const caption = useCaption(panel);
  if (!panel) return null;
  const bit = settingOf(panel, "bit", undefined as number | undefined, isNumber);
  const on = lit(value, bit);
  const color = settingOf(panel, "color", "pass", isString);
  // Words only when the operator gave them; the lamp itself says on or off.
  const words = on === undefined ? undefined : on ? settingOf(panel, "onText", "", isString)
    : settingOf(panel, "offText", "", isString);
  const state = on === undefined ? "无数据" : on ? "亮" : "灭";
  return (
    <PanelFrame panel={panel} className="flex items-center gap-2 px-2">
      <span role="img" aria-label={`指示灯 ${state}`} title={`${caption}：${state}`}
        className={cn("size-3.5 shrink-0 rounded-full border transition-colors duration-120",
          on ? cn("border-transparent", LAMP_COLORS[color]) : "border-line-strong bg-surface-3",
          on === undefined && "opacity-50")} />
      {ref ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-xs">
          <span className="truncate text-fg" title={caption}>{caption}</span>
          {words && <span className={cn("shrink-0", on ? "font-medium text-fg" : "text-fg-3")}>{words}</span>}
        </span>
      ) : <Hint>在属性里选信号</Hint>}
    </PanelFrame>
  );
}

/** 文字: a heading or a note. */
export function LabelWidget({ api }: PanelProps) {
  const [, panel] = usePanel(api.id);
  if (!panel) return null;
  const size = settingOf(panel, "size", "md", isString);
  const text = settingOf(panel, "text", "", isString);
  return (
    <PanelFrame panel={panel} className="flex items-center bg-transparent px-1.5">
      <span className={cn("truncate text-fg",
        size === "lg" ? "text-lg font-semibold" : size === "sm" ? "text-2xs text-fg-2" : "text-sm font-medium")}>
        {text || <span className="text-fg-3">在属性里写文字</span>}
      </span>
    </PanelFrame>
  );
}

const WANTED = { switch: "toggle", slider: "slider", button: "button" } as const;
const WIDGET_NAMES = { switch: "开关", slider: "滑块", button: "按钮" } as const;

/** 开关 / 滑块 / 按钮: one control calling a device tool, showing the value read back from its first stream. */
export function ControlWidget({ api }: PanelProps) {
  const [{ workspace }, panel] = usePanel(api.id);
  const { value } = useFirst(panel);
  const [setting, setSetting] = useState(false);
  if (!panel) return null;
  const control = panel.settings.control as MonitorControl | undefined;
  const bit = settingOf(panel, "bit", undefined as number | undefined, isNumber);
  const readback = panel.type === "switch" ? lit(value, bit) : value;
  const type = panel.type as keyof typeof WANTED;
  return (
    <PanelFrame panel={panel}>
      {control ? (
        <Control control={panel.title ? { ...control, label: panel.title } : control} readback={readback} />
      ) : (
        <button type="button" onClick={() => setSetting(true)}
          className={cn("flex h-full w-full items-center justify-center gap-1 rounded-sm border border-dashed",
            "border-line-strong px-1 text-2xs text-fg-3 hover:border-signal hover:text-signal")}>
          <SettingsIcon className="size-3 shrink-0" /><span className="truncate">{WIDGET_NAMES[type]}：设置动作</span>
        </button>
      )}
      <AddControlDialog open={setting} widgetWanted={WANTED[type]} onClose={() => setSetting(false)}
        onAdd={(item) => workspace.updatePanel(panel.id, { settings: { ...panel.settings, control: item } })} />
    </PanelFrame>
  );
}
