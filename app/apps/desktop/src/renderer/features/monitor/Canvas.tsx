import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GripIcon, PuzzleIcon, XIcon } from "lucide-react";
import {
  GRID_PX, PANEL_SIZES, type ControlWidget, type Frame, type MonitorPanel, type PanelType
} from "@teststand/contracts/monitor";
import { cn, IconButton } from "../../ui/index.js";
import { BARE_TYPES, canvasExtent, cells, MIN_CELLS, moved, resized } from "./canvas-model.js";
import { CONTROL_MIME, newControlPanelId, requestControl } from "./control-requests.js";
import { PANEL_LABELS, PANEL_MIME, panelTitle, type MonitorWorkspace } from "./use-monitor-workspace.js";

/** A control dropped from the component bar becomes this widget (presets live in a control panel). */
const CONTROL_WIDGETS: Record<ControlWidget, PanelType> = {
  button: "button", toggle: "switch", slider: "slider", presets: "control"
};

const GRID_BACKGROUND = {
  backgroundImage: "linear-gradient(to right, var(--color-line) 1px, transparent 1px), "
    + "linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)",
  backgroundSize: `${GRID_PX}px ${GRID_PX}px`
};

/**
 * 运行监控's canvas: one page on which every panel sits where it was put, like a host-computer front panel.
 * Outside 编辑布局 the panels are live and operated. In 编辑布局 a panel is moved by dragging it, resized on
 * its corner, removed with × and picked for the property panel by a click; it is not operated meanwhile.
 * Components dropped on an empty spot make a panel there.
 */
