import { expect,test } from "@playwright/test";
import { login } from "./helpers";
test("a local draft survives reload without a server mutation",async({page})=>{await login(page);const editor=page.getByLabel("Write an update");await editor.fill("Draft retained through reauthentication");await page.reload();await expect(page.getByLabel("Write an update")).toContainText("Draft retained through reauthentication");await page.getByLabel("Write an update").fill("");});
