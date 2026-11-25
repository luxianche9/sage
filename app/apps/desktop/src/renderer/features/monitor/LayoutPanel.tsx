import { useState } from "react";
import { ArrowLeftIcon } from "lucide-react";
import type { PanelType } from "@sage/contracts/monitor";
import { Button, IconButton, Panel, PanelBody, PanelHeader, SegmentedControl, cn } from "../../ui/index.js";
import { COMPONENT_GROUPS, defaultTypeFor, PANEL_HINTS, PANEL_LABELS, panelTitle } from "./component-model.js";
import { COMPONENT_ICONS } from "./components/index.js";
import { Properties } from "./Properties.js";
import { useManualControl } from "./use-manual-control.js";
import { PANEL_MIME, useMonitorWorkspace, VARIABLE_MIME } from "./use-monitor-workspace.js";

type Tab = "components" | "variables";

const tabs = [
  { value: "components", label: "组件", title: "把组件拖到画布上，或点一下放到第一个空位" },
  { value: "variables", label: "变量", title: "把设备的数据流拖到画布上，生成显示它的组件" }
] as const;

const TYPE_NAMES: Record<string, string> = {
  scalar: "数值", bits: "开关量", bytes: "字节流", frames: "报文流", block: "采样块"
};

const rowClass = cn(
  "flex w-full items-center gap-2 px-3 text-left outline-none transition-colors duration-120",
  "hover:bg-surface-2 focus-visible:bg-surface-2 active:bg-surface-3"
);

/**
 * The left column of the 运行 page while the canvas is arranged: the component library and the project's
 * variables to drag onto the canvas, and — once a component is picked — its properties, where it is bound to
 * the hardware by hand.
 */
export function LayoutPanel({ selected, onSelect, onDone }: {
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  onDone: () => void;
}) {
  const workspace = useMonitorWorkspace(undefined);
  const control = useManualControl();
  const [tab, setTab] = useState<Tab>("components");
  const panel = workspace.monitor.panels.find((item) => item.id === selected);
  const add = (type: PanelType, sources: { hardwareId: string; streamId: string }[] = []) => {
    const id = `${type}-${Date.now().toString(36)}`;
    workspace.addPanel(type, sources, undefined, id);
    onSelect(id);
  };

  return (
    <Panel as="aside" aria-label="编辑布局" className="h-full">
      <PanelHeader {...(panel ? { className: "pl-1.5" } : { title: "编辑布局" })}
        actions={<Button size="xs" variant="primary" onClick={onDone}>完成编辑</Button>}>
        {panel && (
          <>
            <IconButton label="回到组件库" size="icon-sm" variant="ghost" onClick={() => onSelect(undefined)}>
              <ArrowLeftIcon />
            </IconButton>
            <h2 className="tf-label min-w-0 truncate text-fg-2">属性 · {panelTitle(panel)}</h2>
          </>
        )}
      </PanelHeader>
      {panel ? (
        <PanelBody>
          <Properties panel={panel} workspace={workspace} control={control} onRemoved={() => onSelect(undefined)} />
        </PanelBody>
      ) : (
        <>
          <div className="flex shrink-0 border-b border-line p-1.5">
            <SegmentedControl<Tab> label="左栏内容" size="xs" value={tab} options={tabs} onChange={setTab} />
          </div>
          <PanelBody className="py-1">
            {tab === "components" ? COMPONENT_GROUPS.map((group) => (
              <section key={group.title} aria-label={group.title} className="pb-1">
                <h3 className="tf-label flex h-6 items-center px-3 text-fg-3">{group.title}</h3>
                <ul>
                  {group.types.map((type) => (
                    <li key={type}>
                      <button type="button" draggable title="拖到画布上，或点一下放到第一个空位"
                        onDragStart={(event) => {
                          event.dataTransfer.setData(PANEL_MIME, type);
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => add(type)}
                        className={cn(rowClass, "h-10 cursor-grab active:cursor-grabbing")}>
                        <span className={cn("grid size-6 shrink-0 place-items-center rounded-sm border border-line",
                          "bg-surface-0 text-fg-2 [&_svg]:size-3.5")}>{COMPONENT_ICONS[type]}</span>
                        <span className="grid min-w-0">
                          <span className="truncate text-sm text-fg">{PANEL_LABELS[type]}</span>
                          <span className="truncate text-2xs text-fg-3">{PANEL_HINTS[type]}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )) : (
              <Variables workspace={workspace} onAdd={add} />
            )}
          </PanelBody>
        </>
      )}
    </Panel>
  );
}

/** The streams every device declares (and the protocol fields decoded from them), to drag onto the canvas. */
function Variables({ workspace, onAdd }: {
  workspace: ReturnType<typeof useMonitorWorkspace>;
  onAdd: (type: PanelType, sources: { hardwareId: string; streamId: string }[]) => void;
}) {
  const devices = workspace.devices.filter((device) => device.streams.length);
  if (!devices.length) {
    return <p className="px-3 py-2 text-xs text-fg-3">还没有变量：设备连接后，它的数据流会列在这里。</p>;
  }
  return (
    <>
      {devices.map((device) => (
        <section key={device.hardwareId} aria-label={device.label || device.hardwareId} className="pb-1">
          <h3 className="tf-label flex h-6 items-center px-3 text-fg-3">{device.label || device.hardwareId}</h3>
          <ul>
            {device.streams.map((stream) => {
              const type = String(stream.type);
              const display = defaultTypeFor(type);
              const name = typeof stream.label === "string" && stream.label ? stream.label : stream.id;
              return (
                <li key={stream.id}>
                  <button type="button" draggable={Boolean(display)} disabled={!display}
                    title={display ? `拖到画布上生成「${PANEL_LABELS[display]}」，或拖到已有的组件上`
                      : "这种数据流没有对应的组件"}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(VARIABLE_MIME, JSON.stringify({
                        hardwareId: device.hardwareId, streamId: stream.id, type
                      }));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => {
                      if (display) onAdd(display, [{ hardwareId: device.hardwareId, streamId: stream.id }]);
                    }}
                    className={cn(rowClass, "h-7 cursor-grab text-xs active:cursor-grabbing disabled:opacity-50")}>
                    <span className="min-w-0 flex-1 truncate text-fg">{name}</span>
                    {name !== stream.id && (
                      <span className="max-w-24 truncate font-mono text-2xs text-fg-3">{stream.id}</span>
                    )}
                    <span className="shrink-0 text-2xs text-fg-3">{TYPE_NAMES[type] ?? type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
