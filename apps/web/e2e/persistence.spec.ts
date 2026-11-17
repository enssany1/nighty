import { expect,test } from "@playwright/test";
import { login } from "./helpers";

const record="Release persistence smoke record";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=","base64");
test("inline image, attachment, autosave, and manual Handover persist",async({page})=>{
  await login(page);
  await page.locator(".shift-stream").waitFor();
  const existing=page.locator(".entry-content p").filter({hasText:record});
  if(await existing.count()===0){
    await page.getByLabel("Write an update").fill(record);
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({name:"release-inline.png",mimeType:"image/png",buffer:png});
    await page.locator('input[type="file"]:not([accept])').setInputFiles({name:"release-notes.txt",mimeType:"text/plain",buffer:Buffer.from("Nighty release attachment")});
    await expect(page.getByRole("button",{name:"Submit",exact:true})).toHaveCount(0);
    await expect(page.locator(".entry-content p").filter({hasText:record}).last()).toBeVisible();
    await expect(page.getByRole("img",{name:"release-inline.png"})).toBeVisible();
    await expect(page.getByRole("link",{name:/release-notes.txt/})).toBeVisible();
    page.once("dialog",dialog=>dialog.accept());
    await page.getByRole("button",{name:/Handover/}).click();
    await expect(page.getByText(/Handover complete/)).toBeVisible();
  }else{
    await expect(page.getByRole("img",{name:"release-inline.png"}).last()).toBeVisible();
    await expect(page.getByRole("link",{name:/release-notes.txt/}).last()).toBeVisible();
  }
});
