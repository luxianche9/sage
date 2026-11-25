import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  monitorChannels, placedPanels, type Frame, type Monitor, type MonitorPanel, type MonitorUpdateInput,
  type PanelType, type StreamRef
} from "@sage/contracts/monitor";
import type { DeviceStream, RunTimeline, StreamDeclaration, StreamInfo } from "@sage/contracts/observability";
import type { ProjectDocument } from "@sage/contracts/projects";
import { useMonitorStreams, useProjectDocument } from "../../lib/queries.js";
import { queryKeys } from "../../lib/query-keys.js";
import { incrementedCopy, SINGLE_SOURCE, takes } from "./component-model.js";

/** Drag payload of a component from the library: the component type. */
export const PANEL_MIME = "application/x-sage-panel";
/** Drag payload of a variable from the variable list: `{hardwareId, streamId, type}` as JSON. */
export const VARIABLE_MIME = "application/x-sage-variable";

const EMPTY: Monitor = { panels: [] };

function streamKey(ref: StreamRef): string {
  return `${ref.hardwareId}__${ref.streamId}`;
}

/** What the panels need of a stream the device declares; live frames carry the rest. */
function declaredStreamInfo(hardwareId: string, stream: DeviceStream | undefined, streamId: string): StreamInfo {
  const declaration = (stream ?? {}) as StreamDeclaration & { rateHz?: number };
  return {
    key: `${hardwareId}__${streamId}`,
    hardwareId,
    streamId,
    type: stream?.type ?? "scalar",
    clock: null,
    count: 0,
    first: null,
    last: null,
    lastI: null,
    watermark: null,
    watermarkTb: null,
    gaps: 0,
    // A sampled stream is drawn as a trace; one published on write holds its level.
    states: declaration.rateHz ? ["sampling"] : [],
    declaration
  };
}

/**
 * The project's monitor canvas — its panels (each with its frame), the streams every device offers, and the
 * edits the canvas makes (add, move or remove a panel, bind its signals). Edits go to the project buffer,
 * like the Agent's.
 */
