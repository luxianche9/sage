import type { ReactNode } from "react";
import {
  BinaryIcon, CableIcon, CpuIcon, HistoryIcon, ListTreeIcon, MonitorPlayIcon, MoonIcon, SettingsIcon, SunIcon
} from "lucide-react";
import { PAGE_LABELS, PROJECT_PAGES, type ProjectPage } from "../lib/pages.js";
import { Tooltip, cn } from "../ui";

const ICONS: Record<ProjectPage, ReactNode> = {
  devices: <CpuIcon />,
  wiring: <CableIcon />,
  protocols: <BinaryIcon />,
  flow: <ListTreeIcon />,
  run: <MonitorPlayIcon />,
  records: <HistoryIcon />
};

/**
 * The column of icons at the window's left edge: one page of the project each, in the order the work goes
 * (设备 → 接线 → 协议 → 流程 → 运行 → 记录). A second click on the shown page folds its left column away.
 * Settings and the theme sit at its foot.
 */
export function ActivityBar({ page, inProject, settingsOpen, theme, onPage, onSettings, onToggleTheme }: {
  page: ProjectPage;
  inProject: boolean;
  settingsOpen: boolean;
  theme: "light" | "dark";
  onPage: (page: ProjectPage) => void;
  onSettings: () => void;
  onToggleTheme: () => void;
}) {
  return (
    <nav
      aria-label="页面导航"
      className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface-1 py-1.5"
    >
      {inProject && PROJECT_PAGES.map((item) => (
        <BarButton
          key={item}
          label={PAGE_LABELS[item]}
          current={!settingsOpen && page === item}
          onClick={() => onPage(item)}
        >
          {ICONS[item]}
        </BarButton>
      ))}
      <span className="flex-1" />
      <BarButton label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"} onClick={onToggleTheme}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </BarButton>
      <BarButton label="设置" pressed={settingsOpen} onClick={onSettings}><SettingsIcon /></BarButton>
    </nav>
  );
}

function BarButton({ label, current, pressed, onClick, children }: {
  label: string;
  /** The page shown. */
  current?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const active = current || pressed;
  return (
    <Tooltip content={label} side="right">
      <button
        type="button"
        aria-label={label}
        aria-current={current ? "page" : undefined}
        aria-pressed={pressed ?? undefined}
        onClick={onClick}
        className={cn(
          "relative grid size-9 place-items-center rounded-md text-fg-3 transition-colors duration-120",
          "hover:bg-surface-2 hover:text-fg [&_svg]:size-[18px]",
          active && "text-fg before:absolute before:inset-y-1.5 before:-left-1 before:w-0.5 before:rounded-full",
          active && "before:bg-signal"
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
