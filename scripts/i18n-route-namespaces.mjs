// Guardián de #444 (split de mensajes i18n por ruta). Uso:
//   node scripts/i18n-route-namespaces.mjs .
// Al añadir una ruta o un `useTranslations("ns")`, compara la salida con los
// `ns` que declara cada <RouteMessages>/layout de sección: los providers NO
// mergean con el padre, así que un namespace nuevo no cubierto sale como la
// clave sin traducir (no rompe el build). BASE (nav/notifications/common/time/
// errors/push) lo pone el provider raíz y no hace falta repetirlo.
//
// Analiza, por cada page.tsx, el conjunto de namespaces que usa su subárbol de
// CLIENTE (useTranslations). Recorre el grafo de imports (relativos y @/…),
// deduplicando, y en cada fichero recoge useTranslations("ns…") → raíz `ns`.
// getTranslations (servidor) NO cuenta: lee de la config del servidor, no del
// provider cliente. Salida: page → [namespaces] ordenados.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { globSync } from "node:fs";

const ROOT = process.argv[2];
const SRC = join(ROOT, "src");

const exts = [".tsx", ".ts", ".jsx", ".js"];
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // paquete externo
  const cands = [];
  for (const e of exts) cands.push(base + e);
  for (const e of exts) cands.push(join(base, "index" + e));
  for (const c of cands) if (existsSync(c)) return c;
  return null;
}

const importRe = /(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;
// También imports dinámicos: import("x"), dynamic(() => import("x")), require("x")
const dynImportRe = /(?:import|require)\(\s*["']([^"']+)["']\s*\)/g;
const useTransRe = /useTranslations\(\s*["']([^"'.]+)/g;

const fileCache = new Map();
function read(f) {
  if (!fileCache.has(f)) fileCache.set(f, readFileSync(f, "utf8"));
  return fileCache.get(f);
}

function collect(entry) {
  const seen = new Set();
  const ns = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let src;
    try { src = read(f); } catch { continue; }
    let m;
    useTransRe.lastIndex = 0;
    while ((m = useTransRe.exec(src))) ns.add(m[1]);
    importRe.lastIndex = 0;
    while ((m = importRe.exec(src))) {
      const r = resolveImport(f, m[1]);
      if (r && !seen.has(r)) stack.push(r);
    }
    dynImportRe.lastIndex = 0;
    while ((m = dynImportRe.exec(src))) {
      const r = resolveImport(f, m[1]);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return [...ns].sort();
}

const pages = globSync(join(SRC, "app", "**", "page.tsx"));
const out = {};
for (const p of pages.sort()) {
  const route = p.replace(join(SRC, "app"), "").replace(/\\/g, "/").replace(/\/page\.tsx$/, "") || "/";
  out[route] = collect(p);
}

// Imprime tabla ordenada + el universo total
const allNs = new Set();
for (const route of Object.keys(out)) {
  for (const n of out[route]) allNs.add(n);
  console.log(out[route].length.toString().padStart(2), route, "→", out[route].join(", "));
}
console.log("\nUniverso de namespaces cliente vistos por alguna ruta:", [...allNs].sort().join(", "));
console.log("Total:", allNs.size);