export function useMonitorWorkspace(timeline: RunTimeline | undefined) {
  const client = useQueryClient();
  const project = useProjectDocument();
  const devices = useMonitorStreams();
  const file = project.data?.file.monitor ?? EMPTY;
  // Panels of an older project have no frame yet: they get the first free spots, as the backend places them.
  const monitor = useMemo<Monitor>(() => ({ panels: placedPanels(file.panels) }), [file]);
  const setMonitor = useCallback((next: (current: Monitor) => Monitor) => {
    client.setQueryData<ProjectDocument | null>(queryKeys.projectDocument, (current) => current
      ? { ...current, dirty: true, file: { ...current.file, monitor: next(current.file.monitor) } }
      : current);
  }, [client]);
  const update = useMutation({
    mutationFn: (input: MonitorUpdateInput) => window.sage.monitor.update({ input }),
    onMutate: (input) => {
      // A panel moved or resized shows at its new place at once, not after the round trip.
      const frames = new Map((input.operations ?? []).flatMap((operation) =>
        operation.op === "updatePanel" && operation.frame ? [[operation.panelId, operation.frame] as const] : []));
      if (frames.size) {
        setMonitor((current) => ({
          ...current,
          panels: current.panels.map((panel) => {
            const frame = frames.get(panel.id);
            return frame ? { ...panel, frame } : panel;
          })
        }));
      }
    },
    onSuccess: (result) => setMonitor(() => result),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.projectDocument })
  });
  const save = update.mutate;

  const declared = useMemo(() => new Map<string, DeviceStream>((devices.data ?? []).flatMap((device) =>
    device.streams.map((stream): [string, DeviceStream] => [`${device.hardwareId}__${stream.id}`, stream]))),
  [devices.data]);
  const channels = useMemo(() => monitorChannels(monitor), [monitor]);
  const infos = useMemo(() => {
    const recorded = new Map((timeline?.streams ?? []).map((stream) => [stream.key, stream]));
    return new Map(channels.map((ref): [string, StreamInfo] => {
      const key = streamKey(ref);
      const info = declaredStreamInfo(ref.hardwareId, declared.get(key), ref.streamId);
      const run = recorded.get(key);
      if (!run) return [key, info];
      const merged: StreamInfo = { ...info, ...run };
      if (!run.declaration && info.declaration) merged.declaration = info.declaration;
      return [key, merged];
    }));
  }, [channels, declared, timeline?.streams]);
  /** The streams a panel shows, in its order, that its type can draw. */
  const streamsOf = useCallback((panel: MonitorPanel): StreamInfo[] => panel.sources.flatMap((ref) => {
    const info = infos.get(streamKey(ref));
    return info && takes(panel.type, String(info.type)) ? [info] : [];
  }), [infos]);
  const typeOf = useCallback((ref: StreamRef) => declared.get(streamKey(ref))?.type, [declared]);

  const addTo = useCallback((panelId: string, ref: StreamRef) =>
    save({ operations: [{ op: "addSources", panelId, sources: [ref] }] }), [save]);
  const removeFrom = useCallback((panelId: string, ref: StreamRef) =>
    save({ operations: [{ op: "removeSources", panelId, sources: [ref] }] }), [save]);
  const addPanel = useCallback((type: PanelType, sources: StreamRef[] = [], frame?: Frame, id?: string,
    settings?: Record<string, unknown>) =>
    save({ operations: [{
      op: "addPanel",
      panel: { type, sources, ...(id ? { id } : {}), ...(frame ? { frame } : {}), ...(settings ? { settings } : {}) }
    }] }), [save]);
  /** Moves or resizes a panel. */
  const move = useCallback((panelId: string, frame: Frame) =>
    save({ operations: [{ op: "updatePanel", panelId, frame }] }), [save]);
  const removePanel = useCallback((panelId: string) =>
    save({ operations: [{ op: "removePanel", panelId }] }), [save]);
  const updatePanel = useCallback((panelId: string, change: { title?: string; settings?: Record<string, unknown> }) =>
    save({ operations: [{ op: "updatePanel", panelId, ...change }] }), [save]);
  /** Shows a stream on a component: added to it, or in place of the one stream it shows. */
  const show = useCallback((panel: MonitorPanel, ref: StreamRef) => {
    if (!SINGLE_SOURCE.has(panel.type)) { addTo(panel.id, ref); return; }
    save({ operations: [
      ...(panel.sources.length ? [{ op: "removeSources" as const, panelId: panel.id, sources: panel.sources }] : []),
      { op: "addSources" as const, panelId: panel.id, sources: [ref] }
    ] });
  }, [addTo, save]);
  /** 复制并递增: the next of a row of alike components (see `incrementedCopy`). */
  const duplicate = useCallback((panelId: string) => {
    const panel = monitor.panels.find((item) => item.id === panelId);
    const frame = panel?.frame;
    if (panel && frame) save({ operations: [{ op: "addPanel", panel: incrementedCopy({ ...panel, frame }) }] });
  }, [monitor.panels, save]);
  /** Puts a panel's streams in this order (and only these). */
  const setSources = useCallback((panelId: string, sources: StreamRef[]) => {
    const current = monitor.panels.find((panel) => panel.id === panelId)?.sources ?? [];
    save({ operations: [
      ...(current.length ? [{ op: "removeSources" as const, panelId, sources: current }] : []),
      ...(sources.length ? [{ op: "addSources" as const, panelId, sources }] : [])
    ] });
  }, [monitor.panels, save]);
  /** Replaces the whole canvas (a preset, an imported file, a generated layout). */
  const replace = useCallback((next: Pick<Monitor, "panels">) => save({
    panels: next.panels.map(({ id, type, title, sources, settings, frame }) => ({
      id, type, sources, settings, ...(title !== undefined ? { title } : {}), ...(frame ? { frame } : {})
    }))
  }), [save]);

  return {
    projectId: project.data?.file.projectId,
    monitor,
    channels,
    streams: [...infos.values()],
    streamsOf,
    typeOf,
    addTo,
    removeFrom,
    addPanel,
    removePanel,
    move,
    updatePanel,
    show,
    duplicate,
    replace,
    setSources,
    devices: devices.data ?? [],
    declarationOf: (ref: StreamRef) => declared.get(streamKey(ref)),
    error: update.error
  };
}

export type MonitorWorkspace = ReturnType<typeof useMonitorWorkspace>;
