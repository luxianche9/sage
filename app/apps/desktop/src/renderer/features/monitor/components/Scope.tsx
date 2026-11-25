import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { StreamPoint } from "@sage/contracts/observability";
import { cn } from "../../../ui/index.js";
import { TIME_DIVISIONS } from "../../streams/scope-controls.js";
import { formatNumber, hasBit, relativeTime, type TimeRange } from "../../streams/stream-model.js";
import { lampBits, panelTitle } from "../component-model.js";
import {
  Hint, staleTitle, streamName, unitOf, useMonitorStatic, useMonitorTimeContext, useReadings, useWindow,
  type ComponentProps, type Reading
} from "../panel-kit.js";

const PAD = { left: 46, right: 8, top: 6, bottom: 18 };
const LANE = 14;
const CHANNELS = 5;

function cssColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function numeric(point: StreamPoint): number | undefined {
  return typeof point.v === "number" && Number.isFinite(point.v) ? point.v : undefined;
}

type Lane = { reading: Reading; bit: number; name: string };

/** Everything one frame of the waveform draws, so the drawing itself is a plain function. */
interface Frame {
  width: number;
  height: number;
  range: TimeRange;
  analog: Reading[];
  lanes: Lane[];
  marker: number | undefined;
  origin: number | undefined;
}

function draw(context: CanvasRenderingContext2D, frame: Frame) {
  const { width, height, range, analog, lanes } = frame;
  const plot = {
    x: PAD.left, y: PAD.top, w: Math.max(1, width - PAD.left - PAD.right),
    h: Math.max(1, height - PAD.top - PAD.bottom - lanes.length * LANE)
  };
  const span = range[1] - range[0];
  const xOf = (tb: number) => plot.x + ((tb - range[0]) / span) * plot.w;
  const grid = cssColor("--tf-canvas-grid");
  const text = cssColor("--tf-fg-3");
  context.clearRect(0, 0, width, height);
  context.font = "10px ui-monospace, monospace";
  context.lineWidth = 1;

  // The value axis fits every analog trace shown, with a little room above and below.
  let low = Infinity;
  let high = -Infinity;
  for (const reading of analog) {
    for (const point of reading.points ?? []) {
      const value = numeric(point);
      if (value === undefined || point.tb < range[0] || point.tb > range[1]) continue;
      if (value < low) low = value;
      if (value > high) high = value;
    }
  }
  if (!Number.isFinite(low)) { low = 0; high = 1; }
  if (high === low) { high += 1; low -= 1; }
  const room = (high - low) * 0.08;
  low -= room;
  high += room;
  const yOf = (value: number) => plot.y + plot.h - ((value - low) / (high - low)) * plot.h;

  context.strokeStyle = grid;
  context.fillStyle = text;
  context.beginPath();
  for (let division = 0; division <= TIME_DIVISIONS; division += 1) {
    const x = Math.round(plot.x + (plot.w * division) / TIME_DIVISIONS) + 0.5;
    context.moveTo(x, plot.y);
    context.lineTo(x, plot.y + plot.h + lanes.length * LANE);
  }
  if (analog.length) {
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let step = 0; step <= 4; step += 1) {
      const value = low + ((high - low) * step) / 4;
      const y = Math.round(yOf(value)) + 0.5;
      context.moveTo(plot.x, y);
      context.lineTo(plot.x + plot.w, y);
      context.fillText(formatNumber(value), plot.x - 5, y);
    }
  }
  context.stroke();

  // Time labels: against the run's start when there is one, else back from the newest edge.
  context.textBaseline = "top";
  for (let division = 0; division <= TIME_DIVISIONS; division += 2) {
    const tb = range[0] + (span * division) / TIME_DIVISIONS;
    const label = frame.origin !== undefined ? `${relativeTime(tb, frame.origin, 1)}s`
      : division === TIME_DIVISIONS ? "现在" : `-${((range[1] - tb) / 1000).toFixed(span < 5000 ? 1 : 0)}s`;
    context.textAlign = division === 0 ? "left" : division === TIME_DIVISIONS ? "right" : "center";
    context.fillText(label, plot.x + (plot.w * division) / TIME_DIVISIONS, height - PAD.bottom + 5);
  }

  context.save();
  context.beginPath();
  context.rect(plot.x, plot.y, plot.w, plot.h + lanes.length * LANE);
  context.clip();
  analog.forEach((reading, index) => {
    context.strokeStyle = cssColor(`--tf-ch-${(index % CHANNELS) + 1}`);
    context.lineWidth = 1.5;
    context.beginPath();
    let started = false;
    for (const point of reading.points ?? []) {
      const value = numeric(point);
      if (value === undefined) { started = false; continue; }
      if (started) context.lineTo(xOf(point.tb), yOf(value));
      else context.moveTo(xOf(point.tb), yOf(value));
      started = true;
    }
    context.stroke();
  });
  // A bit holds its level until the next record: each lane is filled while it is set.
  lanes.forEach((lane, index) => {
    const top = plot.y + plot.h + index * LANE;
    const points = lane.reading.points ?? [];
    context.fillStyle = cssColor(`--tf-ch-${((analog.length + index) % CHANNELS) + 1}`);
    points.forEach((point, at) => {
      if (!hasBit(Number(point.mask ?? 0), lane.bit)) return;
      const from = Math.max(plot.x, xOf(point.tb));
      const to = Math.min(plot.x + plot.w, xOf(points[at + 1]?.tb ?? range[1]));
      if (to > from) context.fillRect(from, top + 3, to - from, LANE - 6);
    });
    context.fillStyle = grid;
    context.fillRect(plot.x, top + LANE - 1, plot.w, 1);
  });
  if (frame.marker !== undefined && frame.marker >= range[0] && frame.marker <= range[1]) {
    context.strokeStyle = cssColor("--tf-signal");
    context.lineWidth = 1;
    context.beginPath();
    const x = Math.round(xOf(frame.marker)) + 0.5;
    context.moveTo(x, plot.y);
    context.lineTo(x, plot.y + plot.h + lanes.length * LANE);
    context.stroke();
  }
  context.restore();

  context.fillStyle = text;
  context.textAlign = "right";
  context.textBaseline = "middle";
  lanes.forEach((lane, index) => {
    context.fillText(lane.name.slice(0, 7), plot.x - 5, plot.y + plot.h + index * LANE + LANE / 2);
  });
}

