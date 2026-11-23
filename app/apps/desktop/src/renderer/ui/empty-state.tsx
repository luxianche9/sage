import * as React from "react";
import { cn } from "./cn";

export function EmptyState({ icon, title, description, action, className, compact }: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-6" : "h-full min-h-40 px-6 py-10",
        className
      )}
    >
      {icon && (
        <div
          aria-hidden
          className={cn(
            "mb-1 grid place-items-center rounded-md border border-dashed border-line-strong text-fg-3",
            "[&_svg]:size-4",
            compact ? "size-8" : "size-10"
          )}
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-80 text-xs leading-5 text-fg-2">{description}</p>}
      {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** An empty canvas: a dashed frame marking where things are dropped, with a short title and optional actions. */
export function DropZone({ icon, title, children, className }: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none absolute inset-4 z-[1] grid place-items-center rounded-lg",
      "border-2 border-dashed border-line-strong/70", className)}>
      <div className="grid justify-items-center gap-3">
        <div aria-hidden className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-3 [&_svg]:size-5">
          {icon}
        </div>
        <p className="text-sm font-medium text-fg-2">{title}</p>
        {children && <div className="pointer-events-auto flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
