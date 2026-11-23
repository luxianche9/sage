import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Hardware } from "@sage/contracts/devices";
import type { ProtocolBindingState } from "@sage/contracts/projects";
import {
  BinaryIcon, BoxIcon, CheckIcon, ChevronRightIcon, CpuIcon, FileCode2Icon, GripVerticalIcon, PencilIcon, PlusIcon,
  RotateCwIcon, SlidersHorizontalIcon, Unlink2Icon
} from "lucide-react";
import { errorMessage } from "../../lib/errors.js";
import { hardwareStatus } from "../../lib/hardware-status.js";
import { useDashboard, useDevicePackages, useMonitorStreams } from "../../lib/queries.js";
import { queryKeys } from "../../lib/query-keys.js";
import {
  AddSlot, Button, IconButton, Panel, PanelBody, StatusLamp, cn, useConfirm, useToast, type Tone
} from "../../ui/index.js";
import { BindProtocolDialog } from "../protocols/BindProtocolDialog.js";
import { IcdEditorDialog } from "../protocols/IcdEditorDialog.js";
import { useProtocolBindings, useUpdateProtocols } from "../protocols/use-protocols.js";
import { useLatestValues, type LatestEntry } from "../variables/use-latest-values.js";
import {
  deviceVariables, formatValue, liveKeys, VALUE_TYPES, type DeviceVariables, type RawVariable, type Variable
} from "../variables/variable-model.js";
import { HARDWARE_MIME } from "../wiring/WiringCanvas.js";

const statusTone: Record<ReturnType<typeof hardwareStatus>["tone"], Tone> = {
  ok: "pass",
  warn: "run",
  bad: "fail",
  muted: "neutral"
};

const TYPE_LABELS: Record<string, string> = {
  scalar: "模拟", bits: "位", bytes: "字节流", frames: "报文流", block: "采样块", blob: "文件", events: "事件"
};

const rowClass = cn(
  "flex h-8 w-full items-center gap-2 pr-2 pl-1.5 text-left outline-none",
  "transition-colors duration-120 hover:bg-surface-2 active:bg-surface-3",
  "focus-visible:bg-surface-2 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-signal"
);

type Binding = { hardwareId: string; streamId: string; streamType: string };

/**
 * 设备管理 of 测试台架: devices (plugin instances), passive parts and the project's protocols. A click on a
 * device expands it to its signals with their live values; under a raw byte / frame stream are the protocols
 * put on it (解析协议 binds one) and the fields they decode. A passive part has no signals, so its click opens
 * its information. The edit button opens the information of either; a device's actions open from its control
 * button. A row is dragged onto the 端口连线 canvas to place its card. Signals are put on 运行监控 widgets from
 * the widget's property panel.
 */
