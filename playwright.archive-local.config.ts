import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/ci",
  testMatch: "letterboxd-archive.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 25000 },
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000", trace: "retain-on-failure" },
});
