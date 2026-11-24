import { useMemo, useState } from "react";
import { ArrowLeftIcon, HistoryIcon } from "lucide-react";
import { PageFrame } from "../../app/PageFrame.js";
import { PAGE_LABELS } from "../../lib/pages.js";
import { useTestStepCatalog } from "../../lib/queries.js";
import { EmptyState, IconButton, Panel, PanelHeader, Spinner } from "../../ui/index.js";
import { PlanFlow } from "../testing/PlanFlow.js";
import { RunHistory } from "../testing/RunHistory.js";
import { MonitorPane, type StepFocus } from "./MonitorPane.js";
import { useRecordRun } from "./use-bench-run.js";

/**
 * 记录 page: every run of the project on the left. Picking one turns the left column into that run's steps
 * with their results and replays it in the centre on the project's canvas, read-only, with its header and
 * timeline — the 运行 page's layout, standing still. The arrow goes back to the list, which keeps its filters.
 */
export function RecordsPage() {
  const [runId, setRunId] = useState<string>();
  const [stepFocus, setStepFocus] = useState<StepFocus>();
  const [selectedStepId, setSelectedStepId] = useState<string>();
  const bench = useRecordRun(runId, setRunId);
  const catalog = useTestStepCatalog();
  const typeLabels = useMemo(
    () => new Map((catalog.data ?? []).map((item) => [item.type, item.label])),
    [catalog.data]
  );
  const { trace, runLog } = bench.view;
  const open = (next: string | undefined) => {
    setRunId(next);
    setSelectedStepId(undefined);
    setStepFocus(undefined);
  };

  const left = (
    <Panel as="aside" aria-label="运行记录" className="h-full">
      {runId ? (
        <PanelHeader title={runLog.log?.plan.name ?? "运行记录"} className="pl-1.5">
          <IconButton label="返回全部记录" size="icon-sm" variant="ghost" className="order-first"
            onClick={() => open(undefined)}>
            <ArrowLeftIcon />
          </IconButton>
        </PanelHeader>
      ) : (
        <PanelHeader title={PAGE_LABELS.records} />
      )}
      {/* The list stays mounted under the steps, so its filters and loaded pages survive. */}
      <div hidden={Boolean(runId)} className="flex min-h-0 flex-1 flex-col">
        <RunHistory selectedRunId={runId} onOpenRun={open} />
      </div>
      {runId && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {trace ? (
            <PlanFlow
              trace={trace}
              selectedStepId={selectedStepId}
              typeLabel={(type) => typeLabels.get(type) ?? type}
              onSelect={(node) => {
                setSelectedStepId(node.stepId);
                if (!node.pending) {
                  setStepFocus((current) => ({ executionId: node.executionId, seq: (current?.seq ?? 0) + 1 }));
                }
              }}
            />
          ) : (
            <div className="grid min-h-24 place-items-center">
              {runLog.error
                ? <span className="px-3 text-xs text-fail">读取运行日志失败：{runLog.error}</span>
                : <Spinner label="正在读取运行日志…" />}
            </div>
          )}
        </div>
      )}
    </Panel>
  );

  return (
    <PageFrame page="records" left={left}>
      {runId
        ? <MonitorPane key={runId} bench={bench} stepFocus={stepFocus} />
        : <EmptyState icon={<HistoryIcon />} title="选一条运行记录"
            description="在左边点一次运行，这里按它当时的数据回放：结论、每一步的结果、画布和时间轴。" />}
    </PageFrame>
  );
}
