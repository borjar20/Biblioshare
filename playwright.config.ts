import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// Carga mínima de .env.local (Playwright no lo hace solo) para tener las
// credenciales del usuario de prueba y apuntar al proyecto Supabase dev.
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // Sin .env.local (p. ej. CI): se espera TEST_USER_* en el entorno.
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // Reutiliza el `next dev` ya levantado; si no hay ninguno, lo arranca.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
