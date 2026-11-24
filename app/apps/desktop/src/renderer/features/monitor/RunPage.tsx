import { useState } from "react";
import { HammerIcon, XIcon } from "lucide-react";
import { PageFrame } from "../../app/PageFrame.js";
import { Button, EmptyState, IconButton, Panel, PanelBody, PanelHeader, Section } from "../../ui/index.js";
import { RunPanel } from "../testing/RunPanel.js";
import { isActiveRun } from "../testing/plan-helpers.js";
import type { PlanEditor } from "../testing/usePlanEditor.js";
import { MonitorPane, type StepFocus } from "./MonitorPane.js";
import { useBenchRun } from "./use-bench-run.js";
import { panelTitle, useMonitorWorkspace } from "./use-monitor-workspace.js";

/**
 * 运行 page: the test flow with each step's state on the left, the host-computer canvas in the centre. With
 * no run the canvas shows the devices' live data and its controls work by hand; a run that starts takes it
 * over, and the left column says which step it is at whatever else changes. 编辑布局 turns the left column
 * into the component library, and into the picked panel's properties; it is off while a test runs.
 */
export function RunPage({ editor }: { editor: PlanEditor }) {
  const bench = useBenchRun();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [stepFocus, setStepFocus] = useState<StepFocus>();
  // A run that starts ends the editing: the layout is locked and the steps are what matters.
  const arranging = editing && !isActiveRun(bench.run);
  const left = arranging ? (
    <LayoutPanel selected={selected} onDeselect={() => setSelected(undefined)}
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

/** The left column while the canvas is being arranged: the component library, or the picked panel's
 *  properties. Both are being redesigned (docs/decisions 0005); their places are kept here. */
function LayoutPanel({ selected, onDeselect, onDone }: {
  selected: string | undefined;
  onDeselect: () => void;
  onDone: () => void;
}) {
  const workspace = useMonitorWorkspace(undefined);
  const panel = workspace.monitor.panels.find((item) => item.id === selected);
  return (
    <Panel as="aside" aria-label="编辑布局" className="h-full">
      <PanelHeader title="编辑布局"
        actions={<Button size="xs" variant="primary" onClick={onDone}>完成编辑</Button>} />
      <PanelBody>
        {panel ? (
          <Section title={`属性 · ${panelTitle(panel)}`}
            actions={(
              <IconButton label="回到组件库" size="icon-xs" variant="ghost" onClick={onDeselect}><XIcon /></IconButton>
            )}>
            <EmptyState compact icon={<HammerIcon />} title="属性面板重做中"
              description="控件可以拖动、改大小，按 Delete 或点 × 删除。" />
          </Section>
        ) : (
          <Section title="组件">
            <EmptyState compact icon={<HammerIcon />} title="组件库重做中"
              description="现在可以用画布工具栏的「布局」按数据生成一版，再拖动调整。" />
          </Section>
        )}
      </PanelBody>
    </Panel>
  );
}
