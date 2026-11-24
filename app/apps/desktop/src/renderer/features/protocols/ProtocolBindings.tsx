import { useMemo, useState } from "react";
import type { ProtocolBindingState } from "@sage/contracts/projects";
import { Link2Icon, Unlink2Icon } from "lucide-react";
import { Button, IconButton, Input, Select, cn, useConfirm } from "../../ui/index.js";
import { useToast } from "../../ui/toast.js";
import { errorMessage } from "../../lib/errors.js";
import { useMonitorStreams } from "../../lib/queries.js";
import { ALIAS, nextAlias } from "./icd-model.js";
import { useUpdateProtocols } from "./use-protocols.js";

/** A raw stream a protocol can be put on. */
export type RawSource = { hardwareId: string; streamId: string; streamType: string };

const sourceKey = (source: { hardwareId: string; streamId: string }) => `${source.hardwareId}/${source.streamId}`;

/**
 * 解析的数据流: the raw streams one protocol (ICD) decodes, as a bar over its editor. The ICD says how the bytes
 * split into frames and fields; once bound, each numeric field is a signal of that device,
 * `<alias>.<message>.<field>`, with a live value. A protocol is bound here, and only once it has been saved.
 */
export function ProtocolBindings({ icd, transport, bindings, aliases, pending, onBound }: {
  /** The saved ICD; undefined while a new protocol has not been saved yet. */
  icd: string | undefined;
  /** `bytes` or `frames`: it can only decode streams of that type. */
  transport?: string | undefined;
  /** This ICD's bindings. */
  bindings: readonly ProtocolBindingState[];
  /** Aliases already bound in the project. */
  aliases: readonly string[];
  /** The stream the operator came here to decode (from a device's 解析协议): preselected. */
  pending?: RawSource | undefined;
  onBound?: () => void;
}) {
  const toast = useToast();
  const update = useUpdateProtocols();
  const devices = useMonitorStreams();
  const [confirm, confirmDialog] = useConfirm();
  const [picked, setPicked] = useState<string>();
  const [alias, setAlias] = useState<string>();

  const sources = useMemo(() => {
    const raw = (devices.data ?? []).flatMap((device) => device.streams
      .filter((stream) => !stream.derived && (stream.type === "bytes" || stream.type === "frames"))
      .map((stream): RawSource & { label: string } => ({
        hardwareId: device.hardwareId, streamId: stream.id, streamType: String(stream.type),
        label: `${device.label || device.hardwareId} / ${stream.id}`
      })));
    // The stream asked for is offered even while its device has not reported its streams.
    if (pending && !raw.some((item) => sourceKey(item) === sourceKey(pending))) {
      raw.unshift({ ...pending, label: sourceKey(pending) });
    }
    return raw.filter((item) => !transport || item.streamType === transport);
  }, [devices.data, pending, transport]);
  const bound = new Set(bindings.map((binding) => sourceKey(binding.source)));
  const free = sources.filter((item) => !bound.has(sourceKey(item)));
  const wanted = picked ?? (pending ? sourceKey(pending) : undefined);
  const chosen = free.find((item) => sourceKey(item) === wanted) ?? free[0];
  const name = alias ?? nextAlias(aliases, icd);
  const aliasError = !ALIAS.test(name) ? "别名只能包含字母、数字和下划线，且不能以数字开头"
    : aliases.includes(name) ? `别名 ${name} 已被使用` : undefined;

  const bind = () => {
    if (!icd || !chosen) return;
    update.mutate(
      [{ op: "add", icd, alias: name, source: { hardwareId: chosen.hardwareId, streamId: chosen.streamId } }],
      {
        onSuccess: () => {
          toast.success(`已用 ${icd} 解析 ${chosen.streamId}`);
          setAlias(undefined);
          setPicked(undefined);
          onBound?.();
        },
        onError: (error) => toast.error(errorMessage(error))
      }
    );
  };
  const unbind = async (binding: ProtocolBindingState) => {
    if (!await confirm({
      title: "解除协议",
      message: `不再用 ${binding.icd} 解析这条流；字段信号 ${binding.alias}.* 会从面板和测试引用里失效。`,
      confirmLabel: "解除",
      danger: true
    })) return;
    update.mutate([{ op: "remove", alias: binding.alias }], { onError: (error) => toast.error(errorMessage(error)) });
  };

  return (
    <section aria-label="解析的数据流" className={cn("flex min-h-10 shrink-0 flex-wrap items-center gap-x-3",
      "gap-y-1.5 border-b border-line bg-surface-1 px-3 py-1.5")}>
      <h3 className="tf-label shrink-0 text-fg-3">解析的数据流</h3>
      {bindings.map((binding) => (
        <span key={binding.alias} title={binding.ok ? `别名 ${binding.alias}` : binding.error}
          className={cn("flex h-6 items-center gap-1.5 rounded-sm border pr-0.5 pl-2 text-xs",
            binding.ok ? "border-line bg-surface-0 text-fg" : "border-fail/40 bg-fail/8 text-fail")}>
          <span className="font-mono">{sourceKey(binding.source)}</span>
          <span className="text-fg-3">→ {binding.alias}.*</span>
          <IconButton label={`解除协议 ${binding.alias}`} size="icon-xs" variant="ghost"
            onClick={() => void unbind(binding)}><Unlink2Icon /></IconButton>
        </span>
      ))}
      {!icd ? (
        <span className="text-xs text-fg-3">保存这份协议后，在这里选它要解析的数据流。</span>
      ) : !free.length ? (
        <span className="text-xs text-fg-3">
          {bindings.length ? "没有别的数据流可解析了。" : "还没有可解析的原始数据流：先在设备页添加带字节流或报文流的设备。"}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5">
          <Select aria-label="数据流" className="h-7 w-56 text-xs" value={chosen ? sourceKey(chosen) : ""}
            onChange={(event) => setPicked(event.target.value)}>
            {free.map((item) => <option key={sourceKey(item)} value={sourceKey(item)}>{item.label}</option>)}
          </Select>
          <span className="text-xs text-fg-3">别名</span>
          <Input aria-label="别名" className="h-7 w-28 font-mono text-xs" value={name}
            aria-invalid={Boolean(aliasError)} onChange={(event) => setAlias(event.target.value)} />
          <Button size="xs" variant={pending ? "primary" : "outline"}
            disabled={!chosen || Boolean(aliasError) || update.isPending} onClick={bind}>
            <Link2Icon />绑定
          </Button>
          {aliasError && <span role="alert" className="text-xs text-fail">{aliasError}</span>}
        </span>
      )}
      {confirmDialog}
    </section>
  );
}
