import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// S3 uses only its own disposable fixtures, never the global shared QA seed.
export default defineConfig({
  ...base,
  testMatch: "club-madriguera.spec.ts",
  globalSetup: undefined,
  retries: 0,
  webServer: process.env.S3_API_ONLY ? undefined : {
    command: "node node_modules/next/dist/bin/next start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000,
  },
});