export function DeviceList({
  hardware, placed, header, active, onOpen, onControl, onAddDevice, onAddPart, ...props
}: {
  hardware: Hardware[];
  /** Hardware already carded on the 端口连线 canvas. */
  placed: ReadonlySet<string>;
  header: ReactNode;
  /** Shown: live values are polled only then. */
  active: boolean;
  onOpen: (hardware: Hardware) => void;
  onControl: (hardwareId: string, anchor: DOMRect) => void;
  onAddDevice: () => void;
  onAddPart: () => void;
  id?: string;
  role?: string;
}) {
  const dashboard = useDashboard();
  const packages = useDevicePackages();
  const declared = useMonitorStreams();
  const protocols = useProtocolBindings();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [binding, setBinding] = useState<Binding>();
  const availability = useMemo(
    () => new Map((dashboard.data?.availability ?? []).map((item) => [item.hardwareId, item])),
    [dashboard.data]
  );
  const variables = useMemo(
    () => new Map((declared.data ?? []).map((device) =>
      [device.hardwareId, deviceVariables(device, protocols.data ?? [])])),
    [declared.data, protocols.data]
  );
  const expanded = [...variables.values()].filter((device) => open.has(device.hardwareId));
  const values = useLatestValues(liveKeys(expanded), active && expanded.length > 0);
  const aliases = (protocols.data ?? []).map((item) => item.alias);
  const statusOf = (item: Hardware) => {
    if (item.kind !== "managed") return undefined;
    const instance = dashboard.data?.deviceStatuses.find((entry) => entry.deviceId === item.deviceId);
    const status = hardwareStatus(instance, availability.get(item.hardwareId));
    return { label: status.label, tone: statusTone[status.tone], title: status.title, pulse: status.tone === "warn" };
  };
  const toggle = (hardwareId: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(hardwareId)) next.delete(hardwareId); else next.add(hardwareId);
    return next;
  });
  const groups = [
    { key: "managed", title: "设备", add: { label: "添加设备（.sagedev）", run: onAddDevice },
      items: hardware.filter((item) => item.kind === "managed") },
    { key: "passive", title: "被测件 / 夹具", add: { label: "登记被测件 / 夹具", run: onAddPart },
      items: hardware.filter((item) => item.kind !== "managed") }
  ];
  return (
    <Panel as="aside" aria-label="设备列表" className="min-h-0" {...props}>
      {header}
      {packages.data?.restartRequired && (
        <div
          role="status"
          className={cn(
            "mx-2 mt-2 flex items-center gap-2 rounded-md border border-line bg-surface-2",
            "px-2.5 py-1.5 text-xs leading-5 text-fg-2"
          )}
        >
          <span className="min-w-0 flex-1">设备驱动已更新，重启 SAGE 后生效。</span>
          <Button size="sm" onClick={() => void window.sage.window.relaunch()}>
            <RotateCwIcon />重启
          </Button>
        </div>
      )}
      <PanelBody className="py-1">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title} className="pb-1">
            <h3 className="tf-label flex h-6 items-center gap-1.5 px-3 text-fg-3">
              {group.title}<span className="tf-num">{group.items.length}</span>
            </h3>
            {group.items.length === 0 && (
              <div className="px-3 pb-2"><AddSlot onClick={group.add.run}>{group.add.label}</AddSlot></div>
            )}
            <ul className="grid grid-cols-[minmax(0,1fr)]">
              {group.items.map((item) => {
                const status = statusOf(item);
                const managed = item.kind === "managed";
                const isOpen = open.has(item.hardwareId);
                return (
                  <li key={item.hardwareId}>
                    <div
                      className="group flex items-center"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(HARDWARE_MIME, item.hardwareId);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <button
                        type="button"
                        {...(managed ? { "aria-expanded": isOpen } : {})}
                        onClick={() => (managed ? toggle(item.hardwareId) : onOpen(item))}
                        title={item.label}
                        className={cn(rowClass, "relative min-w-0 flex-1 cursor-grab active:cursor-grabbing")}
                      >
                        <GripVerticalIcon aria-hidden className={cn("absolute left-0 size-3 text-fg-3 opacity-0",
                          "transition-opacity group-hover:opacity-100")} />
                        {/* Only shows whether the signals are open; the whole row toggles them. */}
                        {managed ? (
                          <ChevronRightIcon aria-hidden className={cn("size-3.5 shrink-0 text-fg-3",
                            "transition-transform", isOpen && "rotate-90")} />
                        ) : <span aria-hidden className="w-3.5 shrink-0" />}
                        <span className={cn("grid size-5 shrink-0 place-items-center rounded-sm border",
                          "border-line bg-surface-0 text-fg-3")}>
                          {managed ? <CpuIcon className="size-3" /> : <BoxIcon className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.label}</span>
                        {placed.has(item.hardwareId) && (
                          <CheckIcon aria-label="已在画布上" className="size-3 shrink-0 text-fg-3" />
                        )}
                        {status && (
                          <span title={status.title} className="flex shrink-0 items-center gap-1.5 text-2xs text-fg-2">
                            <StatusLamp tone={status.tone} pulse={status.pulse} />{status.label}
                          </span>
                        )}
                      </button>
                      <IconButton label={`详细 ${item.label}`} title="查看和编辑设备信息" size="icon-sm"
                        variant="ghost" className={managed ? "" : "mr-1"} onClick={() => onOpen(item)}>
                        <PencilIcon />
                      </IconButton>
                      {managed && (
                        <IconButton label={`控制 ${item.label}`} size="icon-sm" variant="ghost" className="mr-1"
                          onClick={(event) => onControl(item.hardwareId, event.currentTarget.getBoundingClientRect())}>
                          <SlidersHorizontalIcon />
                        </IconButton>
                      )}
                    </div>
                    {managed && isOpen && (
                      <SignalRows device={variables.get(item.hardwareId)} label={item.label} values={values}
                        onBind={(raw) => setBinding({
                          hardwareId: raw.hardwareId, streamId: raw.stream.id, streamType: String(raw.stream.type)
                        })} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <ProtocolFiles />
      </PanelBody>
      {binding && <BindProtocolDialog {...binding} aliases={aliases} onClose={() => setBinding(undefined)} />}
    </Panel>
  );
}

/** A device's signals with their live values; raw streams carry their protocols and decoded fields. */
function SignalRows({ device, label, values, onBind }: {
  device: DeviceVariables | undefined;
  label: string;
  values: ReadonlyMap<string, LatestEntry>;
  onBind: (raw: RawVariable) => void;
}) {
  if (!device?.known || (!device.signals.length && !device.raws.length)) {
    return (
      <p className="pb-1.5 pl-10 text-2xs text-fg-3">
        {device?.known ? "这台设备没有声明信号" : "设备连接后显示它的信号"}
      </p>
    );
  }
  return (
    <ul aria-label={`${label} 的信号`} className="pb-1">
      {device.signals.map((item) => (
        <SignalRow key={item.key} item={item} depth={1} value={values.get(item.key)} />
      ))}
      {device.raws.map((raw) => (
        <li key={raw.key} role="group" aria-label={`${raw.name} 及其协议字段`}>
          <ul>
            <SignalRow item={raw} depth={1}
              action={(
                <Button size="xs" variant="ghost" className="h-5 shrink-0 px-1.5" onClick={() => onBind(raw)}
                  title="选一份协议（ICD）把这条流解析成字段信号">
                  <BinaryIcon />解析协议
                </Button>
              )} />
            {raw.bindings.map((binding) => <BindingRow key={binding.alias} binding={binding} />)}
            {raw.fields.map((field) => (
              <SignalRow key={field.key} item={field} depth={2} value={values.get(field.key)} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function SignalRow({ item, depth, value, action }: {
  item: Variable;
  depth: 1 | 2;
  value?: LatestEntry | undefined;
  action?: ReactNode;
}) {
  const type = String(item.stream.type);
  const live = VALUE_TYPES.has(type) || Boolean(item.stream.derived);
  const offline = value?.state && value.state.state !== "connected" && value.state.state !== "live";
  const width = typeof item.stream.width === "number" && item.stream.width > 1 ? item.stream.width : "";
  return (
    <li title={`${item.hardwareId}/${item.stream.id}`}
      className={cn("flex h-6 items-center gap-2 pr-2 text-2xs hover:bg-surface-2", depth === 1 ? "pl-10" : "pl-14")}>
      <span className="min-w-0 truncate text-fg">{item.name}</span>
      {item.name !== item.stream.id && <span className="min-w-0 truncate font-mono text-fg-3">{item.stream.id}</span>}
      <span className="flex-1" />
      {live ? (
        <span aria-label={`${item.name} 的当前值`}
          className={cn("shrink-0 font-mono tabular-nums", offline || !value?.record ? "text-fg-3" : "text-fg")}>
          {formatValue(value?.record?.v, type)}{item.unit && <span className="text-fg-3"> {item.unit}</span>}
        </span>
      ) : (
        <span className="shrink-0 text-fg-3">{TYPE_LABELS[type] ?? type}{width}{item.unit && ` ${item.unit}`}</span>
      )}
      {action}
    </li>
  );
}

/** One protocol on a raw stream: its ICD (editable here), or why it decodes nothing. */
function BindingRow({ binding }: { binding: ProtocolBindingState }) {
  const toast = useToast();
  const update = useUpdateProtocols();
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState(false);
  const unbind = async () => {
    if (!await confirm({
      title: "解除协议",
      message: `不再用 ${binding.icd} 解析这条流；字段信号 ${binding.alias}.* 会从面板和测试引用里失效。`,
      confirmLabel: "解除",
      danger: true
    })) return;
    update.mutate([{ op: "remove", alias: binding.alias }], {
      onError: (error) => toast.error(errorMessage(error))
    });
  };
  return (
    <li className="group/binding flex h-6 items-center gap-1.5 pr-2 pl-14 text-2xs">
      <FileCode2Icon className="size-3 shrink-0 text-fg-3" />
      <span className="truncate font-mono text-fg-2" title={`别名 ${binding.alias}，协议 ${binding.icd}`}>
        {binding.alias} · {binding.icd}
      </span>
      {!binding.ok && <span className="min-w-0 flex-1 truncate text-fail" title={binding.error}>{binding.error}</span>}
      <span className="flex-1" />
      <IconButton label={`编辑协议 ${binding.icd}`} size="icon-xs" variant="ghost"
        className="invisible group-hover/binding:visible" onClick={() => setEditing(true)}><PencilIcon /></IconButton>
      <IconButton label={`解除协议 ${binding.alias}`} size="icon-xs" variant="ghost"
        className="invisible group-hover/binding:visible" onClick={() => void unbind()}><Unlink2Icon /></IconButton>
      {editing && (
        <IcdEditorDialog name={binding.icd} alias={binding.alias} source={binding.source}
          onClose={() => setEditing(false)} />
      )}
      {confirmDialog}
    </li>
  );
}

/** The project's protocols (ICD files): written before any device is connected, bound to raw streams above. */
function ProtocolFiles() {
  const icds = useQuery({ queryKey: queryKeys.icds, queryFn: () => window.sage.testing.listIcds() });
  const [editing, setEditing] = useState<{ name?: string }>();
  return (
    <section aria-label="协议" className="pb-1">
      <h3 className="tf-label flex h-6 items-center gap-1.5 pr-1 pl-3 text-fg-3">
        协议（ICD）<span className="tf-num">{icds.data?.length ?? 0}</span>
        <span className="flex-1" />
        {Boolean(icds.data?.length) && (
          <Button size="xs" variant="ghost" className="h-5 px-1.5" onClick={() => setEditing({})}>
            <PlusIcon />新建协议
          </Button>
        )}
      </h3>
      <ul>
        {(icds.data ?? []).map((item) => (
          <li key={item.name} className="group/icd flex h-6 items-center gap-1.5 pr-2 pl-4 text-2xs hover:bg-surface-2">
            <FileCode2Icon className="size-3 shrink-0 text-fg-3" />
            <span className="truncate font-mono text-fg">{item.name}</span>
            <span className={cn("min-w-0 flex-1 truncate", item.valid ? "text-fg-3" : "text-fail")}
              title={item.valid ? item.description ?? undefined : item.error}>
              {item.valid ? item.description ?? "" : "无效"}
            </span>
            <IconButton label={`编辑协议 ${item.name}`} size="icon-xs" variant="ghost"
              className="invisible group-hover/icd:visible" onClick={() => setEditing({ name: item.name })}>
              <PencilIcon />
            </IconButton>
          </li>
        ))}
        {icds.isSuccess && !icds.data.length && (
          <li className="px-3 pb-2">
            <AddSlot icon={<FileCode2Icon aria-hidden />} onClick={() => setEditing({})}>新建协议</AddSlot>
          </li>
        )}
      </ul>
      {editing && <IcdEditorDialog {...editing} onClose={() => setEditing(undefined)} />}
    </section>
  );
}
