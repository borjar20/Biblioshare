// Re-embebe docs/architecture/graph.json dentro de map.html y valida referencias.
//
//   node docs/architecture/sync.mjs          → valida y regenera map.html
//   node docs/architecture/sync.mjs --check  → solo valida (para CI o pre-commit)
//
// map.html es AUTOCONTENIDO a propósito (se abre con doble clic, sin servidor),
// así que lleva una copia del JSON incrustada. Este script es lo que impide que
// las dos copias diverjan: edita SIEMPRE graph.json y corre esto después.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(here, "graph.json");
const HTML_PATH = join(here, "map.html");
const checkOnly = process.argv.includes("--check");

const raw = readFileSync(JSON_PATH, "utf8");
const g = JSON.parse(raw);

// --- Validación de integridad referencial -------------------------------
const ids = new Set(g.nodes.map((n) => n.id));
const layerIds = new Set(g.meta.layers.map((l) => l.id));
const errors = [];

const dupes = g.nodes.map((n) => n.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupes.length) errors.push(`ids de nodo duplicados: ${[...new Set(dupes)].join(", ")}`);

for (const n of g.nodes) {
  if (!layerIds.has(n.layer)) errors.push(`nodo ${n.id}: capa desconocida "${n.layer}"`);
}
for (const e of g.edges) {
  if (!ids.has(e.from)) errors.push(`arista → ${e.to}: origen inexistente "${e.from}"`);
  if (!ids.has(e.to)) errors.push(`arista ${e.from} →: destino inexistente "${e.to}"`);
  if (!g.meta.edgeKinds[e.kind]) errors.push(`arista ${e.from}→${e.to}: kind desconocido "${e.kind}"`);
}
for (const f of g.flows) {
  if (!f.steps?.length) errors.push(`flujo ${f.id}: sin pasos`);
  f.steps?.forEach((s, i) => {
    if (!ids.has(s.node)) errors.push(`flujo ${f.id} paso ${i + 1}: nodo inexistente "${s.node}"`);
  });
}
// El JSON viaja dentro de un <script>: un "</script" literal lo rompería.
if (/<\/script/i.test(raw)) errors.push('graph.json contiene "</script" y rompería map.html');

if (errors.length) {
  console.error("graph.json NO valida:");
  for (const e of errors) console.error("  · " + e);
  process.exit(1);
}

const stats =
  `${g.nodes.length} nodos · ${g.edges.length} aristas · ${g.flows.length} flujos · ` +
  `${g.flows.reduce((a, f) => a + f.steps.length, 0)} pasos`;

if (checkOnly) {
  console.log(`graph.json OK — ${stats}`);
  process.exit(0);
}

// --- Re-embebido ---------------------------------------------------------
const html = readFileSync(HTML_PATH, "utf8");
const open = '<script id="graph-data" type="application/json">';
const start = html.indexOf(open);
const end = html.indexOf("</" + "script>", start);
if (start === -1 || end === -1) {
  console.error('No encuentro el bloque <script id="graph-data"> en map.html.');
  process.exit(1);
}
const next = html.slice(0, start + open.length) + raw + html.slice(end);
writeFileSync(HTML_PATH, next);
console.log(`map.html regenerado — ${stats}`);
