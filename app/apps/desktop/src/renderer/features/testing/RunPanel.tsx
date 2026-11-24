import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, PencilRulerIcon, SlidersHorizontalIcon } from "lucide-react";
import { useProjectDocument, useTestRuns, useTestStepCatalog } from "../../lib/queries.js";
import { queryKeys } from "../../lib/query-keys.js";
import { openPage, PAGE_LABELS } from "../../lib/pages.js";
import { Badge, Button, Panel, PanelHeader, Spinner, useConfirm } from "../../ui";
import type { BenchRun } from "../monitor/use-bench-run.js";
import { IssuesButton, RunControls } from "./EditorToolbar.js";
import { RunParametersDialog } from "./PlanDialogs.js";
import { PlanFlow } from "./PlanFlow.js";
import { FLOW_ID, featureSteps, isActiveRun } from "./plan-helpers.js";
import { RecoveryBanner, RecoveryDialog } from "./RecoveryDialog.js";
import { buildExecutionTrace } from "./run-log-model.js";
import { useFeatureSelection } from "./use-feature-selection.js";
import type { PlanEditor } from "./usePlanEditor.js";
import { useRunLog } from "./useRunLog.js";

type PanelDialog = "parameters" | "recovery";

/**
 * The left column of the 运行 page: the project's test flow with the state each step has in the run shown
 * beside it (or in the flow's latest run), the 功能组 picked for the next run, and 校验 / 运行. Whatever else is
 * on screen, this column says which step the run is at. The flow is edited on the 流程 page, which 编辑流程
 * and a double click on a step open.
 */
export function RunPanel({ bench, editor, onFocusStep }: {
  bench: BenchRun;
  editor: PlanEditor;
  /** A step that ran was picked: the canvas zooms to the time it took. */
  onFocusStep: (executionId: string) => void;
}) {
  const client = useQueryClient();
  const [confirm, confirmDialog] = useConfirm();
  const [dialog, setDialog] = useState<PanelDialog>();
  const catalog = useTestStepCatalog();
  const typeLabels = useMemo(
    () => new Map((catalog.data ?? []).map((item) => [item.type, item.label])),
    [catalog.data]
  );
  const { run } = bench;
  const busy = isActiveRun(run);
  const { draft, dirty } = editor;
  const issues = dirty ? editor.draftAnalysis?.issues ?? [] : editor.issues;
  const featureIds = useMemo(() => featureSteps(draft).map((step) => step.id), [draft]);
  const features = useFeatureSelection(useProjectDocument().data?.rootPath, featureIds);
  const nothingChosen = features.total > 0 && features.chosen.length === 0;

  // The flow shows the state its steps have in the run on the canvas, or else in its latest run.
  const latestRunId = useTestRuns({ planId: FLOW_ID, limit: 1 }, !bench.runId).data?.items[0]?.runId;
  const latestLog = useRunLog(bench.runId ? undefined : latestRunId, false).log;
  const latestTrace = useMemo(
    () => latestLog
      && buildExecutionTrace(latestLog.plan, latestLog.events, latestLog.results, latestLog.run.operations ?? []),
    [latestLog]
  );
  const runLog = bench.runId ? bench.view.runLog.log : latestLog;
  const shownTrace = bench.runId ? bench.view.trace : latestTrace;
  const runTrace = draft && runLog?.plan.id === draft.id && !dirty ? shownTrace : undefined;
  const trace = useMemo(
    () => runTrace ?? (draft ? buildExecutionTrace(draft, [], [], []) : undefined),
    [runTrace, draft]
  );
  const refreshRun = () => { void client.invalidateQueries({ queryKey: queryKeys.testRun }); };

  return (
    <Panel as="aside" aria-label="运行步骤" className="h-full">
      <PanelHeader
        title={PAGE_LABELS.run}
        meta={features.total ? `已选 ${features.chosen.length}/${features.total} 功能组` : undefined}
      >
        {dirty && <Badge tone="invalid">未保存</Badge>}
        {editor.conflict && <Badge tone="fail">冲突</Badge>}
      </PanelHeader>
      <div role="toolbar" aria-label="测试流程操作"
        className="flex flex-wrap items-center gap-1 border-b border-line p-1.5">
        <Button size="xs" variant="outline" disabled={!draft} title="去流程页编辑测试流程"
          onClick={() => openPage({ page: "flow" })}>
          <PencilRulerIcon />编辑流程
        </Button>
        <Button size="xs" variant="outline" disabled={!draft} onClick={() => void editor.validate()}>
          <CheckCircle2Icon />校验
        </Button>
        <IssuesButton issues={issues} onClick={() => openPage({ page: "flow", issues: true })} />
        {draft && draft.parameters.length > 0 && (
          <Button size="xs" variant="outline" onClick={() => setDialog("parameters")}>
            <SlidersHorizontalIcon />参数
          </Button>
        )}
        <span className="ml-auto" title={nothingChosen && !busy ? "先勾选要运行的功能组" : undefined}>
          <RunControls run={run} disabled={!draft || (nothingChosen && !busy)} confirm={confirm}
            onStart={() => void editor.start(features.total ? features.chosen : undefined)} onChanged={refreshRun} />
        </span>
      </div>
      {editor.message && (
        <div role="status" className="truncate px-3 py-1 text-2xs text-fg-3">{editor.message}</div>
      )}
      <RecoveryBanner onOpen={() => setDialog("recovery")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {draft && trace ? (
          <PlanFlow
            trace={trace}
            selectedStepId={editor.selectedStepId}
            typeLabel={(type) => typeLabels.get(type) ?? type}
            selection={features.selection}
            onSelect={(node) => {
              editor.setSelectedStepId(node.stepId);
              if (runTrace && bench.runId && !node.pending) onFocusStep(node.executionId);
            }}
            onEdit={(stepId) => openPage({ page: "flow", stepId })}
          />
        ) : (
          <div className="grid min-h-24 place-items-center"><Spinner label="正在读取测试流程…" /></div>
        )}
      </div>

      <RunParametersDialog
        open={dialog === "parameters"}
        plan={draft}
        value={editor.runParameters}
        onChange={editor.setRunParameters}
        onClose={() => setDialog(undefined)}
      />
      <RecoveryDialog open={dialog === "recovery"} onClose={() => setDialog(undefined)} />
      {confirmDialog}
    </Panel>
  );
}
