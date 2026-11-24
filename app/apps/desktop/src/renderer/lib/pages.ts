/** The pages of an open project, one per activity-bar icon, in workflow order. */
export type ProjectPage = "devices" | "wiring" | "protocols" | "flow" | "run" | "records";

export const PROJECT_PAGES: readonly ProjectPage[] = ["devices", "wiring", "protocols", "flow", "run", "records"];

export const PAGE_LABELS: Record<ProjectPage, string> = {
  devices: "设备",
  wiring: "接线",
  protocols: "协议",
  flow: "流程",
  run: "运行",
  records: "记录"
};

/** What the page is asked to show: a protocol (or a raw stream to put one on), or a step or the validation
 *  issues of the flow. */
export type PageRequest =
  | { page: "protocols"; icd?: string; source?: { hardwareId: string; streamId: string; streamType: string } }
  | { page: "flow"; stepId?: string | undefined; issues?: boolean }
  | { page: Exclude<ProjectPage, "protocols" | "flow"> };

const OPEN_PAGE = "sage:open-page";
const LAST_PAGE = "sage.project-page";

/** Sends the operator to another page. Only buttons that name their destination call this. */
export function openPage(request: PageRequest) {
  window.dispatchEvent(new CustomEvent(OPEN_PAGE, { detail: request }));
}

export function onPageRequested(listener: (request: PageRequest) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<PageRequest | undefined>).detail;
    if (detail?.page) listener(detail);
  };
  window.addEventListener(OPEN_PAGE, handler);
  return () => window.removeEventListener(OPEN_PAGE, handler);
}

/** The page shown when a project opens: the one last used on this computer, 设备 the first time. */
export function readLastPage(): ProjectPage {
  try {
    const saved = localStorage.getItem(LAST_PAGE);
    if (PROJECT_PAGES.includes(saved as ProjectPage)) return saved as ProjectPage;
  } catch { /* Storage may be unavailable. */ }
  return "devices";
}

export function writeLastPage(page: ProjectPage) {
  try { localStorage.setItem(LAST_PAGE, page); } catch { /* Storage may be unavailable. */ }
}
