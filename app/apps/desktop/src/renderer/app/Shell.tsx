import { lazy, Suspense, useCallback, useEffect, useReducer, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProjectDocument, ProjectFolderSelection } from "@sage/contracts/projects";
import { ToastProvider, TooltipProvider, useToast } from "../ui";
import { useDashboard, useProjectDocument } from "../lib/queries.js";
import { useTheme } from "../lib/theme.js";
import { errorMessage } from "../lib/errors.js";
import { queryKeys } from "../lib/query-keys.js";
import { REOPEN_AFTER_RELAUNCH } from "../lib/host/api.js";
import { useSageEvents } from "../lib/hooks/useSageEvents.js";
import { useKeyboardShortcut } from "../lib/hooks/useKeyboardShortcut.js";
import { useDirtyGuard } from "../lib/hooks/useDirtyGuard.js";
import { chooseProjectFolder } from "../lib/projects.js";
import { onPageRequested, readLastPage, writeLastPage, type ProjectPage } from "../lib/pages.js";
import { onRunRequested } from "../lib/run-focus.js";
import { ManualCheckDialog } from "../features/testing/ManualCheckDialog.js";
import { ActivityBar } from "./ActivityBar.js";
import { appNavigationReducer, initialAppNavigation, type AppPage } from "./app-navigation.js";
import { readAssistantOpen, writeAssistantOpen } from "./assistant-preference.js";
import { AgentConfirmationDialog } from "./AgentConfirmationDialog.js";
import { DirtyDialog } from "./DirtyDialog.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { FeatureFallback } from "./FeatureFallback.js";
import { InitializeDialog } from "./InitializeDialog.js";
import { TitleBar, type ProjectAction } from "./TitleBar.js";

const AssistantSidebar = lazy(() => import("../features/agent/assistant.js")
  .then((module) => ({ default: module.AssistantSidebar })));
const ProjectWorkspace = lazy(() => import("../features/projects/ProjectWorkspace.js")
  .then((module) => ({ default: module.ProjectWorkspace })));