/**
 * 波形: the streams over the shared time axis — analog ones overlaid on one value axis, the lines of bits
 * streams as lanes under them. A click picks an instant for every component; a drag zooms to that span.
 */
export function ScopeComponent({ panel }: ComponentProps) {
  const { pick } = useMonitorStatic();
  const time = useMonitorTimeContext();
  const view = useWindow();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<{ from: number; to: number }>();
  // Columns are asked for in hundreds, so resizing does not start a new subscription per pixel.
  const { readings, range } = useReadings(panel, Math.max(200, Math.ceil(size.width / 100) * 100));

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const analog = readings.filter((reading) => reading.stream.type !== "bits");
  const lanes: Lane[] = readings.filter((reading) => reading.stream.type === "bits").flatMap((reading) =>
    lampBits(panel, reading.stream.declaration).slice(0, 16).map((bit) => ({
      reading, bit, name: reading.stream.declaration?.bitLabels?.[bit] ?? `${reading.stream.streamId}.${bit}`
    })));

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context || !range || !size.width || !size.height) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.round(size.width * ratio);
    element.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(context, { ...size, range, analog, lanes, marker: view.marker, origin: view.origin });
  });

  if (!readings.length) return <Hint>在属性里添加要画的信号</Hint>;
  const timeAt = (event: ReactPointerEvent): number | undefined => {
    const bounds = box.current?.getBoundingClientRect();
    if (!bounds || !range) return undefined;
    const share = (event.clientX - bounds.left - PAD.left) / Math.max(1, bounds.width - PAD.left - PAD.right);
    return range[0] + Math.max(0, Math.min(1, share)) * (range[1] - range[0]);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul aria-label={`${panelTitle(panel)} 的图例`} className="flex shrink-0 flex-wrap gap-x-3 px-2 pt-1 text-2xs">
        {analog.map((reading, index) => (
          <li key={reading.stream.key} title={staleTitle(reading)} className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3" style={{ background: `var(--tf-ch-${(index % CHANNELS) + 1})` }} />
            <span className="text-fg-2">{streamName(reading.stream)}</span>
            <span className={cn("tf-num font-mono", staleTitle(reading) ? "text-fg-3" : "text-fg")}>
              {formatNumber(reading.value)} {unitOf(reading.stream)}
            </span>
          </li>
        ))}
      </ul>
      <div ref={box} className="relative min-h-0 flex-1 cursor-crosshair touch-none"
        onPointerDown={(event) => {
          const at = timeAt(event);
          if (at === undefined || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrag({ from: at, to: at });
        }}
        onPointerMove={(event) => {
          const at = timeAt(event);
          if (drag && at !== undefined) setDrag({ from: drag.from, to: at });
        }}
        onPointerUp={(event) => {
          if (!drag || !range) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const [start, end] = drag.from <= drag.to ? [drag.from, drag.to] : [drag.to, drag.from];
          // A drag wider than a hundredth of the view zooms to it; anything less is a click.
          if (end - start > (range[1] - range[0]) / 100) time.select([start, end]);
          else pick(drag.to);
          setDrag(undefined);
        }}
        onPointerCancel={() => setDrag(undefined)}>
        <canvas ref={canvas} role="img" aria-label={panelTitle(panel)} className="absolute inset-0 size-full" />
        {drag && range && drag.from !== drag.to && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 bg-signal/15" style={{
            left: `calc(${PAD.left}px + (100% - ${PAD.left + PAD.right}px) * ${
              (Math.min(drag.from, drag.to) - range[0]) / (range[1] - range[0])})`,
            width: `calc((100% - ${PAD.left + PAD.right}px) * ${Math.abs(drag.to - drag.from) / (range[1] - range[0])})`
          }} />
        )}
      </div>
    </div>
  );
}
