import type { SageLiveApi } from "@sage/contracts/desktop";
import type {
  LiveFrame, RunStreamWindow, StreamPoint, StreamRead, StreamReadQuery, StreamWindow
} from "@sage/contracts/observability";

// The reading hooks (useStreamsPoints, useStreamRecords) went with the scope and terminal panels
// while the component library is redesigned; docs/decisions names the archive tag that keeps them.

/**
 * Where a view's streams come from (design doc 5.9.3). A run has its recording: `window` for
 * min/max points over a range, `records` to page through records. Live data comes as frames from
 * `GET /api/live`; a view without a recording (a device watch) only has `live`.
 */
export interface StreamSource {
  window?: (keys: string[], t0: number, t1: number, width: number) => Promise<RunStreamWindow>;
  records?: (key: string, query: StreamReadQuery) => Promise<StreamRead>;
  live?: SageLiveApi["live"];
}

/** Applies one frame: `reset` replaces a stream's points, otherwise they replace those from `t0` on. */
export function mergeFrame(
  buffers: Readonly<Record<string, StreamWindow>>, frame: LiveFrame
): Record<string, StreamWindow> {
  const next = { ...buffers };
  for (const [key, entry] of Object.entries(frame.streams)) {
    if (entry.records) continue;
    const { reset, points, ...meta } = entry;
    const previous = buffers[key]?.points ?? [];
    const kept = reset ? [] : !points ? previous : previous.slice(0, lowerBound(previous, entry.t0));
    next[key] = { ...buffers[key], ...meta, points: points ? [...kept, ...points] : kept };
  }
  return next;
}

/** Drops points before `cutoff`, keeping the last one of them: the value in force at the cutoff. */
export function trimBuffers(
  buffers: Readonly<Record<string, StreamWindow>>, cutoff: number
): Record<string, StreamWindow> {
  const next: Record<string, StreamWindow> = {};
  for (const [key, item] of Object.entries(buffers)) {
    const points: StreamPoint[] = item.points ?? [];
    const first = lowerBound(points, cutoff);
    const drop = first - 1;
    next[key] = drop > 0 ? { ...item, points: points.slice(drop) } : item;
  }
  return next;
}

/** First point whose timestamp is at least `value`; stream points are kept sorted by timestamp. */
function lowerBound(points: readonly StreamPoint[], value: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle]!.tb < value) low = middle + 1;
    else high = middle;
  }
  return low;
}
