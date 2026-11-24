import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import type { Hardware, HardwarePort } from "@sage/contracts/devices";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "../../lib/errors.js";
import { Button, Input } from "../../ui";
import { PortEditor } from "./PortEditor.js";
import { BundleActions } from "./BundleActions.js";
import { EditorAlert, EditorField, EditorPanel, editorGrid } from "./EditorField.js";

const hardwareEditorSchema = z.object({
  hardwareId: z.string().trim().min(1, "请输入 hardwareId")
    .refine((value) => !/\s/.test(value), "hardwareId 不能包含空格"),
  label: z.string().trim().min(1, "请输入显示名称")
});
type HardwareEditorValues = z.infer<typeof hardwareEditorSchema>;
const blankHardware: HardwareEditorValues = { hardwareId: "DUT_1", label: "被测对象" };

/** DUTs, fixtures and breakout boards, edited in place: no device plugin; ports and pins for the wiring.
 *  Without `hardware` it registers a new one. Escape or 取消 drops the changes. */
export function HardwareEditor({ hardware, onClose, onChanged }: {
  hardware?: Hardware | undefined;
  onClose: () => void;
  /** Called with the saved hardwareId once the lists have it. */
  onChanged: (hardwareId: string) => Promise<void>;
}) {
  const [ports, setPorts] = useState<HardwarePort[]>([]);
  const { register, reset, watch, handleSubmit, formState } = useForm<HardwareEditorValues>({
    resolver: zodResolver(hardwareEditorSchema),
    mode: "onChange",
    defaultValues: blankHardware
  });
  const { errors, isValid } = formState;
  const hardwareId = watch("hardwareId");

  useEffect(() => {
    reset(hardware ? { hardwareId: hardware.hardwareId, label: hardware.label } : blankHardware);
    setPorts(hardware ? structuredClone(hardware.ports) : []);
  }, [hardware, reset]);

  const save = useMutation({
    mutationFn: async (values: HardwareEditorValues) => {
      const normalizedId = values.hardwareId.trim();
      await window.sage.devices.saveHardware({
        input: {
          formatVersion: 2,
          hardwareId: normalizedId,
          label: values.label.trim() || normalizedId,
          kind: "passive",
          ports
        }
      });
      return normalizedId;
    },
    onSuccess: async (savedId) => {
      await onChanged(savedId);
      onClose();
    }
  });
  const submit = handleSubmit(async (values) => { await save.mutateAsync(values); });

  return (
    <form aria-label={hardware ? "编辑硬件" : "登记被测件 / 夹具"} className={editorGrid}
      onSubmit={(event) => { void submit(event); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <EditorField label="稳定 hardwareId" required error={errors.hardwareId?.message}>
        <Input
          className="font-mono"
          {...register("hardwareId")}
          disabled={Boolean(hardware)}
          placeholder="DUT_1"
        />
      </EditorField>
      <EditorField label="显示名称" required error={errors.label?.message}>
        <Input {...register("label")} />
      </EditorField>
      <EditorPanel>
        <PortEditor ports={ports} onChange={setPorts} />
      </EditorPanel>
      {save.isError && <EditorAlert message={errorMessage(save.error)} />}
      <div className="col-span-2 flex items-center gap-2">
        <BundleActions
          kind="hardware"
          id={hardwareId}
          saved={Boolean(hardware)}
          disabled={save.isPending}
          onImported={async () => { await onChanged(hardwareId.trim()); onClose(); }}
        />
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" type="submit" disabled={save.isPending || !isValid}>
          {save.isPending ? "保存中…" : "保存"}
        </Button>
      </div>
    </form>
  );
}
