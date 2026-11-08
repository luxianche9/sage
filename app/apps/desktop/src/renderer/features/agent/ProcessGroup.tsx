import { useAuiState } from "@assistant-ui/react";
import { ChevronRightIcon } from "lucide-react";
import { useState, type PropsWithChildren } from "react";
import { Collapsible } from "radix-ui";
import { cn } from "../../ui";

type Group = { indices: readonly number[]; status: { type: string } };

/** A tool's name as the summary shows it: without the `teststand_` prefix of the MCP server. */
function shortName(name: string | undefined): string {
  return (name ?? "").replace(/^teststand_/, "");
}

/** "check_icd ×3、save_icd": the tools of a run of steps, most used first, at most three named. */
export function toolSummary(names: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(shortName(name), (counts.get(shortName(name)) ?? 0) + 1);
  const ranked = [...counts].sort((left, right) => right[1] - left[1]);
  const shown = ranked.slice(0, 3).map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join("、");
  return ranked.length > 3 ? `${shown} 等` : shown;
}

/**
 * The assistant's working steps — its reasoning and every tool call between two pieces of text — folded into
 * one quiet line, as Claude Desktop shows them ("调用了 5 个工具：check_icd ×3、save_icd >"), so the answer
 * reads as one stream while it works. It opens by itself only when a tool waits for the operator's decision;
 * a click opens or closes it.
 */
export function ProcessGroup({ group, children }: PropsWithChildren<{ group: Group }>) {
  const start = group.indices[0] ?? 0;
  const end = group.indices.at(-1) ?? start;
  const summary = useAuiState((state) => {
    const names: string[] = [];
    let current: string | undefined;
    let waiting = false;
    let failed = 0;
    let thought = false;
    for (let index = start; index <= end; index++) {
      const part = state.message.parts[index] as {
        type: string; toolName?: string; status?: { type?: string };
        approval?: { approved?: boolean; resolution?: unknown };
      } | undefined;
      if (part?.type === "reasoning") thought = true;
      if (part?.type !== "tool-call") continue;
      names.push(part.toolName ?? "");
      const type = part.status?.type;
      if (type === "running") current = part.toolName;
      if (type === "incomplete") failed += 1;
      if (type === "requires-action"
        || (part.approval && part.approval.approved === undefined && part.approval.resolution === undefined)) {
        waiting = true;
        current = part.toolName;
      }
    }
    return JSON.stringify({ names, current: current ?? "", waiting, failed, thought });
  });
  const { names, current, waiting, failed, thought } = JSON.parse(summary) as {
    names: string[]; current: string; waiting: boolean; failed: number; thought: boolean;
  };
  const running = group.status.type === "running";
  const [userOpen, setUserOpen] = useState<boolean>();
  // Only invisible parts (step markers, empty text): nothing to show.
  if (!names.length && !thought && !running) return null;
  const open = userOpen ?? waiting;
  const label = waiting ? `等待确认：${shortName(current)}`
    : running ? (current ? `正在调用 ${shortName(current)}…` : "思考中…")
      : names.length ? `调用了 ${names.length} 个工具：${toolSummary(names)}${failed ? `（${failed} 个失败）` : ""}`
        : "思考过程";
  return (
    <Collapsible.Root open={open} onOpenChange={setUserOpen} data-slot="aui_process-group" className="w-full min-w-0">
      <Collapsible.Trigger className={cn(
        "group flex max-w-full min-w-0 items-center gap-1 py-0.5 text-left text-xs outline-none",
        "transition-colors duration-120 focus-visible:outline-1 focus-visible:outline-signal",
        waiting ? "text-run" : failed && !running ? "text-fail/80 hover:text-fail" : "text-fg-3 hover:text-fg-2"
      )}>
        <span className={cn("relative min-w-0 truncate", running && "text-fg-2")}>
          {label}
          {running && !waiting && (
            <span aria-hidden className="shimmer pointer-events-none absolute inset-0">{label}</span>
          )}
        </span>
        <ChevronRightIcon aria-hidden
          className="size-3.5 shrink-0 transition-transform duration-120 group-data-[state=open]:rotate-90" />
      </Collapsible.Trigger>
      <Collapsible.Content className={cn(
        "overflow-hidden outline-none",
        "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        "motion-reduce:animate-none"
      )}>
        <div className="mt-1 mb-1 flex flex-col gap-1.5 border-l-2 border-line pl-2.5 text-xs leading-relaxed text-fg-3
          [&_[data-slot=aui_reasoning-text]]:text-fg-3">
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
