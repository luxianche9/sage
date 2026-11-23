import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, Field, IconButton, Input, Select
} from "../../ui/index.js";
import { useToast } from "../../ui/toast.js";
import { errorMessage } from "../../lib/errors.js";
import { queryKeys } from "../../lib/query-keys.js";
import { ALIAS, nextAlias } from "./icd-model.js";
import { IcdEditorDialog } from "./IcdEditorDialog.js";
import { useUpdateProtocols } from "./use-protocols.js";

/**
 * 解析协议: put an ICD on one raw stream. The ICD says how the bytes split into frames and fields; once
 * bound, each numeric field is a stream of the same device, `<alias>.<message>.<field>`, with a live value.
 */
export function BindProtocolDialog({ hardwareId, streamId, streamType, aliases, onClose }: {
  hardwareId: string;
  streamId: string;
  /** `bytes` or `frames`: only ICDs of that transport can decode it. */
  streamType: string;
  /** Aliases already bound in the project. */
  aliases: readonly string[];
  onClose: () => void;
}) {
  const toast = useToast();
  const icds = useQuery({ queryKey: queryKeys.icds, queryFn: () => window.sage.testing.listIcds() });
  const usable = (icds.data ?? []).filter((item) => item.valid && (!item.transport || item.transport === streamType));
  const [icd, setIcd] = useState<string>();
  const [alias, setAlias] = useState<string>();
  const [editing, setEditing] = useState<{ name?: string }>();
  const update = useUpdateProtocols();
  const chosen = icd ?? usable[0]?.name ?? "";
  const name = alias ?? nextAlias(aliases, chosen);
  const aliasError = !ALIAS.test(name) ? "别名只能包含字母、数字和下划线，且不能以数字开头"
    : aliases.includes(name) ? `别名 ${name} 已被使用` : undefined;

  const bind = () => update.mutate(
    [{ op: "add", icd: chosen, alias: name, source: { hardwareId, streamId } }],
    {
      onSuccess: () => { toast.success(`已用 ${chosen} 解析 ${streamId}`); onClose(); },
      onError: (error) => toast.error(errorMessage(error))
    }
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title={`解析协议：${hardwareId} / ${streamId}`} size="md">
        <DialogBody className="grid gap-3">
          <Field label="协议（ICD）" error={icds.error ? errorMessage(icds.error) : undefined}
>
            <div className="flex items-center gap-1.5">
              <Select aria-label="ICD" className="min-w-0 flex-1" value={chosen}
                onChange={(event) => setIcd(event.target.value)}>
                {!usable.length && <option value="">（无）</option>}
                {usable.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}{item.description ? ` · ${item.description}` : ""}
                  </option>
                ))}
              </Select>
              <IconButton label="编辑这份 ICD" size="icon-sm" disabled={!chosen}
                onClick={() => setEditing({ name: chosen })}><PencilIcon /></IconButton>
              <Button size="sm" variant={usable.length ? "secondary" : "primary"} onClick={() => setEditing({})}>
                <PlusIcon />新建 ICD
              </Button>
            </div>
          </Field>
          <Field label="别名" error={aliasError}>
            <div className="flex items-center gap-1.5">
              <Input aria-label="别名" className="min-w-0 flex-1 font-mono" value={name}
                onChange={(event) => setAlias(event.target.value)} />
              <span aria-hidden className="shrink-0 font-mono text-xs text-fg-3">.报文.字段</span>
            </div>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!chosen || Boolean(aliasError) || update.isPending} onClick={bind}>
            绑定
          </Button>
        </DialogFooter>
      </DialogContent>
      {editing && (
        <IcdEditorDialog
          {...editing}
          alias={name}
          source={{ hardwareId, streamId }}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => setIcd(saved)}
        />
      )}
    </Dialog>
  );
}
