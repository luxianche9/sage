import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboardIcon, ListChecksIcon, PencilRulerIcon, RadioIcon, TimerResetIcon } from "lucide-react";
import { errorMessage } from "../../lib/errors.js";
import { queryKeys } from "../../lib/query-keys.js";
import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, Field, IconButton, Input, Menu, MenuContent,
  MenuItem, MenuSeparator, MenuTrigger, Toolbar, useConfirm, useToast
} from "../../ui/index.js";
import { RunOverview, streamUnit, type StreamSource } from "../streams/index.js";
import { RunControls } from "../testing/EditorToolbar.js";
import { RunHeader } from "../testing/RunHeader.js";
import { resultRows } from "../testing/result-rows.js";
import { stepRange } from "../testing/useRunView.js";
import {
  deletePreset, exportText, generatedLayout, importText, readPresets, savePreset, type LayoutPreset
} from "./layout-tools.js";
import { useLiveKeepalive, useMonitorTime } from "./monitor-time.js";
import { Canvas } from "./Canvas.js";
import { MonitorContext, MonitorTimeContext, type MonitorStaticContextValue } from "./panel-kit.js";
import { TimebaseControls } from "./TimebaseControls.js";
import type { BenchRun } from "./use-bench-run.js";
import { useManualControl } from "./use-manual-control.js";
import { useMonitorWorkspace, type MonitorWorkspace } from "./use-monitor-workspace.js";

/** 编辑布局, owned by the 运行 page: its left column shows the component library and the picked panel. */
export type CanvasLayout = {
  editing: boolean;
  onEditing: (editing: boolean) => void;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
};

/** A step picked in a flow beside the canvas; `seq` makes picking the same step again count. */
export type StepFocus = { executionId: string; seq: number };

/**
 * The host-computer canvas, the centre of the 运行 and 记录 pages: one page of panels placed freely, like a
 * front panel — oscilloscopes, values, gauges, lamps, terminals, bus traces, switches, sliders, buttons, the
 * run's results and decoded messages — each showing the device streams (or protocol fields) dropped on it,
 * all on one time axis. The canvas is the project's (the Agent builds it too).
 *
 * On the 运行 page (`layout` given) it shows the devices' live data; a run that starts takes over at once,
 * with its header above and its event timeline under the canvas, and stays shown when it ends until 返回实时.
 * 编辑布局 moves, resizes and configures panels; devices can be controlled by hand from the displays and
 * controls, except those a running test holds. On the 记录 page (no `layout`) a finished run is replayed the
 * same way and nothing can be changed.
 */
