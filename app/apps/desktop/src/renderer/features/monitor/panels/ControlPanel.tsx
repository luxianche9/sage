import { useEffect, useMemo, useState } from "react";
import { PlusIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import type { ToolCatalogItem } from "@teststand/contracts/devices";
import { CONTROL_WIDGETS, type ControlWidget, type MonitorControl } from "@teststand/contracts/monitor";
import { errorMessage } from "../../../lib/errors.js";
import {
  Button, cn, Dialog, DialogBody, DialogContent, DialogFooter, IconButton, Input, Select, Spinner
} from "../../../ui/index.js";
import { actionKind, actionName } from "../../bench/device-actions.js";
import { SchemaArgumentsForm } from "../../manual/SchemaForm.js";
import { initialSchemaValue, stripSchemaProperties, type JsonSchema } from "../../manual/schema-form-model.js";
import { widgetFor } from "../../manual/widget-model.js";
import { ToolFieldContext } from "../../manual/widgets.js";
import { deviceName } from "../../streams/stream-model.js";
import { useControlRequest } from "../control-requests.js";
import { PanelFrame, useMonitorStatic, usePanel, type PanelProps } from "../panel-kit.js";
import { PanelEmpty } from "./common.js";

function controlsOf(settings: Record<string, unknown>): MonitorControl[] {
  const value = settings.controls;
  return Array.isArray(value) ? value.filter((item): item is MonitorControl =>
    Boolean(item) && typeof item === "object" && typeof (item as MonitorControl).tool === "string") : [];
}

const WIDGET_LABELS: Record<ControlWidget, string> = { button: "按钮", toggle: "开关", slider: "滑块", presets: "预置值" };

function propertiesOf(tool: ToolCatalogItem | undefined): Record<string, JsonSchema> {
  return (tool?.inputSchema.properties ?? {}) as Record<string, JsonSchema>;
}

/** The widget a parameter suits best: a switch for a boolean, a slider for a number, else presets. */
function suggestedWidget(schema: JsonSchema | undefined): ControlWidget {
  if (!schema) return "button";
  if (schema.type === "boolean") return "toggle";
  if (schema.type === "number" || schema.type === "integer") return "slider";
  return "presets";
}

/** "0, 1.65, abc" → [0, 1.65, "abc"]. */
function presetValues(text: string): (string | number)[] {
  return text.split(/[,，\s]+/).filter(Boolean).map((item) => (Number.isFinite(Number(item)) ? Number(item) : item));
}

type Outcome = { ok: boolean; message: string; at: number } | undefined;
const SETTLE_MS = 1500;
/** How long a call's outcome tints the control. */
const FLASH_MS = 900;
/** Keys that step a slider: it calls its tool when they are released. */
const STEP_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

/**
 * One control in the compact host-computer style (WinCC Unified / Ignition): only what the operator needs —
 * a button with its text, a switch with its name, a slider with its name, value and track, preset keys. The
 * device, tool and fixed arguments are in its tooltip and the property panel; a call that fails tints it red
 * and keeps the reason in the tooltip; one that succeeds flashes green.
 */
export function Control({ control, onRemove, readback, framed = false }: {
  control: MonitorControl;
  onRemove?: (() => void) | undefined;
  /** The value read back from the device; shown unless the operator just set one. */
  readback?: unknown;
  /** Drawn as a cell of a control panel (its own outline), not filling a widget of its own. */
  framed?: boolean;
}) {
  const { control: manual } = useMonitorStatic();
  const [own, setOwn] = useState<{ value: unknown; at: number }>();
  const [draft, setDraft] = useState<number>();
  // What the operator set wins for a moment, until the device's own value has had time to follow.
  const value = own && (readback === undefined || Date.now() - own.at < SETTLE_MS) ? own.value : readback;
  const setValue = (next: unknown) => setOwn({ value: next, at: Date.now() });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const [, setTick] = useState(0);
  const tool = manual.findTool(control.hardwareId, control.tool);
  const locked = manual.lockOf(control.hardwareId);
  const schema = control.param ? propertiesOf(tool)[control.param] : undefined;
  const disabled = Boolean(locked) || !tool || busy;
  const run = async (next?: unknown) => {
    setBusy(true);
    try {
      const args = { ...control.fixed, ...(control.param && next !== undefined ? { [control.param]: next } : {}) };
      const result = await manual.call(control.hardwareId, control.tool, args);
      setOutcome({ ok: true, message: JSON.stringify(result.output), at: Date.now() });
    } catch (cause) {
      setOutcome({ ok: false, message: errorMessage(cause), at: Date.now() });
    } finally {
      setBusy(false);
      setTimeout(() => setTick((tick) => tick + 1), FLASH_MS);
    }
  };
  const widget = schema ? widgetFor(control.param ?? "", schema) : undefined;
  const numeric = widget?.kind === "number" ? widget : undefined;
  const kind = tool ? actionKind(tool) : undefined;
  const name = control.label || (tool ? actionName(tool, manual.toolsOf(control.hardwareId)) : control.tool);
  const fixedText = Object.entries(control.fixed).map(([key, item]) => `${key}=${JSON.stringify(item)}`).join(" ");
  const problem = locked ? `${locked}，不能手动控制` : !tool ? `设备离线或没有工具 ${control.tool}` : undefined;
  const failed = outcome && !outcome.ok ? outcome.message : undefined;
  const flash = outcome?.ok && Date.now() - outcome.at < FLASH_MS;
  const tip = [name, `${deviceName(control.hardwareId)} · ${control.tool}${fixedText ? ` · ${fixedText}` : ""}`,
    problem, failed ? `上次失败：${failed}` : outcome?.ok ? `上次结果：${outcome.message}` : undefined]
    .filter(Boolean).join("\n");
  const on = value === true || (typeof value === "number" && value !== 0);
  // An integer parameter (a channel or line number) gets whole steps whatever widget its schema suggests.
  const integer = numeric?.integer ?? schema?.type === "integer";
  const bound = (key: "minimum" | "maximum") => (typeof schema?.[key] === "number" ? schema[key] as number : undefined);
  const min = control.min ?? numeric?.min ?? bound("minimum") ?? 0;
  const max = control.max ?? numeric?.max ?? bound("maximum") ?? 10;
  const step = integer ? Math.max(1, Math.round(numeric?.step ?? 1)) : numeric?.step ?? (max - min) / 200;
  const shown = draft ?? (typeof value === "number" ? value : undefined);
  const unit = numeric?.unit ? ` ${numeric.unit}` : "";
  const digits = integer ? 0 : step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const options = (control.presets ?? []).filter((item): item is string | number =>
    typeof item === "string" || typeof item === "number");

  return (
    <div title={tip} data-control={control.id}
      className={cn("group/control relative flex h-full min-h-0 min-w-0 flex-col justify-center gap-1 px-2 py-1",
        framed && "rounded-sm border border-line bg-surface-1",
        failed && "ring-1 ring-fail ring-inset", flash && "ring-1 ring-pass ring-inset",
        (problem || !tool) && "opacity-55")}>
      {control.widget === "button" && (
        <button type="button" disabled={disabled} onClick={() => void run()} aria-label={name}
          className={cn("relative flex h-full max-h-12 min-h-6 w-full items-center justify-center gap-1.5 rounded-sm",
            "px-2 text-xs font-medium transition-colors duration-120 select-none",
            "disabled:cursor-not-allowed",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal",
            kind?.tone === "signal"
              ? "bg-signal text-signal-fg hover:bg-signal/90 active:bg-signal/80"
              : "border border-line-strong bg-surface-2 text-fg hover:bg-surface-3 active:bg-surface-3/80")}>
          {busy ? <Spinner /> : <span className="truncate">{name}</span>}
        </button>
      )}
      {control.widget === "toggle" && (
        <label className="flex min-w-0 items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-fg">{name}</span>
          {busy && <Spinner />}
          <button type="button" role="switch" aria-checked={on} aria-label={name} disabled={disabled}
            onClick={() => { setValue(!on); void run(!on); }}
            className={cn("relative h-4 w-8 shrink-0 rounded-full border transition-colors duration-120",
              "disabled:cursor-not-allowed",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal",
              on ? "border-pass bg-pass" : "border-line-strong bg-surface-3")}>
            <span className={cn("absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white shadow-sm",
              "transition-[left]",
              "duration-120", on ? "left-[17px]" : "left-[1px]")} />
          </button>
        </label>
      )}
      {control.widget === "slider" && (
        <>
          <div className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg-2">{name}</span>
            {busy && <Spinner />}
            <span className="shrink-0 font-mono text-fg tabular-nums">
              {shown === undefined ? "—" : shown.toFixed(digits)}<span className="text-fg-3">{unit}</span>
            </span>
          </div>
          <input type="range" aria-label={name} disabled={disabled} min={min} max={max} step={step}
            value={shown ?? min} className="tf-hmi-range w-full"
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={() => { if (draft !== undefined) { setValue(draft); void run(draft); setDraft(undefined); } }}
            onKeyUp={(event) => {
              if (draft === undefined || !STEP_KEYS.has(event.key)) return;
              setValue(draft); void run(draft); setDraft(undefined);
            }} />
        </>
      )}
      {control.widget === "presets" && (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-xs text-fg-2">{name}</span>
          <div role="radiogroup" aria-label={name} className="flex min-w-0 gap-0.5">
            {options.map((item) => (
              <button key={String(item)} type="button" role="radio" aria-checked={value === item} disabled={disabled}
                onClick={() => { setValue(item); void run(item); }}
                className={cn("h-6 min-w-0 flex-1 truncate rounded-sm border px-1 font-mono text-2xs",
                  "transition-colors duration-120 disabled:cursor-not-allowed",
                  value === item ? "border-signal bg-signal text-signal-fg"
                    : "border-line bg-surface-2 text-fg hover:bg-surface-3")}>
                {String(item)}
              </button>
            ))}
          </div>
        </div>
      )}
      {(problem || failed) && (
        <span aria-label={problem ?? failed} className="absolute top-1 right-1 size-1.5 rounded-full bg-fail" />
      )}
      {onRemove && (
        <IconButton label={`删除控件 ${name}`} size="icon-xs" variant="ghost"
          className={cn("absolute -top-0.5 -right-0.5 size-4 bg-surface-1 opacity-0 [&_svg]:size-3",
            "group-hover/control:opacity-100 focus-visible:opacity-100")}
          onClick={onRemove}>
          <XIcon />
        </IconButton>
      )}
    </div>
  );
}

/** Picks a device tool, the argument the operator sets, the fixed ones and the widget. */
/** The parameter a widget sets: a boolean for a switch, a number for a slider, none for a button. */
function paramFor(widget: ControlWidget, props: Record<string, JsonSchema>): string | undefined {
  const names = Object.keys(props);
  const typed = (types: string[]) => names.find((name) => types.includes(String(props[name]?.type)));
  if (widget === "button") return undefined;
  if (widget === "toggle") return typed(["boolean"]) ?? typed(["integer"]);
  if (widget === "slider") return typed(["number"]) ?? typed(["integer"]);
  return typed(["number", "integer", "string"]);
}

export function AddControlDialog({ open, widgetWanted, onClose, onAdd }: {
  open: boolean;
  /** The widget asked for (dropped from the component sidebar); otherwise suggested by the tool. */
  widgetWanted: ControlWidget | undefined;
  onClose: () => void;
  onAdd: (control: Omit<MonitorControl, "id">) => void;
}) {
  const { workspace, control: manual } = useMonitorStatic();
  const devices = workspace.devices.filter((device) => manual.toolsOf(device.hardwareId).length);
  const [hardwareId, setHardwareId] = useState<string>();
  const [toolName, setToolName] = useState<string>();
  const [param, setParam] = useState<string>();
  const [widget, setWidget] = useState<ControlWidget>("button");
  const [fixed, setFixed] = useState<Record<string, unknown>>({});
  const [label, setLabel] = useState("");
  const [presets, setPresets] = useState("");
  const device = hardwareId ?? devices[0]?.hardwareId;
  const tools = device ? manual.toolsOf(device) : [];
  const tool = tools.find((item) => item.remoteName === toolName) ?? tools[0];
  const properties = propertiesOf(tool);
  const fixedSchema = useMemo(() => (tool ? stripSchemaProperties(tool.inputSchema, param ? [param] : []) : {}),
    [tool, param]);
  const pickTool = (name: string | undefined) => {
    const next = tools.find((item) => item.remoteName === name) ?? tools[0];
    const props = propertiesOf(next);
    const free = widgetWanted ? paramFor(widgetWanted, props)
      : Object.keys(props).find((item) => ["boolean", "number"].includes(String(props[item]?.type)));
    setToolName(next?.remoteName);
    setParam(free);
    setWidget(widgetWanted && (widgetWanted === "button") === !free ? widgetWanted
      : suggestedWidget(free ? props[free] : undefined));
    const initial = next ? initialSchemaValue(stripSchemaProperties(next.inputSchema, free ? [free] : [])) : {};
    setFixed(initial as Record<string, unknown>);
  };
  useEffect(() => {
    if (open && tool) pickTool(tool.remoteName);
  }, [open, tool?.remoteName, widgetWanted]); // eslint-disable-line react-hooks/exhaustive-deps
  const values = presetValues(presets);
  const add = () => {
    if (!device || !tool) return;
    onAdd({
      hardwareId: device, tool: tool.remoteName, widget, fixed,
      ...(param ? { param } : {}), ...(label.trim() ? { label: label.trim() } : {}),
      ...(values.length ? { presets: values } : {})
    });
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent title="添加控件" size="md">
        <DialogBody className="grid gap-2.5 text-xs">
          <label className="grid gap-1">设备
            <Select aria-label="设备" value={device ?? ""}
              onChange={(event) => { setHardwareId(event.target.value); setToolName(undefined); }}>
              {devices.map((item) => (
                <option key={item.hardwareId} value={item.hardwareId}>{item.label || item.hardwareId}</option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1">工具
            <Select aria-label="工具" value={tool?.remoteName ?? ""} onChange={(event) => pickTool(event.target.value)}>
              {tools.map((item) => (
                <option key={item.remoteName} value={item.remoteName}>
                  {actionName(item, tools)} · {actionKind(item).label}
                </option>
              ))}
            </Select>
          </label>
          {tool?.description && <p className="text-2xs text-fg-3">{tool.description}</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1">由操作员设定的参数
              <Select aria-label="设定的参数" value={param ?? ""} onChange={(event) => {
                const next = event.target.value || undefined;
                setParam(next);
                setWidget(next ? suggestedWidget(properties[next]) : "button");
              }}>
                <option value="">无（按钮）</option>
                {Object.keys(properties).map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </label>
            <label className="grid gap-1">控件
              <Select aria-label="控件类型" value={widget}
                onChange={(event) => setWidget(event.target.value as ControlWidget)}>
                {CONTROL_WIDGETS.filter((item) => (item === "button") === !param).map((item) => (
                  <option key={item} value={item}>{WIDGET_LABELS[item]}</option>
                ))}
              </Select>
            </label>
          </div>
          {(widget === "presets" || widget === "slider") && (
            <label className="grid gap-1">预置值（逗号分隔）
              <Input aria-label="预置值" value={presets} placeholder="0, 1.65, 3.3"
                onChange={(event) => setPresets(event.target.value)} />
            </label>
          )}
          <label className="grid gap-1">名称
            <Input aria-label="控件名称" value={label} placeholder={tool ? actionName(tool, tools) : ""}
              onChange={(event) => setLabel(event.target.value)} />
          </label>
          {tool && Object.keys((fixedSchema.properties ?? {}) as object).length > 0 && (
            <fieldset className="grid gap-2 rounded-sm border border-line p-2">
              <legend className="px-1 text-2xs text-fg-3">固定参数</legend>
              <ToolFieldContext.Provider value={{ ...(device ? { hardwareId: device } : {}), tool: tool.remoteName }}>
                <SchemaArgumentsForm schema={fixedSchema} value={fixed} onChange={setFixed} />
              </ToolFieldContext.Provider>
            </fieldset>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!device || !tool || (widget === "presets" && !values.length)}
            onClick={add}>
            添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The operator's own front panel (CANoe Panel Designer, FUXA): a dense grid of buttons, switches, sliders
 * and preset keys bound to device tools with some arguments fixed, e.g. "AO0 = slider" or "K5 closed / open".
 * Disabled for a device a test run holds. The Agent can build it too.
 */
export function ControlPanel({ api }: PanelProps) {
  const [{ workspace, control }, panel] = usePanel(api.id);
  const [adding, setAdding] = useState(false);
  const [requested, requestDone] = useControlRequest(api.id);
  if (!panel) return null;
  const controls = controlsOf(panel.settings);
  return (
    <PanelFrame panel={panel} className="flex flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {!controls.length ? (
          <PanelEmpty icon={<SlidersHorizontalIcon />} text="添加按钮、开关或滑块">
            <Button size="xs" variant="outline" onClick={() => setAdding(true)}><PlusIcon />添加控件</Button>
          </PanelEmpty>
        ) : (
          <div className="grid auto-rows-[40px] gap-1"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))" }}>
            {controls.map((item) => (
              <div key={item.id} className={item.widget === "slider" || item.widget === "presets" ? "col-span-2" : ""}>
                <Control control={item} framed onRemove={() => workspace.removeControl(panel.id, item.id)} />
              </div>
            ))}
            <button type="button" onClick={() => setAdding(true)}
              className={cn("flex items-center justify-center gap-1 rounded-sm border border-dashed border-line",
                "text-2xs text-fg-3 hover:border-signal hover:text-signal")}>
              <PlusIcon className="size-3" />添加
            </button>
          </div>
        )}
      </div>
      {control.running && (
        <p className="shrink-0 truncate border-t border-line px-2 py-0.5 text-2xs text-fail">测试运行中：运行占用的设备不能手动控制</p>
      )}
      {control.history.length > 0 && (
        <details className="shrink-0 border-t border-line bg-surface-1 text-2xs">
          <summary className="cursor-pointer px-2 py-0.5 text-fg-3">操作记录 {control.history.length}</summary>
          <ol className="max-h-24 overflow-auto px-2 pb-1 font-mono">
            {control.history.map((call) => (
              <li key={call.id} className={cn("truncate", call.ok ? "text-fg-2" : "text-fail")} title={call.message}>
                {new Date(call.at).toLocaleTimeString()} {deviceName(call.hardwareId)}.{call.tool}
                {" "}{JSON.stringify(call.args)} → {call.message}
              </li>
            ))}
          </ol>
        </details>
      )}
      <AddControlDialog open={adding || requested !== undefined} widgetWanted={requested}
        onClose={() => { setAdding(false); requestDone(); }}
        onAdd={(item) => workspace.addControl(panel.id, item)} />
    </PanelFrame>
  );
}
