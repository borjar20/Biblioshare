import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

// Isolated from the global sagas cleanup: this spec owns only its fixed IDs.
export default defineConfig({
  testDir: "./e2e", testMatch: "moderation-admin.spec.ts",
  workers: 1, retries: 0, timeout: 240_000, expect: { timeout: 20_000 },
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: process.env.MODERATION_PRODUCTION === "1" ? "npm run start" : "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
