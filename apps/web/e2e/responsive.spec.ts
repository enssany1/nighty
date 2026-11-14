import { expect,test } from "@playwright/test";
import { login } from "./helpers";
for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1280,height:800}]){test(`operations reflow at ${viewport.width}px`,async({page})=>{await page.setViewportSize(viewport);await login(page);await expect(page.getByLabel("Operational day calendar")).toBeVisible();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBeLessThanOrEqual(1);});}
