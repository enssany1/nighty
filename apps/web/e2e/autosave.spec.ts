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
  const row = page.locator(".shift-section.active .entry-row").filter({ hasText: marker.slice(0, 12) });
  await page.keyboard.type(marker.slice(12), { delay: 120 });
  await expect(row.first()).toBeVisible();
  await expect(editor).toHaveText(marker);
  await expect(page.locator(".shift-section.active .entry-row").filter({ hasText: marker }).getByText("Follow")).toBeVisible();
});
