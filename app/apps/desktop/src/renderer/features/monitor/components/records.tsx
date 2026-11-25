import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { StreamInfo, StreamRecord } from "@sage/contracts/observability";
import { cn } from "../../../ui/index.js";
import { relativeTime, terminalLine } from "../../streams/stream-model.js";
import { useStreamRecords } from "../../streams/useStreamReader.js";
import { panelTitle, textSetting } from "../component-model.js";
import { Hint, streamName, useMonitorStatic, useWindow, type ComponentProps } from "../panel-kit.js";
import { recordRows } from "../trace-model.js";

/** Records kept per component; older ones leave the view. */
const KEEP = 5_000;
/** Rows drawn: the newest of what is kept. */
const SHOWN = 400;

/** The records of one raw stream as they arrive (or as the shown run recorded them), newest last. */
function useRecords(stream: StreamInfo): { records: StreamRecord[]; error: string | undefined } {
  const { source, bench } = useMonitorStatic();
  const store = useRef<StreamRecord[]>([]);
  const [version, setVersion] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  // Records arrive in bursts: one render per 150 ms is plenty.
  const bump = () => {
    if (timer.current !== undefined) return;
    timer.current = window.setTimeout(() => { timer.current = undefined; setVersion((value) => value + 1); }, 150);
  };
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current); }, []);
  const state = useStreamRecords(source, stream.key, bench.mode !== "replay", {
    onReset: () => { store.current = []; bump(); },
    onRecords: (records) => {
      const next = store.current.concat(records);
      store.current = next.length > KEEP ? next.slice(next.length - KEEP) : next;
      bump();
    }
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` stands for the store's content
  const records = useMemo(() => store.current, [version]);
  return { records, error: state.error };
}

function clock(tb: number, origin: number | undefined): string {
  if (origin !== undefined) return relativeTime(tb, origin);
  const date = new Date(tb);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${time}.${pad(date.getMilliseconds(), 3)}`;
}

/** Keeps a scrolling list at its newest row while the time axis follows the data. */
function useStickToEnd(follow: boolean, count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [follow, count]);
  return ref;
}

const DIRECTION: Record<string, { label: string; className: string }> = {
  tx: { label: "发", className: "text-signal" },
  rx: { label: "收", className: "text-pass" },
  mark: { label: "记", className: "text-fg-3" }
};

/** 终端: the traffic of one serial port or bus as text or hex, a line per record, newest at the bottom. */
export function TerminalComponent({ panel }: ComponentProps) {
  const { workspace } = useMonitorStatic();
  const stream = workspace.streamsOf(panel)[0];
  if (!stream) return <Hint>在属性里选一条字节流或报文流</Hint>;
  return <Terminal key={stream.key} panel={panel} stream={stream} />;
}

function Terminal({ panel, stream }: ComponentProps & { stream: StreamInfo }) {
  const view = useWindow();
  const { records, error } = useRecords(stream);
  const mode = textSetting(panel, "mode", ["text", "hex"] as const, "text");
  const shown = records.slice(-SHOWN);
  const ref = useStickToEnd(view.follow, records.length);
  if (error) return <Hint tone="fail">读取失败：{error}</Hint>;
  if (!records.length) return <Hint>{streamName(stream)} 还没有数据</Hint>;
  return (
    <div ref={ref} role="log" aria-label={panelTitle(panel)}
      className="h-full overflow-auto bg-canvas px-2 py-1 font-mono text-2xs leading-5">
      {records.length > shown.length && (
        <p className="text-fg-3">更早的 {records.length - shown.length} 条没有显示</p>
      )}
      {shown.map((record) => {
        const line = terminalLine(String(stream.type), record, mode);
        const direction = DIRECTION[line.dir] ?? DIRECTION.rx!;
        return (
          <div key={record.i} className="flex gap-2 whitespace-pre-wrap">
            <span className="shrink-0 text-fg-3">{clock(record.tb, view.origin)}</span>
            <span className={cn("shrink-0", direction.className)}>{direction.label}</span>
            <span className="min-w-0 break-all text-fg">{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 报文表: one row per frame (or chunk of bytes) — time, direction, id, length, bytes; a row unfolds to its
 *  bytes one by one. */
export function TraceComponent({ panel }: ComponentProps) {
  const { workspace } = useMonitorStatic();
  const stream = workspace.streamsOf(panel)[0];
  if (!stream) return <Hint>在属性里选一条报文流或字节流</Hint>;
  return <Trace key={stream.key} panel={panel} stream={stream} />;
}

function Trace({ panel, stream }: ComponentProps & { stream: StreamInfo }) {
  const view = useWindow();
  const { records, error } = useRecords(stream);
  const [open, setOpen] = useState<string>();
  const rows = useMemo(() => recordRows(stream.key, stream.streamId, records.slice(-SHOWN)), [records, stream]);
  const ref = useStickToEnd(view.follow && !open, records.length);
  if (error) return <Hint tone="fail">读取失败：{error}</Hint>;
  if (!records.length) return <Hint>{streamName(stream)} 还没有数据</Hint>;
  const hex = (byte: number) => byte.toString(16).toUpperCase().padStart(2, "0");
  return (
    <div ref={ref} className="h-full overflow-auto">
      <table aria-label={panelTitle(panel)} className="w-full border-collapse font-mono text-2xs">
        <thead className="sticky top-0 bg-surface-1 font-sans text-fg-3">
          <tr className="h-6 text-left [&>th]:px-2 [&>th]:font-normal">
            <th>时间</th><th>方向</th><th>标识</th><th className="text-right">长度</th><th>数据</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const direction = DIRECTION[row.dir] ?? DIRECTION.rx!;
            const unfolded = open === row.uid;
            return (
              <Fragment key={row.uid}>
                <tr aria-expanded={unfolded} onClick={() => setOpen(unfolded ? undefined : row.uid)}
                  className={cn("h-5 cursor-pointer border-t border-line hover:bg-surface-2 [&>td]:px-2",
                    unfolded && "bg-surface-2")}>
                  <td className="whitespace-nowrap text-fg-3">{clock(row.tb, view.origin)}</td>
                  <td className={direction.className}>{direction.label}</td>
                  <td className="text-fg">{row.ident || "—"}</td>
                  <td className="text-right text-fg-2">{row.bytes.length}</td>
                  <td className="max-w-0 truncate text-fg">{row.bytes.map(hex).join(" ")}</td>
                </tr>
                {unfolded && (
                  <tr className="bg-surface-2">
                    <td colSpan={5} className="px-2 py-1.5">
                      <ol aria-label="逐字节" className="flex flex-wrap gap-1">
                        {row.bytes.map((byte, index) => (
                          <li key={index} title={`第 ${index} 字节 = ${byte}`}
                            className="grid w-7 justify-items-center rounded-sm border border-line bg-surface-0">
                            <span className="text-fg-3">{index}</span>
                            <span className="text-fg">{hex(byte)}</span>
                          </li>
                        ))}
                        {!row.bytes.length && <li className="font-sans text-fg-3">这条记录没有数据字节</li>}
                      </ol>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
