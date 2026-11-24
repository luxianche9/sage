import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow } from "@xyflow/react";
import type { Hardware } from "@sage/contracts/devices";
import { TriangleAlertIcon } from "lucide-react";
import { PageFrame } from "../../app/PageFrame.js";
import { errorMessage } from "../../lib/errors.js";
import { resolvePortRef } from "../../lib/hardware.js";
import { PAGE_LABELS } from "../../lib/pages.js";
import {
  Panel, PanelBody, SegmentedControl, Spinner, Toolbar, ToolbarDivider, cn, useConfirm
} from "../../ui/index.js";
import { HardwareList } from "../devices/index.js";
import { EditPinsModal, ListCreateConnectionModal } from "./ConnectionEditor.js";
import { ConnectionStrip } from "./ConnectionStrip.js";
import { PinList } from "./PinList.js";
import {
  NodeContextMenu, WiringCanvas, useTransientNodeUi, type ManualPair, type NodeMenu
} from "./WiringCanvas.js";
import { WiringLogPanel } from "./WiringLogPanel.js";
import { fallbackHardware, toFlowEdges, toFlowNode } from "./flow-elements.js";
import { useWiringDocument } from "./use-wiring-document.js";
import {
  sortedPair, straightThrough, touchesHardware, type HardwareFlowNode, type TopologyEdge
} from "./wiring-model.js";

/** 接线 shows the same cables two ways: as a canvas of faceplates, or as a pin table. */
type WiringView = "canvas" | "table";
type LeftTab = "hardware" | "log";

const viewOptions = [
  { value: "canvas", label: "画布", title: "在画布上摆放硬件并从端口拖线" },
  { value: "table", label: "表格", title: "针脚表：按线缆列出每一对接好的针脚，含同端口跳线" }
] as const;

const leftTabs = [
  { value: "hardware", label: "硬件" },
  { value: "log", label: "变更记录" }
] as const;

/**
 * 接线 page: the physical wiring of the bench. The left column lists the hardware (drag one onto the canvas;
 * a click finds its card and keeps only its cables in the table) or, on its second tab, every change made to
 * the wiring. The centre is the canvas or the pin table — the page's one view switch — and the cable picked
 * on the canvas shows its pins in a strip under it.
 */
export function WiringPage() {
  return <ReactFlowProvider><Wiring /></ReactFlowProvider>;
}

