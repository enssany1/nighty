import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("an Update or Follow chosen with / shows on the board while it is still being typed", async ({ page }) => {
  await login(page);
  const editor = page.getByLabel("Write an update");
  const marker = `Slash follow ${Date.now()}`;
  await editor.click();
  await page.keyboard.type("/");
  await page.getByRole("menuitem", { name: /Follow/ }).click();
  await page.keyboard.type(marker.slice(0, 12), { delay: 40 });
  const row = page.locator(".shift-section.active .entry-composer").filter({ hasText: marker.slice(0, 12) });
  await page.keyboard.type(marker.slice(12), { delay: 120 });
  await expect(row.first()).toBeVisible();
  await expect(editor).toHaveText(marker);
  await expect(page.locator(".shift-section.active .composer-gutter").getByText("Follow")).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".shift-section.active .entry-row").filter({ hasText: marker }).getByText("Follow")).toBeVisible();
});

test("typing /follow and Enter starts a Follow without saving the command", async ({ page }) => {
  await login(page);
  const editor = page.getByLabel("Write an update");
  const marker = `Typed follow ${Date.now()}`;
  await editor.click();
  await page.keyboard.type("/follow", { delay: 60 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker, { delay: 60 });
  await page.keyboard.press("Control+Enter");
  const row = page.locator(".shift-section.active .entry-row").filter({ hasText: marker });
  await expect(row.getByText("Follow")).toBeVisible();
  await expect(page.locator(".shift-section.active .entry-content").filter({ hasText: "/follow" })).toHaveCount(0);
});

test("formatting commands and colours are kept on the board", async ({ page }) => {
  await login(page);
  const editor = page.getByLabel("Write an update");
  const marker = `Gateway ${Date.now()}`;
  await editor.click();
  await page.keyboard.type("/h2"); await page.keyboard.press("Enter"); await page.keyboard.type(marker); await page.keyboard.press("Enter");
  await page.keyboard.type("/bullet"); await page.keyboard.press("Enter"); await page.keyboard.type("checked logs");
  await page.keyboard.down("Shift"); for (let index = 0; index < "logs".length; index += 1) await page.keyboard.press("ArrowLeft"); await page.keyboard.up("Shift");
  await page.getByRole("button", { name: "Text colour" }).click();
  await page.getByRole("menuitem", { name: "Red text" }).click();
  await page.keyboard.press("End"); await page.keyboard.press("Control+Enter");
  const row = page.locator(".shift-section.active .entry-row").filter({ hasText: marker });
  await expect(row.locator("h4")).toHaveText(marker);
  await expect(row.locator("li span")).toHaveCSS("color", "rgb(212, 76, 71)");
});
