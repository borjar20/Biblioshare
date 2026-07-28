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
  // Issue #215: la semilla QA de sagas se corrompía entre specs y ENTRE
  // SESIONES (un spec que muere a mitad deja su `finally` sin correr, y el
  // siguiente lee esa suciedad como su estado de partida y la restaura). Esto
  // reimpone la línea base antes de la suite. No sustituye a la limpieza de
  // cada spec: la hace componible.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // Un reintento. NO es para tapar tests malos: el origen está medido y es del
  // entorno (Supabase remoto, ~240 ms por consulta con picos de 1,3 s), no del
  // producto — se ve igual en GETs y en el proxy de auth, que no revalidan
  // nada. La prueba de que no es el bug de ningún test es que el que falla se
  // MUEVE en cada pasada (310, 347, 467, 512...).
  //
  // Playwright marca como "flaky" (no "passed") lo que pasa al reintentar, así
  // que esto estabiliza la señal sin esconderla: si un test empieza a salir
  // flaky de forma consistente, sigue viéndose en el informe.
  retries: 1,
  // El defecto de Playwright son 5 s, y se queda corto contra `next dev`. Aquí
  // casi todo lo que se comprueba llega tras un ida y vuelta al servidor, y el
  // entorno de desarrollo tiene picos de latencia MEDIDOS: un POST normal va en
  // 2-4 s, pero la cola llega a 13-19 s, y los GET se van a 8 s con `proxy.ts`
  // (que solo resuelve la sesión de Supabase) pasando de 140 ms a 2,8 s. Con 5 s
  // el presupuesto caía dentro de esa distribución y la suite salía cara o cruz:
  // fallaba un test distinto en cada pasada (310, 347, 467, 512...), lo que
  // delataba que no era el bug de ninguno, sino el reloj.
  //
  // No es tapar un fallo: son picos del ENTORNO, no del producto (por eso se
  // ven también en GETs y en el proxy, que no revalidan nada). Subirlo aquí, y
  // no assert a assert, es lo que corresponde: afecta a todos por igual.
  expect: { timeout: 20_000 },
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
