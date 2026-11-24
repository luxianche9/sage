import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BinaryIcon, FileCode2Icon, PlusIcon, XIcon } from "lucide-react";
import { PageFrame } from "../../app/PageFrame.js";
import { useLeaveGuard } from "../../lib/hooks/useLeaveGuard.js";
import { onPageRequested, PAGE_LABELS } from "../../lib/pages.js";
import { queryKeys } from "../../lib/query-keys.js";
import {
  AddSlot, Button, EmptyState, IconButton, Panel, PanelBody, PanelHeader, Spinner, cn, useConfirm
} from "../../ui/index.js";
import { IcdEditor } from "./IcdEditor.js";
import { ProtocolBindings, type RawSource } from "./ProtocolBindings.js";
import { useProtocolBindings } from "./use-protocols.js";

/** A protocol being written that has no file yet. */
const NEW = Symbol("new protocol");

const DISCARD = {
  title: "放弃未保存的修改？",
  message: "这份协议有没保存的修改。",
  confirmLabel: "放弃修改",
  danger: true
};

/**
 * 协议 page: the project's protocols (ICD files) on the left, the picked one's editor in the centre with the
 * raw streams it decodes in a bar over it. A protocol can be written before any device is connected; a
 * device's 解析协议 button comes here with its stream preselected.
 */
export function ProtocolsPage() {
  const icds = useQuery({ queryKey: queryKeys.icds, queryFn: () => window.sage.testing.listIcds() });
  const protocols = useProtocolBindings();
  const [confirm, confirmDialog] = useConfirm();
  const [picked, setPicked] = useState<string | typeof NEW>();
  const [pending, setPending] = useState<RawSource>();
  const [dirty, setDirty] = useState(false);
  /** Bumped to reload the editor from the file, dropping its changes. */
  const [reset, setReset] = useState(0);
  const list = icds.data ?? [];
  const selected = picked === NEW ? undefined : list.find((item) => item.name === picked) ?? list[0];
  const creating = picked === NEW;

  const state = useRef({ dirty, empty: !list.length });
  state.current = { dirty, empty: icds.isSuccess && !list.length };
  useEffect(() => onPageRequested((request) => {
    if (request.page !== "protocols") return;
    if (request.source) setPending(request.source);
    // Unsaved work stays on screen; the stream asked for is still preselected for it.
    if (state.current.dirty) return;
    if (request.icd) setPicked(request.icd);
    else if (request.source && state.current.empty) setPicked(NEW);
  }), []);
  useLeaveGuard(dirty, () => confirm(DISCARD), () => { setDirty(false); setReset((count) => count + 1); });

  const choose = async (next: string | typeof NEW) => {
    if (next === (creating ? NEW : selected?.name)) return;
    if (dirty && !await confirm(DISCARD)) return;
    setDirty(false);
    setPicked(next);
  };

  const bindings = protocols.data ?? [];
  const own = selected ? bindings.filter((item) => item.icd === selected.name) : [];
  const aliases = bindings.map((item) => item.alias);
  const source = own[0]?.source ?? pending;

  const left = (
    <Panel as="aside" aria-label="协议列表" className="h-full">
      <PanelHeader
        title={PAGE_LABELS.protocols}
        meta={list.length}
        actions={(
          <IconButton label="新建协议" size="icon-sm" onClick={() => void choose(NEW)}><PlusIcon /></IconButton>
        )}
      />
      {pending && (
        <div role="status" className={cn("mx-2 mt-2 flex items-start gap-2 rounded-md border border-signal/40",
          "bg-signal/8 px-2.5 py-1.5 text-xs leading-5 text-fg-2")}>
          <span className="min-w-0 flex-1 break-words">
            要解析 <code className="font-mono text-fg">{pending.hardwareId}/{pending.streamId}</code>
            ：选一份协议（或新建并保存），再点「绑定」。
          </span>
          <IconButton label="不解析了" size="icon-xs" variant="ghost" onClick={() => setPending(undefined)}>
            <XIcon />
          </IconButton>
        </div>
      )}
      <PanelBody className="py-1">
        <ul>
          {list.map((item) => {
            const count = bindings.filter((binding) => binding.icd === item.name).length;
            return (
              <li key={item.name}>
                <button type="button" aria-current={!creating && item.name === selected?.name ? "true" : undefined}
                  onClick={() => void choose(item.name)}
                  className={cn("grid w-full gap-0.5 px-3 py-1.5 text-left outline-none transition-colors duration-120",
                    "hover:bg-surface-2 focus-visible:bg-surface-2 aria-[current=true]:bg-surface-3")}>
                  <span className="flex items-center gap-1.5">
                    <FileCode2Icon className="size-3 shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{item.name}</span>
                    {count > 0 && <span className="shrink-0 text-2xs text-fg-3">解析 {count} 条流</span>}
                  </span>
                  <span className={cn("truncate pl-[18px] text-2xs", item.valid ? "text-fg-3" : "text-fail")}
                    title={item.valid ? item.description ?? undefined : item.error}>
                    {item.valid ? item.description || "—" : "无效"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {icds.isSuccess && !list.length && !creating && (
          <div className="px-3 py-2">
            <AddSlot icon={<FileCode2Icon aria-hidden />} onClick={() => void choose(NEW)}>新建协议</AddSlot>
          </div>
        )}
      </PanelBody>
    </Panel>
  );

  return (
    <PageFrame page="protocols" left={left}>
      {icds.isLoading ? (
        <div className="grid h-full place-items-center"><Spinner label="正在读取协议" /></div>
      ) : !creating && !selected ? (
        <EmptyState icon={<BinaryIcon />} title="还没有协议"
          description="协议（ICD）说明一串字节怎样切成报文、报文里每个字段在第几个字节。写好后绑定到设备的原始数据流上，字段就成为可以显示和判定的信号。"
          action={<Button variant="primary" onClick={() => void choose(NEW)}><PlusIcon />新建协议</Button>} />
      ) : (
        <IcdEditor
          key={`${creating ? "" : selected?.name}:${reset}`}
          name={creating ? undefined : selected?.name}
          alias={own[0]?.alias}
          source={source}
          onDirtyChange={setDirty}
          onSaved={(name) => setPicked(name)}
          bindings={(
            <ProtocolBindings
              icd={creating ? undefined : selected?.name}
              transport={creating ? undefined : selected?.transport ?? undefined}
              bindings={own}
              aliases={aliases}
              pending={pending}
              onBound={() => setPending(undefined)}
            />
          )}
        />
      )}
      {confirmDialog}
    </PageFrame>
  );
}
