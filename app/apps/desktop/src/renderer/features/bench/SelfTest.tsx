import { useMutation } from "@tanstack/react-query";
import type { ToolCatalogItem } from "@sage/contracts/devices";
import { RotateCwIcon, ShieldCheckIcon } from "lucide-react";
import { errorMessage } from "../../lib/errors.js";
import { Button, cn, Section, Spinner, StatusLamp, toneText } from "../../ui";
import { selfTestReport, type SelfTestReport } from "./self-test.js";

const TIMEOUT_MS = 60_000;
const GRID = "grid grid-cols-[64px_minmax(120px,1fr)_minmax(90px,1fr)_minmax(90px,1fr)] items-center gap-2 px-2";

/**
 * A plugin's self-test, as a section of the device's page: the checks it makes on the card (identity,
 * versions, channel counts, register readback, the rate a stream really reaches), each with what it measured
 * and expected. It only reads. Passing says the plugin and the card agree; the wiring is proved by the
 * acceptance steps in the plugin's README.
 */
export function SelfTest({ tool, hardwareId, available }: {
  tool: ToolCatalogItem;
  hardwareId: string;
  available: boolean;
}) {
  const run = useMutation({
    mutationFn: async (): Promise<SelfTestReport> => {
      const result = await window.sage.manual.invokeTool({
        raw: { hardwareId, toolName: tool.externalName, arguments: {}, timeoutMs: TIMEOUT_MS }
      });
      const report = selfTestReport(result.output);
      if (!report) throw new Error("插件返回的不是自检结果");
      return report;
    }
  });
  const report = run.data;

  return (
    <Section
      title="自检"
      actions={(
        <Button size="xs" variant="outline" disabled={!available || run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? <Spinner /> : <RotateCwIcon />}
          {report || run.isError ? "重新自检" : "开始自检"}
        </Button>
      )}
    >
      <p className="flex items-center gap-1.5 text-xs text-fg-2">
        <ShieldCheckIcon className="size-3.5 shrink-0 text-pass" />只读检查，不改变输出；接线与电压仍需现场实测
      </p>
      {!available && <p role="alert" className="text-xs text-fail">设备当前不在线，恢复在线后才能自检。</p>}
      {run.isPending && <Spinner label="正在自检" />}
      {run.isError && <p role="alert" className="text-xs break-words text-fail">{errorMessage(run.error)}</p>}
      {report && !run.isPending && <SelfTestTable report={report} />}
    </Section>
  );
}

function SelfTestTable({ report }: { report: SelfTestReport }) {
  const failed = report.checks.filter((check) => !check.passed).length;
  const tone = report.passed ? "pass" : "fail";
  return (
    <section aria-label="自检结果" className="overflow-hidden rounded-md border border-line bg-surface-0">
      <header className="flex h-8 items-center gap-2 border-b border-line px-2.5">
        <StatusLamp tone={tone} />
        <strong className={cn("text-sm font-semibold", toneText[tone])}>
          {report.passed ? "自检通过" : `自检未通过：${failed} 项`}
        </strong>
        <span className="tf-num ml-auto text-2xs text-fg-3">
          {report.checks.length} 项{report.durationMs !== undefined && ` · ${Math.round(report.durationMs)} ms`}
          {report.dryRun && " · 模拟器"}
        </span>
      </header>
      <div role="table" aria-label="自检项">
        <div role="row" className={cn(GRID, "h-6 border-b border-line text-2xs font-semibold text-fg-3")}>
          {["结论", "检查项", "测得", "期望"].map((label) => <span key={label} role="columnheader">{label}</span>)}
        </div>
        {report.checks.map((check, index) => {
          const rowTone = check.passed ? "pass" : "fail";
          return (
            <div key={`${check.name}-${index}`} role="row"
              className={cn("border-b border-line/60 py-1 text-xs last:border-b-0", !check.passed && "bg-fail/4")}>
              <div className={GRID}>
                <span role="cell" className={cn("flex items-center gap-1.5 font-medium", toneText[rowTone])}>
                  <StatusLamp tone={rowTone} />{check.passed ? "通过" : "不通过"}
                </span>
                <span role="cell" className="truncate text-fg" title={check.name}>{check.name}</span>
                <span role="cell" className={cn("truncate font-mono", check.passed ? "text-fg" : "text-fail")}
                  title={check.measured}>{check.measured || "—"}</span>
                <span role="cell" className="truncate font-mono text-fg-2" title={check.expected}>
                  {check.expected || "—"}
                </span>
              </div>
              {check.detail && <p className="px-2 pt-0.5 pl-[80px] text-2xs break-words text-fg-3">{check.detail}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