function Wiring() {
  const flow = useReactFlow<HardwareFlowNode, TopologyEdge>();
  const { project, catalog, save, wiring, hardware, edits } = useWiringDocument();
  const [view, setView] = useState<WiringView>("canvas");
  const [tab, setTab] = useState<LeftTab>("hardware");
  const [focusedId, setFocusedId] = useState<string>();
  const [listCreateOpen, setListCreateOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string>();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [nodeMenu, setNodeMenu] = useState<NodeMenu>();
  const [editingPortHardwareId, setEditingPortHardwareId] = useState<string>();
  const [confirmRemove, confirmDialog] = useConfirm();
  const [nodes, setNodes, onNodesChange] = useNodesState<HardwareFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdge>([]);
  const [tableTools, setTableTools] = useState<HTMLElement | null>(null);

  const connections = useMemo(() => wiring?.connections ?? [], [wiring?.connections]);
  const placed = useMemo(() => new Set((wiring?.nodes ?? []).map((node) => node.hardwareId)), [wiring?.nodes]);

  const { movePort, resizeNode } = edits;
  const flowNodes = useMemo(() => (wiring?.nodes ?? []).map((node) => toFlowNode(
    node,
    hardware.find((entry) => entry.hardwareId === node.hardwareId),
    fallbackHardware(node.hardwareId),
    { editingHardwareId: editingPortHardwareId, movePort, resizeNode }
  )), [editingPortHardwareId, hardware, movePort, resizeNode, wiring?.nodes]);
  const flowEdges = useMemo(
    () => toFlowEdges(connections, hardware).map((edge) => ({ ...edge, selected: edge.id === selectedConnectionId })),
    [connections, hardware, selectedConnectionId]
  );
  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);
  // A cable just drawn is picked before its save comes back with it: keep that selection meanwhile.
  const created = useRef<string>(undefined);
  useEffect(() => {
    if (!selectedConnectionId) return;
    if (connections.some((item) => item.connectionId === selectedConnectionId)) {
      if (created.current === selectedConnectionId) created.current = undefined;
    } else if (created.current !== selectedConnectionId) {
      setSelectedConnectionId(undefined);
    }
  }, [connections, selectedConnectionId]);
  useEffect(() => {
    if (focusedId && !hardware.some((item) => item.hardwareId === focusedId)) setFocusedId(undefined);
  }, [focusedId, hardware]);

  const closeMenu = useCallback(() => setNodeMenu(undefined), []);
  const stopEditing = useCallback(() => setEditingPortHardwareId(undefined), []);
  useTransientNodeUi({ menu: nodeMenu, editingHardwareId: editingPortHardwareId, closeMenu, stopEditing });

  /** A click in the hardware list: find its card on the canvas and keep only its cables in the table; a
   *  second click on the same one shows everything again. */
  const focusHardware = (item: Hardware) => {
    if (focusedId === item.hardwareId) { setFocusedId(undefined); return; }
    setFocusedId(item.hardwareId);
    if (placed.has(item.hardwareId)) {
      void flow.fitView({ nodes: [{ id: item.hardwareId }], padding: 0.6, maxZoom: 1, duration: 240 });
    }
  };
  /** A canvas drag between two connectors is the same cable the 针脚表 creates: confirm it straight
   *  through, then open its pin editor so the mapping can be corrected. */
  const connectOnCanvas = ({ portA, portB }: ManualPair) => {
    const pair = sortedPair(portA, portB);
    const existing = connections.find((item) => sortedPair(item.portA, item.portB) === pair);
    if (existing) { setSelectedConnectionId(existing.connectionId); return; }
    const a = resolvePortRef(portA, hardware);
    const b = resolvePortRef(portB, hardware);
    const connectionId = edits.createConnection(portA, portB, straightThrough(a.port, b.port));
    if (connectionId) {
      created.current = connectionId;
      setSelectedConnectionId(connectionId);
      setEditingConnectionId(connectionId);
    }
  };
  const removeNode = async (hardwareId: string) => {
    setEditingPortHardwareId((current) => current === hardwareId ? undefined : current);
    const cables = connections.filter((entry) => touchesHardware(entry, hardwareId)).length;
    if (cables > 0 && !await confirmRemove({
      title: "从画布移除",
      message: `这台硬件上还有 ${cables} 条接线，移除卡片会一并删掉它们。`,
      confirmLabel: "移除并删除接线",
      danger: true
    })) return;
    edits.removeNode(hardwareId);
  };

  const tabs = (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
      <h2 className="tf-label text-fg-2">{PAGE_LABELS.wiring}</h2>
      <SegmentedControl<LeftTab> label="左栏内容" size="xs" className="ml-auto" value={tab} options={leftTabs}
        onChange={setTab} />
    </header>
  );
  const left = tab === "hardware" ? (
    <Panel as="aside" aria-label="硬件列表" className="h-full">
      {tabs}
      <PanelBody>
        <HardwareList hardware={hardware} placed={placed} selectedId={focusedId} onSelect={focusHardware} />
      </PanelBody>
    </Panel>
  ) : (
    <WiringLogPanel hardware={hardware} header={tabs} />
  );

  if (project.isError) {
    return (
      <PageFrame page="wiring" left={left}>
        <div className="grid h-full place-items-center p-6">
          <div role="alert" className={cn("flex max-w-[560px] items-start gap-2 rounded-md border border-fail/35",
            "bg-fail/8 px-3 py-2 text-xs text-fail")}>
            <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="break-words whitespace-pre-wrap">{errorMessage(project.error)}</span>
          </div>
        </div>
      </PageFrame>
    );
  }
  if (project.isLoading || catalog.isLoading || !wiring) {
    return (
      <PageFrame page="wiring" left={left}>
        <div className="grid h-full place-items-center"><Spinner label="正在读取接线" /></div>
      </PageFrame>
    );
  }

  const editingConnection = connections.find((item) => item.connectionId === editingConnectionId);
  const selectedConnection = connections.find((item) => item.connectionId === selectedConnectionId);

  return (
    <PageFrame page="wiring" left={left}>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <Toolbar aria-label="接线工具栏" className="h-9 px-2">
          <SegmentedControl<WiringView> label="接线视图" value={view} options={viewOptions} onChange={setView} />
          {save.isPending && <span className="text-2xs whitespace-nowrap text-fg-3">正在保存…</span>}
          <ToolbarDivider />
          {/* One slot per view, both kept mounted so the table's portal target never moves. */}
          <span ref={setTableTools} role="group" aria-label="针脚表工具"
            className={cn("flex min-w-0 flex-1 items-center gap-1.5", view !== "table" && "hidden")} />
          <span role="group" aria-label="画布工具"
            className={cn("flex min-w-0 flex-1 items-center gap-1.5", view !== "canvas" && "hidden")}>
            <span className="tf-label text-fg-3">画布硬件</span>
            <span className="tf-num text-xs text-fg">{wiring.nodes.length}</span>
            <span className="tf-label ml-2 text-fg-3">接线</span>
            <span className="tf-num text-xs text-fg">{connections.length}</span>
          </span>
        </Toolbar>
        {save.isError && (
          <div role="alert"
            className="flex items-start gap-2 border-b border-fail/35 bg-fail/8 px-3 py-1.5 text-xs text-fail">
            <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <span className="break-words whitespace-pre-wrap">{errorMessage(save.error)}</span>
          </div>
        )}
        {/* Both stay mounted: the canvas keeps its viewport while the table is shown. */}
        <div className={cn("min-h-0 flex-1", view !== "table" && "hidden")}>
          <PinList
            connections={connections}
            hardware={hardware}
            filter={focusedId}
            busy={save.isPending}
            toolbar={tableTools}
            onCreate={() => setListCreateOpen(true)}
            onEdit={setEditingConnectionId}
            onRemove={edits.removeConnection}
          />
        </div>
        <div className={cn("flex min-h-0 flex-1 flex-col", view !== "canvas" && "hidden")}>
          <div className="min-h-0 flex-1">
            <WiringCanvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={connectOnCanvas}
              onDropHardware={edits.addNode}
              onMoveNode={edits.moveNode}
              onSelectConnection={setSelectedConnectionId}
              onNodeMenu={setNodeMenu}
            />
          </div>
          {selectedConnection && (
            <ConnectionStrip
              connection={selectedConnection}
              hardware={hardware}
              onClose={() => setSelectedConnectionId(undefined)}
              onEdit={() => setEditingConnectionId(selectedConnection.connectionId)}
              onRemove={edits.removeConnection}
              removing={save.isPending}
            />
          )}
        </div>
      </div>

      {nodeMenu && (
        <NodeContextMenu
          menu={nodeMenu}
          onEditPorts={() => { setEditingPortHardwareId(nodeMenu.hardwareId); setNodeMenu(undefined); }}
          onRemove={() => { setNodeMenu(undefined); void removeNode(nodeMenu.hardwareId); }}
        />
      )}
      <ListCreateConnectionModal
        open={listCreateOpen}
        hardware={hardware}
        existing={connections}
        onClose={() => setListCreateOpen(false)}
        onCreate={(portA, portB, pins) => { edits.createConnection(portA, portB, pins); setListCreateOpen(false); }}
      />
      <EditPinsModal
        connection={editingConnection}
        hardware={hardware}
        onClose={() => setEditingConnectionId(undefined)}
        onSave={(connectionId, pins) => {
          edits.updateConnectionPins(connectionId, pins);
          setEditingConnectionId(undefined);
        }}
      />
      {confirmDialog}
    </PageFrame>
  );
}
