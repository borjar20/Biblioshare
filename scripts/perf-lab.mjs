#!/usr/bin/env node
// Vía B del baseline: medida SINTÉTICA por ruta, en laboratorio.
//
// Existe porque el campo no llega. Medido el 2026-08-04: 159 muestras de LCP en
// 6 días para toda la app, y repartidas fatal — `/` tenía 89 y `/clubes` y
// `/estadisticas` UNA cada una. O sea que el RUM nunca va a demostrar que las
// mejoras de esas dos páginas funcionaron: un p75 sobre una muestra es esa
// muestra. Esto sí, porque no depende de que entre nadie.
//
// Usa el Chromium que ya trae @playwright/test. Sin dependencias nuevas.
//
// IMPORTANTE — contra build de PRODUCCIÓN, no contra `next dev`:
//   npm run build && npm start
//   node scripts/perf-lab.mjs
// En dev los números no significan nada (compilación bajo demanda). El script
// avisa si detecta que está midiendo dev.
//
// Uso:  node scripts/perf-lab.mjs [--runs 5] [--url http://localhost:3000]

import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // Sin .env.local: se espera TEST_USER_* en el entorno.
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const BASE = arg("url", process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
// 9 y no 5: con 5 dos capturas consecutivas del MISMO commit dieron 3176 ms y
// 1940 ms de LCP en `/`. Esa dispersión no es la app, es la latencia de
// Supabase dev metiéndose en la mediana, y con 5 muestras una sola carga lenta
// la mueve. El informe saca además el rango de cada ruta para que se vea el
// suelo de ruido: una diferencia antes/después más pequeña que ese rango NO es
// una mejora, es la misma medición otra vez.
const RUNS = Number(arg("runs", "9"));
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;
const USERNAME = process.env.TEST_USER_USERNAME;

// Las rutas que el plan de migración tiene que poder demostrar. `auth: false`
// = medible sin sesión (son las públicas de catálogo, las que además interesan
// para SEO).
const ROUTES = [
  { path: "/", label: "/", auth: true },
  { path: "/clubes", label: "/clubes", auth: true, issue: "#438" },
  { path: "/estadisticas", label: "/estadisticas", auth: true, issue: "#440" },
  { path: "/coleccion", label: "/coleccion", auth: true },
  { path: "/buscar", label: "/buscar", auth: true },
  USERNAME ? { path: `/u/${USERNAME}`, label: "/u/[username]", auth: true } : null,
].filter(Boolean);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// TTFB y LCP de UNA carga en frío. Contexto nuevo por medición: reutilizarlo
// dejaría la caché del navegador caliente y mediría la segunda visita, que no
// es la que duele.
async function measure(browser, storageState, path) {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  // El LCP puede moverse después de `load` (una imagen que entra tarde). Un
  // respiro corto y se lee el último valor observado.
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      // TTFB = responseStart desde el origen del tiempo, que es como lo define
      // web-vitals (y por tanto Speed Insights). NO `responseStart -
      // requestStart`: eso deja fuera DNS, TCP y redirecciones y daría un
      // número más bonito que el de la Vía A midiendo otra cosa.
      ttfb: nav ? nav.responseStart : null,
      fcp: fcp ? fcp.startTime : null,
      lcp: window.__lcp || null,
    };
  });

  await context.close();
  return m;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Falta TEST_USER_EMAIL / TEST_USER_PASSWORD (.env.local o entorno).");
    process.exit(1);
  }

  const browser = await chromium.launch();

  // Sesión UNA vez, y se reutiliza como storageState. Loguearse en cada
  // medición metería el coste del login dentro de la cifra.
  const authCtx = await browser.newContext();
  const authPage = await authCtx.newPage();
  await authPage.goto(`${BASE}/login`);
  await authPage.fill('input[name="email"]', EMAIL);
  await authPage.fill('input[name="password"]', PASSWORD);
  await authPage.click('button[type="submit"]');
  await authPage.waitForURL(`${BASE}/`, { timeout: 30_000 });
  const storageState = await authCtx.storageState();
  await authCtx.close();

  const rows = [];
  for (const route of ROUTES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        runs.push(await measure(browser, storageState, route.path));
      } catch (err) {
        console.error(`  ! ${route.label} run ${i + 1}: ${err.message.split("\n")[0]}`);
      }
    }
    const ok = runs.filter((r) => r.ttfb !== null);
    if (!ok.length) {
      rows.push({ ...route, ttfb: null });
      continue;
    }
    const lcps = ok.filter((r) => r.lcp).map((r) => r.lcp);
    rows.push({
      ...route,
      ttfb: median(ok.map((r) => r.ttfb)),
      fcp: median(ok.filter((r) => r.fcp).map((r) => r.fcp)),
      lcp: median(lcps),
      lcpMin: lcps.length ? Math.min(...lcps) : null,
      lcpMax: lcps.length ? Math.max(...lcps) : null,
      n: ok.length,
    });
  }

  await browser.close();

  console.log(`<!-- generado por scripts/perf-lab.mjs · ${RUNS} cargas/ruta · ${new Date().toISOString().slice(0, 10)} -->\n`);
  console.log(`### Vía B · Laboratorio (${BASE}, mediana de ${RUNS} cargas en frío)\n`);
  console.log("| Ruta | TTFB | FCP | LCP (mediana) | LCP rango | Issue |");
  console.log("|---|---:|---:|---:|---:|---|");
  for (const r of rows) {
    if (r.ttfb === null) {
      console.log(`| \`${r.label}\` | — | — | — | — | ${r.issue ?? ""} |`);
      continue;
    }
    const ms = (v) => (v ? `${Math.round(v)} ms` : "—");
    const range =
      r.lcpMin && r.lcpMax ? `${Math.round(r.lcpMin)}–${Math.round(r.lcpMax)}` : "—";
    console.log(
      `| \`${r.label}\` | ${ms(r.ttfb)} | ${ms(r.fcp)} | ${ms(r.lcp)} | ${range} | ${r.issue ?? ""} |`,
    );
  }
  console.log(`\n> Mediana de ${RUNS} cargas, no media: un pico de latencia de Supabase no debe`);
  console.log(`> mover la cifra. **Lee el rango antes de celebrar una mejora**: si el`);
  console.log(`> antes/después es menor que él, no has medido una mejora sino el ruido.`);
  console.log(`> Medir SIEMPRE contra \`npm run build && npm start\`.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
