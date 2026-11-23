import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  _electron as electron, expect, test, type ElectronApplication, type Page
} from "@playwright/test";
import { reloadAfterLeave, rendererReady, showPanel } from "./renderer.js";

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
        deviceId: "MON_RELAY", label: "继电器卡", hardwareId, type: "comm_link", settings: {}, enabled: true
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
    const panel = page.getByRole("region", { name: "运行监控" });
    await page.evaluate(async (id) => {
      await window.sage.monitor.update({ input: { operations: [
        { op: "addPanel", panel: { id: "dio", type: "digital", title: "继电器", sources: [{ hardwareId: id, streamId: "di" }] } },
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
    const tools = page.getByRole("toolbar", { name: "台架工具栏" });
    await tools.getByRole("button", { name: "编辑布局" }).click();
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
    await panel.getByRole("button", { name: "删除 结果" }).click();
    await expect(panel.locator("[data-canvas-item='results']")).toHaveCount(0);
    await page.screenshot({ path: join(artifacts, "workspace.png") });
    await tools.getByRole("button", { name: "编辑布局" }).click();
    const ids = await page.evaluate(async () =>
      (await window.sage.monitor.get()).panels.map((item) => item.id));
    expect(ids).toEqual(["scope", "dio"]);
  });


  test("shows a run started from the test panel with its event timeline from the first step", async () => {
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
    await showPanel(page, "测试编排");
    await page.getByRole("toolbar", { name: "测试流程操作" }).getByRole("button", { name: "运行", exact: true }).click();
    const panel = page.getByRole("region", { name: "运行监控" });
    await expect(panel).toContainText("运行监控运行");
    // The event timeline: regions, steps, verdicts and calls on the run's time axis.
    const overview = panel.getByRole("region", { name: "运行概览" });
    await expect(overview).toBeVisible();
    await expect(overview.getByText("第一步").first()).toBeVisible();
    await page.screenshot({ path: join(artifacts, "run.png") });
    // Finished, the run stays on the panel as a replay until the operator returns to live data.
    await expect(panel.getByRole("button", { name: "返回实时" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("toolbar", { name: "台架工具栏" })).toContainText("历史回放");
    await panel.getByRole("button", { name: "返回实时" }).click();
    await expect(overview).toHaveCount(0);
  });


  test("shows the physical wiring as a pin list", async () => {
    await page.getByRole("group", { name: "台架视图" }).getByRole("button", { name: "工位接线", exact: true }).click();
    const list = page.getByRole("region", { name: "针脚列表" });
    await expect(list).toContainText("被测板");
    const row = page.getByRole("toolbar", { name: "台架工具栏" });
    await expect(row.getByRole("group", { name: "针脚列表工具" }).getByRole("button", { name: "新建接线" })).toBeVisible();
    await expect(row.getByRole("group", { name: "运行监控工具" })).toBeHidden();
    await expect(list).toContainText("1 (EN)");
    await page.screenshot({ path: join(artifacts, "pin-list.png") });

    // 端口连线 is the other half of 工位接线: the same cables, on a canvas with nothing placed yet.
    await page.getByRole("group", { name: "接线视图" }).getByRole("button", { name: "端口连线", exact: true }).click();
    await expect(page.getByText("把左侧设备拖到这里，再从端口拖线")).toBeVisible();
    await expect(row.getByRole("group", { name: "端口连线工具" })).toContainText("画布设备");
    expect(errors).toEqual([]);
  });
});
