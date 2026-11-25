import type { ReactNode } from "react";
import type { MonitorPanel } from "@sage/contracts/monitor";
import { cn, toneText, verdictLabels, verdictTone } from "../../../ui/index.js";
import { measure } from "../../streams/measure.js";
import { formatNumber, hasBit } from "../../streams/stream-model.js";
import { lampBits, numberSetting, panelTitle, textSetting } from "../component-model.js";
import {
  Hint, staleTitle, streamName, unitOf, useMonitorStatic, useReadings, type ComponentProps, type Reading
} from "../panel-kit.js";

function fixed(value: number | undefined, decimals: number | undefined): string {
  if (value === undefined) return "—";
  return decimals === undefined ? formatNumber(value) : value.toFixed(Math.max(0, Math.min(6, decimals)));
}

function outside(value: number | undefined, lo: number | undefined, hi: number | undefined): boolean {
  return value !== undefined && ((lo !== undefined && value < lo) || (hi !== undefined && value > hi));
}

/** The small name over a bare component (it has no title bar of its own). */
function Caption({ children, title }: { children: ReactNode; title?: string | undefined }) {
  return <span title={title} className="min-w-0 truncate text-2xs text-fg-3">{children}</span>;
}

/**
 * 数值: one value with its unit — as digits, a bar or a dial — red outside its limits. A bar or dial needs a
 * range: without one it says so rather than draw a scale nobody set.
 */
export function NumberComponent({ panel }: ComponentProps) {
  const { readings } = useReadings(panel, 60);
  const reading = readings[0];
  const display = textSetting(panel, "display", ["digits", "bar", "dial"] as const, "digits");
  const min = numberSetting(panel, "min");
  const max = numberSetting(panel, "max");
  const lo = numberSetting(panel, "lo");
  const hi = numberSetting(panel, "hi");
  const stale = staleTitle(reading);
  const value = reading?.value;
  const alarm = outside(value, lo, hi);
  const ranged = min !== undefined && max !== undefined && max > min;
  const share = ranged && value !== undefined ? Math.max(0, Math.min(1, (value - min) / (max - min))) : undefined;
  const digits = (
    <span className={cn("tf-num truncate font-mono leading-none", display === "digits" ? "text-2xl" : "text-base",
      stale ? "text-fg-3" : alarm ? "text-fail" : "text-fg")}>
      {fixed(value, numberSetting(panel, "decimals"))}
      {reading && <span className="ml-1 text-xs text-fg-3">{unitOf(reading.stream)}</span>}
    </span>
  );
  return (
    <div title={stale} aria-label={panelTitle(panel)}
      className={cn("flex h-full min-h-0 flex-col justify-center gap-1 px-2.5 py-1.5", stale && "opacity-70")}>
      <Caption>{panel.title || (reading ? streamName(reading.stream) : "数值")}</Caption>
      {display !== "digits" && !ranged ? (
        <>{digits}<span className="text-2xs text-fg-3">在属性里设置量程</span></>
      ) : display === "bar" ? (
        <>
          {digits}
          <div role="meter" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
            className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full", alarm ? "bg-fail" : "bg-signal")}
              style={{ width: `${(share ?? 0) * 100}%` }} />
          </div>
          <div className="tf-num flex justify-between text-2xs text-fg-3"><span>{min}</span><span>{max}</span></div>
        </>
      ) : display === "dial" ? (
        <Dial share={share} alarm={alarm}>{digits}</Dial>
      ) : digits}
      {stale && display === "digits" && <span className="text-2xs text-fg-3">{stale}</span>}
    </div>
  );
}

