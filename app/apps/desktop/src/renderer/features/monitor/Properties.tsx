import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MonitorControl, MonitorPanel, StreamRef } from "@sage/contracts/monitor";
import { PANEL_SOURCE_TYPES, PANEL_WIDGETS } from "@sage/contracts/monitor";
import { CopyPlusIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  Button, Checkbox, Field, IconButton, Input, Section, SegmentedControl, Select, Textarea, cn
} from "../../ui/index.js";
import { actionName } from "../bench/device-actions.js";
import {
  bindable, boundTool, controlOf, numberSetting, PANEL_LABELS, paramKind, paramText, parseBits, parseParam,
  SINGLE_SOURCE, takes, textSetting, toolParams
} from "./component-model.js";
import type { ManualControl } from "./use-manual-control.js";
import type { MonitorWorkspace } from "./use-monitor-workspace.js";

type Props = { panel: MonitorPanel; workspace: MonitorWorkspace };

/** A text box that keeps what is typed until it is left (or Enter), then hands it over once. */
function CommitInput({ value, onCommit, ...props }: {
  value: string;
  onCommit: (text: string) => void;
} & Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange">) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => { if (text !== value) onCommit(text); };
  return (
    <Input {...props} value={text} onChange={(event) => setText(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
  );
}

/** A numeric setting: empty clears it. */
function NumberSetting({ panel, workspace, name, label, placeholder }: Props & {
  name: string;
  label: string;
  placeholder?: string;
}) {
  const value = numberSetting(panel, name);
  return (
    <Field label={label} inline>
      <CommitInput aria-label={label} inputMode="decimal" placeholder={placeholder ?? "不设"}
        value={value === undefined ? "" : String(value)}
        onCommit={(text) => {
          const next = text.trim() === "" ? null : Number(text);
          if (next === null || Number.isFinite(next)) workspace.updatePanel(panel.id, { settings: { [name]: next } });
        }} />
    </Field>
  );
}

function streamLabel(workspace: MonitorWorkspace, ref: StreamRef): string {
  const device = workspace.devices.find((item) => item.hardwareId === ref.hardwareId);
  const stream = device?.streams.find((item) => item.id === ref.streamId);
  const label = typeof stream?.label === "string" && stream.label ? `${stream.label}（${ref.streamId}）` : ref.streamId;
  return `${device?.label || ref.hardwareId} / ${label}`;
}

/** 数据: the read half of the binding — which streams the component shows (or reads back). */
function Sources({ panel, workspace }: Props) {
  const single = SINGLE_SOURCE.has(panel.type);
  const shown = new Set(panel.sources.map((ref) => `${ref.hardwareId}/${ref.streamId}`));
  const candidates = workspace.devices.flatMap((device) => device.streams
    .filter((stream) => takes(panel.type, String(stream.type)) && !shown.has(`${device.hardwareId}/${stream.id}`))
    .map((stream) => ({ hardwareId: device.hardwareId, streamId: stream.id })));
  const operating = Boolean(PANEL_WIDGETS[panel.type]);
  return (
    <Section title={operating ? "读回（设备的实际状态）" : "数据"}>
      {panel.sources.length === 0 && (
        <p className="text-xs text-fg-3">
          {operating ? "没选读回的数据流：组件只能显示上次发出的设定值。" : "还没有选数据流。"}
        </p>
      )}
      <ul className="grid gap-1">
        {panel.sources.map((ref) => (
          <li key={`${ref.hardwareId}/${ref.streamId}`} className="flex items-center gap-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg" title={`${ref.hardwareId}/${ref.streamId}`}>
              {streamLabel(workspace, ref)}
            </span>
            <IconButton label={`不再显示 ${ref.streamId}`} size="icon-xs" variant="ghost"
              onClick={() => workspace.removeFrom(panel.id, ref)}><XIcon /></IconButton>
          </li>
        ))}
      </ul>
      <Select aria-label={single ? "选择数据流" : "添加数据流"} className="h-7 text-xs" value=""
        disabled={!candidates.length}
        onChange={(event) => {
          const picked = candidates[Number(event.target.value)];
          if (event.target.value !== "" && picked) workspace.show(panel, picked);
        }}>
        <option value="">
          {!candidates.length ? "没有可选的数据流" : single && panel.sources.length ? "换一条数据流…" : "添加数据流…"}
        </option>
        {candidates.map((ref, index) => (
          <option key={`${ref.hardwareId}/${ref.streamId}`} value={index}>{streamLabel(workspace, ref)}</option>
        ))}
      </Select>
    </Section>
  );
}

/** 外观: what only this type of component has. */
function Appearance({ panel, workspace }: Props) {
  const set = (settings: Record<string, unknown>) => workspace.updatePanel(panel.id, { settings });
  const bitsStream = panel.sources.some((ref) => workspace.typeOf(ref) === "bits");
  let body: ReactNode = null;
  if (panel.type === "number") {
    body = (
      <>
        <Field label="样子" inline>
          <SegmentedControl label="样子" size="xs"
            value={textSetting(panel, "display", ["digits", "bar", "dial"], "digits")}
            options={[{ value: "digits", label: "数字" }, { value: "bar", label: "条形" }, { value: "dial", label: "表盘" }]}
            onChange={(display) => set({ display })} />
        </Field>
        <NumberSetting panel={panel} workspace={workspace} name="min" label="量程下限" />
        <NumberSetting panel={panel} workspace={workspace} name="max" label="量程上限" />
        <NumberSetting panel={panel} workspace={workspace} name="decimals" label="小数位" placeholder="自动" />
        <NumberSetting panel={panel} workspace={workspace} name="lo" label="报警下限" />
        <NumberSetting panel={panel} workspace={workspace} name="hi" label="报警上限" />
      </>
    );
  } else if (panel.type === "lamp" || panel.type === "scope") {
    const bits = Array.isArray(panel.settings.bits) ? (panel.settings.bits as unknown[]).join(", ") : "";
    body = (
      <>
        {bitsStream && (
          <Field label="显示哪几位" inline hint="如 0-3, 5；不填显示全部">
            <CommitInput aria-label="显示哪几位" placeholder="全部" value={bits}
              onCommit={(text) => {
                const parsed = text.trim() === "" ? null : parseBits(text);
                if (parsed !== undefined) set({ bits: parsed });
              }} />
          </Field>
        )}
        {panel.type === "lamp" && !bitsStream && (
          <NumberSetting panel={panel} workspace={workspace} name="threshold" label="点亮阈值" placeholder="0.5" />
        )}
      </>
    );
  } else if (panel.type === "terminal") {
    body = (
      <Field label="显示成" inline>
        <SegmentedControl label="显示成" size="xs" value={textSetting(panel, "mode", ["text", "hex"], "text")}
          options={[{ value: "text", label: "文本" }, { value: "hex", label: "十六进制" }]}
          onChange={(mode) => set({ mode })} />
      </Field>
    );
  } else if (panel.type === "switch" && bitsStream) {
    body = <NumberSetting panel={panel} workspace={workspace} name="bit" label="读回第几位" placeholder="0" />;
  } else if (panel.type === "label") {
    body = (
      <>
        <Field label="文字">
          <Textarea aria-label="文字" className="min-h-12 text-xs" defaultValue={String(panel.settings.text ?? "")}
            key={panel.id} onBlur={(event) => set({ text: event.target.value })} />
        </Field>
        <Field label="大小" inline>
          <SegmentedControl label="大小" size="xs" value={textSetting(panel, "size", ["sm", "md", "lg"], "md")}
            options={[{ value: "sm", label: "小" }, { value: "md", label: "中" }, { value: "lg", label: "大" }]}
            onChange={(size) => set({ size })} />
        </Field>
      </>
    );
  } else if (panel.type === "button") {
    body = (
      <label className="flex items-center gap-2 text-xs text-fg-2">
        <Checkbox checked={panel.settings.confirm === true}
          onCheckedChange={(checked) => set({ confirm: checked === true })} />
        执行前先确认
      </label>
    );
  }
  return body ? <Section title="外观">{body}</Section> : null;
}

type Draft = {
  hardwareId: string;
  tool: string;
  param: string;
  fixed: Record<string, string>;
  on: string;
  off: string;
  min: string;
  max: string;
  step: string;
  presets: string;
};

function draftOf(control: MonitorControl | undefined): Draft {
  const presets = (control?.presets ?? []).map((value, index) => {
    const label = control?.labels?.[index];
    return label ? `${label}=${paramText(value)}` : paramText(value);
  }).join("\n");
  return {
    hardwareId: control?.hardwareId ?? "",
    tool: control?.tool ?? "",
    param: control?.param ?? "",
    fixed: Object.fromEntries(Object.entries(control?.fixed ?? {}).map(([name, value]) => [name, paramText(value)])),
    on: paramText(control?.on), off: paramText(control?.off),
    min: paramText(control?.min), max: paramText(control?.max), step: paramText(control?.step),
    presets
  };
}

/**
 * 动作: the write half of the binding, chosen by hand (docs/decisions 0007) — the device, the tool it calls,
 * which argument takes the operator's value, and what the other arguments are fixed to. Nothing is guessed
 * from names; the lists come from the device's own tool definitions. It is applied as a whole, once complete.
 */
function BindingEditor({ panel, workspace, control }: Props & { control: ManualControl }) {
  const saved = useMemo(() => controlOf(panel), [panel]);
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  useEffect(() => setDraft(draftOf(saved)), [saved]);
  const widget = PANEL_WIDGETS[panel.type] ?? "button";
  const tools = draft.hardwareId ? control.toolsOf(draft.hardwareId).filter((tool) => bindable(tool, panel.type)) : [];
  const tool = draft.tool
    ? boundTool({ hardwareId: draft.hardwareId, tool: draft.tool, widget, fixed: {} }, tools) : undefined;
  const params = toolParams(tool);
  const valued = widget !== "button";
  const valueParam = params.find((item) => item.name === draft.param);
  const others = params.filter((item) => item.name !== draft.param);
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  // What is still missing, in the order the form is filled.
  const fixed: Record<string, unknown> = {};
  let missing: string | undefined;
  if (!draft.hardwareId) missing = "选设备";
  else if (!tool) missing = tools.length ? "选动作" : "这台设备现在没有可绑定的动作（离线，或没有会改变输出的动作）";
  else if (valued && !valueParam) missing = "选值填进哪个参数";
  for (const item of others) {
    const text = draft.fixed[item.name] ?? "";
    const value = text.trim() === "" ? undefined : parseParam(text, item.schema);
    if (value !== undefined) fixed[item.name] = value;
    else if (!missing && (item.required || text.trim() !== "")) missing = `参数 ${item.name} 的值不对`;
  }
  const number = (text: string) => (text.trim() === "" || !Number.isFinite(Number(text)) ? undefined : Number(text));
  const presetLines = draft.presets.split("\n").map((line) => line.trim()).filter(Boolean);
  const presets = presetLines.map((line) => {
    const cut = line.indexOf("=");
    const text = cut < 0 ? line : line.slice(cut + 1);
    return { label: cut < 0 ? "" : line.slice(0, cut).trim(), value: parseParam(text, valueParam?.schema ?? {}) };
  });
  if (!missing && widget === "presets") {
    if (!presets.length) missing = "填预设值";
    else if (presets.some((item) => item.value === undefined)) missing = "有预设值和参数类型不符";
  }
  const built: MonitorControl | undefined = missing || !tool ? undefined : {
    hardwareId: draft.hardwareId, tool: tool.remoteName, widget, fixed,
    ...(valued ? { param: draft.param } : {}),
    ...(widget === "toggle" && draft.on.trim() ? { on: parseParam(draft.on, valueParam?.schema ?? {}) } : {}),
    ...(widget === "toggle" && draft.off.trim() ? { off: parseParam(draft.off, valueParam?.schema ?? {}) } : {}),
    ...(widget === "slider" && number(draft.min) !== undefined ? { min: number(draft.min)! } : {}),
    ...(widget === "slider" && number(draft.max) !== undefined ? { max: number(draft.max)! } : {}),
    ...(widget === "slider" && number(draft.step) !== undefined ? { step: number(draft.step)! } : {}),
    ...(widget === "presets" ? { presets: presets.map((item) => item.value) } : {}),
    ...(widget === "presets" && presets.some((item) => item.label) ? { labels: presets.map((item) => item.label) } : {})
  };
  const comparable = (value: MonitorControl | undefined) => {
    if (!value) return "";
    const { id: _id, label: _label, ...rest } = value;
    return JSON.stringify(rest, Object.keys(rest).sort());
  };
  const changed = Boolean(built) && comparable(built) !== comparable(saved);
  const valueKind = valueParam && paramKind(valueParam.schema);
  const numeric = valueKind === "integer" || valueKind === "number";
  const devices = workspace.devices.filter((device) => control.toolsOf(device.hardwareId).length
    || device.hardwareId === draft.hardwareId);

  return (
    <Section title="动作（点它时调用什么）">
      <Field label="设备" inline>
        <Select aria-label="设备" className="h-7 text-xs" value={draft.hardwareId}
          onChange={(event) => patch({ hardwareId: event.target.value, tool: "", param: "", fixed: {} })}>
          <option value="">选择设备…</option>
          {devices.map((device) => (
            <option key={device.hardwareId} value={device.hardwareId}>{device.label || device.hardwareId}</option>
          ))}
        </Select>
      </Field>
      <Field label="动作" inline>
        <Select aria-label="动作" className="h-7 text-xs" value={tool?.remoteName ?? ""} disabled={!tools.length}
          onChange={(event) => patch({ tool: event.target.value, param: "", fixed: {} })}>
          <option value="">{draft.tool && !tool ? `${draft.tool}（设备上没有）` : "选择动作…"}</option>
          {tools.map((item) => (
            <option key={item.remoteName} value={item.remoteName}>{actionName(item, tools)}</option>
          ))}
        </Select>
      </Field>
      {tool?.description && <p className="text-2xs break-words text-fg-3">{tool.description}</p>}
      {tool && valued && (
        <Field label="值填进" inline hint="操作员在组件上给的值，填进动作的这个参数">
          <Select aria-label="值填进哪个参数" className="h-7 text-xs" value={draft.param}
            onChange={(event) => patch({ param: event.target.value })}>
            <option value="">选择参数…</option>
            {params.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </Select>
        </Field>
      )}
      {tool && others.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-2xs text-fg-3">其余参数固定为</span>
          {others.map((item) => (
            <Field key={item.name} label={`${item.name}${item.required ? " *" : ""}`} inline>
              <Input aria-label={`固定参数 ${item.name}`} className="font-mono text-xs"
                placeholder={paramKind(item.schema) === "boolean" ? "true / false" : item.required ? "必填" : "不填"}
                title={typeof item.schema.description === "string" ? item.schema.description : undefined}
                value={draft.fixed[item.name] ?? ""}
                onChange={(event) => patch({ fixed: { ...draft.fixed, [item.name]: event.target.value } })} />
            </Field>
          ))}
        </div>
      )}
      {valueParam && widget === "toggle" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="开时发">
            <Input aria-label="开时发的值" className="font-mono text-xs" placeholder={numeric ? "1" : "true"}
              value={draft.on} onChange={(event) => patch({ on: event.target.value })} />
          </Field>
          <Field label="关时发">
            <Input aria-label="关时发的值" className="font-mono text-xs" placeholder={numeric ? "0" : "false"}
              value={draft.off} onChange={(event) => patch({ off: event.target.value })} />
          </Field>
        </div>
      )}
      {valueParam && widget === "slider" && (
        <div className="grid grid-cols-3 gap-2">
          {([["min", "最小", valueParam.schema.minimum], ["max", "最大", valueParam.schema.maximum],
            ["step", "步长", undefined]] as const).map(([key, label, declared]) => (
            <Field key={key} label={label}>
              <Input aria-label={`滑块${label}`} className="font-mono text-xs" inputMode="decimal"
                placeholder={declared === undefined ? "自动" : String(declared)}
                value={draft[key]} onChange={(event) => patch({ [key]: event.target.value })} />
            </Field>
          ))}
        </div>
      )}
      {valueParam && widget === "presets" && (
        <Field label="预设值" hint="一行一个；可以写成 名称=值">
          <Textarea aria-label="预设值" className="min-h-16 font-mono text-xs" spellCheck={false}
            placeholder={"低速=100\n高速=1000"} value={draft.presets}
            onChange={(event) => patch({ presets: event.target.value })} />
        </Field>
      )}
      <div className="flex items-center gap-2">
        <Button size="xs" variant="primary" disabled={!changed}
          onClick={() => { if (built) workspace.updatePanel(panel.id, { settings: { control: built } }); }}>
          应用绑定
        </Button>
        <span role="status" className={cn("min-w-0 flex-1 truncate text-2xs", missing ? "text-fg-2" : "text-fg-3")}>
          {missing ? `还差：${missing}` : changed ? "有没应用的修改" : saved ? "已绑定" : ""}
        </span>
      </div>
    </Section>
  );
}

/**
 * 属性 of the component picked on the canvas, in the left column while the layout is edited: its title, the
 * streams it shows, what only its type has, and — for a component that operates the hardware — its binding.
 */
export function Properties({ panel, workspace, control, onRemoved }: Props & {
  control: ManualControl;
  onRemoved: () => void;
}) {
  return (
    <div aria-label={`${PANEL_LABELS[panel.type]}的属性`} role="group">
      <Section title="标题">
        <CommitInput aria-label="标题" placeholder={PANEL_LABELS[panel.type]} value={panel.title ?? ""}
          onCommit={(title) => workspace.updatePanel(panel.id, { title })} />
      </Section>
      {PANEL_SOURCE_TYPES[panel.type].length > 0 && <Sources panel={panel} workspace={workspace} />}
      {PANEL_WIDGETS[panel.type] && (
        <BindingEditor key={panel.id} panel={panel} workspace={workspace} control={control} />
      )}
      <Appearance panel={panel} workspace={workspace} />
      <Section title="操作">
        <div className="flex flex-wrap gap-1.5">
          <Button size="xs" variant="outline" title="在旁边再放一个：位号、通道号和标题末尾的数字各加一"
            onClick={() => workspace.duplicate(panel.id)}>
            <CopyPlusIcon />复制并递增
          </Button>
          <Button size="xs" variant="danger" onClick={() => { workspace.removePanel(panel.id); onRemoved(); }}>
            <Trash2Icon />删除
          </Button>
        </div>
      </Section>
    </div>
  );
}