const WelcomePage = lazy(() => import("../features/projects/WelcomePage.js")
  .then((module) => ({ default: module.WelcomePage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage.js")
  .then((module) => ({ default: module.SettingsPage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function beforeNavigation(detail: Record<string, unknown>) {
  return window.dispatchEvent(new CustomEvent("sage:before-navigation", { cancelable: true, detail }));
}

function Shell() {
  const client = useQueryClient();
  const theme = useTheme();
  const dashboard = useDashboard();
  const project = useProjectDocument();
  const [navigation, navigate] = useReducer(appNavigationReducer, initialAppNavigation);
  const [assistantOpen, setAssistantOpen] = useState(readAssistantOpen);
  const [projectPage, setProjectPage] = useState<ProjectPage>(readLastPage);
  const [leftOpen, setLeftOpen] = useState(true);
  const [pendingSelection, setPendingSelection] = useState<ProjectFolderSelection>();
  const toast = useToast();
  const setError = useCallback((message?: string) => { if (message) toast.error(message); }, [toast]);

  useSageEvents(client);

  const syncProject = useCallback(async (document?: ProjectDocument | null) => {
    if (document !== undefined) client.setQueryData(queryKeys.projectDocument, document);
    else await client.invalidateQueries({ queryKey: queryKeys.projectDocument });
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.recentProjects }),
      client.invalidateQueries({ queryKey: queryKeys.wiringTasks }),
      client.invalidateQueries({ queryKey: queryKeys.openCodeStatus })
    ]);
  }, [client]);

  const save = useMutation({
    mutationFn: () => window.sage.projects.saveProject(),
    onSuccess: (document) => void syncProject(document),
    onError: (reason) => setError(errorMessage(reason))
  });

  const dirtyGuard = useDirtyGuard(
    Boolean(project.data?.dirty),
    () => window.sage.projects.saveProject(),
    syncProject,
    (message) => setError(message)
  );

  useKeyboardShortcut("s", () => save.mutate(), Boolean(project.data));
  // Only the operator's own choice is remembered; closing the sidebar with the project is not one.
  const showAssistant = useCallback((open: boolean) => { writeAssistantOpen(open); setAssistantOpen(open); }, []);
  useEffect(() => { if (!project.data) setAssistantOpen(false); }, [project.data]);
  /** Shows a page with its left column: a column folded on one page is not left folded on the next. */
  const showPage = useCallback((next: ProjectPage) => {
    writeLastPage(next);
    setProjectPage(next);
    setLeftOpen(true);
    navigate({ type: "show-content", page: "project" });
  }, []);
  useEffect(() => {
    if (!project.data) return;
    // A button that names its destination ("去协议页", "编辑流程") sent the operator to another page.
    const stopPages = onPageRequested((request) => showPage(request.page));
    // The operator started a run, or asked for the running one: it is watched on the 运行 page.
    const stopRuns = onRunRequested(() => showPage("run"));
    return () => {
      stopPages();
      stopRuns();
    };
  }, [project.data, showPage]);

  const enterProject = useCallback(async () => {
    await syncProject();
    setProjectPage(readLastPage());
    navigate({ type: "show-content", page: "project" });
    setAssistantOpen(readAssistantOpen());
  }, [syncProject]);

  // After 重启 SAGE (a driver update), open the project the restart left.
  useEffect(() => {
    const rootPath = localStorage.getItem(REOPEN_AFTER_RELAUNCH);
    if (!rootPath) return;
    localStorage.removeItem(REOPEN_AFTER_RELAUNCH);
    void window.sage.projects.openFolder({ rootPath })
      .then(() => enterProject())
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [enterProject, setError]);

  const goWelcome = useCallback(async () => {
    await window.sage.projects.leaveProject();
    await syncProject(null);
    setAssistantOpen(false);
    navigate({ type: "show-content", page: "welcome" });
  }, [syncProject]);

  const chooseAndOpen = useCallback(async () => {
    const selection = await chooseProjectFolder();
    if (!selection) return;
    if (selection.state === "invalid") throw new Error(selection.message ?? "项目清单无法读取。");
    if (selection.state === "uninitialized") { setPendingSelection(selection); return; }
    await window.sage.projects.openFolder({ rootPath: selection.rootPath });
    await enterProject();
  }, [enterProject]);

  const openSettings = () => {
    if (navigation.page === "settings" || beforeNavigation({ next: "settings" })) navigate({ type: "open-settings" });
  };
  const returnFromSettings = () => navigate({ type: "return-from-settings", hasProject: Boolean(project.data) });
  /** An activity bar icon: show its page, or fold the left column away when it is the page shown. */
  const pickPage = (next: ProjectPage) => {
    if (navigation.page !== "settings" && next === projectPage) setLeftOpen((open) => !open);
    else showPage(next);
  };

  const handleProjectAction = (action: ProjectAction) => {
    if (action !== "save" && !beforeNavigation({ action })) return;
    if (action === "save") { save.mutate(); return; }
    if (action === "welcome") { dirtyGuard.guard("返回欢迎页", goWelcome); return; }
    dirtyGuard.guard("打开其他项目", async () => {
      try { await chooseAndOpen(); } catch (reason) { setError(errorMessage(reason)); }
    });
  };

  const initializeSelected = async () => {
    if (!pendingSelection) return;
    try {
      await window.sage.projects.initializeFolder({ rootPath: pendingSelection.rootPath });
      setPendingSelection(undefined);
      await enterProject();
    } catch (reason) { setError(errorMessage(reason)); }
  };

  const currentProject = project.data ?? null;
  const page: AppPage = navigation.page;

  return (
    <div className="flex h-full flex-col bg-surface-0 text-fg">
      <TitleBar
        page={page}
        project={currentProject}
        assistantOpen={assistantOpen}
        busy={save.isPending}
        onProjectAction={handleProjectAction}
        onToggleAssistant={() => showAssistant(!assistantOpen)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar
          page={projectPage}
          inProject={page !== "welcome" && Boolean(currentProject)}
          settingsOpen={page === "settings"}
          theme={theme.resolved}
          onPage={pickPage}
          onSettings={() => (page === "settings" ? returnFromSettings() : openSettings())}
          onToggleTheme={() => void theme.select(theme.resolved === "dark" ? "light" : "dark")}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* One boundary per open project: switching its pages must not remount them. */}
          <ErrorBoundary key={page === "project" ? `project-${currentProject?.rootPath}` : `content-${page}`}>
            <Suspense fallback={<FeatureFallback />}>
              {page === "settings"
                ? <SettingsPage
                    dashboard={dashboard}
                    theme={theme.choice}
                    onThemeChange={theme.select}
                    onBack={returnFromSettings}
                  />
                : page !== "welcome" && currentProject
                  ? <ProjectWorkspace page={projectPage} leftOpen={leftOpen} />
                  : <WelcomePage onOpened={() => enterProject()} />}
            </Suspense>
          </ErrorBoundary>
        </main>
        {page !== "welcome" && assistantOpen && currentProject && (
          <ErrorBoundary key={`assistant-${currentProject.rootPath}`} fallback={<AssistantUnavailable />}>
            <Suspense fallback={<aside className="tf-agent-sidebar animate-slide-in-right"><FeatureFallback /></aside>}>
              <AssistantSidebar
                gatewayRunning={dashboard.data?.gateway.running ?? false}
                onClose={() => showAssistant(false)}
                onOpenSettings={openSettings}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      <AgentConfirmationDialog />
      <ManualCheckDialog />
      <DirtyDialog
        pending={dirtyGuard.pending}
        onContinue={(saveFirst) => void dirtyGuard.continuePending(saveFirst)}
        onCancel={dirtyGuard.clearPending}
      />
      <InitializeDialog
        selection={pendingSelection}
        busy={false}
        onConfirm={() => void initializeSelected()}
        onCancel={() => setPendingSelection(undefined)}
      />
    </div>
  );
}

function AssistantUnavailable() {
  return (
    <aside className="tf-agent-sidebar animate-slide-in-right">
      <section role="alert" className="grid h-full place-content-center gap-2 p-8 text-center text-sm text-fg-3">
        AI 助手暂时无法显示
      </section>
    </aside>
  );
}
