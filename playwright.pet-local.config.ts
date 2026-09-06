import { defineConfig, devices } from "@playwright/test";

// Dedicated local gate: no remote .env loading, no shared dev seed or sweeper.
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "PLAYWRIGHT_BASE_URL"]) {
  const url = new URL(process.env[name] ?? "http://127.0.0.1:3000");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error(`${name} must be local`);
}
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[name]) throw new Error(`Missing local ${name}`);
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["mascota-batallas-autoridad.spec.ts", "mascota-batallas-local.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", trace: "off" },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
