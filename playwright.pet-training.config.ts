import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";

try { loadEnvFile(".env.local"); } catch { /* CI provides its own environment. */ }
const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
// This gate creates disposable accounts; never allow production by accident.
if (!["tyvzpuhxfwxrnkcpzxyg.supabase.co", "localhost", "127.0.0.1"].includes(database.hostname)) {
  throw new Error("Training verification requires Supabase dev or local");
}
export default defineConfig({
  testDir: "./e2e", testMatch: "mascota-entrenamiento.spec.ts",
  workers: 1, retries: 0, timeout: 120_000, reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3000", trace: "off", actionTimeout: 15_000 },
  webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 60_000 },
});
