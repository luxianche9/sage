import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Hardware } from "@sage/contracts/devices";
import type { TestPlan, TestStep, TestStepCatalogItem } from "@sage/contracts/testing";
import { XIcon } from "lucide-react";
import { PageFrame } from "../../app/PageFrame.js";
import { useLeaveGuard } from "../../lib/hooks/useLeaveGuard.js";
import { onPageRequested, PAGE_LABELS } from "../../lib/pages.js";
import { IconButton, Panel, PanelBody, PanelHeader, cn, useConfirm } from "../../ui";
import { ComponentLibrary, type DragDescriptor } from "./ComponentLibrary.js";
import { IssueList } from "./PlanDialogs.js";
import { PlanEditorPane } from "./PlanEditorPane.js";
import { FLOW_ID, insertStepAt, invokeStepFor, moveStepTo, stepIdForIssuePath } from "./plan-helpers.js";
import { createStep, findStep } from "./plan-model.js";
import type { PlanEditor } from "./usePlanEditor.js";

/**
 * 流程 page: step cards on the left (drag one into a region, or click to append it), the project's test flow
 * in the centre. A step clicked in the flow unfolds with its properties; validation issues list under the
 * flow and a click on one picks its step. The draft is the project's: the 运行 page shows the same flow, marks
 * it unsaved, and a run saves it first.
 */
export function FlowPage({ editor }: { editor: PlanEditor }) {
  const [confirm, confirmDialog] = useConfirm();
  const [activeDrag, setActiveDrag] = useState<DragDescriptor>();
  const [issuesOpen, setIssuesOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const { draft, dirty, loadPlan } = editor;
  const issues = dirty ? editor.draftAnalysis?.issues ?? [] : editor.issues;

  useEffect(() => { void loadPlan(FLOW_ID); }, [loadPlan]);
  useLeaveGuard(dirty || editor.conflict, () => confirm({
    title: "放弃未保存的修改？",
    message: "测试流程有未保存或冲突中的修改。放弃修改后请重新切换页面。",
    confirmLabel: "放弃修改",
    danger: true
  }), () => editor.discard());
  // 编辑流程 on the 运行 page (or a double click on a step there), and its 「N 个问题」.
  const select = useRef(editor.setSelectedStepId);
  select.current = editor.setSelectedStepId;
  useEffect(() => onPageRequested((request) => {
    if (request.page !== "flow") return;
    if (request.stepId) select.current(request.stepId);
    if (request.issues) setIssuesOpen(true);
  }), []);

  const insert = (step: TestStep, overId?: string) => {
    editor.mutate((next) => insertStepAt(next, step, overId));
    editor.setSelectedStepId(step.id);
  };
  const addCatalog = (item: TestStepCatalogItem) => insert(createStep(item));
  const addDevice = (hardware: Hardware) => insert(invokeStepFor(hardware));
  const onDragStart = (event: DragStartEvent) => {
    const descriptor = event.active.data.current as DragDescriptor | undefined;
    setActiveDrag(descriptor?.kind ? descriptor : { kind: "step", stepId: String(event.active.id) });
  };
  const onDragEnd = (event: DragEndEvent) => {
    const descriptor = event.active.data.current as DragDescriptor | undefined;
    setActiveDrag(undefined);
    if (!draft || !event.over) return;
    const overId = String(event.over.id);
    if (descriptor?.kind === "catalog") { insert(createStep(descriptor.item), overId); return; }
    if (descriptor?.kind === "device") { insert(invokeStepFor(descriptor.hardware), overId); return; }
    if (event.active.id === event.over.id) return;
    editor.mutate((next) => moveStepTo(next, String(event.active.id), overId));
  };

  const left = (
    <Panel as="aside" aria-label="步骤卡片" className="h-full">
      <PanelHeader title={PAGE_LABELS.flow} meta="步骤卡片" />
      <PanelBody>
        <ComponentLibrary enabled={Boolean(draft)} onAdd={addCatalog} onAddDevice={addDevice} />
      </PanelBody>
    </Panel>
  );
  const footer = issuesOpen && (
    <section aria-label="校验问题" className="flex max-h-[40%] min-h-0 shrink-0 flex-col border-t border-line bg-surface-1">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3">
        <h3 className="tf-label text-fg-2">校验问题</h3>
        <span className="tf-num text-xs text-fg-3">{issues.length}</span>
        <IconButton label="收起校验问题" size="icon-sm" variant="ghost" className="ml-auto"
          onClick={() => setIssuesOpen(false)}><XIcon /></IconButton>
      </header>
      <div className="min-h-0 overflow-auto p-3">
        <IssueList issues={issues} onSelect={(issue) => {
          const stepId = draft ? stepIdForIssuePath(draft, issue.path) : undefined;
          if (stepId) editor.setSelectedStepId(stepId);
        }} />
      </div>
    </section>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveDrag(undefined)}
    >
      <PageFrame page="flow" left={left}>
        <PlanEditorPane editor={editor} onIssues={() => setIssuesOpen((open) => !open)} footer={footer} />
        {confirmDialog}
      </PageFrame>
      {createPortal(
        <DragOverlay>
          {activeDrag && (
            <div className={cn(
              "rounded-sm border border-signal bg-surface-2 px-3 py-1.5 text-xs text-fg shadow-overlay"
            )}>
              {dragLabel(activeDrag, draft)}
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}

function dragLabel(drag: DragDescriptor, draft?: TestPlan): string {
  if (drag.kind === "catalog") return drag.item.label;
  if (drag.kind === "device") return drag.hardware.label;
  return draft ? findStep(draft, drag.stepId)?.step.name ?? drag.stepId : drag.stepId;
}
