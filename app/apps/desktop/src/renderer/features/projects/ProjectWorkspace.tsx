import type { ReactNode } from "react";
import { ErrorBoundary } from "../../app/ErrorBoundary.js";
import { PagesProvider } from "../../app/PageFrame.js";
import type { ProjectPage } from "../../lib/pages.js";
import { openRunMonitor } from "../../lib/run-focus.js";
import { DevicesPage } from "../bench/index.js";
import { RecordsPage, RunPage } from "../monitor/index.js";
import { ProtocolsPage } from "../protocols/index.js";
import { FlowPage, usePlanEditor } from "../testing/index.js";
import { WiringPage } from "../wiring/index.js";

/**
 * The open project: its six pages, one shown at a time. All stay mounted, so a page keeps its draft, live
 * data and viewport while another is shown; each has its own error boundary, so one failing leaves the
 * others usable. The test flow's draft is the project's: the 流程 page edits it and the 运行 page runs it.
 */
export function ProjectWorkspace({ page, leftOpen }: { page: ProjectPage; leftOpen: boolean }) {
  const editor = usePlanEditor({ onRunStarted: openRunMonitor });
  const pages: [ProjectPage, ReactNode][] = [
    ["devices", <DevicesPage />],
    ["wiring", <WiringPage />],
    ["protocols", <ProtocolsPage />],
    ["flow", <FlowPage editor={editor} />],
    ["run", <RunPage editor={editor} />],
    ["records", <RecordsPage />]
  ];
  return (
    <div className="h-full min-h-0 min-w-0 flex-1 bg-surface-0">
      <PagesProvider page={page} leftOpen={leftOpen}>
        {pages.map(([name, content]) => (
          // A page that failed shows its error only while it is the page shown.
          <div key={name} hidden={name !== page} className="h-full min-h-0 min-w-0">
            <ErrorBoundary>{content}</ErrorBoundary>
          </div>
        ))}
      </PagesProvider>
    </div>
  );
}