export function Canvas({ workspace, editing, selected, onSelect, empty }: {
  workspace: MonitorWorkspace;
  /** 编辑布局: panels are arranged, not operated. */
  editing: boolean;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  /** Offered while the canvas is empty. */
  empty: ReactNode;
}) {
  const panels = workspace.monitor.panels as Array<MonitorPanel & { frame: Frame }>;
  const extent = useMemo(() => canvasExtent(panels.map((panel) => panel.frame)), [panels]);
  const surface = useRef<HTMLDivElement>(null);
  const [arranging, setArranging] = useState(false);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    if (!editing || !selected) return undefined;
    const remove = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (event.key !== "Delete") return;
      workspace.removePanel(selected);
      onSelect(undefined);
    };
    window.addEventListener("keydown", remove);
    return () => window.removeEventListener("keydown", remove);
  }, [editing, selected, workspace, onSelect]);

  /** Where on the canvas (cells) an event happened. */
  const at = (clientX: number, clientY: number): { x: number; y: number } => {
    const box = surface.current?.getBoundingClientRect();
    return { x: cells(clientX - (box?.left ?? 0) - GRID_PX / 2), y: cells(clientY - (box?.top ?? 0) - GRID_PX / 2) };
  };
  const frameAt = (type: PanelType, point: { x: number; y: number }): Frame =>
    ({ ...point, w: PANEL_SIZES[type][0], h: PANEL_SIZES[type][1] });

  return (
    <>
      <div role="region" aria-label="画布" className="relative min-h-0 flex-1 overflow-auto bg-surface-0"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget || event.target === surface.current) onSelect(undefined);
        }}>
        <div ref={surface} data-testid="canvas-surface" className="relative"
          style={{
            width: extent.width, height: extent.height, minWidth: "100%", minHeight: "100%",
            ...(editing || arranging || dropping ? GRID_BACKGROUND : {})
          }}
          onDragOver={(event) => {
            const types = [...event.dataTransfer.types];
            if (!types.includes(PANEL_MIME) && !types.includes(CONTROL_MIME)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
          }}
          onDrop={(event) => {
            setDropping(false);
            const onto = (event.target as HTMLElement).closest<HTMLElement>("[data-canvas-item]");
            const point = at(event.clientX, event.clientY);
            const widget = event.dataTransfer.getData(CONTROL_MIME) as ControlWidget | "";
            if (widget) {
              event.preventDefault();
              const target = onto ? panels.find((panel) => panel.id === onto.dataset.canvasItem) : undefined;
              if (target?.type === "control") { requestControl(target.id, widget); return; }
              const type = CONTROL_WIDGETS[widget];
              if (type === "control") {
                const id = newControlPanelId();
                workspace.addPanel("control", [], frameAt("control", point), id);
                requestControl(id, widget);
              } else {
                workspace.addPanel(type, [], frameAt(type, point));
              }
              return;
            }
            const type = event.dataTransfer.getData(PANEL_MIME) as PanelType | "";
            if (type && PANEL_LABELS[type]) {
              event.preventDefault();
              workspace.addPanel(type, [], frameAt(type, point));
            }
          }}>
          {panels.map((panel) => (
            <CanvasItem key={panel.id} panel={panel} editing={editing}
              selected={selected === panel.id} onSelect={() => onSelect(panel.id)}
              onArrange={setArranging}
              onMove={(frame) => workspace.move(panel.id, frame)}
              onRemove={() => { workspace.removePanel(panel.id); if (selected === panel.id) onSelect(undefined); }} />
          ))}
        </div>
        {!panels.length && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
            <div className="pointer-events-auto grid max-w-md justify-items-center gap-2 text-xs text-fg-3">
              <p className="text-sm text-fg-2">这是一整页画布，像上位机界面一样自由摆放</p>
              <p>从活动栏「组件」把显示组件、开关、按钮拖到这里，再在属性面板里选它显示的信号或调用的设备动作；也可以让 AI 助手来搭。</p>
              {empty}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type Gesture = { kind: "move" | "resize"; x: number; y: number; frame: Frame; travelled: boolean };

function CanvasItem({ panel, editing, selected, onSelect, onArrange, onMove, onRemove }: {
  panel: MonitorPanel & { frame: Frame };
  editing: boolean;
  selected: boolean;
  onSelect: () => void;
  /** A move or resize is under way (the grid shows meanwhile). */
  onArrange: (arranging: boolean) => void;
  onMove: (frame: Frame) => void;
  onRemove: () => void;
}) {
  const [gesture, setGesture] = useState<Gesture>();
  const [preview, setPreview] = useState<Frame>();
  const frame = preview ?? panel.frame;
  const bare = BARE_TYPES.has(panel.type);
  const title = panelTitle(panel);

  const start = (kind: Gesture["kind"]) => (event: ReactPointerEvent) => {
    if (!editing || event.button !== 0) return;
    event.stopPropagation();
    onSelect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ kind, x: event.clientX, y: event.clientY, frame: panel.frame, travelled: false });
  };
  const follow = (event: ReactPointerEvent) => {
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.travelled && Math.hypot(dx, dy) < 3) return;
    if (!gesture.travelled) { setGesture({ ...gesture, travelled: true }); onArrange(true); }
    setPreview(gesture.kind === "move" ? moved(gesture.frame, dx, dy) : resized(gesture.frame, dx, dy, MIN_CELLS));
  };
  const finish = (event: ReactPointerEvent) => {
    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (preview && (preview.x !== panel.frame.x || preview.y !== panel.frame.y
      || preview.w !== panel.frame.w || preview.h !== panel.frame.h)) onMove(preview);
    if (gesture?.travelled) onArrange(false);
    setGesture(undefined);
    setPreview(undefined);
  };
  const handlers = (kind: Gesture["kind"]) => ({
    onPointerDown: start(kind), onPointerMove: follow, onPointerUp: finish, onPointerCancel: finish
  });
  const active = Boolean(gesture?.travelled);

  return (
    // The frame is the panel's grid box; the card sits a few pixels inside it, so neighbours keep a gap.
    <div data-canvas-item={panel.id} role="group" aria-label={title}
      className={cn("group/item absolute p-[3px]", active && "z-30")}
      style={{ left: frame.x * GRID_PX, top: frame.y * GRID_PX, width: frame.w * GRID_PX, height: frame.h * GRID_PX }}>
      <div className={cn("relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-surface-1",
          "border-line shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-[box-shadow,border-color] duration-120",
          editing && "border-line-strong group-hover/item:border-signal/60",
          selected && "border-signal ring-1 ring-signal", active && "opacity-85 shadow-overlay")}>
        {!bare && (
          <header className={cn("flex h-6 shrink-0 items-center gap-1.5 border-b border-line bg-surface-1 px-2 text-xs",
            editing && "cursor-move")} {...handlers("move")}>
            <PuzzleIcon className="size-3.5 text-fg-3" />
            <span className="truncate font-medium text-fg">{title}</span>
          </header>
        )}
        <div className="relative min-h-0 flex-1">
          <PendingComponent type={panel.type} />
          {editing && (
            // While editing, the panel is moved and picked, not operated.
            <div aria-label={`移动 ${title}`} className="absolute inset-0 z-30 cursor-move" {...handlers("move")} />
          )}
        </div>
      </div>
      {editing && (
        <>
          <span aria-label={`移动 ${title}`} role="button" tabIndex={-1} title="拖动移动；单击选中，在属性面板里设置"
            className={cn("absolute top-0 left-0 z-40 grid size-4 cursor-move place-items-center",
              "rounded-tl-md rounded-br-sm",
              "bg-signal text-signal-fg opacity-0 transition-opacity duration-120 group-hover/item:opacity-100",
              (selected || active) && "opacity-100")}
            {...handlers("move")}>
            <GripIcon className="size-3" />
          </span>
          <IconButton label={`删除 ${title}`} size="icon-xs" variant="ghost"
            className={cn("absolute top-0 right-0 z-40 size-4 rounded-tr-md rounded-bl-sm bg-surface-1/90 opacity-0",
              "transition-opacity duration-120 group-hover/item:opacity-100 [&_svg]:size-3", selected && "opacity-100")}
            onPointerDown={(event) => event.stopPropagation()} onClick={onRemove}>
            <XIcon />
          </IconButton>
          <span aria-label={`调整 ${title} 的大小`} role="separator"
            className={cn("absolute right-0 bottom-0 z-40 size-3.5 cursor-nwse-resize rounded-br-md",
              "border-r-[3px] border-b-[3px] border-signal opacity-0 transition-opacity duration-120",
              "group-hover/item:opacity-100", (selected || active) && "opacity-100")}
            {...handlers("resize")} />
        </>
      )}
    </div>
  );
}

/** Stands in for a panel while the host-computer components are being redesigned. */
function PendingComponent({ type }: { type: PanelType }) {
  return (
    <div className="grid h-full place-items-center p-2 text-center text-2xs text-fg-3">
      <span>组件「{PANEL_LABELS[type]}」待重新设计</span>
    </div>
  );
}
