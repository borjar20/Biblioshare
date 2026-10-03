import { defineConfig,devices } from "@playwright/test";
import { readFileSync } from "node:fs";
try {
  for(const line of readFileSync(".env.local","utf8").split(/\r?\n/)) {
    const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
    if(match&&!process.env[match[1]]) process.env[match[1]]=match[2];
  }
} catch { /* CI/local runner supplies environment. */ }
export default defineConfig({
  testDir:"./e2e",testMatch:"experiencias-*.spec.ts",fullyParallel:false,workers:1,retries:0,
  reporter:"list",timeout:90000,expect:{timeout:20000},
  use:{baseURL:"http://localhost:3000",trace:"retain-on-failure"},
  projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}}],
  webServer:{command:"npm run start",url:"http://localhost:3000",reuseExistingServer:true,timeout:120000},
});