/** A 240° dial: the track, and the arc up to the value. */
function Dial({ share, alarm, children }: { share: number | undefined; alarm: boolean; children: ReactNode }) {
  const radius = 40;
  const sweep = 240;
  const point = (fraction: number) => {
    const angle = ((150 + sweep * fraction) * Math.PI) / 180;
    return `${50 + radius * Math.cos(angle)} ${50 + radius * Math.sin(angle)}`;
  };
  const arc = (fraction: number) =>
    `M ${point(0)} A ${radius} ${radius} 0 ${sweep * fraction > 180 ? 1 : 0} 1 ${point(fraction)}`;
  return (
    <div className="relative grid min-h-0 flex-1 place-items-center">
      <svg viewBox="0 0 100 80" role="img" aria-label="表盘" className="h-full max-h-full w-full">
        <path d={arc(1)} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-surface-3" />
        {share !== undefined && share > 0 && (
          <path d={arc(share)} fill="none" strokeWidth="7" strokeLinecap="round"
            className={alarm ? "stroke-fail" : "stroke-signal"} />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-[18%] grid place-items-center">{children}</div>
    </div>
  );
}

function limitsOf(panel: MonitorPanel, reading: Reading): { lo?: number; hi?: number } {
  const all = panel.settings.limits;
  const item = all && typeof all === "object"
    ? (all as Record<string, unknown>)[`${reading.stream.hardwareId}/${reading.stream.streamId}`] : undefined;
  if (!item || typeof item !== "object") return {};
  const { lo, hi } = item as Record<string, unknown>;
  return { ...(typeof lo === "number" ? { lo } : {}), ...(typeof hi === "number" ? { hi } : {}) };
}

/** 数值表: many signals at once — the value now and min / max / mean over the shown window. */
export function ValuesComponent({ panel }: ComponentProps) {
  const { readings, range } = useReadings(panel, 240);
  if (!readings.length) return <Hint>在属性里添加数值信号</Hint>;
  return (
    <div className="h-full overflow-auto">
      <table aria-label={panelTitle(panel)} className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-surface-1 text-2xs text-fg-3">
          <tr className="h-6 text-left [&>th]:px-2 [&>th]:font-normal">
            <th>信号</th><th className="text-right">当前</th><th className="text-right">最小</th>
            <th className="text-right">最大</th><th className="text-right">平均</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => {
            const stats = measure(reading.points, range);
            const limits = limitsOf(panel, reading);
            const stale = staleTitle(reading);
            return (
              <tr key={reading.stream.key} title={stale} className="h-6 border-t border-line [&>td]:px-2">
                <td className="max-w-48 truncate text-fg">{streamName(reading.stream)}</td>
                <td className={cn("tf-num text-right font-mono", stale ? "text-fg-3"
                  : outside(reading.value, limits.lo, limits.hi) ? "text-fail" : "text-fg")}>
                  {formatNumber(reading.value)} <span className="text-fg-3">{unitOf(reading.stream)}</span>
                </td>
                <td className="tf-num text-right font-mono text-fg-2">{formatNumber(stats?.min)}</td>
                <td className="tf-num text-right font-mono text-fg-2">{formatNumber(stats?.max)}</td>
                <td className="tf-num text-right font-mono text-fg-2">{formatNumber(stats?.mean)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 指示灯: one lamp per line of a bits stream (all of them, or the bits picked in the settings), or one lamp for
 * a value at or above the threshold. A lamp without data is hollow: unknown is neither on nor off.
 */
export function LampComponent({ panel }: ComponentProps) {
  const { readings } = useReadings(panel, 60);
  if (!readings.length) return <Hint>在属性里选开关量或数值</Hint>;
  const threshold = numberSetting(panel, "threshold") ?? 0.5;
  const lamps = readings.flatMap((reading) => {
    const stale = staleTitle(reading);
    if (reading.stream.type !== "bits") {
      return [{
        key: reading.stream.key, name: readings.length > 1 || !panel.title ? streamName(reading.stream) : panel.title,
        on: reading.value === undefined ? undefined : reading.value >= threshold, stale
      }];
    }
    const labels = reading.stream.declaration?.bitLabels;
    return lampBits(panel, reading.stream.declaration).map((bit) => ({
      key: `${reading.stream.key}#${bit}`, name: labels?.[bit] ?? `${streamName(reading.stream)}.${bit}`,
      on: reading.mask === undefined ? undefined : hasBit(reading.mask, bit), stale
    }));
  });
  return (
    <ul aria-label={panelTitle(panel)}
      className="flex h-full flex-wrap content-center items-center gap-x-3 gap-y-1.5 overflow-auto px-2.5 py-1.5">
      {lamps.map((lamp) => (
        <li key={lamp.key} title={lamp.stale}
          aria-label={`${lamp.name} ${lamp.on === undefined ? "未知" : lamp.on ? "亮" : "灭"}`}
          className="flex items-center gap-1.5 text-xs">
          <span aria-hidden className={cn("size-3 shrink-0 rounded-full border",
            lamp.on === undefined || lamp.stale ? "border-dashed border-fg-3"
              : lamp.on ? "border-pass bg-pass shadow-[0_0_6px_var(--tf-pass)]" : "border-line-strong bg-surface-3")} />
          <span className={cn("truncate", lamp.on && !lamp.stale ? "text-fg" : "text-fg-2")}>{lamp.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** 结果表: every verdict of the run shown, with what was measured against which limit. */
export function ResultsComponent({ panel }: ComponentProps) {
  const { rows, bench, zoomStep } = useMonitorStatic();
  if (!bench.runId) return <Hint>运行测试后，这里列出每一项判定</Hint>;
  if (!rows.length) return <Hint>这次运行还没有判定结果</Hint>;
  return (
    <div className="h-full overflow-auto">
      <table aria-label={panelTitle(panel)} className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-surface-1 text-2xs text-fg-3">
          <tr className="h-6 text-left [&>th]:px-2 [&>th]:font-normal">
            <th>判定项</th><th className="text-right">测得</th><th>限值</th><th>结论</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} title={row.reason}
              className={cn("h-6 border-t border-line [&>td]:px-2",
                row.executionId && "cursor-pointer hover:bg-surface-2")}
              onClick={() => { if (row.executionId) zoomStep(row.executionId); }}>
              <td className="max-w-56 truncate text-fg">{row.name}</td>
              <td className="tf-num text-right font-mono text-fg">
                {row.valueText} <span className="text-fg-3">{row.unit}</span>
              </td>
              <td className="tf-num font-mono text-fg-2">{row.limitText}</td>
              <td className={cn("font-mono font-semibold", toneText[verdictTone(row.verdict)])}>
                {verdictLabels[row.verdict]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const LABEL_SIZES = { sm: "text-xs", md: "text-sm font-medium", lg: "text-lg font-semibold" } as const;

/** 文字: a heading or a note on the canvas. */
export function LabelComponent({ panel }: ComponentProps) {
  const size = textSetting(panel, "size", ["sm", "md", "lg"] as const, "md");
  const text = typeof panel.settings.text === "string" && panel.settings.text ? panel.settings.text : panel.title;
  return (
    <div className={cn("flex h-full items-center px-2 break-words whitespace-pre-wrap text-fg", LABEL_SIZES[size])}>
      {text || <span className="text-fg-3">文字</span>}
    </div>
  );
}

/** 分组框: a titled frame drawn behind the components placed inside it. */
export function GroupComponent({ panel }: ComponentProps) {
  return (
    <div className="pointer-events-none h-full rounded-md">
      <span className="tf-label absolute -top-px left-2 -translate-y-1/2 bg-surface-0 px-1.5 text-fg-2">
        {panelTitle(panel)}
      </span>
    </div>
  );
}
