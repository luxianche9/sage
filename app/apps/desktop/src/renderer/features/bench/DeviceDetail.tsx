import { useMemo, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import type { DeviceInstance, Hardware, ToolCatalogItem } from "@sage/contracts/devices";
import { ChevronRightIcon, PencilIcon, RefreshCwIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { errorMessage } from "../../lib/errors.js";
import { useDashboard, useDeviceDefinition, useMonitorStreams } from "../../lib/queries.js";
import { Badge, Button, PanelBody, Section, Toolbar, cn, useConfirm } from "../../ui";
import { DeviceEditor } from "../devices/DeviceEditor.js";
import { HardwareEditor } from "../devices/HardwareEditor.js";
import { hardwareRowStatus } from "../devices/device-labels.js";
import { ErrorStrip, HardwareSections, Meta } from "../devices/inspector-parts.js";
import { useProtocolBindings } from "../protocols/use-protocols.js";
import { useLatestValues } from "../variables/use-latest-values.js";
import { deviceVariables, liveKeys } from "../variables/variable-model.js";
import { ActionForm } from "./ActionForm.js";
import { DeviceSignals } from "./DeviceSignals.js";
import { actionKind, actionName, deviceActions } from "./device-actions.js";
import { SelfTest } from "./SelfTest.js";
import { selfTestTool } from "./self-test.js";

type DetailProps = {
  hardware: Hardware;
  onChanged: () => Promise<void>;
  /** The hardware is gone: the page picks another. */
  onRemoved: () => void;
};

function Card({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-md border border-line bg-surface-1">{children}</div>;
}

function Body({ children }: { children: ReactNode }) {
  return <PanelBody><div className="mx-auto grid max-w-4xl gap-3 p-3">{children}</div></PanelBody>;
}

/**
 * The centre of the 设备 page for a device (plugin instance): identity and status, connector pins, signals
 * with their live values, the actions it can be asked to do by hand, and its self-test. 编辑 turns the first
 * card into its form; nothing here opens a dialog except the confirmation before deleting.
 */
export function DeviceDetail({ hardware, instance, active, onChanged, onRemoved }: DetailProps & {
  instance: DeviceInstance;
  /** Shown: live values are polled only then. */
  active: boolean;
}) {
  const dashboard = useDashboard();
  const definition = useDeviceDefinition(instance.hardwareId).data;
  const declared = useMonitorStreams();
  const protocols = useProtocolBindings();
  const [confirm, confirmNode] = useConfirm();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [openAction, setOpenAction] = useState<string>();
  const deviceStatus = dashboard.data?.deviceStatuses.find((item) => item.deviceId === instance.deviceId);
  const availability = dashboard.data?.availability?.find((item) => item.hardwareId === instance.hardwareId);
  const status = hardwareRowStatus(deviceStatus, availability);
  const online = availability?.state === "available";
  const identity = definition?.document.identity;
  const tools = dashboard.data?.tools;
  const actions = useMemo(() => deviceActions(tools ?? [], instance.deviceId), [tools, instance.deviceId]);
  const selfTest = useMemo(() => selfTestTool(tools ?? [], instance.deviceId), [tools, instance.deviceId]);
  const variables = useMemo(() => {
    const device = declared.data?.find((item) => item.hardwareId === hardware.hardwareId);
    return device && deviceVariables(device, protocols.data ?? []);
  }, [declared.data, protocols.data, hardware.hardwareId]);
  const values = useLatestValues(variables ? liveKeys([variables]) : [], active);

  const refresh = useMutation({
    mutationFn: () => window.sage.devices.refreshDevice({ deviceId: instance.deviceId }),
    onMutate: () => setError(undefined),
    onError: (reason) => setError(errorMessage(reason)),
    onSettled: () => void onChanged()
  });
  const remove = useMutation({
    mutationFn: () => window.sage.devices.removeDevice({ deviceId: instance.deviceId }),
    onError: (reason) => setError(errorMessage(reason)),
    onSuccess: async () => { await onChanged(); onRemoved(); }
  });
  const requestRemove = async () => {
    if (await confirm({
      title: "删除设备",
      message: `删除 ${instance.label}？画布上的卡片和接线保留，设备不再受控。`,
      confirmLabel: "删除",
      danger: true
    })) remove.mutate();
  };

  return (
    <main aria-label={`设备 ${hardware.label}`} className="flex h-full min-h-0 min-w-0 flex-col">
      <Toolbar aria-label="设备操作">
        <strong className="min-w-0 truncate text-sm font-semibold text-fg">{hardware.label}</strong>
        <Badge tone={status.tone} title={status.title}>{status.label}</Badge>
        <span className="flex-1" />
        <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          <RefreshCwIcon className={cn(refresh.isPending && "animate-spin")} />检测状态
        </Button>
        <Button size="sm" variant="outline" aria-pressed={editing} onClick={() => setEditing((value) => !value)}>
          <PencilIcon />编辑
        </Button>
        <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => void requestRemove()}>
          <Trash2Icon />删除
        </Button>
      </Toolbar>
      {error && <ErrorStrip message={error} />}
      <Body>
        <Card>
          <Section title={editing ? "编辑设备" : "基本信息"}>
            {editing ? (
              <DeviceEditor instance={instance} onClose={() => setEditing(false)} onChanged={onChanged} />
            ) : (
              <>
                {definition?.document.description && (
                  <p className="text-xs break-words text-fg-2">{definition.document.description}</p>
                )}
                <Meta items={[
                  {
                    label: "型号",
                    value: identity ? `${identity.manufacturer ?? ""} ${identity.model ?? ""}`.trim() : instance.type
                  },
                  { label: "设备 ID", value: instance.deviceId }
                ]} />
                {status.title && (
                  <p className={cn("text-xs break-words", status.tone === "fail" ? "text-fail" : "text-fg-3")}>
                    {status.title}
                  </p>
                )}
              </>
            )}
          </Section>
        </Card>
        <Card><HardwareSections hardware={hardware} /></Card>
        <Card>
          <Section title="信号">
            <DeviceSignals device={variables} label={hardware.label} values={values} />
          </Section>
        </Card>
        <Card>
          <Section title="手动操作"
            actions={<span className="tf-num text-2xs text-fg-3">{actions.length} 个动作</span>}>
            {actions.length === 0 && <p className="text-xs text-fg-3">该设备没有可执行的动作。</p>}
            {actions.length > 0 && (
              <ul className="overflow-hidden rounded-md border border-line">
                {actions.map((action) => (
                  <ActionRow key={action.externalName} action={action} siblings={actions}
                    open={openAction === action.externalName}
                    onToggle={() => setOpenAction((current) =>
                      current === action.externalName ? undefined : action.externalName)}
                    hardwareId={hardware.hardwareId} available={online} />
                ))}
              </ul>
            )}
          </Section>
        </Card>
        {selfTest && (
          <Card>
            <SelfTest key={selfTest.externalName} tool={selfTest} hardwareId={hardware.hardwareId} available={online} />
          </Card>
        )}
      </Body>
      {confirmNode}
    </main>
  );
}

function ActionRow({ action, siblings, open, onToggle, hardwareId, available }: {
  action: ToolCatalogItem;
  siblings: ToolCatalogItem[];
  open: boolean;
  onToggle: () => void;
  hardwareId: string;
  available: boolean;
}) {
  const kind = actionKind(action);
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" aria-expanded={open} title={action.description} onClick={onToggle}
        className={cn("flex h-8 w-full items-center gap-2 px-2.5 text-left outline-none transition-colors",
          "duration-120 hover:bg-surface-2 focus-visible:bg-surface-2", open && "bg-surface-2")}>
        <ChevronRightIcon aria-hidden className={cn("size-3.5 shrink-0 text-fg-3 transition-transform",
          open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{actionName(action, siblings)}</span>
        <Badge tone={kind.tone}>{kind.label}</Badge>
      </button>
      {open && <ActionForm action={action} hardwareId={hardwareId} available={available} />}
    </li>
  );
}

/** The centre of the 设备 page for a passive part (DUT, fixture): its ids and connector pins; 编辑 turns the
 *  page into the part's form. */
export function PartDetail({ hardware, onChanged, onRemoved }: DetailProps) {
  const [confirm, confirmNode] = useConfirm();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => window.sage.devices.removeHardware({ hardwareId: hardware.hardwareId }),
    onError: (reason) => setError(errorMessage(reason)),
    onSuccess: async () => { await onChanged(); onRemoved(); }
  });
  const exportBundle = useMutation({
    mutationFn: async () => window.sage.dialogs.saveBundle(
      "hardware", hardware.hardwareId, await window.sage.devices.exportBundle({ hardwareId: hardware.hardwareId })
    ),
    onError: (reason) => setError(errorMessage(reason))
  });
  const requestRemove = async () => {
    if (await confirm({
      title: "删除被测件",
      message: `删除 ${hardware.label}？它的端口和针脚一并删除，画布上的卡片会显示为未解析。`,
      confirmLabel: "删除",
      danger: true
    })) remove.mutate();
  };
  return (
    <main aria-label={`被测件 ${hardware.label}`} className="flex h-full min-h-0 min-w-0 flex-col">
      <Toolbar aria-label="被测件操作">
        <strong className="min-w-0 truncate text-sm font-semibold text-fg">{hardware.label}</strong>
        <Badge>被测件 / 夹具</Badge>
        <span className="flex-1" />
        <Button size="sm" variant="outline" disabled={exportBundle.isPending} title="导出为 .sagehw 文件"
          onClick={() => exportBundle.mutate()}>
          <UploadIcon />导出
        </Button>
        <Button size="sm" variant="outline" aria-pressed={editing} onClick={() => setEditing((value) => !value)}>
          <PencilIcon />编辑
        </Button>
        <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => void requestRemove()}>
          <Trash2Icon />删除
        </Button>
      </Toolbar>
      {error && <ErrorStrip message={error} />}
      <Body>
        {editing ? (
          <Card>
            <Section title="编辑硬件">
              <HardwareEditor hardware={hardware} onClose={() => setEditing(false)} onChanged={onChanged} />
            </Section>
          </Card>
        ) : (
          <>
            <Card>
              <Section title="基本信息">
                <Meta items={[{ label: "硬件 ID", value: hardware.hardwareId }]} />
              </Section>
            </Card>
            <Card><HardwareSections hardware={hardware} /></Card>
          </>
        )}
      </Body>
      {confirmNode}
    </main>
  );
}
