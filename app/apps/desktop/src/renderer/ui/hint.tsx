import * as React from "react";
import { InfoIcon, PlusIcon } from "lucide-react";
import { cn } from "./cn";
import { Tooltip } from "./tooltip";

/** Explanation on demand: an ⓘ beside a label whose text shows on hover or focus, never on the page. */
export function HintIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Tooltip content={<span className="block max-w-72 leading-5">{children}</span>} side="top">
      <button
        type="button"
        aria-label={typeof children === "string" ? children : "说明"}
        className={cn(
          "inline-grid size-4 shrink-0 cursor-help place-items-center rounded-full align-middle text-fg-3",
          "transition-colors hover:text-fg focus-visible:text-signal focus-visible:outline-none",
          className
        )}
      >
        <InfoIcon aria-hidden className="size-3" />
      </button>
    </Tooltip>
  );
}

/**
 * The empty place where the next item goes: a dashed slot that adds it when clicked.
 * Replaces "nothing here yet, click X above to add one" sentences.
 */
export function AddSlot({ children, icon, onClick, className, disabled }: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong",
        "text-xs text-fg-2 transition-colors hover:border-signal hover:bg-signal/5 hover:text-fg",
        "focus-visible:border-signal focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        className
      )}
    >
      {icon ?? <PlusIcon aria-hidden />}
      {children}
    </button>
  );
}
