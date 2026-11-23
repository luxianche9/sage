import type { SageApi } from "@sage/contracts/desktop";
import type { SageHost } from "../shared/desktop-ipc.js";

declare global {
  interface Window {
    /** Built by the renderer itself (`lib/host/install.ts`) on top of the preload's host bridge. */
    sage: SageApi;
    sageHost: SageHost;
  }
}
export {};
