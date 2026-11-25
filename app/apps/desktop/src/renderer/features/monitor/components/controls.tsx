import { useState, type ReactNode } from "react";
import { cn, Select, Spinner, useConfirm } from "../../../ui/index.js";
import { formatNumber, hasBit } from "../../streams/stream-model.js";
import { numberSetting, panelTitle, sliderRange, switchValues } from "../component-model.js";
import { staleTitle, unitOf, useBinding, useReadings, type ComponentProps } from "../panel-kit.js";

type Binding = ReturnType<typeof useBinding>;

/** The name on an operating component: its title, else the binding's label, else the tool it calls. */
function nameOf({ panel }: ComponentProps, binding: Binding): string {
  return panel.title || binding.control?.label || binding.control?.tool || panelTitle(panel);
}

/**
 * The frame every operating component shares: its name, the control, and under it why it cannot be used —
 * in red when the binding itself is wrong, quietly when it only cannot be used now.
 */
function Operating({ name, binding, note, children }: {
  name: string;
  binding: Binding;
  /** Said under the control when nothing blocks it (e.g. 设定值: there is nothing to read back). */
  note?: string | undefined;
  children: ReactNode;
}) {
  const reason = binding.blocked ?? note;
  return (
    <div title={reason} className="flex h-full min-h-0 flex-col justify-center gap-0.5 px-2.5 py-1">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-fg">{name}</span>
        {children}
      </div>
      {reason && (
        <span role={binding.broken ? "alert" : undefined}
          className={cn("truncate text-2xs", binding.broken ? "text-fail" : "text-fg-3")}>{reason}</span>
      )}
    </div>
  );
}

/** 按钮: one call of the bound tool with its fixed arguments; asks first when its settings say so. */
export function ButtonComponent({ panel }: ComponentProps) {
  const binding = useBinding(panel);
  const [confirm, confirmDialog] = useConfirm();
  const name = nameOf({ panel }, binding);
  const press = async () => {
    if (panel.settings.confirm === true && !await confirm({
      title: name, message: `执行 ${binding.control?.tool ?? ""}？`, confirmLabel: "执行"
    })) return;
    await binding.call();
  };
  return (
    <div title={binding.blocked} className="flex h-full min-h-0 flex-col justify-center gap-0.5 p-1">
      <button type="button" disabled={Boolean(binding.blocked) || binding.busy} onClick={() => void press()}
        className={cn("flex min-h-0 w-full flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm",
          "border-line-strong bg-surface-2 text-fg transition-colors duration-120 hover:bg-surface-3",
          "active:bg-signal/20 disabled:pointer-events-none disabled:opacity-50")}>
        {binding.busy && <Spinner />}
        <span className="truncate">{name}</span>
      </button>
      {binding.blocked && (
        <span role={binding.broken ? "alert" : undefined}
          className={cn("truncate px-1 text-center text-2xs", binding.broken ? "text-fail" : "text-fg-3")}>
          {binding.blocked}
        </span>
      )}
      {confirmDialog}
    </div>
  );
}

/**
 * 开关: sends the bound tool the "on" or "off" value and shows the state the device reads back — a bit of a
 * bits stream, or a value that is not 0. The knob moves when the hardware reports it, not when it is clicked.
 */