export function MonitorPane({ bench, layout, stepFocus }: {
  bench: BenchRun;
  layout?: CanvasLayout | undefined;
  stepFocus?: StepFocus | undefined;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const { run, hub, runId, setRunId, live, mode, view } = bench;
  const { timeline, origin } = view;
  const workspace = useMonitorWorkspace(runId ? timeline : undefined);
  const control = useManualControl();
  const time = useMonitorTime(mode !== "replay", mode === "run" ? origin : undefined,
    mode === "replay" ? view.range : undefined);
  const source = useMemo<StreamSource>(
    () => (mode === "live" || !view.source ? { live: hub } : view.source),
    [mode, hub, view.source]
  );
  // Only the 运行 page keeps the live feed open: a replay reads the recording.
  useLiveKeepalive(hub, layout ? workspace.streams.map((stream) => stream.key) : []);
  const [rejudging, setRejudging] = useState(false);
  const editing = Boolean(layout?.editing) && !control.running;
  const activePanelId = layout?.selected;
  const selectPanel = layout?.onSelect;
  const focus = useCallback((id: string | undefined) => { selectPanel?.(id); }, [selectPanel]);
  const results = view.runLog.log?.results;
  const rows = useMemo(() => {
    if (!runId || !results) return [];
    const units = new Map((timeline?.streams ?? []).map((stream) =>
      [`${stream.hardwareId}/${stream.streamId}`, stream.declaration?.unit ?? streamUnit(stream)]));
    return resultRows(results, (hardwareId, streamId) => units.get(`${hardwareId}/${streamId}`) ?? "");
  }, [runId, results, timeline?.streams]);

  const zoomStep = useCallback((executionId: string | undefined) => {
    const stepped = stepRange(timeline, executionId);
    if (!stepped) return;
    time.select(stepped);
    const start = timeline?.steps.find((step) => step.executionId === executionId)?.tb0;
    if (start != null) time.pick(start);
  }, [time, timeline]);
  // A step picked in the flow beside the canvas.
  const zoomRef = useRef(zoomStep);
  zoomRef.current = zoomStep;
  useEffect(() => { if (stepFocus) zoomRef.current(stepFocus.executionId); }, [stepFocus]);
  const pick = useCallback((tb: number) => { time.pick(tb); }, [time]);
  const refreshRun = () => {
    void client.invalidateQueries({ queryKey: queryKeys.testRun });
  };
  const rejudge = async () => {
    if (!runId) return;
    setRejudging(true);
    try {
      const result = await window.sage.testing.rejudgeRun({ runId });
      const changed = result.results.filter((item) => !item.same).length;
      if (result.consistent) toast.success(`复核一致：${result.results.length} 项判定与原结果相同`);
      else toast.error(`复核发现 ${changed} 项判定与原结果不同`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRejudging(false);
    }
  };
  useEffect(() => { if (workspace.error) toast.error(errorMessage(workspace.error)); }, [workspace.error, toast]);

  const notify = useMemo(() => ({
    error: (message: string) => toast.error(message),
    success: (message: string) => toast.success(message)
  }), [toast]);
  const context = useMemo<MonitorStaticContextValue>(() => ({
    workspace, source, bench, rows, pick, zoomStep, control, notify, readOnly: !layout
  }), [workspace, source, bench, rows, pick, zoomStep, control, notify, layout]);

  const layoutMenu = (labelled: boolean) => (
    <LayoutMenu workspace={workspace} labelled={labelled} onError={(message) => toast.error(message)}
      onDone={(message) => toast.success(message)} />
  );
  const modeLabel = mode === "live" ? "实时数据" : mode === "run" ? "本次运行" : layout ? "上次运行" : "历史回放";
  const runActions = (
    <>
      {mode === "replay" && layout && (
        <Button size="xs" variant="outline" onClick={() => setRunId(undefined)}><RadioIcon />返回实时</Button>
      )}
      {live && <RunControls run={run} confirm={confirm} onStart={() => undefined} onChanged={refreshRun} />}
      {!live && Boolean(timeline?.windows.length) && (
        <Button size="xs" variant="outline" disabled={rejudging} onClick={() => void rejudge()}>
          <ListChecksIcon />复核判定
        </Button>
      )}
    </>
  );

  return (
    <section aria-label={layout ? "上位机画布" : "运行回放"} className="relative flex h-full min-h-0 min-w-0 flex-col">
      <Toolbar aria-label="画布工具栏" className="h-9 gap-1 px-2">
        <span className="text-2xs whitespace-nowrap text-fg-3">{modeLabel}</span>
        <span className="flex-1" />
        <TimebaseControls time={time} />
        <IconButton label="复位时间轴" size="icon-sm" variant="ghost" disabled={time.follow} onClick={time.reset}>
          <TimerResetIcon />
        </IconButton>
        {layout && (
          <>
            <Button size="xs" variant={editing ? "primary" : "outline"} aria-pressed={editing}
              disabled={control.running}
              title={control.running ? "测试运行中，布局锁定"
                : editing ? "完成编辑：控件恢复可操作" : "编辑布局：拖动、改大小、设置和删除控件"}
              onClick={() => { layout.onEditing(!layout.editing); focus(undefined); }}>
              <PencilRulerIcon />{editing ? "完成编辑" : "编辑布局"}
            </Button>
            {layoutMenu(false)}
          </>
        )}
      </Toolbar>
      {runId && (
        <RunHeader
          state={view.runLog}
          trace={view.trace}
          activeExecutionIds={view.activeExecutionIds}
          problemExecutionId={view.problemExecutionId}
          following={time.follow}
          onCurrent={time.reset}
          onProblem={() => zoomStep(view.problemExecutionId)}
          actions={runActions}
        />
      )}
      <MonitorTimeContext.Provider value={time}>
        <MonitorContext.Provider value={context}>
          <div className="flex min-h-0 flex-1">
            <Canvas key={workspace.projectId ?? "none"} workspace={workspace} editing={editing}
              selected={activePanelId} onSelect={focus}
              emptyTitle={layout ? "画布还是空的：按数据生成布局，或点「编辑布局」从左栏拖控件" : "这个项目的画布上还没有控件"}
              empty={layout ? layoutMenu(true) : undefined} />
          </div>
        </MonitorContext.Provider>
      </MonitorTimeContext.Provider>
      {runId && timeline && view.range && origin !== undefined && (
        <RunOverview
          timeline={timeline}
          stepNames={view.stepNames}
          range={view.range}
          origin={origin}
          marker={time.marker}
          onSelect={time.select}
          onStep={zoomStep}
          onPick={pick}
        />
      )}
      {confirmDialog}
    </section>
  );
}

/** Generated layout, saved presets, and the workspace as a file. */
function LayoutMenu({ workspace, labelled = false, onError, onDone }: {
  workspace: MonitorWorkspace;
  labelled?: boolean;
  onError: (message: string) => void;
  onDone: (message: string) => void;
}) {
  const [presets, setPresets] = useState<LayoutPreset[]>([]);
  // The name is asked in a dialog: Electron has no window.prompt().
  const [presetName, setPresetName] = useState<string>();
  const file = useRef<HTMLInputElement>(null);
  const generate = () => {
    const streams = workspace.channels.length
      ? workspace.channels
      : workspace.devices.flatMap((device) =>
        device.streams.map((stream) => ({ hardwareId: device.hardwareId, streamId: stream.id })));
    const panels = generatedLayout(streams.map((ref) => ({
      ...ref, type: String(workspace.typeOf(ref) ?? "scalar"), declaration: workspace.declarationOf(ref) as never
    })));
    workspace.replace({ panels });
    onDone(workspace.channels.length ? "已按现有数据流重新生成布局" : "已按所有设备的数据流生成布局");
  };
  const save = () => {
    const name = presetName?.trim();
    if (!name) return;
    setPresets(savePreset(name, workspace.monitor));
    setPresetName(undefined);
    onDone(`已保存预设「${name}」`);
  };
  const overwrites = presets.some((preset) => preset.name === presetName?.trim());
  const exportFile = () => {
    const blob = new Blob([exportText(workspace.monitor)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "monitor-layout.json";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <Menu onOpenChange={(open) => { if (open) setPresets(readPresets()); }}>
        <MenuTrigger asChild>
          {labelled
            ? <Button size="xs" variant="outline"><LayoutDashboardIcon />布局</Button>
            : <IconButton label="布局" size="icon-sm" variant="ghost"><LayoutDashboardIcon /></IconButton>}
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem onSelect={generate}>按数据生成布局</MenuItem>
          <MenuSeparator />
          {presets.map((preset) => (
            <MenuItem key={preset.name}
              onSelect={() => { workspace.replace(preset.monitor); onDone(`已应用预设「${preset.name}」`); }}>
              应用预设：{preset.name}
            </MenuItem>
          ))}
          <MenuItem onSelect={() => setPresetName("台架布局")}>保存为预设…</MenuItem>
          {presets.map((preset) => (
            <MenuItem key={`delete:${preset.name}`} danger
              onSelect={() => { setPresets(deletePreset(preset.name)); onDone(`已删除预设「${preset.name}」`); }}>
              删除预设：{preset.name}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={exportFile}>导出布局文件…</MenuItem>
          <MenuItem onSelect={() => file.current?.click()}>导入布局文件…</MenuItem>
        </MenuContent>
      </Menu>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-hidden
        onChange={async (event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          const parsed = importText(await chosen.text());
          if (typeof parsed === "string") onError(parsed);
          else { workspace.replace(parsed); onDone(`已导入 ${chosen.name}`); }
        }} />
      <Dialog open={presetName !== undefined} onOpenChange={(open) => { if (!open) setPresetName(undefined); }}>
        <DialogContent title="保存为预设" size="sm">
          <form onSubmit={(event) => { event.preventDefault(); save(); }}>
            <DialogBody>
              <Field label="预设名称" hint="预设存在本机，所有项目通用">
                <Input value={presetName ?? ""} onChange={(event) => setPresetName(event.target.value)} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={() => setPresetName(undefined)}>取消</Button>
              <Button type="submit" variant={overwrites ? "danger" : "primary"} disabled={!presetName?.trim()}>
                {overwrites ? "覆盖" : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
