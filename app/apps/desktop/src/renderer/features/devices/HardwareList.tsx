import { useMemo, type ReactNode } from "react";
import type { Hardware } from "@sage/contracts/devices";
import { BoxIcon, CheckIcon, CpuIcon, GripVerticalIcon } from "lucide-react";
import { HARDWARE_MIME } from "../../lib/hardware.js";
import { useDashboard } from "../../lib/queries.js";
import { AddSlot, StatusLamp, cn } from "../../ui";
import { hardwareRowStatus } from "./device-labels.js";

const rowClass = cn(
  "relative flex h-8 w-full items-center gap-2 pr-2.5 pl-3 text-left outline-none",
  "transition-colors duration-120 hover:bg-surface-2 active:bg-surface-3",
  "focus-visible:bg-surface-2 focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-signal",
  "aria-[current=true]:bg-surface-3"
);

/**
 * The project's hardware as the left column of a page: devices (plugin instances) with their status, then
 * passive parts (DUTs, fixtures). A click picks one for the page's centre. Where `placed` is given the rows
 * can also be dragged onto the wiring canvas, and those already on it carry a tick.
 */
export function HardwareList({ hardware, selectedId, onSelect, placed, onAddDevice, onAddPart }: {
  hardware: Hardware[];
  selectedId?: string | undefined;
  onSelect: (item: Hardware) => void;
  /** Hardware already carded on the wiring canvas; makes the rows draggable. */
  placed?: ReadonlySet<string> | undefined;
  /** Offered in place of an empty group. */
  onAddDevice?: (() => void) | undefined;
  onAddPart?: (() => void) | undefined;
}) {
  const dashboard = useDashboard();
  const status = useMemo(() => {
    const availability = new Map((dashboard.data?.availability ?? []).map((item) => [item.hardwareId, item]));
    const statuses = new Map((dashboard.data?.deviceStatuses ?? []).map((item) => [item.deviceId, item]));
    return (item: Hardware) => item.kind === "managed"
      ? hardwareRowStatus(statuses.get(item.deviceId ?? ""), availability.get(item.hardwareId))
      : undefined;
  }, [dashboard.data]);
  const groups: { key: string; title: string; icon: ReactNode; add?: ReactNode; items: Hardware[] }[] = [
    {
      key: "managed", title: "设备", icon: <CpuIcon className="size-3" />,
      add: onAddDevice && <AddSlot onClick={onAddDevice}>添加设备（.sagedev）</AddSlot>,
      items: hardware.filter((item) => item.kind === "managed")
    },
    {
      key: "passive", title: "被测件 / 夹具", icon: <BoxIcon className="size-3" />,
      add: onAddPart && <AddSlot onClick={onAddPart}>登记被测件 / 夹具</AddSlot>,
      items: hardware.filter((item) => item.kind !== "managed")
    }
  ];
  return (
    <div className="py-1">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title} className="pb-1">
          <h3 className="tf-label flex h-6 items-center gap-1.5 px-3 text-fg-3">
            {group.title}<span className="tf-num">{group.items.length}</span>
          </h3>
          {group.items.length === 0 && (
            group.add
              ? <div className="px-3 pb-2">{group.add}</div>
              : <p className="px-3 pb-2 text-2xs text-fg-3">还没有，在设备页添加。</p>
          )}
          <ul className="grid grid-cols-[minmax(0,1fr)]">
            {group.items.map((item) => {
              const state = status(item);
              return (
                <li key={item.hardwareId} className="group">
                  <button
                    type="button"
                    title={item.label}
                    aria-current={item.hardwareId === selectedId ? "true" : undefined}
                    draggable={Boolean(placed)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(HARDWARE_MIME, item.hardwareId);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => onSelect(item)}
                    className={cn(rowClass, placed && "cursor-grab active:cursor-grabbing")}
                  >
                    {placed && (
                      <GripVerticalIcon aria-hidden className={cn("absolute left-0 size-3 text-fg-3 opacity-0",
                        "transition-opacity group-hover:opacity-100")} />
                    )}
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-sm border",
                      "border-line bg-surface-0 text-fg-3")}>
                      {group.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.label}</span>
                    {placed?.has(item.hardwareId) && (
                      <CheckIcon aria-label="已在画布上" className="size-3 shrink-0 text-fg-3" />
                    )}
                    {state && (
                      <span title={state.title} className="flex shrink-0 items-center gap-1.5 text-2xs text-fg-2">
                        <StatusLamp tone={state.tone} pulse={state.pulse ?? false} />{state.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
