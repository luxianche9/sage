import { useEffect, useRef, useState } from "react";
import type { TestRunSnapshot } from "@sage/contracts/testing";
import { useCurrentTestRun } from "../../lib/queries.js";
import { onRunRequested, peekRequestedRun, takeRequestedRun } from "../../lib/run-focus.js";
import { isActiveRun } from "../testing/plan-helpers.js";
import { useRunView } from "../testing/useRunView.js";
import { useLiveHub, type MonitorMode } from "./monitor-time.js";

function activeRunId(run: TestRunSnapshot | null | undefined): string | undefined {
  return isActiveRun(run) ? run.runId : undefined;
}

/** Everything a canvas and the flow beside it need to know about the run they show. */
function useShownRun(runId: string | undefined, setRunId: (runId: string | undefined) => void) {
  const run = useCurrentTestRun().data;
  const hub = useLiveHub();
  const live = Boolean(runId && run?.runId === runId && isActiveRun(run));
  const mode: MonitorMode = !runId ? "live" : live ? "run" : "replay";
  const view = useRunView(runId, live, hub);
  return { run, hub, runId, setRunId, live, mode, view };
}

/**
 * The run the 运行 page shows: none (the devices' live data) or the current one, followed as soon as it
 * starts however it was started. It stays shown when it ends, until the operator returns to live data.
 * The canvas draws it; the flow in the page's left column reads it too.
 */
export function useBenchRun() {
  const run = useCurrentTestRun().data;
  const [runId, setRunId] = useState<string | undefined>(() => peekRequestedRun() ?? activeRunId(run));

  useEffect(() => {
    const requested = takeRequestedRun();
    if (requested) setRunId(requested);
    return onRunRequested((next) => setRunId(takeRequestedRun() ?? next));
  }, []);
  // Follow every run that starts, however it was started.
  const followed = useRef(activeRunId(run));
  useEffect(() => {
    if (!isActiveRun(run) || followed.current === run.runId) return;
    followed.current = run.runId;
    setRunId(run.runId);
  }, [run]);

  return useShownRun(runId, setRunId);
}

/** The run picked on the 记录 page, replayed (or followed, if it is the one running now); none before one is
 *  picked. */
export function useRecordRun(runId: string | undefined, setRunId: (runId: string | undefined) => void) {
  return useShownRun(runId, setRunId);
}

export type BenchRun = ReturnType<typeof useBenchRun>;