export function SwitchComponent({ panel }: ComponentProps) {
  const binding = useBinding(panel);
  const { readings } = useReadings(panel, 60);
  const reading = readings[0];
  const bit = numberSetting(panel, "bit") ?? 0;
  const values = binding.control ? switchValues(binding.control, binding.tool) : undefined;
  const readback = !reading ? undefined
    : reading.stream.type === "bits" ? (reading.mask === undefined ? undefined : hasBit(reading.mask, bit))
      : reading.value === undefined ? undefined : reading.value >= 0.5;
  // With nothing to read back, the last value sent is all there is: it is labelled as such.
  const state = reading ? readback : binding.sent === undefined ? undefined : binding.sent === values?.on;
  const stale = reading ? staleTitle(reading) : undefined;
  const name = nameOf({ panel }, binding);
  return (
    <Operating name={name} binding={binding} note={reading ? stale : "设定值，没有读回"}>
      {binding.busy && <Spinner />}
      <button type="button" role="switch" aria-checked={state === undefined ? "mixed" : state} aria-label={name}
        disabled={Boolean(binding.blocked) || binding.busy}
        onClick={() => { if (values) void binding.call(state ? values.off : values.on); }}
        className={cn("relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-120",
          "disabled:pointer-events-none disabled:opacity-50",
          state === undefined || stale ? "border-dashed border-fg-3 bg-surface-2"
            : state ? "border-pass bg-pass" : "border-line-strong bg-surface-3")}>
        <span aria-hidden className={cn("absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm",
          "transition-[left] duration-120",
          state ? "left-[18px]" : "left-0.5", state === undefined && "left-[10px] opacity-60")} />
      </button>
    </Operating>
  );
}

/**
 * 滑块: sets one numeric argument of the bound tool, sent when the handle is released (not while it moves),
 * and shows the value the device reads back beside it.
 */
export function SliderComponent({ panel }: ComponentProps) {
  const binding = useBinding(panel);
  const { readings } = useReadings(panel, 60);
  const reading = readings[0];
  const [draft, setDraft] = useState<number>();
  const range = binding.control ? sliderRange(binding.control, binding.tool) : undefined;
  const name = nameOf({ panel }, binding);
  const current = reading?.value ?? (typeof binding.sent === "number" ? binding.sent : undefined);
  const unit = reading ? unitOf(reading.stream) : "";
  const commit = () => {
    if (draft === undefined) return;
    void binding.call(draft).finally(() => setDraft(undefined));
  };
  const note = !binding.blocked && binding.control && !range ? "在属性里设置滑块量程"
    : reading ? staleTitle(reading) : "设定值，没有读回";
  return (
    <Operating name={name} binding={binding} note={note}>
      <span className="tf-num shrink-0 font-mono text-xs text-fg">
        {draft !== undefined ? `→ ${formatNumber(draft)}` : formatNumber(current)}
        <span className="text-fg-3"> {unit}</span>
      </span>
      <input type="range" aria-label={name} className="h-4 min-w-16 flex-[2] accent-(--tf-signal)"
        disabled={Boolean(binding.blocked) || binding.busy || !range}
        min={range?.min ?? 0} max={range?.max ?? 1} step={range?.step ?? 0.01}
        value={draft ?? current ?? range?.min ?? 0}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </Operating>
  );
}

/** 选择: one of a few preset values of one argument of the bound tool. */
export function SelectComponent({ panel }: ComponentProps) {
  const binding = useBinding(panel);
  const { readings } = useReadings(panel, 60);
  const reading = readings[0];
  const presets = binding.control?.presets ?? [];
  const labels = binding.control?.labels ?? [];
  const name = nameOf({ panel }, binding);
  const now = reading ? reading.value ?? reading.mask : binding.sent;
  const picked = presets.findIndex((preset) =>
    preset === now || (typeof preset === "number" && Number(now) === preset));
  return (
    <Operating name={name} binding={binding} note={reading ? staleTitle(reading) : "设定值，没有读回"}>
      {binding.busy && <Spinner />}
      <Select aria-label={name} className="h-7 min-w-0 flex-[2] text-xs" value={picked < 0 ? "" : String(picked)}
        disabled={Boolean(binding.blocked) || binding.busy}
        onChange={(event) => {
          const index = Number(event.target.value);
          if (event.target.value !== "" && index < presets.length) void binding.call(presets[index]);
        }}>
        {picked < 0 && <option value="">—</option>}
        {presets.map((preset, index) => (
          <option key={index} value={index}>{labels[index] || String(preset)}</option>
        ))}
      </Select>
    </Operating>
  );
}
