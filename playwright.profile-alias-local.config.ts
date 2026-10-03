import { defineConfig, devices } from "@playwright/test";

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "PLAYWRIGHT_BASE_URL"]) {
  const url = new URL(process.env[name] ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must point to a disposable local instance`);
  }
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local service key");

// Reuse the campaign's existing production server. This config cannot start one.
export default defineConfig({
  testDir: "./e2e/ci",
  testMatch: "profile-collection-alias.spec.ts",
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: ".scratch/alias1325/test-results",
  reporter: [["list"], ["html", { outputFolder: ".scratch/alias1325/report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    serviceWorkers: "block",
    // Credentials stay out of retained browser artifacts, including failing login.
    trace: "off",
    screenshot: "off",
  },
});
