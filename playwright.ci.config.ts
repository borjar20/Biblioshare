import { defineConfig, devices } from "@playwright/test";

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "PLAYWRIGHT_BASE_URL"]) {
  const url = new URL(process.env[name] ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must point to a disposable local instance`);
  }
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local service key");

export default defineConfig({
  testDir: "./e2e/ci",
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1",
    url: process.env.PLAYWRIGHT_BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
