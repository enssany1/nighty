import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir:"./e2e",fullyParallel:false,workers:1,retries:0,timeout:30_000,expect:{timeout:8_000},use:{baseURL:process.env.NIGHTY_BASE_URL??"http://127.0.0.1:8088",trace:"retain-on-failure",screenshot:"only-on-failure"},reporter:[["list"]] });
