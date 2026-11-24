import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CpuIcon, PlusIcon, RefreshCwIcon, RotateCwIcon } from "lucide-react";
import { PageFrame, usePageActive } from "../../app/PageFrame.js";
import { errorMessage } from "../../lib/errors.js";
import { invalidateDeviceData, invalidateWiringData } from "../../lib/mutations.js";
import { PAGE_LABELS } from "../../lib/pages.js";
import { useDashboard, useDeviceCatalog, useDevicePackages } from "../../lib/queries.js";
import {
  Button, EmptyState, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Panel, PanelBody,
  PanelHeader, Section, Spinner, Toolbar, cn, useToast
} from "../../ui";
import { AddDeviceDialog, pickDevicePackage, type StagedPackage } from "../devices/AddDeviceDialog.js";
import { importBundleFile } from "../devices/BundleActions.js";
import { HardwareEditor } from "../devices/HardwareEditor.js";
import { HardwareList } from "../devices/HardwareList.js";
import { DeviceDetail, PartDetail } from "./DeviceDetail.js";

/** A new passive part being registered: it has no id yet, so it is not in the list. */
const NEW_PART = Symbol("new part");

/**
 * 设备 page: the project's devices and passive parts on the left, the picked one in the centre with everything
 * about it — identity, status, connector pins, signals, manual actions, self-test — and its form when edited.
 * A device arrives as a device package (`.sagedev`), a passive part is registered here or imported (`.sagehw`).
 */
export function DevicesPage() {
  const client = useQueryClient();
  const toast = useToast();
  const active = usePageActive("devices");
  const dashboard = useDashboard();
  const catalog = useDeviceCatalog();
  const packages = useDevicePackages();
  const [picked, setPicked] = useState<string | typeof NEW_PART>();
  const [staged, setStaged] = useState<StagedPackage>();
  const [checking, setChecking] = useState(false);
  const hardware = useMemo(() => catalog.data?.hardware ?? [], [catalog.data]);
  // The centre always shows something while there is hardware: the first one until another is picked.
  const selected = picked === NEW_PART ? undefined
    : hardware.find((item) => item.hardwareId === picked) ?? hardware[0];
  const instance = selected && dashboard.data?.devices.find((item) => item.hardwareId === selected.hardwareId);

  const refreshAll = async () => {
    await Promise.all([invalidateDeviceData(client), invalidateWiringData(client)]);
  };
  const checkStatus = async () => {
    setChecking(true);
    try {
      await Promise.allSettled((dashboard.data?.devices ?? [])
        .map(({ deviceId }) => window.sage.devices.refreshDevice({ deviceId })));
    } finally {
      await refreshAll();
      setChecking(false);
    }
  };
  /** A device is added from its device package: pick the .sagedev, then confirm in the dialog. */
  const addDevice = async () => {
    try {
      const chosen = await pickDevicePackage();
      if (chosen) setStaged(chosen);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  /** A passive part arrives as a finished `.sagehw`: pick it and import, no editor in between. */
  const importPart = async () => {
    try {
      const message = await importBundleFile("hardware");
      if (!message) return;
      await refreshAll();
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const left = (
    <Panel as="aside" aria-label="设备列表" className="h-full">
      <PanelHeader
        title={PAGE_LABELS.devices}
        meta={hardware.length}
        actions={(
          <>
            <IconButton label="检测设备状态" size="icon-sm" disabled={checking} onClick={() => void checkStatus()}>
              <RefreshCwIcon className={cn(checking && "animate-spin")} />
            </IconButton>
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="添加" size="icon-sm"><PlusIcon /></IconButton>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => void addDevice()}>添加设备…</MenuItem>
                <MenuItem onSelect={() => setPicked(NEW_PART)}>登记被测件 / 夹具</MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={() => void importPart()}>导入被测件 / 夹具（.sagehw）…</MenuItem>
              </MenuContent>
            </Menu>
          </>
        )}
      />
      {packages.data?.restartRequired && (
        <div role="status" className={cn("mx-2 mt-2 flex items-center gap-2 rounded-md border border-line",
          "bg-surface-2 px-2.5 py-1.5 text-xs leading-5 text-fg-2")}>
          <span className="min-w-0 flex-1">设备驱动已更新，重启 SAGE 后生效。</span>
          <Button size="sm" onClick={() => void window.sage.window.relaunch()}><RotateCwIcon />重启</Button>
        </div>
      )}
      <PanelBody>
        <HardwareList hardware={hardware} selectedId={selected?.hardwareId}
          onSelect={(item) => setPicked(item.hardwareId)}
          onAddDevice={() => void addDevice()} onAddPart={() => setPicked(NEW_PART)} />
      </PanelBody>
    </Panel>
  );

  return (
    <PageFrame page="devices" left={left}>
      {catalog.isLoading ? (
        <div className="grid h-full place-items-center"><Spinner label="正在读取设备" /></div>
      ) : picked === NEW_PART ? (
        <main aria-label="登记被测件 / 夹具" className="flex h-full min-h-0 min-w-0 flex-col">
          <Toolbar><strong className="text-sm font-semibold text-fg">登记被测件 / 夹具</strong></Toolbar>
          <PanelBody>
            <div className="mx-auto max-w-4xl p-3">
              <div className="overflow-hidden rounded-md border border-line bg-surface-1">
                <Section title="端口和针脚用于接线">
                  <HardwareEditor
                    onClose={() => setPicked((current) => current === NEW_PART ? undefined : current)}
                    onChanged={async (hardwareId) => { await refreshAll(); setPicked(hardwareId); }} />
                </Section>
              </div>
            </div>
          </PanelBody>
        </main>
      ) : !selected ? (
        <EmptyState icon={<CpuIcon />} title="还没有设备"
          description="设备从它的设备包（.sagedev）添加；被测件和夹具在这里登记端口和针脚。"
          action={(
            <>
              <Button variant="primary" onClick={() => void addDevice()}><PlusIcon />添加设备…</Button>
              <Button onClick={() => setPicked(NEW_PART)}>登记被测件 / 夹具</Button>
            </>
          )} />
      ) : selected.kind !== "managed" ? (
        <PartDetail key={selected.hardwareId} hardware={selected}
          onChanged={refreshAll} onRemoved={() => setPicked(undefined)} />
      ) : instance ? (
        <DeviceDetail key={selected.hardwareId} hardware={selected} instance={instance} active={active}
          onChanged={refreshAll} onRemoved={() => setPicked(undefined)} />
      ) : (
        // The device list arrives with the dashboard, a moment after the hardware catalog.
        <div className="grid h-full place-items-center"><Spinner label="正在读取设备" /></div>
      )}
      <AddDeviceDialog staged={staged} onClose={() => setStaged(undefined)} onAdded={refreshAll} />
    </PageFrame>
  );
}
