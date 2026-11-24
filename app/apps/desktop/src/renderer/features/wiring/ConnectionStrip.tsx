import type { Hardware } from "@sage/contracts/devices";
import type { ProjectWiringConnection } from "@sage/contracts/wiring";
import { ArrowRightIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { pinText, resolvePortRef } from "../../lib/hardware.js";
import { Button, IconButton } from "../../ui/index.js";
import { pinCountText } from "./wiring-model.js";

function End({ label, port }: { label: string; port: string | undefined }) {
  return <>{label} <span className="font-mono text-2xs text-fg-2">{port ?? "?"}</span></>;
}

/**
 * The cable selected on the canvas, as a strip under it: its two ends, its pin pairs, and the same 编辑针脚 /
 * 删除 actions a 针脚表 row offers. Under the canvas rather than beside it: the page has no right column.
 */
export function ConnectionStrip({ connection, hardware, onClose, onEdit, onRemove, removing }: {
  connection: ProjectWiringConnection;
  hardware: Hardware[];
  onClose: () => void;
  onEdit: () => void;
  onRemove: (connectionId: string) => void;
  removing: boolean;
}) {
  const a = resolvePortRef(connection.portA, hardware);
  const b = resolvePortRef(connection.portB, hardware);
  return (
    <aside aria-label="端口接线详情"
      className="flex max-h-[40%] min-h-0 shrink-0 flex-col border-t border-line bg-surface-1">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 truncate text-sm text-fg">
          <End label={a.hardware?.label ?? connection.portA} port={a.port?.name} />
          <span className="mx-1.5 text-fg-3">↔</span>
          <End label={b.hardware?.label ?? connection.portB} port={b.port?.name} />
        </span>
        <span className="shrink-0 text-2xs text-fg-3">{pinCountText(connection)}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="xs" disabled={removing} onClick={onEdit}><PencilIcon />编辑针脚</Button>
        <Button variant="danger" size="xs" disabled={removing} onClick={() => onRemove(connection.connectionId)}>
          <Trash2Icon />删除这条接线
        </Button>
        <IconButton label="关闭" size="icon-sm" variant="ghost" onClick={onClose}><XIcon /></IconButton>
      </header>
      <div className="min-h-0 overflow-auto">
        {connection.pins.length === 0 ? (
          <p className="px-3 py-3 text-xs text-fg-3">整根线缆（端口对端口）</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-4 px-3 py-1.5">
            {connection.pins.map((pin, index) => (
              <li key={`${pin.a}-${pin.b}`}
                className="grid grid-cols-[20px_minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-2 py-1">
                <span className="tf-num text-2xs text-fg-3">{index + 1}</span>
                <span className="truncate text-xs text-fg">{pinText(a.port, pin.a)}</span>
                <ArrowRightIcon aria-hidden className="size-3 text-fg-3" />
                <span className="truncate text-xs text-fg">{pinText(b.port, pin.b)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
