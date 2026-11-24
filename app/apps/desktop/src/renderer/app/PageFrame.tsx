import { createContext, useContext, type ReactNode } from "react";
import { PAGE_LABELS, type ProjectPage } from "../lib/pages.js";
import { useResizableWidth } from "../lib/resizable.js";
import { Splitter } from "../ui";

type Pages = {
  /** The page shown; the others stay mounted and hidden, so drafts, live data and viewports survive. */
  page: ProjectPage;
  /** Whether the pages show their left column (a second click on the shown page's icon folds it). */
  leftOpen: boolean;
  /** One width for every page's left column, so the centre does not jump when the page changes. */
  sidebar: Pick<ReturnType<typeof useResizableWidth>, "width" | "separatorProps">;
};

const PagesContext = createContext<Pages | undefined>(undefined);

export function PagesProvider({ page, leftOpen, children }: {
  page: ProjectPage;
  leftOpen: boolean;
  children: ReactNode;
}) {
  const sidebar = useResizableWidth({
    storageKey: "sage.page-left-width", defaultWidth: 300, min: 220, max: 520, direction: "right"
  });
  return <PagesContext.Provider value={{ page, leftOpen, sidebar }}>{children}</PagesContext.Provider>;
}

/** Whether `page` is the one shown: a hidden page stops polling for what only its screen needs. */
export function usePageActive(page: ProjectPage): boolean {
  const pages = useContext(PagesContext);
  return !pages || pages.page === page;
}

/**
 * One page of the project: a left column (pick which one, or take material from it) beside the centre (work
 * on it). Never a third column: the right edge belongs to the AI assistant. Outside a provider (a test of one
 * page) the page is shown with its left column at the default width.
 */
export function PageFrame({ page, left, children }: { page: ProjectPage; left: ReactNode; children: ReactNode }) {
  const pages = useContext(PagesContext);
  const active = !pages || pages.page === page;
  const leftOpen = pages?.leftOpen ?? true;
  const width = pages?.sidebar.width ?? 300;
  return (
    <section
      aria-label={`${PAGE_LABELS[page]}页`}
      hidden={!active}
      className="grid h-full min-h-0 min-w-0 bg-surface-0"
      style={{ gridTemplateColumns: leftOpen ? `${width}px 1px minmax(0, 1fr)` : "minmax(0, 1fr)" }}
    >
      <div hidden={!leftOpen} className="min-h-0 min-w-0">{left}</div>
      {leftOpen && (pages
        ? <Splitter label="调整左栏宽度" {...pages.sidebar.separatorProps} />
        : <span aria-hidden className="bg-line" />)}
      <div className="min-h-0 min-w-0">{children}</div>
    </section>
  );
}
