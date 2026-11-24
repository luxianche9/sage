import type { ReactNode } from "react";
import type { ProtocolBindingState } from "@sage/contracts/projects";
import { BinaryIcon, FileCode2Icon } from "lucide-react";
import { openPage } from "../../lib/pages.js";
import { Button, cn } from "../../ui";
import type { LatestEntry } from "../variables/use-latest-values.js";
import { formatValue, VALUE_TYPES, type DeviceVariables, type RawVariable, type Variable } from
  "../variables/variable-model.js";

const TYPE_LABELS: Record<string, string> = {
  scalar: "模拟", bits: "位", bytes: "字节流", frames: "报文流", block: "采样块", blob: "文件", events: "事件"
};

/**
 * A device's signals with their live values. Under a raw byte / frame stream are the protocols put on it and
 * the fields they decode; protocols are written and bound on the 协议 page, which the buttons here open.
 */
export function DeviceSignals({ device, label, values }: {
  device: DeviceVariables | undefined;
  label: string;
  values: ReadonlyMap<string, LatestEntry>;
}) {
  if (!device?.known || (!device.signals.length && !device.raws.length)) {
    return (
      <p className="text-xs text-fg-3">
        {device?.known ? "这台设备没有声明信号。" : "设备连接后显示它的信号。"}
      </p>
    );
  }
  return (
    <ul aria-label={`${label} 的信号`} className="overflow-hidden rounded-md border border-line bg-surface-1">
      {device.signals.map((item) => (
        <SignalRow key={item.key} item={item} depth={0} value={values.get(item.key)} />
      ))}
      {device.raws.map((raw) => (
        <li key={raw.key} role="group" aria-label={`${raw.name} 及其协议字段`}>
          <ul>
            <SignalRow item={raw} depth={0} action={<BindButton raw={raw} />} />
            {raw.bindings.map((binding) => <BindingRow key={binding.alias} binding={binding} />)}
            {raw.fields.map((field) => (
              <SignalRow key={field.key} item={field} depth={1} value={values.get(field.key)} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function BindButton({ raw }: { raw: RawVariable }) {
  return (
    <Button size="xs" variant="ghost" className="h-5 shrink-0 px-1.5"
      title="去协议页，选一份协议（ICD）把这条流解析成字段信号"
      onClick={() => openPage({
        page: "protocols",
        source: { hardwareId: raw.hardwareId, streamId: raw.stream.id, streamType: String(raw.stream.type) }
      })}>
      <BinaryIcon />解析协议
    </Button>
  );
}

function SignalRow({ item, depth, value, action }: {
  item: Variable;
  depth: 0 | 1;
  value?: LatestEntry | undefined;
  action?: ReactNode;
}) {
  const type = String(item.stream.type);
  const live = VALUE_TYPES.has(type) || Boolean(item.stream.derived);
  const offline = value?.state && value.state.state !== "connected" && value.state.state !== "live";
  const width = typeof item.stream.width === "number" && item.stream.width > 1 ? item.stream.width : "";
  return (
    <li title={`${item.hardwareId}/${item.stream.id}`}
      className={cn("flex h-7 items-center gap-2 border-b border-line/60 pr-2.5 text-xs last:border-b-0",
        "hover:bg-surface-2", depth === 0 ? "pl-2.5" : "pl-8")}>
      <span className="min-w-0 truncate text-fg">{item.name}</span>
      {item.name !== item.stream.id && (
        <span className="min-w-0 truncate font-mono text-2xs text-fg-3">{item.stream.id}</span>
      )}
      <span className="flex-1" />
      {live ? (
        <span aria-label={`${item.name} 的当前值`}
          className={cn("shrink-0 font-mono tabular-nums", offline || !value?.record ? "text-fg-3" : "text-fg")}>
          {formatValue(value?.record?.v, type)}{item.unit && <span className="text-fg-3"> {item.unit}</span>}
        </span>
      ) : (
        <span className="shrink-0 text-2xs text-fg-3">
          {TYPE_LABELS[type] ?? type}{width}{item.unit && ` ${item.unit}`}
        </span>
      )}
      {action}
    </li>
  );
}

/** One protocol on a raw stream: its ICD (opened on the 协议 page), or why it decodes nothing. */
function BindingRow({ binding }: { binding: ProtocolBindingState }) {
  return (
    <li className="flex h-7 items-center gap-1.5 border-b border-line/60 pr-2.5 pl-8 text-xs">
      <FileCode2Icon className="size-3 shrink-0 text-fg-3" />
      <span className="truncate font-mono text-fg-2" title={`别名 ${binding.alias}，协议 ${binding.icd}`}>
        {binding.alias} · {binding.icd}
      </span>
      {!binding.ok && <span className="min-w-0 flex-1 truncate text-fail" title={binding.error}>{binding.error}</span>}
      <span className="flex-1" />
      <Button size="xs" variant="ghost" className="h-5 shrink-0 px-1.5"
        onClick={() => openPage({ page: "protocols", icd: binding.icd })}>
        打开协议
      </Button>
    </li>
  );
}
