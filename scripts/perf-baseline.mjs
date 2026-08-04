#!/usr/bin/env node
// Vía A del baseline: métricas REALES de usuario (RUM) desde Speed Insights.
//
// Se saca por CLI y no del panel a propósito: el panel no se puede diffear ni
// pegar en una issue. Esto escupe Markdown listo para `docs/perf-baseline.md`.
//
// TRAMPA QUE MANDA SOBRE TODO LO DEMÁS: el plan Hobby solo guarda los ÚLTIMOS
// 7 DÍAS. `--since 30d` no devuelve menos datos, falla:
//   "the hobby plan only grants access to the latest 7 days of data"
// O sea que el baseline CADUCA y no se puede mirar hacia atrás. Por eso el
// resultado se congela en docs/perf-baseline.md el mismo día que se captura:
// si la comparación llega tres semanas después, la referencia ya no existe.
//
// Uso:  node scripts/perf-baseline.mjs [--since 6d] [--project biblioshare]

import { execSync } from "node:child_process";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  // Estos dos valores acaban dentro de una línea de shell (ver runVercel), así
  // que no pueden traer comillas ni metacaracteres. Son parámetros de un
  // informe, no una API: la lista blanca es más corta que el escapado.
  if (!/^[A-Za-z0-9._-]+$/.test(v)) {
    console.error(`Valor no válido para --${name}: ${v}`);
    process.exit(1);
  }
  return v;
};

// 6d y no 7d: con `--since 7d` el borde de la ventana se sale de la retención
// del plan Hobby y la petición falla entera. Y `--granularity` solo admite
// unidades que Vercel reconoce — `6d` da "Unsupported duration", así que los
// buckets son diarios y el informe da el rango, no un p75 único (promediar los
// p75 de cada día NO es un p75: sería inventarse la cifra).
const SINCE = arg("since", "6d");
const PROJECT = arg("project", "biblioshare");

const METRICS = [
  { id: "lcp_ms", label: "LCP", unit: "ms", good: 2500, poor: 4000 },
  { id: "inp_ms", label: "INP", unit: "ms", good: 200, poor: 500 },
  { id: "cls", label: "CLS", unit: "", good: 0.1, poor: 0.25 },
  { id: "fcp_ms", label: "FCP", unit: "ms", good: 1800, poor: 3000 },
  { id: "ttfb_ms", label: "TTFB", unit: "ms", good: 800, poor: 1800 },
];

// TRAMPA (Windows): `execFileSync("npx", [...])` NO funciona aquí. `npx` es un
// shim `.cmd`, así que sin shell da ENOENT; y llamar a `npx.cmd` directamente da
// EINVAL, porque Node 24 se niega a lanzar `.cmd` sin shell. Con `shell:true` y
// array de args funciona, pero Node avisa (DEP0190) de que los argumentos se
// concatenan sin escapar. Por eso: UNA cadena, y los dos valores que vienen de
// argv validados con lista blanca al leerlos.
function vercelMetrics(metric, extra = []) {
  const cmd = [
    "npx vercel metrics", `vercel.speed_insights.${metric}`,
    "--since", SINCE,
    "--project", PROJECT,
    "--prod --format json",
    ...extra,
  ].join(" ");
  let raw;
  try {
    raw = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    // La CLI saca el JSON de error por stdout con código != 0.
    raw = err.stdout ?? "";
  }
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) return { error: "sin respuesta de vercel metrics" };
  try {
    return JSON.parse(json[0]);
  } catch {
    return { error: "respuesta no parseable" };
  }
}

const fmt = (v, unit) => (unit === "ms" ? `${Math.round(v)}` : v.toFixed(3));
const verdict = (v, { good, poor }) =>
  v <= good ? "bien" : v <= poor ? "regular" : "mal";

// ---- p75 por día -----------------------------------------------------------
function dailyP75(metric) {
  const d = vercelMetrics(metric.id, ["--aggregation", "p75", "--granularity", "1d"]);
  if (d.error) return { error: d.error.message ?? d.error };
  const points = [];
  for (const row of d.data ?? []) {
    for (const [k, v] of Object.entries(row)) {
      if (k !== "timestamp" && v !== null && v !== undefined) {
        points.push({ day: String(row.timestamp).slice(0, 10), value: v });
      }
    }
  }
  return { points };
}

// ---- volumen de muestras por ruta ------------------------------------------
// El count es lo que dice si un p75 SIGNIFICA algo. Sin esto, una ruta con dos
// visitas parece tener métrica y lo que tiene es una anécdota.
function samplesByRoute(metric = "lcp_count") {
  const d = vercelMetrics(metric, ["--aggregation", "sum", "--group-by", "route", "--limit", "25"]);
  if (d.error) return { error: d.error.message ?? d.error };
  const total = {};
  for (const row of d.data ?? []) {
    const route = row.route ?? "?";
    const v = row[`vercel_speed_insights_${metric}_sum`] ?? 0;
    total[route] = (total[route] ?? 0) + v;
  }
  return { routes: Object.entries(total).sort((a, b) => b[1] - a[1]) };
}

// ---- informe ---------------------------------------------------------------
console.log(`<!-- generado por scripts/perf-baseline.mjs · ventana ${SINCE} · ${new Date().toISOString().slice(0, 10)} -->\n`);
console.log(`### Vía A · Campo (Speed Insights, producción, ventana ${SINCE})\n`);
console.log("| Métrica | p75 mín | p75 máx | Umbral «bueno» | Veredicto |");
console.log("|---|---:|---:|---:|---|");

for (const m of METRICS) {
  const { points, error } = dailyP75(m);
  if (error) {
    console.log(`| ${m.label} | — | — | ${m.good}${m.unit} | \`${error}\` |`);
    continue;
  }
  if (!points.length) {
    console.log(`| ${m.label} | — | — | ${m.good}${m.unit} | sin muestras |`);
    continue;
  }
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  console.log(
    `| ${m.label} | ${fmt(min, m.unit)} | ${fmt(max, m.unit)} | ${m.good}${m.unit} | ${verdict(max, m)} |`,
  );
}

console.log(`\n> Rango de los p75 **diarios**, no un p75 de la ventana entera: Vercel no deja`);
console.log(`> agregar todo el periodo y promediar p75 no da un p75.\n`);

const { routes, error } = samplesByRoute();
console.log(`### Volumen de muestras (LCP, ventana ${SINCE})\n`);
if (error) {
  console.log(`\`${error}\`\n`);
} else {
  const total = routes.reduce((a, [, v]) => a + v, 0);
  console.log(`**Total: ${total} muestras.** Una ruta con menos de ~30 no sostiene un p75:`);
  console.log(`su "mejora" será ruido. Para esas, usar la Vía B (\`scripts/perf-lab.mjs\`).\n`);
  console.log("| Ruta | Muestras | ¿Sirve para comparar? |");
  console.log("|---|---:|---|");
  for (const [route, n] of routes) {
    if (n === 0) continue;
    console.log(`| \`${route}\` | ${n} | ${n >= 30 ? "sí" : n >= 10 ? "justo" : "**no**"} |`);
  }
}
