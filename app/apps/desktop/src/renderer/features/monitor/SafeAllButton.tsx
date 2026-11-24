import { ShieldCheckIcon } from "lucide-react";
import { useConfirm, useToast } from "../../ui/index.js";
import { useManualControl } from "./use-manual-control.js";

/**
 * 全部安全: every device back to its safe state, from the title bar so it is one click away on every page.
 * While a test runs it is off: the flow's cleanup region is in charge of the safe state then.
 */
export function SafeAllButton({ className }: { className?: string }) {
  const toast = useToast();
  const control = useManualControl();
  const [confirm, confirmDialog] = useConfirm();
  const safeAll = async () => {
    const ok = await confirm({
      title: "全部回到安全状态",
      message: "依次调用每台设备的安全状态工具：模拟输出回 0、数字输出拉低、继电器释放、波形停止。",
      confirmLabel: "全部安全",
      danger: true
    });
    if (!ok) return;
    const failures = await control.safeAll();
    if (failures.length) toast.error(`有设备未能回到安全状态：${failures.join("；")}`);
    else toast.success("所有设备已回到安全状态");
  };
  return (
    <>
      <button
        type="button"
        aria-label="全部安全状态"
        title={control.running ? "测试运行中，由测试流程负责安全状态" : "所有设备回到安全状态"}
        disabled={control.running}
        onClick={() => void safeAll()}
        className={className}
      >
        <ShieldCheckIcon />
        <span className="max-[1100px]:hidden">全部安全</span>
      </button>
      {confirmDialog}
    </>
  );
}
