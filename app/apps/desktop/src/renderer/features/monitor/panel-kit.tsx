import { createContext } from "react";
import type { ConsoleJump, StreamSource } from "../streams/index.js";
import type { ResultRow } from "../testing/result-rows.js";
import type { MonitorTime } from "./monitor-time.js";
import type { TraceRow } from "./trace-model.js";
import type { BenchRun } from "./use-bench-run.js";
import type { ManualControl } from "./use-manual-control.js";
import type { MonitorWorkspace } from "./use-monitor-workspace.js";

// The panel helpers (usePanel, useWindow, PanelFrame, ...) went with the panel components while the
// component library is redesigned; docs/decisions names the archive tag that keeps their last version.

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
