import type { ControlWidget } from "@sage/contracts/monitor";

/** Drag payload of a control from the component sidebar: the widget kind. */
export const CONTROL_MIME = "application/x-sage-control";

type Request = { panelId: string; widget: ControlWidget };

let pending: Request | undefined;
const listeners = new Set<() => void>();

/**
 * Asks control panel `panelId` to open its "添加控件" dialog for `widget`. The panel may not exist
 * yet (it is being created for the drop): the request waits until it mounts.
 */
export function requestControl(panelId: string, widget: ControlWidget): void {
  pending = { panelId, widget };
  for (const listener of listeners) listener();
}

/** A fresh id for a control panel made for a dropped or clicked control. */
export function newControlPanelId(): string {
  return `control-${Date.now().toString(36)}`;
}
