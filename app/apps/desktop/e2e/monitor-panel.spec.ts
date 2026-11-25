import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  _electron as electron, expect, test, type ElectronApplication, type Page
} from "@playwright/test";
import { reloadAfterLeave, rendererReady, showPage, showWiring } from "./renderer.js";

const desktopDir = resolve(import.meta.dirname, "..");
const artifacts = resolve(desktopDir, "../../output/playwright/monitor-panel");
const hardwareId = "MON_RELAY_CARD";

test.describe.serial("monitor panel and pin list", () => {
  let app: ElectronApplication;
  let page: Page;
  let userData: string;
  const errors: string[] = [];
  test.beforeAll(async () => {
    userData = await mkdtemp(join(tmpdir(), "sage-monitor-"));
    const projectRoot = join(userData, "monitor-fixture");
    await mkdir(projectRoot);
    await mkdir(artifacts, { recursive: true });
    const env = { ...process.env, SAGE_USER_DATA_DIR: userData,
      SAGE_GATEWAY_PORT: "0", SAGE_AGENT_INTEGRATION_TEST_MODE: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: [desktopDir], cwd: desktopDir, env, timeout: 90_000 });
    page = await rendererReady(await app.firstWindow());
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setMinimumSize(0, 0);
      BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800);
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole("heading", { name: "最近项目" })).toBeVisible();
    await page.evaluate(async ({ root, hardwareId }) => {
      await window.sage.projects.initializeFolder({ rootPath: root });
      await window.sage.devices.saveHardware({ input: {
        formatVersion: 2, hardwareId: "DUT", label: "被测板", kind: "passive",
        ports: [{ portId: "J1", name: "J1", pins: [
          { pinId: "1", position: 1, label: "EN" }, { pinId: "2", position: 2, label: "GND" }
        ] }]
      } });
      await window.sage.devices.saveHardware({ input: {
        formatVersion: 2, hardwareId: "FIX", label: "转接箱", kind: "passive",
        ports: [{ portId: "P1", name: "P1", pins: [{ pinId: "1", position: 1, label: "" }] }]
      } });
      // A device without its card: registered, its streams not known until it connects.
      await window.sage.devices.saveDevice({ input: {
        deviceId: "MON_RELAY", label: "继电器卡", hardwareId, type: "demo", settings: {}, enabled: true
      } });
      await window.sage.wiring.updateDocument({ wiring: { nodes: [], connections: [{
        connectionId: "C1", portA: "DUT.J1", portB: "FIX.P1", pins: [{ a: "1", b: "1" }],
        confirmedAt: "2026-10-07T00:00:00.000Z", confirmedBy: "user"
      }] } });
      await window.sage.monitor.update({ input: { operations: [{ op: "addPanel", panel: {
        id: "scope", type: "scope", title: "示波器",
        sources: [{ hardwareId, streamId: "relay" }, { hardwareId, streamId: "di" }]
      } }] } });
      await window.sage.projects.saveProject();
      await window.sage.projects.leaveProject();
    }, { root: projectRoot, hardwareId });
    await reloadAfterLeave(page);
    await page.getByText("monitor-fixture", { exact: true }).first().click();
  });
  test.afterAll(async () => {
    await app?.close().catch(() => undefined);
    if (userData && dirname(userData) === resolve(tmpdir())) await rm(userData, { recursive: true, force: true });
  });



  test("places the panels the Agent adds, and moves, resizes and removes them in edit mode", async () => {
    await showPage(page, "运行");
    const panel = page.getByRole("region", { name: "上位机画布" });
    await page.evaluate(async (id) => {
      await window.sage.monitor.update({ input: { operations: [
        { op: "addPanel", panel: { id: "dio", type: "lamp", title: "继电器", sources: [{ hardwareId: id, streamId: "di" }] } },
        { op: "addPanel", panel: { type: "results" } }
      ] } });
    }, hardwareId);
    const relays = panel.locator("[data-canvas-item='dio']");
    await expect(relays).toContainText("继电器");
    await expect(panel.locator("[data-canvas-item='results']")).toBeVisible();
    // New panels take the first free spot: none overlaps another.
    const frames = await page.evaluate(async () =>
      (await window.sage.monitor.get()).panels.map((item) => item.frame!));
    for (const [index, a] of frames.entries()) {
      for (const b of frames.slice(index + 1)) {
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
    // 编辑布局: drag a panel by 100 px (5 cells), pull its corner, remove another.
    // While the layout is edited the left column is the component library, not the test flow.
    const tools = page.getByRole("toolbar", { name: "画布工具栏" });
    await expect(page.getByRole("complementary", { name: "运行步骤" })).toBeVisible();
    await tools.getByRole("button", { name: "编辑布局" }).click();
    await expect(page.getByRole("complementary", { name: "编辑布局" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "运行步骤" })).toHaveCount(0);
    const before = frames.find((_, index) => index === 1)!;
    const handle = relays.getByRole("button", { name: "移动 继电器" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + 40);
    await page.mouse.move(box.x + 120, box.y + 60);
    await page.mouse.up();
    await expect.poll(async () => page.evaluate(async () =>
      (await window.sage.monitor.get()).panels.find((item) => item.id === "dio")?.frame?.x)).toBe(before.x + 5);
    const grip = relays.getByRole("separator", { name: "调整 继电器 的大小" });
    await grip.scrollIntoViewIfNeeded();
    const corner = (await grip.boundingBox())!;
    await page.mouse.move(corner.x + 4, corner.y + 4);
    await page.mouse.down();
    await page.mouse.move(corner.x + 44, corner.y + 44);
    await page.mouse.up();
    await expect.poll(async () => page.evaluate(async () =>
      (await window.sage.monitor.get()).panels.find((item) => item.id === "dio")?.frame?.w)).toBe(before.w + 2);
    await panel.getByRole("button", { name: "删除 结果表" }).click();
    await expect(panel.locator("[data-canvas-item='results']")).toHaveCount(0);
    await page.screenshot({ path: join(artifacts, "workspace.png") });
    await tools.getByRole("button", { name: "完成编辑" }).click();
    await expect(page.getByRole("complementary", { name: "运行步骤" })).toBeVisible();
    const ids = await page.evaluate(async () =>
      (await window.sage.monitor.get()).panels.map((item) => item.id));
    expect(ids).toEqual(["scope", "dio"]);
  });

  test("binds a switch to a device tool by hand, then operates the device with it", async () => {
    await showPage(page, "运行");
    const panel = page.getByRole("region", { name: "上位机画布" });
    const tools = page.getByRole("toolbar", { name: "画布工具栏" });
    await tools.getByRole("button", { name: "编辑布局" }).click();
    const left = page.getByRole("complementary", { name: "编辑布局" });
    // The library lists the 13 components; a click puts one in the first free spot and opens its properties.
    await expect(left.getByRole("region", { name: "显示" }).getByRole("button")).toHaveCount(6);
    await expect(left.getByRole("region", { name: "操作" }).getByRole("button")).toHaveCount(4);
    await expect(left.getByRole("region", { name: "测试与版面" }).getByRole("button")).toHaveCount(3);
    await left.getByRole("region", { name: "操作" }).getByRole("button", { name: /^开关/ }).click();
    const properties = left.getByRole("group", { name: "开关的属性" });
    await expect(properties).toBeVisible();
    const added = panel.locator("[data-component='switch']");
    await expect(added.getByRole("alert")).toContainText("未绑定");

    await properties.getByRole("textbox", { name: "标题" }).fill("输出 2");
    await properties.getByRole("textbox", { name: "标题" }).press("Enter");
    // The write half: device, tool, which argument takes the value, the rest fixed. Nothing is guessed.
    await properties.getByRole("combobox", { name: "设备" }).selectOption({ label: "继电器卡" });
    await properties.getByRole("combobox", { name: "动作" }).selectOption({ label: "set_level" });
    await expect(properties.getByRole("status")).toHaveText("还差：选值填进哪个参数");
    await properties.getByRole("combobox", { name: "值填进哪个参数" }).selectOption("level");
    await properties.getByRole("textbox", { name: "固定参数 channel" }).fill("2");
    await properties.getByRole("button", { name: "应用绑定" }).click();
    await expect(properties.getByRole("status")).toHaveText("已绑定");
    // The read half: the stream that reports the output, and which of its bits.
    await properties.getByRole("combobox", { name: "选择数据流" }).selectOption({ label: "继电器卡 / do" });
    await properties.getByRole("textbox", { name: "读回第几位" }).fill("2");
    await properties.getByRole("textbox", { name: "读回第几位" }).press("Enter");
    await page.screenshot({ path: join(artifacts, "binding.png") });
    await tools.getByRole("button", { name: "完成编辑" }).click();

    // Operated: the knob follows what the device reports back, not the click itself.
    const knob = panel.getByRole("switch", { name: "输出 2" });
    await expect(knob).toBeEnabled();
    await knob.click();
    await expect(knob).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
    await page.screenshot({ path: join(artifacts, "components.png") });
    await knob.click();
    await expect(knob).toHaveAttribute("aria-checked", "false", { timeout: 15_000 });
    // The canvas was open before the device connected: once it has, its sampled inputs show their real
    // levels (all low here), not "unknown".
    await expect(panel.getByLabel("DI0 灭")).toBeVisible({ timeout: 20_000 });
    const stored = await page.evaluate(async () =>
      (await window.sage.monitor.get()).panels.find((item) => item.type === "switch"));
    expect(stored?.title).toBe("输出 2");
    expect(stored?.settings).toMatchObject({
      bit: 2, control: { tool: "demo_set_level", widget: "toggle", param: "level", fixed: { channel: 2 } }
    });
    expect(errors).toEqual([]);
  });


  test("shows the device's live data on the displays, driven from the operating components", async () => {
    await showPage(page, "运行");
    const panel = page.getByRole("region", { name: "上位机画布" });
    const ref = (streamId: string) => ({ hardwareId, streamId });
    await page.evaluate(async ({ ai0, di, serial, id }) => {
      await window.sage.monitor.update({ input: { panels: [
        { id: "group", type: "group", title: "演示板", frame: { x: 0, y: 0, w: 58, h: 30 } },
        { id: "wave", type: "scope", title: "电压波形", sources: [ai0, di], frame: { x: 1, y: 1, w: 30, h: 13 } },
        { id: "volts", type: "number", title: "电压", sources: [ai0],
          settings: { display: "dial", min: 0, max: 5, decimals: 2, hi: 4 }, frame: { x: 32, y: 1, w: 9, h: 7 } },
        { id: "table", type: "values", title: "数值表", sources: [ai0], frame: { x: 42, y: 1, w: 15, h: 7 } },
        { id: "mode", type: "select", title: "采集模式", frame: { x: 32, y: 9, w: 12, h: 3 }, settings: { control: {
          hardwareId: id, tool: "configure", widget: "presets", param: "mode", fixed: {},
          presets: ["fast", "slow"], labels: ["快", "慢"]
        } } },
        { id: "send", type: "button", title: "发送 hi", frame: { x: 45, y: 9, w: 8, h: 3 }, settings: { control: {
          hardwareId: id, tool: "write_text", widget: "button", fixed: { text: "hi" }
        } } },
        { id: "port", type: "terminal", title: "串口", sources: [serial], frame: { x: 1, y: 15, w: 28, h: 13 } },
        { id: "frames", type: "trace", title: "串口报文", sources: [serial], frame: { x: 30, y: 15, w: 27, h: 13 } },
        { id: "note", type: "label", settings: { text: "演示设备，全部是模拟数据", size: "sm" },
          frame: { x: 32, y: 12, w: 20, h: 2 } }
      ] } });
    }, { ai0: ref("ai0"), di: ref("di"), serial: ref("serial1"), id: hardwareId });

    // The analog input reads nothing until the device is configured: the value says so, it is not 0.
    const volts = panel.locator("[data-canvas-item='volts']");
    await expect(volts).toContainText("—");
    // 选择 calls the bound tool with the preset picked; the device then samples, and every display follows.
    await panel.getByRole("combobox", { name: "采集模式" }).selectOption({ label: "慢" });
    await expect(volts).toContainText("1.25", { timeout: 20_000 });
    await expect(volts.getByRole("img", { name: "表盘" })).toBeVisible();
    await expect(panel.getByRole("table", { name: "数值表" })).toContainText("1.25");
    await expect(panel.getByRole("img", { name: "电压波形" })).toBeVisible();
    // 按钮 sends on the serial port; the terminal shows what went out and the peer's answer, the frame table too.
    await panel.getByRole("button", { name: "发送 hi" }).click();
    const terminal = panel.getByRole("log", { name: "串口" });
    await expect(terminal).toContainText("hi", { timeout: 20_000 });
    await expect(terminal).toContainText("OK");
    const rows = panel.getByRole("table", { name: "串口报文" }).getByRole("row");
    await expect(rows.filter({ hasText: "68 69" })).toHaveCount(1);
    await rows.filter({ hasText: "68 69" }).click();
    await expect(panel.getByRole("list", { name: "逐字节" }).getByRole("listitem")).toHaveCount(2);
    await page.screenshot({ path: join(artifacts, "gallery.png") });
    expect(errors).toEqual([]);
  });

  test("shows a run with its steps beside the canvas, and replays it from the records page", async () => {
    await page.evaluate(async () => {
      const flow = await window.sage.testing.loadPlan({ planId: "flow" });
      await window.sage.testing.applyPlanOperations({ input: {
        planId: flow.id, baseRevision: flow.revision, requestId: crypto.randomUUID(),
        operations: [
          { type: "set_plan_fields", patch: { name: "运行监控运行" } },
          { type: "insert_step", region: "test", step: { id: "first", type: "PublishResult", name: "第一步", value: "ok" } },
          { type: "insert_step", region: "test", step: { id: "wait", type: "Delay", name: "等待", durationMs: 1_500 } }
        ]
      } });
    });
    await showPage(page, "运行");
    await page.getByRole("toolbar", { name: "测试流程操作" }).getByRole("button", { name: "运行", exact: true }).click();
    const panel = page.getByRole("region", { name: "上位机画布" });
    await expect(panel).toContainText("运行监控运行");
    // The steps stay beside the canvas for the whole run.
    const steps = page.getByRole("complementary", { name: "运行步骤" }).getByRole("tree", { name: "测试流程" });
    await expect(steps.getByRole("treeitem", { name: /第一步/ })).toBeVisible();
    // The event timeline: regions, steps, verdicts and calls on the run's time axis.
    const overview = panel.getByRole("region", { name: "运行概览" });
    await expect(overview).toBeVisible();
    await expect(overview.getByText("第一步").first()).toBeVisible();
    await page.screenshot({ path: join(artifacts, "run.png") });
    // Finished, the run stays on the page until the operator returns to live data.
    await expect(panel.getByRole("button", { name: "返回实时" })).toBeVisible({ timeout: 20_000 });
    const canvasTools = panel.getByRole("toolbar", { name: "画布工具栏" });
    await expect(canvasTools).toContainText("上次运行");
    await panel.getByRole("button", { name: "返回实时" }).click();
    await expect(overview).toHaveCount(0);
    await expect(canvasTools).toContainText("实时数据");

    // 记录: picking the run replays it on that page; the 运行 page still shows live data.
    await showPage(page, "记录");
    const records = page.getByRole("complementary", { name: "运行记录" });
    await records.getByRole("list", { name: "运行记录" }).getByRole("button", { name: /运行监控运行/ }).first().click();
    const replay = page.getByRole("region", { name: "运行回放" });
    await expect(replay.getByRole("toolbar", { name: "画布工具栏" })).toContainText("历史回放");
    await expect(replay.getByRole("region", { name: "运行概览" })).toBeVisible();
    await expect(replay.getByRole("button", { name: "编辑布局" })).toHaveCount(0);
    // The left column is now this run's steps; the arrow goes back to the list.
    await expect(records.getByRole("tree", { name: "测试流程" }).getByRole("treeitem", { name: /第一步/ })).toBeVisible();
    await page.screenshot({ path: join(artifacts, "record.png") });
    await records.getByRole("button", { name: "返回全部记录" }).click();
    await expect(records.getByRole("list", { name: "运行记录" })).toBeVisible();
    await expect(replay).toHaveCount(0);
    await showPage(page, "运行");
    await expect(canvasTools).toContainText("实时数据");
  });


  test("shows the physical wiring as a pin table and as a canvas", async () => {
    await showWiring(page, "表格");
    const list = page.getByRole("region", { name: "针脚列表" });
    await expect(list).toContainText("被测板");
    const row = page.getByRole("toolbar", { name: "接线工具栏" });
    await expect(row.getByRole("group", { name: "针脚表工具" }).getByRole("button", { name: "新建接线" })).toBeVisible();
    await expect(row.getByRole("group", { name: "画布工具" })).toBeHidden();
    await expect(list).toContainText("1 (EN)");
    await page.screenshot({ path: join(artifacts, "pin-list.png") });

    // The canvas is the other view of the same cables, with nothing placed on it yet.
    await showWiring(page, "画布");
    await expect(page.getByText("把左侧设备拖到这里，再从端口拖线")).toBeVisible();
    await expect(row.getByRole("group", { name: "画布工具" })).toContainText("画布硬件");
    expect(errors).toEqual([]);
  });
});
