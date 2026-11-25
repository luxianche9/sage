import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ToolCatalogItem } from "@sage/contracts/devices";
import type { MonitorControl, MonitorPanel } from "@sage/contracts/monitor";
import type { StreamInfo, StreamPoint } from "@sage/contracts/observability";
import { errorMessage } from "../../lib/errors.js";
import { cn } from "../../ui/index.js";
import { valueAt } from "../streams/measure.js";
import { pointAt, pointMask, streamUnit, type TimeRange } from "../streams/stream-model.js";
import type { StreamSource } from "../streams/index.js";
import { useStreamsPoints } from "../streams/useStreamReader.js";
import type { ResultRow } from "../testing/result-rows.js";
import { bindingProblem, boundTool, controlOf } from "./component-model.js";
import type { MonitorTime } from "./monitor-time.js";
import type { BenchRun } from "./use-bench-run.js";
import type { ManualControl } from "./use-manual-control.js";
import type { MonitorWorkspace } from "./use-monitor-workspace.js";

/** What every component of a canvas shares: the streams, one time axis, the run shown, control. */
interface MonitorContextValue {
  workspace: MonitorWorkspace;
  time: MonitorTime;
  source: StreamSource;
  bench: BenchRun;
  rows: readonly ResultRow[];
  /** Picks an instant on the shared time axis. */
  pick: (tb: number) => void;
  zoomStep: (executionId: string | undefined) => void;
  notify: { error: (message: string) => void; success: (message: string) => void };
  control: ManualControl;
  /** A replay (the 记录 page): nothing on this canvas operates the hardware. */
  readOnly: boolean;
}

export type MonitorStaticContextValue = Omit<MonitorContextValue, "time">;

export const MonitorContext = createContext<MonitorStaticContextValue | undefined>(undefined);
export const MonitorTimeContext = createContext<MonitorTime | undefined>(undefined);

export function useMonitorStatic(): MonitorStaticContextValue {
  const value = useContext(MonitorContext);
  if (!value) throw new Error("canvas component outside its canvas");
  return value;
}

export function useMonitorTimeContext(): MonitorTime {
  const value = useContext(MonitorTimeContext);
  if (!value) throw new Error("canvas component outside its canvas");
  return value;
}

/** The window every time-based component reads: the shared time axis. */
export function useWindow() {
  const { source, bench } = useMonitorStatic();
  const time = useMonitorTimeContext();
  return {
    source,
    follow: time.follow,
    spanMs: time.spanMs,
    from: time.from,
    range: time.range,
    marker: time.marker,
    origin: bench.mode === "live" ? undefined : bench.view.origin
  };
}

export type ComponentProps = { panel: MonitorPanel };

/** A stream's name as components show it: its declared label, else its id. */
export function streamName(stream: Pick<StreamInfo, "streamId" | "declaration">): string {
  return stream.declaration?.label || stream.streamId;
}

export function unitOf(stream: StreamInfo): string {
  return stream.declaration?.unit ?? streamUnit(stream);
}

/** Stream states in which the last value is not the present one. */
const DOWN = new Set(["error", "unavailable", "closed", "not_configured", "offline", "disconnected"]);

/** One stream of a component as it reads now (or at the instant picked on the time axis). */
export interface Reading {
  stream: StreamInfo;
  points: StreamPoint[] | undefined;
  /** The value of a scalar stream; undefined without data. */
  value: number | undefined;
  /** The mask of a bits stream; undefined without data. */
  mask: number | undefined;
  /** `nodata`: nothing arrived yet. `down`: the device stopped answering; what is shown is not the present. */
  state: "ok" | "nodata" | "down";
  /** Why it is down, in the plugin's words. */
  message: string | undefined;
}

/**
 * The readings of a component's streams over the shared window. `width` is the number of display columns
 * asked for: a number or a lamp needs few, a waveform as many as it has pixels.
 */
export function useReadings(panel: MonitorPanel, width = 120): { readings: Reading[]; range: TimeRange | undefined } {
  const { workspace, bench } = useMonitorStatic();
  const view = useWindow();
  const streams = workspace.streamsOf(panel);
  const points = useStreamsPoints(view.source, streams.map((stream) => stream.key), { ...view, width });
  const at = view.follow ? undefined : view.marker;
  const readings = streams.map((stream): Reading => {
    const read = points.reads[stream.key];
    const list = read?.points;
    const point = at === undefined ? list?.at(-1) : pointAt(list, at);
    const down = bench.mode !== "replay" && read?.state && DOWN.has(read.state.state);
    return {
      stream,
      points: list,
      value: stream.type === "bits" ? undefined : valueAt(list, at),
      mask: stream.type === "bits" ? pointMask(point) : undefined,
      state: down ? "down" : point ? "ok" : "nodata",
      message: points.errors[stream.key] ?? (down ? read?.state?.message ?? read?.state?.state : undefined)
    };
  });
  return { readings, range: points.range };
}

/** Said in place of a component's content while it has nothing to show. */
export function Hint({ children, tone }: { children: ReactNode; tone?: "fail" | undefined }) {
  return (
    <div className={cn("grid h-full place-items-center px-2 text-center text-2xs",
      tone === "fail" ? "text-fail" : "text-fg-3")}>
      <span>{children}</span>
    </div>
  );
}

/** The marker of a reading that is not the present: no data yet, or the device stopped answering. */
export function staleTitle(reading: Reading | undefined): string | undefined {
  if (!reading) return "没有绑定数据流";
  if (reading.state === "down") return `设备没有响应${reading.message ? `：${reading.message}` : ""}`;
  if (reading.state === "nodata") return "还没有数据";
  return undefined;
}

/**
 * The write half of an operating component: its binding, whether it can be used now and why not, and the
 * call itself. A component never shows what was sent as if it were the state: it shows what is read back,
 * and `sent` only where the device offers nothing to read back.
 */
export function useBinding(panel: MonitorPanel): {
  control: MonitorControl | undefined;
  tool: ToolCatalogItem | undefined;
  /** Why the component cannot operate now; undefined when it can. */
  blocked: string | undefined;
  /** The binding itself is wrong (not just unusable now): shown in red. */
  broken: boolean;
  busy: boolean;
  /** The value last sent, for a component with nothing to read back. */
  sent: unknown;
  call: (value?: unknown) => Promise<boolean>;
} {
  const { control: manual, readOnly, notify } = useMonitorStatic();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<unknown>();
  const control = useMemo(() => controlOf(panel), [panel]);
  const tools = control ? manual.toolsOf(control.hardwareId) : [];
  const tool = control ? boundTool(control, tools) : undefined;
  const problem = bindingProblem(control, tools, panel.type);
  const locked = control ? manual.lockOf(control.hardwareId) : undefined;
  const blocked = readOnly ? "回放中不能操作"
    : problem ?? (locked ? `${locked}，结束后才能手动操作` : undefined);
  const call = async (value?: unknown): Promise<boolean> => {
    if (!control || !tool || blocked) return false;
    setBusy(true);
    try {
      await manual.call(control.hardwareId, tool.remoteName,
        control.param && value !== undefined ? { ...control.fixed, [control.param]: value } : { ...control.fixed });
      setSent(value);
      return true;
    } catch (cause) {
      notify.error(errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return {
    control, tool, blocked, busy, sent, call,
    broken: !readOnly && Boolean(problem) && problem !== "设备离线"
  };
}
