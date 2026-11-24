import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import type { DeviceInstance } from "@sage/contracts/devices";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { errorMessage } from "../../lib/errors.js";
import { Button, Input, Textarea } from "../../ui";
import { EditorAlert, EditorField, editorGrid } from "./EditorField.js";

/** `settings` is edited as JSON text; only a JSON object is accepted. */
function parseSettings(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text.trim() || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

const deviceEditorSchema = z.object({
  label: z.string(),
  settings: z.string().refine((value) => parseSettings(value) !== undefined, "设置必须是 JSON 对象")
});
type DeviceEditorValues = z.infer<typeof deviceEditorSchema>;

function initialValues(instance: DeviceInstance): DeviceEditorValues {
  return { label: instance.label, settings: JSON.stringify(instance.settings, null, 2) };
}

/** Edit a device in place: its name and (advanced) the driver's own settings. Adding a device is done from
 *  its device package (AddDeviceDialog). Escape or 取消 drops the changes. */
export function DeviceEditor({ instance, onClose, onChanged }: {
  instance: DeviceInstance;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { register, reset, handleSubmit, formState } = useForm<DeviceEditorValues>({
    resolver: zodResolver(deviceEditorSchema),
    mode: "onChange",
    defaultValues: initialValues(instance)
  });
  const { errors, isValid } = formState;

  useEffect(() => { reset(initialValues(instance)); }, [instance, reset]);

  const save = useMutation({
    mutationFn: async (values: DeviceEditorValues) => {
      const devices = window.sage.devices;
      await devices.saveDevice({ input: {
        ...instance,
        label: values.label.trim() || instance.label,
        settings: parseSettings(values.settings) ?? {}
      } });
      await devices.refreshDevice({ deviceId: instance.deviceId });
    },
    onSuccess: async () => { await onChanged(); onClose(); }
  });
  const submit = handleSubmit(async (values) => { await save.mutateAsync(values); });

  return (
    <form aria-label="编辑设备" className={editorGrid} onSubmit={(event) => { void submit(event); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <EditorField label="名称">
        <Input autoFocus {...register("label")} />
      </EditorField>
      <details className="col-span-2 text-xs text-fg-2">
        <summary className="cursor-pointer py-1 select-none">高级设置</summary>
        <EditorField label="驱动设置（JSON）" span error={errors.settings?.message}>
          <Textarea className="min-h-[72px] font-mono text-xs" spellCheck={false} {...register("settings")} />
        </EditorField>
      </details>
      {save.isError && <EditorAlert message={errorMessage(save.error)} />}
      <div className="col-span-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>取消</Button>
        <Button variant="primary" type="submit" disabled={save.isPending || !isValid}>
          {save.isPending ? "正在连接…" : "保存"}
        </Button>
      </div>
    </form>
  );
}
