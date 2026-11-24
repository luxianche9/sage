import { expect, type Page } from "@playwright/test";

/** The renderer installs `window.sage` when its bundle runs, after the window exists. */
export async function rendererReady(page: Page): Promise<Page> {
  await page.waitForFunction(() => typeof window.sage === "object");
  return page;
}

/** The page navigation at the window's left edge. */
export function activityBar(page: Page) {
  return page.getByRole("navigation", { name: "页面导航" });
}

/** Show a page of the project (设备, 接线, 协议, 流程, 运行, 记录); a click on the shown one would fold its left
 *  column away. */
export async function showPage(page: Page, label: string): Promise<void> {
  const button = activityBar(page).getByRole("button", { name: label, exact: true });
  if (await button.getAttribute("aria-current") !== "page") await button.click();
  await expect(button).toHaveAttribute("aria-current", "page");
}

/** The 接线 page's left column: the hardware list, or the wiring's change log. */
export async function showWiringLog(page: Page): Promise<void> {
  await showPage(page, "接线");
  await page.getByRole("group", { name: "左栏内容" }).getByRole("button", { name: "变更记录", exact: true }).click();
}

/** The 接线 page showing the canvas or the pin table. */
export async function showWiring(page: Page, view: "画布" | "表格"): Promise<void> {
  await showPage(page, "接线");
  await page.getByRole("group", { name: "接线视图" }).getByRole("button", { name: view, exact: true }).click();
}

/**
 * Reload after a test changed and left the project through the API. Events only invalidate queries, so the
 * interface may still hold a dirty document for a moment, and its dirty-project guard would cancel the unload
 * (Electron shows no dialog for it). Wait for the welcome page and for the coalesced refetches (≤ 500 ms).
 */
export async function reloadAfterLeave(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "最近项目" })).toBeVisible();
  await page.waitForTimeout(600);
  await page.reload();
  await rendererReady(page);
}
