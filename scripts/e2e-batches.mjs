// Issue #584: `npm run test:e2e -- club-` lanza 23 tests con un worker y, a
// mitad de la tanda, el dev server MUERE. Los tests restantes caen en cascada
// con `net::ERR_CONNECTION_REFUSED` y `worker process exited unexpectedly
// (code=3221225794)` — 0xC0000142, STATUS_DLL_INIT_FAILED, que es lo que Windows
// devuelve cuando no quedan recursos para inicializar un proceso. En una máquina
// de 8 GB, el 2026-08-11: 17 passed / 6 failed, de los cuales CINCO eran puro
// entorno.
//
// No es flakiness de un test concreto: es acumulación. Los mismos ficheros, en
// dos tandas cortas, pasan todos. Y el daño real no es el rojo: es que quien lea
// ese log da por rota su rama y se pone a "arreglar" tests que están bien. Costó
// una vuelta entera de diagnóstico separar los cinco ambientales del único real.
//
// Este runner hace dos cosas, y las dos importan:
//
//  1. **Trocea.** Cada lote es un proceso de Playwright aparte, en serie. Al
//     terminar cada uno, su memoria vuelve al sistema; la acumulación que mata
//     al server no llega a construirse.
//  2. **Distingue «la máquina no da más» de «el código está roto».** Antes y
//     después de cada lote comprueba que el servidor sigue respondiendo. Si un
//     lote falla CON el servidor caído, lo dice con todas las letras y para —
//     en vez de dejar que los cuatro lotes siguientes se pinten de rojo por lo
//     mismo y enterrar la señal.
//
// Uso:
//   node scripts/e2e-batches.mjs club-        # todos los specs que empiezan por
//   node scripts/e2e-batches.mjs              # la suite entera, por lotes
//   node scripts/e2e-batches.mjs club- --size 4
//
// NO arranca el servidor: reutiliza el que haya (igual que `npm run test:e2e`,
// `reuseExistingServer: true`). Levanta uno con `npm run dev` antes, en el
// puerto 3000 — ver AGENTS.md, «Higiene del entorno».

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const DEFAULT_BATCH_SIZE = 4;

const args = process.argv.slice(2);
const sizeFlag = args.indexOf("--size");
const batchSize = sizeFlag === -1 ? DEFAULT_BATCH_SIZE : Number(args[sizeFlag + 1]);

// El prefijo es el primer argumento POSICIONAL: se descartan `--size` y su
// valor por ÍNDICE, no por comparar con el número — comparar dejaría fuera un
// prefijo que casualmente valiera lo mismo que el tamaño de lote.
// (El `sizeFlag === -1` no es defensivo de más: sin `--size`, `sizeFlag + 1`
// vale 0 y descartaría el índice 0, o sea el prefijo.)
const posicionales = args.filter(
  (a, i) => !a.startsWith("--") && (sizeFlag === -1 || i !== sizeFlag + 1),
);
const prefix = posicionales[0] ?? "";

if (!Number.isInteger(batchSize) || batchSize < 1) {
  console.error(`--size debe ser un entero >= 1 (recibido: ${args[sizeFlag + 1]})`);
  process.exit(2);
}

const specs = readdirSync("e2e")
  .filter((f) => f.endsWith(".spec.ts") && f.startsWith(prefix))
  .sort();

if (specs.length === 0) {
  console.error(`Ningún spec en e2e/ empieza por "${prefix}"`);
  process.exit(2);
}

// Un HEAD basta: solo interesa si hay alguien escuchando y contestando, no qué
// contesta (un 3xx o un 401 son respuestas perfectamente válidas aquí).
async function serverAlive() {
  try {
    await fetch(BASE_URL, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return true;
  } catch {
    return false;
  }
}

const batches = [];
for (let i = 0; i < specs.length; i += batchSize) {
  batches.push(specs.slice(i, i + batchSize));
}

console.log(
  `${specs.length} spec(s) en ${batches.length} lote(s) de hasta ${batchSize}, contra ${BASE_URL}\n`,
);

if (!(await serverAlive())) {
  console.error(
    `\n✗ No hay nadie escuchando en ${BASE_URL}.\n` +
      `  Arranca el servidor antes:  npm run dev\n` +
      `  (este runner NO lo levanta, a propósito: así un fallo suyo no se confunde\n` +
      `   con un fallo de los tests)\n`,
  );
  process.exit(2);
}

const fallados = [];
for (const [i, batch] of batches.entries()) {
  const etiqueta = `lote ${i + 1}/${batches.length}`;
  console.log(`\n${"─".repeat(72)}\n▶ ${etiqueta}: ${batch.join(", ")}\n${"─".repeat(72)}`);

  const res = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test", ...batch.map((f) => `e2e/${f}`)],
    { stdio: "inherit" },
  );

  if (res.status !== 0) {
    fallados.push(...batch);
    // ESTA es la distinción que pedía la issue. Si el servidor ya no contesta,
    // seguir con los lotes siguientes solo produce más rojo del mismo color.
    if (!(await serverAlive())) {
      console.error(
        `\n${"═".repeat(72)}\n` +
          `✗ ENTORNO, NO PRODUCTO: el servidor de ${BASE_URL} dejó de responder\n` +
          `  durante el ${etiqueta}. Los fallos de este lote NO dicen nada sobre tu\n` +
          `  rama (issue #584). Quedaban ${batches.length - i - 1} lote(s) sin correr.\n\n` +
          `  Qué hacer: reinicia el servidor (npm run dev) y repite SOLO este lote:\n` +
          `    node scripts/e2e-batches.mjs --size ${batchSize} ${batch[0].replace(".spec.ts", "")}\n` +
          `${"═".repeat(72)}\n`,
      );
      process.exit(3);
    }
  }
}

if (fallados.length > 0) {
  console.error(
    `\n✗ ${fallados.length} spec(s) con fallos, con el servidor VIVO todo el rato\n` +
      `  (o sea: mira el producto, no la máquina):\n    ${fallados.join("\n    ")}\n`,
  );
  process.exit(1);
}

console.log(`\n✓ ${specs.length} spec(s) en verde, en ${batches.length} lote(s).\n`);
