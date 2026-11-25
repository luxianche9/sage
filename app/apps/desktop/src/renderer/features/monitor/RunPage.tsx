import { useState } from "react";
import { PageFrame } from "../../app/PageFrame.js";
import { RunPanel } from "../testing/RunPanel.js";
import { isActiveRun } from "../testing/plan-helpers.js";
import type { PlanEditor } from "../testing/usePlanEditor.js";
import { LayoutPanel } from "./LayoutPanel.js";
import { MonitorPane, type StepFocus } from "./MonitorPane.js";
import { useBenchRun } from "./use-bench-run.js";

/**
 * 运行 page: the test flow with each step's state on the left, the host-computer canvas in the centre. With
 * no run the canvas shows the devices' live data and its controls work by hand; a run that starts takes it
 * over, and the left column says which step it is at whatever else changes. 编辑布局 turns the left column
 * into the component library and the variables, and into the picked component's properties; it is off while
 * a test runs.
 */
export function RunPage({ editor }: { editor: PlanEditor }) {
  const bench = useBenchRun();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [stepFocus, setStepFocus] = useState<StepFocus>();
  // A run that starts ends the editing: the layout is locked and the steps are what matters.
  const arranging = editing && !isActiveRun(bench.run);
  const left = arranging ? (
    <LayoutPanel selected={selected} onSelect={setSelected}
      onDone={() => { setEditing(false); setSelected(undefined); }} />
  ) : (
    <RunPanel bench={bench} editor={editor}
      onFocusStep={(executionId) => setStepFocus((current) => ({ executionId, seq: (current?.seq ?? 0) + 1 }))} />
  );
  return (
    <PageFrame page="run" left={left}>
      <MonitorPane bench={bench} stepFocus={stepFocus}
        layout={{ editing, onEditing: setEditing, selected, onSelect: setSelected }} />
    </PageFrame>
  );
}
