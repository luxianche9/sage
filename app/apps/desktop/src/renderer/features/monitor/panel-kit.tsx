import { createContext, useContext, type ReactNode } from "react";
import type { MonitorPanel } from "@teststand/contracts/monitor";
import type { StreamInfo } from "@teststand/contracts/observability";
import { cn } from "../../ui/index.js";
import type { ConsoleJump, StreamSource } from "../streams/index.js";
import type { ResultRow } from "../testing/result-rows.js";
import type { MonitorTime } from "./monitor-time.js";
import type { TraceRow } from "./trace-model.js";
import type { BenchRun } from "./use-bench-run.js";
import type { ManualControl } from "./use-manual-control.js";
import type { MonitorWorkspace } from "./use-monitor-workspace.js";

/** What the canvas hands each panel: its id (the project panel it draws). */
export interface PanelProps {
  api: { id: string };
}

/** A frame picked in a trace panel, for the message detail panel. */
export interface SelectedFrame {
  row: TraceRow;
  /** The ICD that decoded it, when one did. */
  icd: string | undefined;
}

/** What every panel of the workspace shares: the streams, one time axis, the run shown, control. */
interface MonitorContextValue {
  workspace: MonitorWorkspace;
  time: MonitorTime;
  source: StreamSource;
  bench: BenchRun;
  rows: readonly ResultRow[];
  jump: ConsoleJump | undefined;
  pick: (tb: number, scroll: boolean) => void;
  zoomStep: (executionId: string | undefined) => void;
  notify: { error: (message: string) => void; success: (message: string) => void };
  control: ManualControl;
  frame: SelectedFrame | undefined;
  selectFrame: (frame: SelectedFrame | undefined) => void;
  /** The panel last focused, for the property panel. */
  activePanelId: string | undefined;
}

export type MonitorStaticContextValue = Omit<MonitorContextValue, "time">;

export const MonitorContext = createContext<MonitorStaticContextValue | undefined>(undefined);
export const MonitorTimeContext = createContext<MonitorTime | undefined>(undefined);

export function useMonitorStatic(): MonitorStaticContextValue {
  const value = useContext(MonitorContext);
  if (!value) throw new Error("monitor panel outside the workspace");
  return value;
}

export function useMonitorTimeContext(): MonitorTime {
  const value = useContext(MonitorTimeContext);
  if (!value) throw new Error("monitor time outside the workspace");
  return value;
}

/** The project's panel a canvas item draws. */
export function usePanel(id: string): [MonitorStaticContextValue, MonitorPanel | undefined] {
  const monitor = useMonitorStatic();
  return [monitor, monitor.workspace.monitor.panels.find((panel) => panel.id === id)];
}

/** The window every time-based panel reads: the shared time axis. */
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

/** A panel's body. Signals are bound in the property panel, never dropped onto a panel. */
export function PanelFrame({ panel, children, className }: {
  panel: MonitorPanel;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-panel-id={panel.id} className={cn("relative h-full min-h-0 min-w-0 bg-surface-0", className)}>
      {children}
    </div>
  );
}

/** Takes a stream off the panel. */
export function useRemove(panel: MonitorPanel | undefined) {
  const { workspace } = useMonitorStatic();
  return (stream: Pick<StreamInfo, "hardwareId" | "streamId">) => {
    if (panel) workspace.removeFrom(panel.id, { hardwareId: stream.hardwareId, streamId: stream.streamId });
  };
}

/** A stream's name as panels show it: its declared label, else `streamId`. */
export function streamName(stream: Pick<StreamInfo, "streamId" | "declaration">): string {
  return stream.declaration?.label || stream.streamId;
}

export function settingOf<T>(panel: MonitorPanel, key: string, fallback: T, valid: (value: unknown) => value is T): T {
  const value = panel.settings[key];
  return valid(value) ? value : fallback;
}

export const isString = (value: unknown): value is string => typeof value === "string";
export const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
