# Mascota R4a — Aventuras derivadas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aventuras de dos o tres tramos concedidas por día con actividad real, con reintento, reanudación y botín «pendiente de activar», sobre una versión r4.1 del motor de combate.

**Architecture:** La cadena entera es UN combate para el motor (versión `r4.1`, publicada con una herramienta nueva de `freeze`) y UNA fila de `pet_battles` con `kind = 'adventure'`. La concesión se deriva en SQL (días vividos de la última semana menos días con fila); iniciar y resolver son dos funciones SQL en `public` con `pg_advisory_xact_lock` por usuario, ejecutables solo por `service_role`. El botín se elige dentro de esa transacción como primer id no poseído de una permutación derivada del seed en TypeScript.

**Tech Stack:** Next.js (server actions, `"use server"`), Supabase (Postgres, PostgREST RPC, RLS), TypeScript, Vitest (unit, jsdom para componentes), Playwright (e2e), `tsx` para el CLI, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md` (aprobada 2026-09-06). Referencias de secciones (§) en este plan apuntan a esa spec.

## Global Constraints

- **Node 22.** En PowerShell, en el MISMO comando: `fnm env | Out-String | Invoke-Expression; fnm use 22; <comando>`. Comprobar `node --version` antes de fiarse de un test.
- **Esta worktree no tiene `node_modules`.** Primer paso de la sesión: `npm ci` (≈1 min). Copiar `.env.local` del repo padre (`D:\Proyectos\Personal\Biblioshare\.env.local`) a la worktree antes de cualquier e2e; sin él la suite sale verde sin probar nada.
- **`versions/r2.2` y `versions/r3.1` no se tocan** ni un byte (`releases.test.ts` lo vigila). Un test nuevo sobre r3.1 va en `src/lib/pet/battle/*.test.ts`, nunca dentro de `versions/`.
- **Todo módulo del motor es puro** (`purity.test.ts`): sin `Math.random`, `Date`, `process.env`, Supabase, React ni Next.
- **Los números del combate viven solo en `content.ts`.** R4a añade `adventure.chainLength` y NO cambia ningún número de r3.1. Si la calibración obligara a cambiar uno, se para y se registra en `decisiones.md` antes.
- **Ningún `use cache`** en nada de aventuras: todo depende del usuario (regla #437).
- **`pet_battles` la escribe solo `service_role`.** `authenticated` solo lee lo suyo. Las funciones de escritura viven en `public` (PostgREST solo expone `public`) con `revoke all from public, anon, authenticated` y `grant execute to service_role`, como `claim_pet_nudges`.
- **Migraciones: dev primero (`supabase-dev`), prod después y solo tras la aceptación de R3 (#1106).** Verificar contra objetos reales (`pg_proc`, `pg_class`, `has_function_privilege`), no contra el ledger.
- **Día local = Europe/Madrid**, calculado en SQL: `(timezone('Europe/Madrid', now()))::date`.
- **Clave del bloqueo consultivo:** `pg_advisory_xact_lock(20260908, hashtext(p_user::text))`. Es el primer bloqueo consultivo del repo; el `20260908` queda documentado en `data-model.md` y no se reutiliza para otra cosa.
- **Sin arte nuevo** en R4a. Nada de PixelLab.
- **Textos** nuevos en `messages/es.json` bajo `pet.adventure.*` (y las claves de eventos nuevas bajo `pet.training.events.*`). Español, tono del resto de la mascota.
- **Commits pequeños** con prefijo `feat(pet):`, `test(pet):`, `docs(pet):`, `chore(pet):`, y el trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## Preparación del entorno (una vez por sesión)

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22; node --version; npm ci
Copy-Item D:\Proyectos\Personal\Biblioshare\.env.local .\.env.local
```

Comandos de verificación que se repiten en el plan:

```powershell
# unitarios del motor y del CLI (vitest + node:test)
fnm env | Out-String | Invoke-Expression; fnm use 22; npm run test:pet:battle
# un fichero concreto
fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet/battle/engine.test.ts
# tipos y lint
fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit; npm run lint
```

---

## Mapa de ficheros

**Motor y ritual de versiones**
- Create: `scripts/pet-battle/freeze.ts` — `forkVersion`, `manifestFor`, `writeManifest`, `releaseBlock` (funciones puras sobre un directorio raíz).
- Create: `scripts/pet-battle/freeze.test.ts` — node:test sobre una copia temporal.
- Modify: `scripts/pet-battle/simulate.ts` — subcomandos `fork`, `freeze`, `golden --version --chain`, `calibrate --chain`, `run --chain`.
- Create: `src/lib/pet/battle/versions/r4.1/*.ts` (copia de r3.1 + `adventure.ts`), `normative.json`, `manifest.json`.
- Modify: `src/lib/pet/battle/{engine,inputs,types,content,record,ulti,canonical,hash,prng}.ts` — reexports a `r4.1`.
- Modify: `src/lib/pet/battle/replay.ts` — entrada `r4.1` en `BATTLE_RELEASES`.
- Modify: `src/lib/pet/battle/{calibration,policies}.ts`, `src/lib/pet/battle/purity.test.ts`, `content.test.ts`, `engine.test.ts`, `inputs.test.ts`, `record.test.ts`, `releases.test.ts`.
- Create: `src/lib/pet/battle/r4-normative.test.ts`, `src/lib/pet/battle/chain.test.ts`, `src/lib/pet/battle/tick-order.test.ts`.
- Modify: `src/lib/pet/battle/versions/README.md`, `docs/testing/pet-battle.md`.

**Base de datos**
- Create: `supabase/migrations/20260908_pet_adventures.sql`.
- Create: `supabase/tests/pet_adventures.sql`.
- Modify: `src/lib/supabase/database.types.ts` — columnas nuevas de `pet_battles` y tres `Functions`.

**Botín**
- Create: `src/lib/pet/loot/catalog.ts`, `src/lib/pet/loot/reward.ts`, `src/lib/pet/loot/reward.test.ts`.

**Servicio de aventuras**
- Create: `src/lib/pet/adventure/{types,repository,service,get-state,actions}.ts`, `src/lib/pet/adventure/service.test.ts`.
- Create: `src/lib/pet/training/shared.ts` (extraído de `service.ts`: `isIntent`, `verifyResolved`).
- Modify: `src/lib/pet/training/service.ts`, `src/lib/pet/training/types.ts`.
- Modify: `src/lib/celebrations/{types,registry}.ts`, `src/components/celebrations/celebration-overlay.tsx`.

**Cliente**
- Modify: `src/components/pet/training/training-session.ts` (+ test), `training-panel.tsx` (+ test).
- Create: `src/components/pet/adventure/adventure-section.tsx`, `adventure-panel.tsx`, `inventory-list.tsx`.
- Modify: `src/app/mascota/page.tsx`, `messages/es.json`.

**E2E y docs**
- Create: `e2e/mascota-aventuras.spec.ts`.
- Modify: `e2e/mascota-batallas-autoridad.spec.ts`.
- Modify: `docs/requirements/data-model.md`, `docs/requirements/backlog.md`, `docs/requirements/decisiones.md`, `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md`, `docs/architecture/graph.json`, la spec (§4 y §6: funciones en `public`).

---

### Task 1: Herramienta de versiones `fork` / `freeze` / `golden --version` (#1093)

**Files:**
- Create: `scripts/pet-battle/freeze.ts`
- Create: `scripts/pet-battle/freeze.test.ts`
- Modify: `scripts/pet-battle/simulate.ts`
- Modify: `src/lib/pet/battle/purity.test.ts:15-16`
- Modify: `src/lib/pet/battle/versions/README.md`
- Modify: `package.json:23` (`test:pet:battle` incluye el test nuevo)

**Interfaces:**
- Produces: `forkVersion(root, from, to): string[]`, `manifestFor(dir): Record<string,string>`, `writeManifest(root, version): Record<string,string>`, `releaseBlock(version, contentHash): string`. `root` es la carpeta `src/lib/pet/battle` (o una copia temporal en tests).
- Produces: CLI `npm run pet:battle -- fork <from> <to>`, `npm run pet:battle -- golden --version <v> [--chain N]`, `npm run pet:battle -- freeze <version>`.

- [ ] **Step 1: Test node:test de las funciones puras**

`scripts/pet-battle/freeze.test.ts`:

```ts
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { forkVersion, manifestFor, releaseBlock, writeManifest } from "./freeze";

const REAL = "src/lib/pet/battle";

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "battle-freeze-"));
  cpSync(join(REAL, "versions", "r3.1"), join(root, "versions", "r3.1"), { recursive: true });
  return root;
}

test("manifestFor reproduce byte a byte el manifiesto publicado de r3.1", () => {
  const committed = JSON.parse(readFileSync(join(REAL, "versions/r3.1/manifest.json"), "utf8"));
  assert.deepEqual(manifestFor(join(REAL, "versions/r3.1")), committed);
});

test("fork copia solo los .ts y rechaza sobrescribir", () => {
  const root = tempRoot();
  try {
    const copied = forkVersion(root, "r3.1", "r9.9");
    assert.ok(copied.includes("engine.ts") && !copied.includes("normative.json") && !copied.includes("manifest.json"));
    assert.ok(existsSync(join(root, "versions/r9.9/engine.ts")));
    assert.throws(() => forkVersion(root, "r3.1", "r9.9"), /no se sobrescribe/);
    assert.throws(() => forkVersion(root, "r3.1", "bonita"), /versión inválida/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("freeze exige normative.json, escribe el manifiesto una sola vez", () => {
  const root = tempRoot();
  try {
    forkVersion(root, "r3.1", "r9.9");
    assert.throws(() => writeManifest(root, "r9.9"), /normative\.json/);
    writeFileSync(join(root, "versions/r9.9/normative.json"), "{}\n");
    const manifest = writeManifest(root, "r9.9");
    assert.ok("normative.json" in manifest && "engine.ts" in manifest && !("manifest.json" in manifest));
    assert.throws(() => writeManifest(root, "r9.9"), /ya está publicada/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("releaseBlock imprime la entrada de BATTLE_RELEASES con versión y hash", () => {
  const block = releaseBlock("r4.1", "ab".repeat(32));
  assert.match(block, /rulesetVersion: "r4\.1"/);
  assert.match(block, new RegExp("ab".repeat(32)));
  assert.match(block, /versions\/r4\.1/);
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; node --import tsx --test scripts/pet-battle/freeze.test.ts`
Expected: FAIL, `Cannot find module './freeze'`.

- [ ] **Step 3: Implementar `scripts/pet-battle/freeze.ts`**

```ts
// Ritual de publicar una versión de combate (#1093, README de versions/):
// fork = copiar el código ejecutable; freeze = fijar fixture normativo + manifiesto.
// Funciones puras sobre un directorio raíz para poder probarlas en una copia temporal.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BATTLE_DIR = "src/lib/pet/battle";

export function versionDir(root: string, version: string): string {
  return join(root, "versions", version);
}

export function forkVersion(root: string, from: string, to: string): string[] {
  if (!/^r\d+\.\d+$/.test(to)) throw new Error(`versión inválida: ${to} (forma rN.M)`);
  const src = versionDir(root, from);
  const dst = versionDir(root, to);
  if (!existsSync(src)) throw new Error(`no existe la versión de origen ${src}`);
  if (existsSync(dst)) throw new Error(`ya existe ${dst}: una versión publicada no se sobrescribe`);
  mkdirSync(dst, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(src).filter((n) => n.endsWith(".ts"))) {
    cpSync(join(src, name), join(dst, name));
    copied.push(name);
  }
  return copied.sort();
}

/** Mismo cálculo que releases.test.ts: sha256 del fuente con CRLF normalizado a LF. */
export function manifestFor(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((n) => n !== "manifest.json").sort()) {
    const source = readFileSync(join(dir, name), "utf8").replaceAll("\r\n", "\n");
    out[name] = createHash("sha256").update(source).digest("hex");
  }
  return out;
}

export function writeManifest(root: string, version: string): Record<string, string> {
  const dir = versionDir(root, version);
  if (!existsSync(dir)) throw new Error(`no existe ${dir}`);
  if (existsSync(join(dir, "manifest.json"))) throw new Error(`${version} ya está publicada (manifest.json existe): publica otra versión`);
  if (!existsSync(join(dir, "normative.json"))) throw new Error(`${version} no tiene normative.json: ejecuta \`golden --version ${version}\` antes`);
  const manifest = manifestFor(dir);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export function releaseBlock(version: string, contentHash: string): string {
  const v = version.replace(".", "_");
  return [
    `// src/lib/pet/battle/replay.ts — añadir al FINAL de BATTLE_RELEASES (append-only).`,
    `// Imports: import * as ${v} from "./versions/${version}/content"; validateInputs as validate_${v} from "./versions/${version}/inputs";`,
    `// resimulate as resimulate_${v} from "./versions/${version}/record"; isBattleSnapshot as is_${v}_Snapshot from "./versions/${version}/snapshot".`,
    `Object.freeze({`,
    `  rulesetVersion: "${version}",`,
    `  contentHash: "${contentHash}",`,
    `  ruleset: ${v}.RULESET, enemies: ${v}.ENEMIES, isSnapshot: is_${v}_Snapshot,`,
    `  validateInputs: (raw: unknown, fights = 1) => validate_${v}(raw, ${v}.RULESET, fights),`,
    `  async replay(record) { return resimulate_${v}(record, { ruleset: ${v}.RULESET, enemies: ${v}.ENEMIES, contentHash: await ${v}.contentHash() }); },`,
    `}),`,
  ].join("\n");
}
```

- [ ] **Step 4: Subcomandos en `scripts/pet-battle/simulate.ts`**

Añadir el import y las funciones; `golden` gana `--version` (escribe `versions/<v>/normative.json`) y `--chain` (se usa en la Task 5; de momento acepta el flag y lo ignora si vale 1). Reemplazar `main()`:

```ts
import { BATTLE_DIR, forkVersion, releaseBlock, versionDir, writeManifest } from "./freeze";
import { join } from "node:path";

function normativePathFor(version: string | undefined): string {
  return version ? join(versionDir(BATTLE_DIR, version), "normative.json") : NORMATIVE_PATH;
}

async function fork(from: string | undefined, to: string | undefined) {
  if (!from || !to) fail("fork <desde> <hasta>   p. ej. fork r3.1 r4.1");
  const copied = forkVersion(BATTLE_DIR, from, to);
  console.log(`copiados a versions/${to}: ${copied.join(", ")}`);
  console.log(`siguiente: editar versions/${to}, apuntar los reexports de ${BATTLE_DIR}/*.ts a ./versions/${to}, subir RULESET.version a "${to}", y al final \`golden --version ${to}\` y \`freeze ${to}\``);
}

async function freeze(version: string | undefined) {
  if (!version) fail("freeze <versión>");
  if (RULESET.version !== version) fail(`RULESET.version es ${RULESET.version}, no ${version}: los reexports de la API actual deben apuntar a versions/${version} antes de congelarla`);
  const manifest = writeManifest(BATTLE_DIR, version);
  console.log(`escrito versions/${version}/manifest.json (${Object.keys(manifest).length} ficheros)`);
  console.log(releaseBlock(version, await contentHash()));
}
```

En `golden()`: sustituir la constante de ruta por `const out = normativePathFor(arg("version"));` y usar `out` en `mkdirSync(dirname(out))`, `writeFileSync(out, …)` y el `console.log`. Si `arg("version")` existe y `RULESET.version !== arg("version")`, `fail(...)` antes de buscar seeds.

```ts
async function main() {
  const cmd = process.argv[2];
  if (cmd === "run") return run();
  if (cmd === "calibrate") return calib();
  if (cmd === "replay") return replay(process.argv[3]);
  if (cmd === "golden") return golden();
  if (cmd === "fork") return fork(process.argv[3], process.argv[4]);
  if (cmd === "freeze") return freeze(process.argv[3]);
  fail("uso: run | calibrate [--seeds N] [--chain N] | replay <fichero> | golden [--version rN.M] [--chain N] | fork <desde> <hasta> | freeze <versión>");
}
```

Actualizar el comentario de cabecera del fichero con los subcomandos nuevos.

- [ ] **Step 5: Umbral de pureza por versión** (`src/lib/pet/battle/purity.test.ts`)

Sustituir la línea `expect(files.length).toBeGreaterThanOrEqual(13);` por:

```ts
    // Nivel superior (API actual + calibración) y cada versión conservada por separado:
    // si desapareciera un árbol de versions/ el recuento global no lo notaría (#1093).
    expect(files.filter((f) => !f.includes("versions")).length).toBeGreaterThanOrEqual(13);
    for (const version of readdirSync(join(dir, "versions"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      expect(files.filter((f) => f.replaceAll("\\", "/").startsWith(`versions/${version}/`)).length, version).toBeGreaterThanOrEqual(9);
    }
```

- [ ] **Step 6: `package.json` y docs**

En `package.json`, `test:pet:battle`: añadir `scripts/pet-battle/freeze.test.ts` a la lista del `node --test`.

`src/lib/pet/battle/versions/README.md`: sustituir los cuatro pasos numerados por el ritual con herramienta:

```markdown
Para cambiar comportamiento o balance (con herramienta desde R4a, #1093):

1. `npm run pet:battle -- fork <vieja> <nueva>`: copia el código ejecutable a `versions/<nueva>/`.
2. Editar `versions/<nueva>/` (nunca la vieja). Subir `RULESET.version`. Apuntar los reexports
   de `src/lib/pet/battle/*.ts` a `./versions/<nueva>/`.
3. `npm run pet:battle -- golden --version <nueva> [--chain N]`: ejemplo normativo de esa versión.
4. `npm run pet:battle -- freeze <nueva>`: escribe `manifest.json` y muestra el bloque para
   `BATTLE_RELEASES` (`replay.ts`, append-only). Añadir su test `rN-normative.test.ts`.
5. Verificar los ejemplos de TODAS las versiones y `releases.test.ts`. No regenerar fixtures
   ni manifiestos antiguos. Los ficheros de `src/lib/pet/battle/*.ts` son reexports: editarlos
   no cambia nada; el código vive en `versions/`.
```

`docs/testing/pet-battle.md`: añadir en la primera línea tras el título la cabecera `> **[Canónico · verificado 2026-09-07 · CLI: run, calibrate, replay, golden, fork, freeze]**` y una frase sobre `fork`/`freeze`.

- [ ] **Step 7: Verificar**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run test:pet:battle`
Expected: todo verde, incluidos los cuatro tests de `freeze.test.ts`. `npm run pet:battle -- freeze r3.1` debe fallar con «ya está publicada».

- [ ] **Step 8: Commit**

```bash
git add scripts/pet-battle package.json src/lib/pet/battle/purity.test.ts src/lib/pet/battle/versions/README.md docs/testing/pet-battle.md
git commit -m "chore(pet): herramienta fork/freeze para publicar versiones de combate (#1093)"
```

---

### Task 2: Los cuatro tests del orden del tick sobre r3.1 (#1087)

**Files:**
- Create: `src/lib/pet/battle/tick-order.test.ts`

Se escriben contra la API actual (`./engine`, hoy r3.1) y deben seguir verdes cuando la API pase a r4.1 (Task 3): r4.1 con un solo tramo se comporta igual. **No** tocar `content.ts` ni ningún fixture; los casos se montan con `{ ...RULESET, … }` y enemigos locales al test.

- [ ] **Step 1: Escribir los tests**

```ts
import { describe, expect, it } from "vitest";
import { BROTE, RULESET } from "./content";
import { simulate } from "./engine";
import { enemyStats } from "./power";
import { runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import type { BattleInit, BattleInput, EnemyDef, Ruleset } from "./types";

// #1087: las cuatro ramas del orden del tick (C5) que engine.test.ts no fijaba.
const snapshot = snapshotForProfile("lectora_larga", "wizard");
const skill = (tick: number, seq = 0): BattleInput => ({ seq, tick, action: "skill", payload: {} });
// La forma de BattleInit cambia en r4.1 (enemies[]); este helper es el único sitio que lo sabe.
const init = (seed: string, enemy: EnemyDef = BROTE, ruleset: Ruleset = RULESET): BattleInit => ({ seed, snapshot, enemy, ruleset });

function firstGuardTick(ctx: BattleInit): number {
  const ev = simulate(ctx, []).events.find((e) => e.type === "TELEGRAPH_STARTED" && e.kind === "guard");
  if (!ev) throw new Error("sin guardia en este seed");
  return ev.tick;
}

describe("orden del tick (#1087)", () => {
  it("1. KO por castigo a mitad del bucle de inputs: acaba ahí, sin básica posterior, causa skill_wasted_on_guard", () => {
    // Enemigo local: siempre guardia y castigo del 100 % de la vida → un solo golpe en guardia mata.
    const lethal: EnemyDef = { ...BROTE, id: "brote", chargeBp: 0, punishPct: 100 };
    const ctx = init(seedFromIndex(0), lethal);
    const t = firstGuardTick(ctx) + 1;
    const { events, result } = simulate(ctx, [skill(t)]);
    const ended = events.find((e) => e.type === "BATTLE_ENDED");
    expect(ended).toMatchObject({ tick: t, outcome: "lose", reason: "ko" });
    expect(events.filter((e) => e.tick === t).map((e) => e.type)).not.toContain("PET_BASIC");
    expect(result.causes).toContain("skill_wasted_on_guard");
    expect(result.ticks).toBe(t);
  });

  it("2. maxTicks igual al tick de un KO: gana el KO, no el límite", () => {
    const seed = Array.from({ length: 50 }, (_, i) => seedFromIndex(i)).find((s) => simulate(init(s), []).result.reason === "ko");
    expect(seed).toBeDefined();
    const K = simulate(init(seed!), []).result.ticks;
    const { result } = simulate(init(seed!, BROTE, { ...RULESET, maxTicks: K }), []);
    expect(result).toMatchObject({ reason: "ko", ticks: K });
  });

  it("3. aturdimiento que expira en el tick del input: el input ve reposo y pega como hit", () => {
    // Cooldown corto para poder pulsar dos veces dentro del aturdimiento; seed cuya primera carga se interrumpe.
    const ruleset: Ruleset = { ...RULESET, pet: { ...RULESET.pet, skillCooldown: 5 } };
    for (let i = 0; i < 100; i++) {
      const ctx = init(seedFromIndex(i), BROTE, ruleset);
      const windup = simulate(ctx, []).events.find((e) => e.type === "TELEGRAPH_STARTED" && e.kind === "charge");
      if (!windup) continue;
      const t = windup.tick + 1;
      const until = t + BROTE.staggerTicks;
      const probe = simulate(ctx, [skill(t)]);
      if (probe.result.ticks < until) continue; // el combate no llega al fin del aturdimiento
      const { events } = simulate(ctx, [skill(t), skill(until, 1)]);
      const atUntil = events.filter((e) => e.tick === until).map((e) => e.type);
      expect(atUntil.indexOf("STATUS_EXPIRED")).toBeLessThan(atUntil.indexOf("SKILL_USED"));
      expect(events.find((e) => e.tick === until && e.type === "SKILL_USED")).toMatchObject({ effect: "hit" });
      return;
    }
    throw new Error("ningún seed en 100 sirve para el caso");
  });

  it("4. causesFor se queda con dos: las de daño por orden y time_limit se cae", () => {
    const es = enemyStats(BROTE, snapshot);
    const guardOnly = (v: { tick: number; skillReadyAt: number; enemyPhase: string }) => v.tick >= v.skillReadyAt && v.enemyPhase === "guard";
    for (let i = 0; i < 300; i++) {
      const ctx = init(seedFromIndex(i), BROTE, { ...RULESET, maxTicks: 250 });
      const { events, result } = runPolicy(ctx, guardOnly);
      const landed = events.filter((e) => e.type === "TELEGRAPH_RESOLVED" && e.kind === "charge" && e.damage > 0).length;
      const wasted = events.filter((e) => e.type === "SKILL_USED" && e.effect === "wasted").length;
      if (result.reason !== "limit" || result.outcome !== "lose" || landed === 0 || wasted === 0) continue;
      const expected = [["charges_landed", landed * es.charge], ["skill_wasted_on_guard", wasted * es.punish]]
        .sort((a, b) => (b[1] as number) - (a[1] as number)).map(([c]) => c);
      expect(result.causes).toEqual(expected);
      expect(result.causes).not.toContain("time_limit");
      return;
    }
    throw new Error("ningún seed en 300 pierde por límite con carga aterrizada y habilidad desperdiciada");
  });
});
```

Nota para quien ejecuta: el helper `init` construye `{ enemy }` porque hoy `BattleInit` tiene `enemy`; en la Task 3 se reescribe a `enemies: [enemy]` (un cambio de una línea, indicado allí).

- [ ] **Step 2: Ejecutar**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet/battle/tick-order.test.ts`
Expected: los cuatro PASS (son cobertura de comportamiento existente). Si el 3 o el 4 no encuentran seed, ampliar el bucle, no tocar el motor.

- [ ] **Step 3: Confirmar que el fixture normativo no se ha movido**

Run: `git status --short src/lib/pet/battle/__fixtures__ src/lib/pet/battle/versions`
Expected: sin cambios.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pet/battle/tick-order.test.ts
git commit -m "test(pet): fija las cuatro ramas del orden del tick del motor (#1087)"
```

---
### Task 3: Fork r4.1 y motor de cadena

**Files:**
- Create: `src/lib/pet/battle/versions/r4.1/` (vía `fork r3.1 r4.1`) y dentro `adventure.ts`
- Modify: `src/lib/pet/battle/versions/r4.1/{types,content,engine,inputs}.ts`
- Modify: reexports `src/lib/pet/battle/{engine,inputs,types,content,record,ulti,canonical,hash,prng}.ts` → `./versions/r4.1/...`; Create: `src/lib/pet/battle/adventure.ts` (reexport)
- Modify: todos los constructores de `BattleInit` (`enemy: X` → `enemies: [X]`): `src/lib/pet/battle/{engine,ulti,inputs,record,policies,calibration}.test.ts`, `tick-order.test.ts`, `calibration.ts`, `scripts/pet-battle/simulate.ts`, `src/components/pet/training/training-session.ts`, `e2e/mascota-entrenamiento.spec.ts` (grep `enemy: ` en `src`, `scripts`, `e2e`).
- Create: `src/lib/pet/battle/chain.test.ts`

**Interfaces:**
- Produces (r4.1): `BattleInit { seed; snapshot; enemies: EnemyDef[]; ruleset }`; `Ruleset.adventure: { chainLength: number }`; `BattleView.fight`, `BattleView.fights`; `BattleResult.fight`; eventos `FIGHT_ENDED { fight, petHp }` y `FIGHT_STARTED { fight, enemyId, petHp, enemyHp }`; `validateInputs(raw, ruleset, fights = 1)`; `pickEnemies(seed, count, pool): EnemyDef[]`; `enemyList(enemies): string` (ids separados por coma); `parseEnemyList(list, pool): EnemyDef[] | null`.
- Consumes: Task 1 (`fork`).

- [ ] **Step 1: Fork**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run pet:battle -- fork r3.1 r4.1`
Expected: copia `canonical.ts content.ts engine.ts hash.ts inputs.ts power.ts prng.ts record.ts snapshot.ts types.ts ulti.ts` a `versions/r4.1/`.

- [ ] **Step 2: `versions/r4.1/types.ts`**

Cambios exactos sobre la copia:

```ts
export interface Ruleset {
  version: string;
  tickMs: number;
  maxTicks: number;
  maxInputs: number;
  ulti: { readyAt: number; baseMul: number; powerMul: number; shieldPct: number };
  pet: { basicInterval: number; skillCooldown: number; skillIdleMul: number; skillInterruptMul: number; guardBasicDiv: number };
  /** R4a: tramos por aventura. El entrenamiento pasa un solo enemigo. */
  adventure: { chainLength: number };
}
```

En `BattleEvent`, antes de `BATTLE_ENDED`:

```ts
  | (Ev<"FIGHT_ENDED"> & { fight: number; petHp: number })
  | (Ev<"FIGHT_STARTED"> & { fight: number; enemyId: string; petHp: number; enemyHp: number })
```

`BattleResult`: añadir `/** Tramo en que terminó (1 en entrenamiento). */ fight: number;`.
`BattleState`: añadir `fight: number; fights: number; fightStart: number;`.
`BattleView`: añadir `fight: number; fights: number;`.
`BattleInit`: sustituir `enemy: EnemyDef;` por `/** Un enemigo por tramo; el entrenamiento pasa uno. */ enemies: EnemyDef[];`.

- [ ] **Step 3: `versions/r4.1/content.ts`**

`version: "r4.1"` y, tras `pet: {...}`, `adventure: { chainLength: 3 },`. Añadir `Object.freeze(RULESET.adventure);` junto a los demás freeze. Ningún otro número cambia.

- [ ] **Step 4: `versions/r4.1/adventure.ts`** (nuevo; solo imports `./`)

```ts
// Cadena de una aventura (spec R4a §3): los enemigos de cada tramo salen de un
// sub-flujo propio del seed, no del PRNG del combate. Uniforme, con repetición.
import { nextInt, subStream } from "./prng";
import type { EnemyDef } from "./types";

export function pickEnemies(seed: string, count: number, pool: Record<string, EnemyDef>): EnemyDef[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("BAD_CHAIN");
  const ids = Object.keys(pool).sort();
  if (ids.length === 0) throw new Error("NO_ENEMIES");
  const rng = subStream(seed, "r4.1:adventure", 0);
  const out: EnemyDef[] = [];
  for (let i = 0; i < count; i++) out.push(pool[ids[nextInt(rng, 0, ids.length - 1)]]);
  return out;
}

/** Lo que se guarda en pet_battles.enemy_id: ids separados por coma, en orden de tramo. */
export function enemyList(enemies: readonly EnemyDef[]): string {
  return enemies.map((e) => e.id).join(",");
}

export function parseEnemyList(list: string, pool: Record<string, EnemyDef>): EnemyDef[] | null {
  const out: EnemyDef[] = [];
  for (const id of list.split(",")) {
    if (!Object.hasOwn(pool, id)) return null;
    out.push(pool[id]);
  }
  return out;
}
```

- [ ] **Step 5: `versions/r4.1/engine.ts`** — fichero completo

```ts
// Motor de combate (Parte I §16.1–16.2; contratos C5–C8). Puro: sin Math.random,
// sin Date, sin red. r4.1: una cadena de tramos es un solo combate (spec R4a §3).
import { scoreUlti } from "./ulti";
import { validateInputs } from "./inputs";
import { nextBp, nextInt, seedFromHex } from "./prng";
import { enemyStats } from "./power";
import type {
  BattleCause, BattleEvent, BattleInit, BattleInput, BattleOutcome, BattleResult, BattleState, BattleView, EndReason, EnemyDef,
} from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventBody = DistributiveOmit<BattleEvent, "seq" | "tick">;

function enemyOf(ctx: BattleInit, fight: number): EnemyDef {
  const e = ctx.enemies[fight - 1];
  if (!e) throw new Error("NO_ENEMY");
  return e;
}

/** Estado inicial. Consume la PRIMERA tirada del PRNG (duración del reposo inicial). */
export function createBattle(ctx: BattleInit): BattleState {
  if (!Array.isArray(ctx.enemies) || ctx.enemies.length < 1 || ctx.enemies.length > ctx.ruleset.adventure.chainLength) throw new Error("BAD_CHAIN");
  const rng = seedFromHex(ctx.seed);
  const E = enemyOf(ctx, 1);
  const es = enemyStats(E, ctx.snapshot);
  const idle = nextInt(rng, E.idleMin, E.idleMax);
  return {
    tick: 0, nextSeq: 0, ended: false, rng,
    fight: 1, fights: ctx.enemies.length, fightStart: 0,
    pet: {
      hp: ctx.snapshot.hpMax, hpMax: ctx.snapshot.hpMax, atk: ctx.snapshot.atk,
      nextBasic: ctx.ruleset.pet.basicInterval, skillReadyAt: 0, skillUses: 0,
      ultiReadyAt: ctx.ruleset.ulti.readyAt, ultiUsed: false, shield: 0,
    },
    enemy: { hp: es.hpMax, hpMax: es.hpMax, phase: "idle", phaseUntil: idle, nextBasic: E.basicInterval },
    tally: { chargesLanded: 0, chargesInterrupted: 0, skillWasted: 0, damageDealt: 0, damageTaken: 0 },
    result: null,
  };
}

export function viewOf(st: BattleState): BattleView {
  return {
    tick: st.tick, petHp: st.pet.hp, petHpMax: st.pet.hpMax, enemyHp: st.enemy.hp, enemyHpMax: st.enemy.hpMax,
    enemyPhase: st.enemy.phase, enemyPhaseUntil: st.enemy.phaseUntil, skillReadyAt: st.pet.skillReadyAt,
    ultiReadyAt: st.pet.ultiReadyAt, ultiUsed: st.pet.ultiUsed, shield: st.pet.shield, ended: st.ended,
    fight: st.fight, fights: st.fights,
  };
}

/** Un tick. Orden (C5): 0 arranque/tramo · 1 transiciones · 2 inputs · 3 básica mascota ·
 *  4 básica enemigo · 5 límite del tramo. Un KO corta el tick en el acto; un KO del enemigo
 *  a mitad de cadena también, y el tick siguiente arranca el tramo siguiente. */
export function stepBattle(ctx: BattleInit, st: BattleState, inputs: readonly BattleInput[]): BattleEvent[] {
  if (st.ended) throw new Error("BATTLE_ENDED");
  if (!validateInputs(inputs.map((input, seq) => ({ ...input, seq })), ctx.ruleset, st.fights).ok) throw new Error("INVALID_INPUTS");
  const T = st.tick;
  const R = ctx.ruleset;
  const E = enemyOf(ctx, st.fight);
  const es = enemyStats(E, ctx.snapshot);
  const out: BattleEvent[] = [];

  const emit = (body: EventBody) => { out.push({ seq: st.nextSeq++, tick: T, ...body } as BattleEvent); };
  const hurtPet = (dmg: number) => {
    const absorbed = Math.min(dmg, st.pet.shield);
    st.pet.shield -= absorbed;
    const d = Math.min(dmg - absorbed, st.pet.hp);
    st.pet.hp -= d; st.tally.damageTaken += d;
    return d;
  };
  const hurtEnemy = (dmg: number) => {
    const d = Math.min(dmg * (st.enemy.phase === "vulnerable" ? 2 : 1), st.enemy.hp);
    st.enemy.hp -= d; st.tally.damageDealt += d;
    return d;
  };
  const finish = (reason: EndReason, outcome: BattleOutcome) => {
    st.ended = true;
    st.result = {
      outcome, reason, ticks: T, petHp: st.pet.hp, petHpMax: st.pet.hpMax, enemyHp: st.enemy.hp, enemyHpMax: st.enemy.hpMax,
      damageDealt: st.tally.damageDealt, damageTaken: st.tally.damageTaken, causes: causesFor(st, outcome, reason, es), fight: st.fight,
    };
    emit({ type: "BATTLE_ENDED", outcome, reason, petHp: st.pet.hp, enemyHp: st.enemy.hp });
  };
  /** Frontera de tramo (§3): la vida se arrastra; habilidad, ulti y barrera vuelven a cero
   *  relativos al tick siguiente; el enemigo nuevo se instancia desde el PRNG, sin reseed. */
  const nextFight = () => {
    const start = T + 1;
    st.fight++; st.fightStart = start;
    const N = enemyOf(ctx, st.fight);
    const ns = enemyStats(N, ctx.snapshot);
    st.pet.nextBasic = start + R.pet.basicInterval; st.pet.skillReadyAt = start;
    st.pet.ultiReadyAt = start + R.ulti.readyAt; st.pet.ultiUsed = false; st.pet.shield = 0;
    st.enemy = { hp: ns.hpMax, hpMax: ns.hpMax, phase: "idle", phaseUntil: start + nextInt(st.rng, N.idleMin, N.idleMax), nextBasic: start + N.basicInterval };
    st.tick = start;
  };
  const koCheck = (): boolean => {
    if (st.pet.hp === 0) { finish("ko", "lose"); return true; }
    if (st.enemy.hp === 0) {
      if (st.fight === st.fights) { finish("ko", "win"); return true; }
      emit({ type: "FIGHT_ENDED", fight: st.fight, petHp: st.pet.hp });
      nextFight();
      return true;
    }
    return false;
  };
  const toIdle = () => {
    st.enemy.phase = "idle";
    st.enemy.phaseUntil = T + nextInt(st.rng, E.idleMin, E.idleMax);
    st.enemy.nextBasic = T + E.basicInterval;
  };

  // 0. Arranque del combate o del tramo
  if (T === 0) emit({ type: "BATTLE_STARTED", petHp: st.pet.hp, enemyHp: st.enemy.hp });
  else if (T === st.fightStart) emit({ type: "FIGHT_STARTED", fight: st.fight, enemyId: E.id, petHp: st.pet.hp, enemyHp: st.enemy.hp });

  // 1. Transiciones del enemigo
  if (st.enemy.phaseUntil === T) {
    switch (st.enemy.phase) {
      case "windup": {
        const d = hurtPet(es.charge);
        st.tally.chargesLanded++;
        emit({ type: "TELEGRAPH_RESOLVED", kind: "charge", damage: d, petHp: st.pet.hp, shield: st.pet.shield });
        if (koCheck()) return out;
        toIdle();
        break;
      }
      case "guard":
        emit({ type: "TELEGRAPH_RESOLVED", kind: "guard", damage: 0, petHp: st.pet.hp, shield: st.pet.shield });
        if (E.vulnerableTicks) { st.enemy.phase = "vulnerable"; st.enemy.phaseUntil = T + E.vulnerableTicks; emit({ type: "STATUS_APPLIED", status: "vulnerable", until: st.enemy.phaseUntil }); }
        else toIdle();
        break;
      case "vulnerable":
        emit({ type: "STATUS_EXPIRED", status: "vulnerable" }); toIdle(); break;
      case "stagger":
        emit({ type: "STATUS_EXPIRED", status: "stagger" }); toIdle(); break;
      case "idle": {
        const charge = nextBp(st.rng) < E.chargeBp;
        st.enemy.phase = charge ? "windup" : "guard";
        st.enemy.phaseUntil = T + (charge ? E.windupTicks : E.guardTicks);
        emit({ type: "TELEGRAPH_STARTED", kind: charge ? "charge" : "guard", resolvesAt: st.enemy.phaseUntil });
        break;
      }
    }
  }

  // 2. Inputs de este tick (#1086: una rama por acción; lo desconocido lanza)
  for (let k = 0; k < inputs.length; k++) {
    if (inputs[k].tick !== T) throw new Error("INPUT_TICK");
    switch (inputs[k].action) {
      case "ulti": {
        if (T < st.pet.ultiReadyAt || st.pet.ultiUsed) throw new Error("INVALID_INPUTS");
        const score = scoreUlti(ctx.seed, T, inputs[k].payload.order as string);
        st.pet.ultiUsed = true;
        const bonus = score.recipe === "power" ? Math.floor(st.pet.atk * R.ulti.powerMul * score.matches / 4) : 0;
        const shield = score.recipe === "guard" ? Math.floor(st.pet.hpMax * R.ulti.shieldPct * score.matches / 400) : 0;
        st.pet.shield += shield;
        const damage = hurtEnemy(st.pet.atk * R.ulti.baseMul + bonus);
        emit({ type: "ULTI_USED", ...score, damage, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        break;
      }
      case "skill": {
        if (T < st.pet.skillReadyAt) { emit({ type: "SKILL_IGNORED", reason: "cooldown" }); continue; }
        st.pet.skillReadyAt = T + R.pet.skillCooldown;
        st.pet.skillUses++;
        if (st.enemy.phase === "windup") {
          const d = hurtEnemy(st.pet.atk * R.pet.skillInterruptMul);
          st.tally.chargesInterrupted++;
          st.enemy.phase = "stagger"; st.enemy.phaseUntil = T + E.staggerTicks;
          emit({ type: "SKILL_USED", effect: "interrupt", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
          emit({ type: "STATUS_APPLIED", status: "stagger", until: st.enemy.phaseUntil });
        } else if (st.enemy.phase === "guard") {
          hurtPet(es.punish);
          st.tally.skillWasted++;
          emit({ type: "SKILL_USED", effect: "wasted", damage: 0, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        } else {
          const d = hurtEnemy(st.pet.atk * R.pet.skillIdleMul);
          emit({ type: "SKILL_USED", effect: st.enemy.phase === "vulnerable" ? "vulnerable" : "hit", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp, shield: st.pet.shield });
        }
        break;
      }
      default:
        // validateInputs y el motor se han desincronizado: bug nuestro, no del cliente.
        throw new Error("UNKNOWN_ACTION");
    }
    if (koCheck()) { if (k + 1 < inputs.length) throw new Error("INPUTS_AFTER_END"); return out; }
  }

  // 3. Básica de la mascota
  if (T === st.pet.nextBasic) {
    const guarded = st.enemy.phase === "guard";
    const d = hurtEnemy(guarded ? Math.max(1, Math.floor(st.pet.atk / R.pet.guardBasicDiv)) : st.pet.atk);
    st.pet.nextBasic = T + R.pet.basicInterval;
    emit({ type: "PET_BASIC", damage: d, enemyHp: st.enemy.hp, guarded });
    if (koCheck()) return out;
  }

  // 4. Básica del enemigo, solo en reposo
  if (st.enemy.phase === "idle" && T === st.enemy.nextBasic) {
    const d = hurtPet(es.basic);
    st.enemy.nextBasic = T + E.basicInterval;
    emit({ type: "ENEMY_BASIC", damage: d, petHp: st.pet.hp, shield: st.pet.shield });
    if (koCheck()) return out;
  }

  // 5. Límite del tramo: en cadena es derrota; en entrenamiento, la fracción de vida de r3.1
  if (T === st.fightStart + R.maxTicks) {
    if (st.fights > 1) { finish("limit", "lose"); return out; }
    const pet = BigInt(st.pet.hp) * BigInt(st.enemy.hpMax);
    const enemy = BigInt(st.enemy.hp) * BigInt(st.pet.hpMax);
    finish("limit", pet > enemy ? "win" : pet < enemy ? "lose" : "draw");
    return out;
  }

  st.tick = T + 1;
  return out;
}

function causesFor(st: BattleState, outcome: BattleOutcome, reason: EndReason, es: { charge: number; punish: number }): BattleCause[] {
  const t = st.tally;
  if (outcome === "win") return [t.chargesInterrupted > 0 ? "charges_interrupted" : "steady_damage"];
  const causes: BattleCause[] = [];
  if (st.pet.skillUses === 0 && t.chargesLanded > 0) causes.push("skill_unused");
  const byDamage: Array<[BattleCause, number]> = [["charges_landed", t.chargesLanded * es.charge], ["skill_wasted_on_guard", t.skillWasted * es.punish]];
  byDamage.sort((a, b) => b[1] - a[1]);
  for (const [cause, dmg] of byDamage) if (dmg > 0) causes.push(cause);
  if (reason === "limit") causes.push("time_limit");
  return causes.slice(0, 2);
}

/** Simulación completa: la del servidor (y la del CLI). `inputs` validados y ordenados por tick. */
export function simulate(ctx: BattleInit, inputs: readonly BattleInput[]): { events: BattleEvent[]; result: BattleResult } {
  if (!validateInputs(inputs, ctx.ruleset, ctx.enemies.length).ok) throw new Error("INVALID_INPUTS");
  const st = createBattle(ctx);
  const events: BattleEvent[] = [];
  let i = 0;
  while (!st.ended) {
    const at: BattleInput[] = [];
    while (i < inputs.length && inputs[i].tick === st.tick) at.push(inputs[i++]);
    events.push(...stepBattle(ctx, st, at));
  }
  if (i < inputs.length) throw new Error("INPUTS_AFTER_END");
  return { events, result: st.result as BattleResult };
}
```

Nota: `nextFight` fija `st.tick = start` porque `koCheck()` devuelve `true` y el llamante hace `return out` sin llegar al `st.tick = T + 1` final.

- [ ] **Step 6: `versions/r4.1/inputs.ts`** (firma con `fights`; se prueba a fondo en la Task 4)

Cuatro cambios exactos sobre la copia de r3.1:

```ts
export type InputsError = "NOT_ARRAY" | "TOO_MANY" | "BAD_SHAPE" | "BAD_SEQ" | "BAD_TICK" | "TICK_ORDER" | "BAD_ACTION" | "BAD_PAYLOAD" | "NONEMPTY_PAYLOAD" | "ULTI_NOT_READY" | "ULTI_ALREADY_USED" | "BAD_CHAIN";

export function validateInputs(raw: unknown, ruleset: Ruleset, fights = 1): { ok: true; inputs: BattleInput[] } | { ok: false; code: InputsError; index?: number } {
  // (1) antes de todo:
  if (!Number.isInteger(fights) || fights < 1 || fights > ruleset.adventure.chainLength) return { ok: false, code: "BAD_CHAIN" };
  if (!Array.isArray(raw)) return { ok: false, code: "NOT_ARRAY" };
  // (2) presupuesto por tramo × tramos:
  if (raw.length > ruleset.maxInputs * fights) return { ok: false, code: "TOO_MANY" };
  // (3) cota global inclusiva del reloj continuo (§3):
  const lastTick = fights * (ruleset.maxTicks + 1) - 1;
  // … en el bucle, BAD_TICK usa `(tick as number) > lastTick` en vez de `> ruleset.maxTicks`
  // (4) en la rama ulti: en cadena la segunda ulti la juzga el motor tramo a tramo (§3 «Validación de inputs»)
  //     if (fights === 1 && ultiUsed) return { ok: false, code: "ULTI_ALREADY_USED", index: i };
}
```

- [ ] **Step 7: Reexports y constructores de `BattleInit`**

Cambiar `./versions/r3.1/` por `./versions/r4.1/` en `src/lib/pet/battle/{engine,inputs,types,content,record,ulti,canonical,hash,prng}.ts`. Crear `src/lib/pet/battle/adventure.ts` con `export * from "./versions/r4.1/adventure";`.

Run: `rg -n "enemy: " src/lib/pet scripts e2e src/components/pet` y en cada constructor de `BattleInit` sustituir `enemy: X` por `enemies: [X]`. En `training-session.ts` de momento solo la rama actual (`enemy: ENEMIES[b.enemyId]` → `enemies: [ENEMIES[b.enemyId]]`); la compatibilidad con filas r3.1 llega en la Task 7. En `tick-order.test.ts`, el helper `init` pasa a `({ seed, snapshot, enemies: [enemy], ruleset })`. En `training-session.ts` la vista legacy r2.2 añade `fight: 1, fights: 1` al objeto que ya añade `ultiReadyAt: Infinity`.

- [ ] **Step 8: Test de cadena `src/lib/pet/battle/chain.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { enemyList, parseEnemyList, pickEnemies } from "./adventure";
import { BROTE, CAPARAZON, ENEMIES, RULESET } from "./content";
import { createBattle, simulate, stepBattle, viewOf } from "./engine";
import { POLICIES, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import type { BattleInit, BattleInput, EnemyDef } from "./types";

const snapshot = snapshotForProfile("lectora_larga", "wizard");
const chain = (seed: string, enemies: EnemyDef[] = [BROTE, BROTE, BROTE], ruleset = RULESET): BattleInit => ({ seed, snapshot, enemies, ruleset });
const skill = (tick: number, seq: number): BattleInput => ({ seq, tick, action: "skill", payload: {} });
const ulti = (tick: number, seq: number): BattleInput => ({ seq, tick, action: "ulti", payload: { order: "" } });

describe("cadena r4.1 (spec R4a §3)", () => {
  it("un solo tramo se comporta como r3.1: ningún evento de tramo y fight 1", () => {
    const { events, result } = runPolicy(chain(seedFromIndex(1), [BROTE]), POLICIES.interrupt);
    expect(events.some((e) => e.type === "FIGHT_ENDED" || e.type === "FIGHT_STARTED")).toBe(false);
    expect(result.fight).toBe(1);
  });

  it("la vida se arrastra y habilidad, ulti y barrera se reinician en la frontera", () => {
    for (let i = 0; i < 100; i++) {
      const ctx = chain(seedFromIndex(i));
      const { inputs, events } = runPolicy(ctx, POLICIES.interrupt);
      const ended = events.find((e) => e.type === "FIGHT_ENDED");
      if (!ended || ended.type !== "FIGHT_ENDED") continue;
      expect(events.find((e) => e.type === "FIGHT_STARTED")).toMatchObject({ fight: 2, tick: ended.tick + 1, petHp: ended.petHp, enemyId: "brote" });
      const st = createBattle(ctx);
      while (st.tick <= ended.tick && !st.ended) stepBattle(ctx, st, inputs.filter((x) => x.tick === st.tick));
      const v = viewOf(st);
      expect(v).toMatchObject({ fight: 2, fights: 3, tick: ended.tick + 1, petHp: ended.petHp, shield: 0, ultiUsed: false, skillReadyAt: ended.tick + 1, ultiReadyAt: ended.tick + 1 + RULESET.ulti.readyAt });
      expect(v.enemyHp).toBe(v.enemyHpMax);
      return;
    }
    throw new Error("ningún seed en 100 supera el primer tramo con la política interrupt");
  });

  it("ganar el último tramo es victoria por KO en el tramo 3; el límite de un tramo en cadena es derrota", () => {
    const win = Array.from({ length: 200 }, (_, i) => runPolicy(chain(seedFromIndex(i)), POLICIES.interrupt).result).find((r) => r.outcome === "win");
    expect(win).toMatchObject({ reason: "ko", fight: 3 });
    const { result } = simulate(chain(seedFromIndex(0), [BROTE, BROTE], { ...RULESET, maxTicks: 10 }), []);
    expect(result).toMatchObject({ outcome: "lose", reason: "limit", fight: 1, ticks: 10 });
    expect(result.causes).toContain("time_limit");
  });

  it("los ticks son continuos: un input más allá del tick 600 de una cadena es válido", () => {
    for (let i = 0; i < 200; i++) {
      const ctx = chain(seedFromIndex(i));
      if (runPolicy(ctx, POLICIES.interrupt).result.ticks <= 700) continue;
      expect(() => simulate(ctx, [skill(700, 0)])).not.toThrow();
      return;
    }
    throw new Error("ninguna cadena dura más de 700 ticks");
  });

  it("una ulti por tramo: dos en el mismo tramo lanzan; una por tramo tras su recarga vale", () => {
    const t1 = RULESET.ulti.readyAt;
    for (let i = 0; i < 200; i++) {
      const ctx = chain(seedFromIndex(i));
      expect(() => simulate(ctx, [ulti(t1, 0), ulti(t1 + 1, 1)])).toThrow("INVALID_INPUTS");
      const probe = simulate(ctx, [ulti(t1, 0)]);
      const second = probe.events.find((e) => e.type === "FIGHT_STARTED");
      if (!second) continue;
      const both = simulate(ctx, [ulti(t1, 0), ulti(second.tick + RULESET.ulti.readyAt, 1)]);
      expect(both.events.filter((e) => e.type === "ULTI_USED")).toHaveLength(2);
      return;
    }
    throw new Error("ningún seed llega al tramo 2 con una ulti saltada en el tick 120");
  });

  it("pickEnemies es determinista y uniforme sobre el catálogo; parseEnemyList rechaza lo heredado", () => {
    expect(pickEnemies(seedFromIndex(3), 3, ENEMIES)).toEqual(pickEnemies(seedFromIndex(3), 3, ENEMIES));
    const ids = new Set(Array.from({ length: 200 }, (_, i) => enemyList(pickEnemies(seedFromIndex(i), 3, ENEMIES))).flatMap((s) => s.split(",")));
    expect([...ids].sort()).toEqual(["brote", "caparazon"]);
    expect(parseEnemyList("brote,caparazon", ENEMIES)).toEqual([BROTE, CAPARAZON]);
    expect(parseEnemyList("brote,__proto__", ENEMIES)).toBeNull();
    expect(() => createBattle(chain(seedFromIndex(0), [BROTE, BROTE, BROTE, BROTE]))).toThrow("BAD_CHAIN");
  });

  it("una acción desconocida que llegue al motor lanza (#1086)", () => {
    const ctx = chain(seedFromIndex(0), [BROTE]);
    const st = createBattle(ctx);
    expect(() => stepBattle(ctx, st, [{ seq: 0, tick: 0, action: "dance" as never, payload: {} }])).toThrow(/INVALID_INPUTS|UNKNOWN_ACTION/);
  });
});
```

- [ ] **Step 9: Ejecutar el motor**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet/battle`
Expected: `chain.test.ts`, `tick-order.test.ts`, `engine.test.ts`, `ulti.test.ts`, `policies.test.ts` verdes. **Fallan a propósito hasta la Task 4:** `content.test.ts` (versión y hash) y `record.test.ts`/`inputs.test.ts` en lo que dependa del hash o del enemigo único. Si `engine.test.ts` falla por `enemy:` residual, es el Step 7 incompleto.

- [ ] **Step 10: Commit**

```bash
git add src/lib/pet/battle scripts/pet-battle/simulate.ts src/components/pet/training/training-session.ts e2e/mascota-entrenamiento.spec.ts
git commit -m "feat(pet): motor r4.1 con cadena de tramos, pickEnemies y switch de acciones (#1086)"
```

---
### Task 4: Validador de cadena, re-simulación y enrutado de versiones

**Files:**
- Modify: `src/lib/pet/battle/versions/r4.1/record.ts`
- Modify: `src/lib/pet/battle/replay.ts`
- Modify: `src/lib/pet/battle/content.test.ts:21-22`
- Modify: `src/lib/pet/battle/inputs.test.ts`, `src/lib/pet/battle/record.test.ts` (añadir casos)
- Modify: `src/lib/pet/training/service.ts:49-55` (pasa `fights` al validador)

**Interfaces:**
- Consumes: Task 3 (`parseEnemyList`, `validateInputs(raw, ruleset, fights)`).
- Produces: `BattleRelease.validateInputs(raw, fights?)`; `resimulate` acepta `enemyId` con lista; `ResimError` añade `BAD_CHAIN`; `BATTLE_RELEASES` con tres entradas (`r2.2`, `r3.1`, `r4.1`).

- [ ] **Step 1: Tests del validador** (añadir a `src/lib/pet/battle/inputs.test.ts`)

```ts
describe("validateInputs con tramos (r4.1)", () => {
  const skillAt = (tick: number, seq: number) => ({ seq, tick, action: "skill", payload: {} });
  const ultiAt = (tick: number, seq: number) => ({ seq, tick, action: "ulti", payload: { order: "" } });
  it("acepta ticks hasta la cota global y rechaza el siguiente", () => {
    const last = 3 * (RULESET.maxTicks + 1) - 1;
    expect(validateInputs([skillAt(last, 0)], RULESET, 3).ok).toBe(true);
    expect(validateInputs([skillAt(last + 1, 0)], RULESET, 3)).toMatchObject({ ok: false, code: "BAD_TICK" });
    expect(validateInputs([skillAt(RULESET.maxTicks + 1, 0)], RULESET, 1)).toMatchObject({ ok: false, code: "BAD_TICK" });
  });
  it("presupuesto de inputs por tramo × tramos", () => {
    const many = Array.from({ length: RULESET.maxInputs * 3 }, (_, i) => skillAt(i, i));
    expect(validateInputs(many, RULESET, 3).ok).toBe(true);
    expect(validateInputs([...many, skillAt(many.length, many.length)], RULESET, 3)).toMatchObject({ ok: false, code: "TOO_MANY" });
  });
  it("una segunda ulti no se rechaza aquí en cadena (la juzga el motor), pero sí en un solo tramo", () => {
    const two = [ultiAt(RULESET.ulti.readyAt, 0), ultiAt(RULESET.ulti.readyAt + 700, 1)];
    expect(validateInputs(two, RULESET, 3).ok).toBe(true);
    expect(validateInputs(two, RULESET, 1)).toMatchObject({ ok: false, code: "BAD_TICK" });
    expect(validateInputs([ultiAt(RULESET.ulti.readyAt, 0), ultiAt(RULESET.ulti.readyAt + 1, 1)], RULESET, 1)).toMatchObject({ ok: false, code: "ULTI_ALREADY_USED" });
    expect(validateInputs([ultiAt(RULESET.ulti.readyAt - 1, 0)], RULESET, 3)).toMatchObject({ ok: false, code: "ULTI_NOT_READY" });
  });
  it("tramos fuera de rango", () => {
    expect(validateInputs([], RULESET, 0)).toMatchObject({ ok: false, code: "BAD_CHAIN" });
    expect(validateInputs([], RULESET, RULESET.adventure.chainLength + 1)).toMatchObject({ ok: false, code: "BAD_CHAIN" });
    expect(validateInputs([], RULESET, 1.5)).toMatchObject({ ok: false, code: "BAD_CHAIN" });
  });
});
```

- [ ] **Step 2: Tests de `resimulate` con lista de enemigos** (añadir a `record.test.ts`; usa el `snapshot`/`contentHash` que el fichero ya tiene)

```ts
describe("resimulate con cadena (r4.1)", () => {
  it("acepta enemy_id con lista, produce result.fight y rechaza listas malas", async () => {
    const content = { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() };
    const base = { rulesetVersion: RULESET.version, contentHash: content.contentHash, seed: seedFromIndex(2), snapshot, inputs: [] as BattleInput[] };
    const ok = await resimulate({ ...base, enemyId: "brote,caparazon,brote" }, content);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.result.fight).toBeGreaterThanOrEqual(1);
    expect(await resimulate({ ...base, enemyId: "brote,zorro" }, content)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
    expect(await resimulate({ ...base, enemyId: "brote,brote,brote,brote" }, content)).toEqual({ ok: false, code: "BAD_CHAIN" });
    expect(await resimulate({ ...base, enemyId: "" }, content)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
  });
});
```

- [ ] **Step 3: Ejecutar para ver los fallos**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet/battle/inputs.test.ts src/lib/pet/battle/record.test.ts`
Expected: los casos nuevos de `record.test.ts` fallan (`UNKNOWN_ENEMY` con la lista completa); los de inputs pasan si el Step 6 de la Task 3 se hizo bien.

- [ ] **Step 4: `versions/r4.1/record.ts`**

Sustituir el bloque de enemigo y la simulación:

```ts
import { parseEnemyList } from "./adventure";
// ...
export type ResimError = "INVALID_SNAPSHOT" | "UNKNOWN_ENEMY" | "BAD_CHAIN" | "RULESET_MISMATCH" | "CONTENT_MISMATCH" | "INVALID_SEED" | "INVALID_INPUTS" | "INPUTS_AFTER_END" | "RESULT_MISMATCH";
// dentro de resimulate, en lugar de `const enemy = ...; if (!enemy) return UNKNOWN_ENEMY;`:
  const enemies = parseEnemyList(record.enemyId, content.enemies);
  if (!enemies) return { ok: false, code: "UNKNOWN_ENEMY" };
  if (enemies.length > content.ruleset.adventure.chainLength) return { ok: false, code: "BAD_CHAIN" };
// ...
  const validated = validateInputs(record.inputs, content.ruleset, enemies.length);
// ...
    sim = simulate({ seed: record.seed, snapshot: record.snapshot, enemies, ruleset: content.ruleset }, validated.inputs);
```

(`parseEnemyList("")` devuelve `null` porque `""` no es clave del catálogo: por eso el test espera `UNKNOWN_ENEMY`.)

- [ ] **Step 5: `replay.ts` con tres versiones**

```ts
// Append-only release routing. Persisted identity always chooses the executable.
import * as r2 from "./versions/r2.2/content";
import * as r3 from "./versions/r3.1/content";
import * as r4 from "./versions/r4.1/content";
import { resimulate as replayR2, type ResimInput as R2Input } from "./versions/r2.2/record";
import { validateInputs as validateR2 } from "./legacy-inputs";
import { validateInputs as validateR3 } from "./versions/r3.1/inputs";
import { resimulate as replayR3, type ResimInput as R3Input } from "./versions/r3.1/record";
import { isBattleSnapshot as isR3Snapshot } from "./versions/r3.1/snapshot";
import { validateInputs } from "./versions/r4.1/inputs";
import { resimulate, type ResimInput } from "./versions/r4.1/record";
import { isBattleSnapshot as isR4Snapshot } from "./versions/r4.1/snapshot";
import { isBattleSnapshot } from "./snapshot";
import type { Ruleset, EnemyDef } from "./types";

export interface BattleRelease {
  readonly rulesetVersion: string;
  readonly contentHash: string;
  readonly ruleset: Ruleset;
  readonly enemies: Record<string, EnemyDef>;
  readonly isSnapshot: typeof isBattleSnapshot;
  /** `fights` solo lo entiende r4.1; las versiones anteriores lo ignoran (un tramo). */
  readonly validateInputs: (raw: unknown, fights?: number) => ReturnType<typeof validateInputs>;
  readonly replay: (record: ResimInput) => ReturnType<typeof resimulate>;
}
export const BATTLE_RELEASES: readonly BattleRelease[] = Object.freeze([
  Object.freeze({
    rulesetVersion: "r2.2",
    contentHash: "2c40a90c9f141ffd2eda8241c83eb8859a712dbe4606798b56b90fb056b159d3",
    ruleset: r2.RULESET as unknown as Ruleset,
    enemies: r2.ENEMIES,
    isSnapshot: isBattleSnapshot,
    validateInputs(raw: unknown): ReturnType<typeof validateInputs> { return validateR2(raw, r2.RULESET as unknown as Ruleset); },
    async replay(record: ResimInput) {
      if (!isBattleSnapshot(record.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" } as const;
      return replayR2(record as R2Input, { ruleset: r2.RULESET, enemies: r2.ENEMIES, contentHash: await r2.contentHash() });
    },
  }),
  Object.freeze({
    rulesetVersion: "r3.1",
    contentHash: "deebe918beee7f74ff9d9cda720caac9f9182713158085c118971970cce40cb3",
    ruleset: r3.RULESET as unknown as Ruleset,
    enemies: r3.ENEMIES,
    isSnapshot: isR3Snapshot,
    validateInputs: (raw: unknown) => validateR3(raw, r3.RULESET),
    async replay(record: ResimInput) {
      return replayR3(record as R3Input, { ruleset: r3.RULESET, enemies: r3.ENEMIES, contentHash: await r3.contentHash() });
    },
  }),
  Object.freeze({
    rulesetVersion: "r4.1",
    contentHash: "<HASH: salida de `freeze r4.1` en la Task 6; hasta entonces el de content.test.ts>",
    ruleset: r4.RULESET,
    enemies: r4.ENEMIES,
    isSnapshot: isR4Snapshot,
    validateInputs: (raw: unknown, fights = 1) => validateInputs(raw, r4.RULESET, fights),
    async replay(record: ResimInput) {
      return resimulate(record, { ruleset: r4.RULESET, enemies: r4.ENEMIES, contentHash: await r4.contentHash() });
    },
  }),
]);
export function getBattleRelease(version: string, hash: string): BattleRelease | undefined {
  return BATTLE_RELEASES.find((release) => release.rulesetVersion === version && release.contentHash === hash);
}
export async function replayBattle(record: ResimInput, releases: readonly Pick<BattleRelease, "rulesetVersion" | "contentHash" | "replay">[] = BATTLE_RELEASES) {
  const release = releases.find((candidate) => candidate.rulesetVersion === record.rulesetVersion && candidate.contentHash === record.contentHash);
  if (!release) return { ok: false, code: "UNKNOWN_RELEASE" } as const;
  return release.replay(record);
}
```

Si el compilador se queja de que `Ruleset` de r3 no tiene `adventure`, dejar el `as unknown as Ruleset` como está escrito arriba: la versión conservada es dueña de su propio tipo y solo el enrutador la ve a través del tipo actual.

- [ ] **Step 6: Hash de contenido**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet/battle/content.test.ts -u`
Editar `content.test.ts` línea 21: `expect(RULESET.version).toBe("r4.1");` y comprobar que el inline snapshot se actualizó a un hash nuevo (distinto de `deebe9…`). Copiar ese hash al `contentHash` de la entrada `r4.1` de `replay.ts`. La Task 6 lo vuelve a comprobar.

- [ ] **Step 7: El servicio de entrenamiento pasa `fights`**

`src/lib/pet/training/service.ts`, en `resolve`: `const validated = release.validateInputs(rawInputs, battle.enemyId.split(",").length);`. Entrenamiento sigue con un enemigo, pero así el mismo servicio sirve a la Task 10.

- [ ] **Step 8: Verificar todo el motor y los replays históricos**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run test:pet:battle; npx tsc --noEmit`
Expected: verde, incluidos `normative.test.ts` (r2.2), `r3-normative.test.ts`, `releases.test.ts`, `src/lib/pet/training/*.test.ts`. `tsc` limpio (arreglar aquí cualquier consumidor de `BattleInit`/`BattleView` que falte).

- [ ] **Step 9: Commit**

```bash
git add src/lib/pet/battle src/lib/pet/training/service.ts
git commit -m "feat(pet): validador y re-simulación de cadenas; enrutado r2.2/r3.1/r4.1"
```

---

### Task 5: Calibración de cadenas y decisión de la longitud

**Files:**
- Modify: `src/lib/pet/battle/calibration.ts`
- Modify: `src/lib/pet/battle/calibration.test.ts`
- Modify: `scripts/pet-battle/simulate.ts` (`calibrate --chain`, `run --chain`)
- Modify: `src/lib/pet/battle/versions/r4.1/content.ts` (solo si la calibración manda 2 tramos)
- Modify: `docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md` §10 (pegar la tabla)

**Interfaces:**
- Produces: `calibrate({ seeds, chain?, profiles?, classes? })` con `report.chain`; `CALIBRATION.chain = { interruptMin: 0.5, interruptMax: 0.75, neverMax: 0.01 }`; `checkCalibration` aplica los umbrales de cadena cuando `report.chain > 1`.

- [ ] **Step 1: Test** (añadir a `calibration.test.ts`)

```ts
it("una cadena de tres tramos calibra con sus propios umbrales y reporta el tramo", () => {
  const report = calibrate({ seeds: 8, chain: 3, profiles: ["lectora_larga"], classes: ["wizard"] });
  expect(report.chain).toBe(3);
  expect(report.cells).toHaveLength(3);
  for (const c of report.cells) expect(c.fights).toBe(8);
  const failing = { ...report, cells: report.cells.map((c) => c.policy === "never" ? { ...c, wins: c.fights } : c) };
  expect(checkCalibration(failing).ok).toBe(false);
  expect(checkCalibration(failing).failures.join(" ")).toMatch(/never/);
});
```

- [ ] **Step 2: Implementar en `calibration.ts`**

```ts
import { pickEnemies } from "./adventure";
import { BROTE, ENEMIES, RULESET } from "./content";

export const CALIBRATION = {
  seeds: 200,
  win: { interruptMin: 0.85, spamMax: 0.35, neverMax: 0.05 },
  ticks: { interruptMeanMin: 300, interruptMeanMax: 560 },
  /** Cadenas (spec R4a §10): interrumpir gana entre el 50 y el 75 %, no pulsar menos del 1 %. */
  chain: { interruptMin: 0.5, interruptMax: 0.75, neverMax: 0.01 },
} as const;

export interface CalibrationReport { seeds: number; chain: number; cells: CalibrationCell[] }

export function calibrate(opts: { seeds: number; chain?: number; profiles?: readonly ProfileId[]; classes?: readonly PetClass[] }): CalibrationReport {
  const chain = opts.chain ?? 1;
  // ...dentro del bucle de seeds:
  const seed = seedFromIndex(i);
  const enemies = chain === 1 ? [BROTE] : pickEnemies(seed, chain, ENEMIES);
  const { result } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES[policy]);
  // ...
  return { seeds: opts.seeds, chain, cells };
}
```

En `checkCalibration`: si `report.chain > 1`, usar `CALIBRATION.chain` (interrupt fuera de `[interruptMin, interruptMax]` → fallo «interrupt gana X %, fuera de [50 %, 75 %]»; never > neverMax → fallo) y **no** aplicar la ventana de ticks. `formatReport`: primera línea `seeds por celda: N · tramos: C`.

- [ ] **Step 3: CLI**

En `simulate.ts`: `calib()` lee `--chain` (entero 1..RULESET.adventure.chainLength, por defecto 1) y lo pasa; `run()` acepta `--chain N` y usa `pickEnemies(seed, N, ENEMIES)` cuando N > 1 (y `enemyId: enemyList(enemies)` en el record impreso).

- [ ] **Step 4: Ejecutar la calibración y decidir**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22
npm run --silent pet:battle -- calibrate --seeds 200 --chain 2
npm run --silent pet:battle -- calibrate --seeds 200 --chain 3
```

Regla (spec §10): elegir la longitud con la que `interrupt` queda en [50 %, 75 %] agregada por perfil y `never` < 1 %. Si las dos cumplen, **3**. Si solo cumple 2, cambiar `adventure.chainLength` a `2` en `versions/r4.1/content.ts` (el hash cambia: repetir el Step 6 de la Task 4). Si ninguna cumple, **parar**: no tocar números de r3.1; abrir issue `area:play tipo:deuda P2` con la tabla y consultar al usuario.

Pegar la tabla de salida (las dos longitudes) en la spec §10 bajo «Calibración», con la fecha y la longitud elegida.

- [ ] **Step 5: Verificar y commit**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run test:pet:battle`

```bash
git add src/lib/pet/battle/calibration.ts src/lib/pet/battle/calibration.test.ts scripts/pet-battle/simulate.ts src/lib/pet/battle/versions/r4.1/content.ts docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md
git commit -m "feat(pet): calibración de cadenas y longitud de la aventura decidida con datos"
```

---

### Task 6: Publicar r4.1 (`golden`, `freeze`, test normativo)

**Files:**
- Create: `src/lib/pet/battle/versions/r4.1/normative.json`, `manifest.json` (generados)
- Create: `src/lib/pet/battle/r4-normative.test.ts`
- Modify: `src/lib/pet/battle/releases.test.ts:7-10`
- Modify: `src/lib/pet/battle/replay.ts` (hash definitivo)
- Modify: `src/lib/pet/battle/versions/README.md`

- [ ] **Step 1: `golden` con cadena**

En `simulate.ts` `golden()`: leer `--chain` (por defecto 1). Con N > 1, `enemies = pickEnemies(seed, N, ENEMIES)`; el criterio de búsqueda pasa a ser: primer anuncio `charge`, segundo `guard`, `result.outcome === "win"`, `result.reason === "ko"` y `result.fight === N` (enseña la cadena entera). El record lleva `enemyId: enemyList(enemies)`.

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run pet:battle -- golden --version r4.1 --chain 3` (o `--chain 2` si la Task 5 eligió 2)
Expected: `escrito src/lib/pet/battle/versions/r4.1/normative.json: seed … eventos …`.

- [ ] **Step 2: `freeze`**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run pet:battle -- freeze r4.1`
Expected: escribe `manifest.json` e imprime el bloque con el `contentHash`. Comprobar que coincide con el de `replay.ts` y `content.test.ts`; si no, sustituirlo en `replay.ts`.

- [ ] **Step 3: Test normativo y `releases.test.ts`**

`src/lib/pet/battle/r4-normative.test.ts`:

```ts
import { expect, it } from "vitest";
import normative from "./versions/r4.1/normative.json";
import { replayBattle } from "./replay";
import type { ResimInput } from "./record";

it("conserva la cadena normativa de r4.1: eventos de tramo, resultado y digest", async () => {
  const out = await replayBattle(normative.record as ResimInput);
  expect(out.ok).toBe(true);
  if (!out.ok) return;
  expect(out.events).toEqual(normative.events);
  expect(out.result).toEqual(normative.record.result);
  expect(out.digest).toBe(normative.digest);
  expect(normative.record.enemyId.split(",").length).toBe(normative.record.result.fight);
  expect(out.events.filter((e) => e.type === "FIGHT_STARTED")).toHaveLength(normative.record.result.fight - 1);
});
```

`releases.test.ts`: importar `manifestR4 from "./versions/r4.1/manifest.json"` y añadir `["r4.1", manifestR4]` al `describe.each`.

- [ ] **Step 4: README de versiones**

Añadir al final de `versions/README.md`:

```markdown
`r4.1` (R4a) convierte la cadena de una aventura en un solo combate: `BattleInit.enemies[]`,
`enemy_id` con ids separados por coma, reloj continuo con `maxTicks` por tramo, eventos
`FIGHT_ENDED`/`FIGHT_STARTED`, ulti una vez por tramo (la juzga el motor, no el validador),
límite de tramo en cadena = derrota. Con un solo enemigo se comporta como r3.1 y conserva sus
números. Publicada con `fork`/`golden --version`/`freeze` (#1093).
```

- [ ] **Step 5: Verificar**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npm run test:pet:battle; npx tsc --noEmit; npm run lint`
Expected: verde. `releases.test.ts` valida los tres manifiestos; `purity.test.ts` cuenta por versión.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pet/battle scripts/pet-battle/simulate.ts
git commit -m "feat(pet): publica la versión r4.1 del motor (fixture normativo y manifiesto)"
```

---
### Task 7: Sesión de cliente: compatibilidad r3.1, tramos, interludio y log local

**Files:**
- Modify: `src/components/pet/training/training-session.ts`
- Modify: `src/components/pet/training/training-session.test.ts`
- Modify: `src/lib/pet/training/types.ts` (campo opcional `adventure`)

**Interfaces:**
- Produces: `TrainingSession` con `awaitingContinue: boolean`, `continueFight()`, `view.fight/fights`; constructor `new TrainingSession(actions, newId, options?)` con `options.storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">` y `options.storagePrefix?: string` (por defecto `"pet-adventure:"`). `Actions.start(intent: string, enemyId?: string)` sin cambios de firma; en aventuras el adaptador ignora `intent` y la sesión adopta `battle.intentId`.
- Produces: `TrainingBattle.adventure?: { day: string; attempt: number; reward: { itemId: string; slot: "weapon" | "amulet" } | null }`.
- Consumes: Task 3 (vista con `fight/fights`, eventos de tramo).

- [ ] **Step 1: Tests** (añadir a `training-session.test.ts`; mirar cómo construye hoy el `actions` falso y reutilizar su patrón)

```ts
import { ENEMIES, RULESET } from "@/lib/pet/battle/content";
import { pickEnemies, enemyList } from "@/lib/pet/battle/adventure";
import { POLICIES, runPolicy } from "@/lib/pet/battle/policies";
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import { contentHash as r3Hash } from "@/lib/pet/battle/versions/r3.1/content";

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), map: m };
}
const snapshot = snapshotForProfile("lectora_larga", "wizard");

it("simula una fila r3.1 con el motor r3.1 (un tramo) y expone fight 1/1", async () => {
  const battle = { intentId: "i1", status: "open", seed: seedFromIndex(1), snapshot, rulesetVersion: "r3.1", contentHash: await r3Hash(), enemyId: "caparazon", inputs: [], result: null, digest: null };
  const s = new TrainingSession({ start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: false, code: "x" }), replay: async () => ({ ok: false, code: "x" }) }, () => "i1");
  await s.start();
  expect(s.phase).toBe("playing");
  expect(s.view).toMatchObject({ fight: 1, fights: 1, tick: 0 });
});

it("cadena r4.1: al acabar un tramo espera «Continuar», y el log local reanuda en pausa donde estaba", async () => {
  // seed que supera el primer tramo con la política interrupt
  let found: { seed: string; inputs: ReturnType<typeof runPolicy>["inputs"]; endedTick: number } | null = null;
  for (let i = 0; i < 100 && !found; i++) {
    const seed = seedFromIndex(i);
    const enemies = pickEnemies(seed, 3, ENEMIES);
    const { inputs, events } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
    const ended = events.find((e) => e.type === "FIGHT_ENDED");
    if (ended) found = { seed, inputs, endedTick: ended.tick };
  }
  expect(found).not.toBeNull();
  const { seed, inputs, endedTick } = found!;
  const battle = { intentId: "adv-1", status: "open", seed, snapshot, rulesetVersion: RULESET.version, contentHash: "irrelevante-en-cliente", enemyId: enemyList(pickEnemies(seed, 3, ENEMIES)), inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const storage = memoryStorage();
  const actions = { start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: false, code: "x" }), replay: async () => ({ ok: false, code: "x" }) };
  const s = new TrainingSession(actions, () => "ignored", { storage });
  await s.start();
  // reproducir la política tick a tick hasta la frontera
  while (s.view!.tick <= endedTick && !s.awaitingContinue) {
    if (inputs.some((x) => x.tick === s.view!.tick)) s.skill();
    s.tick();
  }
  expect(s.awaitingContinue).toBe(true);
  expect(s.view).toMatchObject({ fight: 2, fights: 3, tick: endedTick + 1 });
  const before = s.view!.tick;
  s.tick(); s.tick();
  expect(s.view!.tick).toBe(before); // el interludio detiene el reloj
  expect(JSON.parse(storage.map.get("pet-adventure:adv-1")!)).toMatchObject({ tick: endedTick + 1 });
  // Nueva sesión con el mismo almacenamiento: reanuda en pausa, en el mismo tick y esperando Continuar
  const s2 = new TrainingSession(actions, () => "ignored", { storage });
  await s2.start();
  expect(s2.paused).toBe(true);
  expect(s2.awaitingContinue).toBe(true);
  expect(s2.view).toMatchObject({ fight: 2, tick: endedTick + 1 });
  expect(s2.inputs).toEqual(s.inputs);
  s2.continueFight(); s2.togglePause(); s2.tick();
  expect(s2.view!.tick).toBe(endedTick + 2);
  expect(s2.events.some((e) => e.type === "FIGHT_STARTED")).toBe(true);
});

it("sin log local, un intento abierto empieza en el tick 0 con el mismo seed", async () => {
  const battle = { intentId: "adv-2", status: "open", seed: seedFromIndex(5), snapshot, rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote,brote", inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const s = new TrainingSession({ start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: false, code: "x" }), replay: async () => ({ ok: false, code: "x" }) }, () => "z", { storage: memoryStorage() });
  await s.start();
  expect(s.view).toMatchObject({ tick: 0, fight: 1, fights: 3 });
  expect(s.paused).toBe(false);
});

it("al resolver, borra la entrada local", async () => {
  const storage = memoryStorage();
  const battle = { intentId: "adv-3", status: "open", seed: seedFromIndex(7), snapshot, rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote", inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const resolved = { ...battle, status: "resolved", result: { outcome: "lose", reason: "ko", ticks: 1, petHp: 0, petHpMax: 1, enemyHp: 1, enemyHpMax: 1, damageDealt: 0, damageTaken: 1, causes: [], fight: 1 }, digest: "d" };
  const s = new TrainingSession({ start: async () => ({ ok: true, battle }), resolve: async () => ({ ok: true, battle: resolved, events: [] }), replay: async () => ({ ok: false, code: "x" }) }, () => "z", { storage });
  await s.start();
  s.skill(); s.tick();
  expect(storage.map.has("pet-adventure:adv-3")).toBe(true);
  s.phase = "resolving";
  await s.resolve();
  expect(storage.map.has("pet-adventure:adv-3")).toBe(false);
});
```

- [ ] **Step 2: Implementar en `training-session.ts`**

Imports y adaptación de motores:

```ts
import { createBattle, stepBattle, viewOf } from "@/lib/pet/battle/engine";
import * as legacy from "@/lib/pet/battle/versions/r2.2/engine";
import * as r3 from "@/lib/pet/battle/versions/r3.1/engine";
import { RULESET as R2, BROTE as R2_BROTE } from "@/lib/pet/battle/versions/r2.2/content";
import { RULESET as R3, ENEMIES as R3_ENEMIES } from "@/lib/pet/battle/versions/r3.1/content";
import type { BattleInput as R2Input } from "@/lib/pet/battle/versions/r2.2/types";
import type { BattleInput as R3Input } from "@/lib/pet/battle/versions/r3.1/types";
import { RULESET, ENEMIES } from "@/lib/pet/battle/content";
import { parseEnemyList } from "@/lib/pet/battle/adventure";

type LocalLog = { inputs: BattleInput[]; tick: number };
interface SessionOptions { storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">; storagePrefix?: string }
```

Campos nuevos en la clase: `awaitingContinue = false;` y el constructor `constructor(private actions: Actions, private newId: () => string, private options: SessionOptions = {}) {}`.

Helpers privados:

```ts
  private storageKey() { return this.intent ? `${this.options.storagePrefix ?? "pet-adventure:"}${this.intent}` : null; }
  private save() {
    const key = this.storageKey();
    if (!key || !this.options.storage || !this.view) return;
    try { this.options.storage.setItem(key, JSON.stringify({ inputs: this.inputs, tick: this.view.tick } satisfies LocalLog)); } catch { /* almacenamiento lleno o bloqueado: se sigue sin log */ }
  }
  private forget() {
    const key = this.storageKey();
    if (key && this.options.storage) try { this.options.storage.removeItem(key); } catch { /* idem */ }
  }
  private loadLocal(): LocalLog | null {
    const key = this.storageKey();
    if (!key || !this.options.storage) return null;
    try {
      const raw = this.options.storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LocalLog;
      if (!Array.isArray(parsed.inputs) || !Number.isSafeInteger(parsed.tick) || parsed.tick < 0) return null;
      return parsed;
    } catch { return null; }
  }
```

En `start()`, tras `if (!response.ok) throw…; const b = response.battle;`: `this.intent = b.intentId;` (la aventura decide el intent en el servidor). Después construir el motor:

```ts
      const withFight = <V extends object>(v: V) => ({ ...v, fight: 1, fights: 1 });
      if (b.rulesetVersion === R2.version && b.enemyId === R2_BROTE.id) {
        const ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: R2, enemy: R2_BROTE };
        const state = legacy.createBattle(ctx);
        const view = () => withFight({ ...legacy.viewOf(state), ultiReadyAt: Infinity, ultiUsed: false, shield: 0 });
        this.view = view();
        this.advance = inputs => ({ events: legacy.stepBattle(ctx, state, inputs as R2Input[]).map(event => (event.type === "ENEMY_BASIC" || event.type === "TELEGRAPH_RESOLVED" || event.type === "SKILL_USED") ? { ...event, shield: 0 } : event), view: view() });
      } else if (b.rulesetVersion === R3.version && Object.hasOwn(R3_ENEMIES, b.enemyId)) {
        const ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: R3, enemy: R3_ENEMIES[b.enemyId] };
        const state = r3.createBattle(ctx);
        this.view = withFight(r3.viewOf(state));
        this.advance = inputs => ({ events: r3.stepBattle(ctx, state, inputs as R3Input[]) as BattleEvent[], view: withFight(r3.viewOf(state)) });
      } else if (b.rulesetVersion === RULESET.version) {
        const enemies = parseEnemyList(b.enemyId, ENEMIES);
        if (!enemies) throw new Error("UNSUPPORTED_BATTLE");
        const ctx = { snapshot: b.snapshot, seed: b.seed, ruleset: RULESET, enemies };
        const state = createBattle(ctx);
        this.view = viewOf(state);
        this.advance = inputs => ({ events: stepBattle(ctx, state, inputs), view: viewOf(state) });
      } else throw new Error("UNSUPPORTED_BATTLE");
      this.battle = b; this.inputs = []; this.events = []; this.paused = false; this.ultiOpen = false; this.awaitingContinue = false;
      this.phase = b.status === "resolved" ? "done" : "playing";
      if (b.status === "resolved") { this.acceptResolved(b, response.events); this.forget(); }
      else this.restoreLocal();
```

`restoreLocal()` (privado): si `loadLocal()` devuelve log, `this.inputs = log.inputs;` y avanzar el motor `while (this.view && !this.view.ended && this.view.tick < log.tick) { const next = this.advance!(this.inputs.filter(i => i.tick === this.view!.tick)); this.events.push(...next.events); this.view = next.view; }`; después `this.paused = true; this.awaitingContinue = this.events.at(-1)?.type === "FIGHT_ENDED";`. Si el motor lanza (log corrupto), `catch` → `this.forget()` y volver a construir desde cero llamando otra vez al bloque de construcción (extraerlo a un método privado `buildEngine(b)` para poder invocarlo dos veces).

`skill()` y `confirmUlti()`: tras `this.inputs.push(...)`, `this.save()`. `togglePause()`: `this.save()` al pausar. `continueFight() { if (this.awaitingContinue) { this.awaitingContinue = false; this.save(); } }`.

`tick()`: primera línea `if (this.paused || this.hidden || this.ultiOpen || this.awaitingContinue) return;`. Tras `this.events.push(...next.events); this.view = next.view;` añadir `if (next.events.some(e => e.type === "FIGHT_ENDED")) { this.awaitingContinue = true; this.save(); }`. En la rama de repetición (`replaying`), al procesar eventos: `if (event.type === "FIGHT_STARTED") { this.view.fight = event.fight; this.view.enemyHp = event.enemyHp; this.view.enemyPhase = "idle"; this.view.skillReadyAt = event.tick; this.view.ultiUsed = false; this.view.shield = 0; }`.

`resolve()`: tras `this.acceptResolved(...)`, `this.forget()`. `replay()`: al reiniciar la vista añadir `fight: 1`.

`src/lib/pet/training/types.ts`: añadir a `TrainingBattle`:

```ts
  /** Solo en aventuras (R4a). */
  adventure?: { day: string; attempt: number; reward: { itemId: string; slot: "weapon" | "amulet" } | null };
```

- [ ] **Step 3: Ejecutar**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/pet/training`
Expected: los tests nuevos y los existentes verdes (los existentes de `training-panel.test.tsx` construyen filas `r2.2`; siguen valiendo).

- [ ] **Step 4: Commit**

```bash
git add src/components/pet/training/training-session.ts src/components/pet/training/training-session.test.ts src/lib/pet/training/types.ts
git commit -m "feat(pet): la sesión de combate entiende cadenas, interludio entre tramos y log local"
```

---

### Task 8: Migración, RPC de concesión, funciones de escritura y matriz SQL

**Files:**
- Create: `supabase/migrations/20260908_pet_adventures.sql`
- Create: `supabase/tests/pet_adventures.sql`
- Modify: `src/lib/supabase/database.types.ts` (`pet_battles` Row/Insert/Update + tres `Functions`)
- Modify: `docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md` §4 y §6 (las funciones de escritura viven en `public`, no en `private`)

**Interfaces:**
- Produces (SQL): `public.get_pet_adventure_days() returns table(day date)`; `public.start_pet_adventure(p_user uuid, p_seed text, p_intent uuid, p_enemies text, p_ruleset_version text, p_content_hash text, p_snapshot jsonb) returns setof public.pet_battles` (0 filas = sin aventura); `public.resolve_pet_adventure(p_user uuid, p_intent uuid, p_inputs jsonb, p_result jsonb, p_digest text, p_reward_order jsonb) returns setof public.pet_battles` (0 filas = intento inexistente; `raise 'DAY_ALREADY_WON'` como defensa). `reward` = `{"itemId": text, "slot": text}`.
- Consumes: `private.pet_lived_activity_days(uuid)` (existente).

- [ ] **Step 1: Corregir la spec** (§4 penúltimo bullet y §6): sustituir `private.start_pet_adventure`/`private.resolve_pet_adventure` por `public.start_pet_adventure`/`public.resolve_pet_adventure` y añadir la frase «en `public` porque PostgREST solo expone ese esquema; el `revoke` a `public, anon, authenticated` y el `grant execute` a `service_role` son lo que las hace privadas, como `claim_pet_nudges`». `p_reward_order` es `jsonb` (lista de `{itemId, slot}`).

- [ ] **Step 2: Escribir la migración `supabase/migrations/20260908_pet_adventures.sql`**

```sql
-- R4a (spec docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md §4–§6).
-- Aditiva sobre pet_battles. Dev primero; prod solo tras la aceptación de R3 (#1106).

-- 1. Columnas, CHECKs e índices
alter table public.pet_battles
  add column adventure_day date,
  add column attempt smallint,
  add column reward jsonb;

alter table public.pet_battles add constraint pet_battles_adventure_shape check (
  (kind = 'adventure' and adventure_day is not null and attempt is not null and attempt >= 1)
  or (kind <> 'adventure' and adventure_day is null and attempt is null)
);
alter table public.pet_battles add constraint pet_battles_reward_resolved check (
  reward is null or status = 'resolved'
);
create unique index pet_battles_adventure_attempt_idx
  on public.pet_battles (user_id, adventure_day, attempt) where kind = 'adventure';
create unique index pet_battles_adventure_open_idx
  on public.pet_battles (user_id) where kind = 'adventure' and status = 'open';
create unique index pet_battles_adventure_win_idx
  on public.pet_battles (user_id, adventure_day)
  where kind = 'adventure' and status = 'resolved' and result->>'outcome' = 'win';

comment on column public.pet_battles.adventure_day is 'R4a: día local (Europe/Madrid) cuya aventura es esta fila; null en entrenamiento.';
comment on column public.pet_battles.attempt is 'R4a: número de intento de ese día (1..n); un día se reintenta hasta ganarlo.';
comment on column public.pet_battles.reward is 'R4a: {itemId, slot} entregado al ganar; fuera del digest porque depende del inventario.';

-- 2. Concesión derivada (§5). La pura no mira auth.uid(): la llaman las funciones de escritura
--    con service_role. La de espectador exige identidad; el wrapper público toma la sesión.
create or replace function private.pet_pending_adventure_days(p_user uuid)
returns table (day date)
language sql stable security definer
set search_path = ''
as $$
  select d.day
  from private.pet_lived_activity_days(p_user) d
  where d.day between (timezone('Europe/Madrid', now()))::date - 6 and (timezone('Europe/Madrid', now()))::date
    and not exists (
      select 1 from public.pet_battles b
      where b.user_id = p_user and b.kind = 'adventure' and b.adventure_day = d.day
    )
  order by d.day;
$$;
revoke all on function private.pet_pending_adventure_days(uuid) from public, anon, authenticated;

create or replace function private.pet_adventure_days(p_viewer uuid)
returns table (day date)
language sql stable security definer
set search_path = ''
as $$
  select * from private.pet_pending_adventure_days(p_viewer) where p_viewer = (select auth.uid());
$$;
revoke all on function private.pet_adventure_days(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.pet_adventure_days(uuid) to authenticated;

create or replace function public.get_pet_adventure_days()
returns table (day date)
language sql stable security invoker
set search_path = ''
as $$
  select * from private.pet_adventure_days((select auth.uid()));
$$;
revoke all on function public.get_pet_adventure_days() from public, anon;
grant execute on function public.get_pet_adventure_days() to authenticated;

-- 3. Escritura serializada por usuario (§6). Primer bloqueo consultivo del repo:
--    clave (20260908, hashtext(user)). No reutilizar 20260908 para otra cosa.
create or replace function public.start_pet_adventure(
  p_user uuid, p_seed text, p_intent uuid, p_enemies text,
  p_ruleset_version text, p_content_hash text, p_snapshot jsonb
)
returns setof public.pet_battles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_open public.pet_battles;
  v_day date;
  v_attempt smallint;
begin
  perform pg_advisory_xact_lock(20260908, hashtext(p_user::text));
  -- (1) intento abierto: se devuelve tal cual
  select * into v_open from public.pet_battles
   where user_id = p_user and kind = 'adventure' and status = 'open';
  if found then
    return next v_open;
    return;
  end if;
  -- (2) día con intentos y sin victoria: siguiente intento
  select b.adventure_day, max(b.attempt) + 1 into v_day, v_attempt
    from public.pet_battles b
   where b.user_id = p_user and b.kind = 'adventure'
     and not exists (
       select 1 from public.pet_battles w
        where w.user_id = p_user and w.kind = 'adventure' and w.adventure_day = b.adventure_day
          and w.status = 'resolved' and w.result->>'outcome' = 'win')
   group by b.adventure_day
   order by b.adventure_day
   limit 1;
  -- (3) día pendiente más antiguo, recalculado bajo el bloqueo
  if v_day is null then
    select min(day) into v_day from private.pet_pending_adventure_days(p_user);
    v_attempt := 1;
  end if;
  -- (4) nada: cero filas
  if v_day is null then
    return;
  end if;
  return query
    insert into public.pet_battles
      (user_id, intent_id, kind, enemy_id, ruleset_version, content_hash, seed, snapshot, status, adventure_day, attempt)
    values
      (p_user, p_intent, 'adventure', p_enemies, p_ruleset_version, p_content_hash, p_seed, p_snapshot, 'open', v_day, v_attempt)
    returning *;
end;
$$;
revoke all on function public.start_pet_adventure(uuid, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_pet_adventure(uuid, text, uuid, text, text, text, jsonb) to service_role;

create or replace function public.resolve_pet_adventure(
  p_user uuid, p_intent uuid, p_inputs jsonb, p_result jsonb, p_digest text, p_reward_order jsonb
)
returns setof public.pet_battles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.pet_battles;
  v_reward jsonb := null;
begin
  perform pg_advisory_xact_lock(20260908, hashtext(p_user::text));
  select * into v_row from public.pet_battles
   where user_id = p_user and intent_id = p_intent and kind = 'adventure';
  if not found then
    return;
  end if;
  -- Un resultado guardado gana sobre cualquier reintento: se devuelve sin tocarlo.
  if v_row.status = 'resolved' then
    return next v_row;
    return;
  end if;
  if p_result->>'outcome' = 'win' then
    if exists (
      select 1 from public.pet_battles w
       where w.user_id = p_user and w.kind = 'adventure' and w.adventure_day = v_row.adventure_day
         and w.status = 'resolved' and w.result->>'outcome' = 'win') then
      raise exception 'DAY_ALREADY_WON' using errcode = 'P0001';
    end if;
    -- Primer objeto de la permutación que el usuario no posee; si los posee todos, el primero.
    select o.item into v_reward
      from jsonb_array_elements(p_reward_order) with ordinality as o(item, ord)
     where not exists (
       select 1 from public.pet_battles w
        where w.user_id = p_user and w.kind = 'adventure' and w.reward is not null
          and w.reward->>'itemId' = o.item->>'itemId')
     order by o.ord
     limit 1;
    if v_reward is null then
      v_reward := p_reward_order->0;
    end if;
  end if;
  return query
    update public.pet_battles
       set status = 'resolved', inputs = p_inputs, result = p_result, digest = p_digest,
           resolved_at = now(), reward = v_reward
     where id = v_row.id and status = 'open'
    returning *;
end;
$$;
revoke all on function public.resolve_pet_adventure(uuid, uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_pet_adventure(uuid, uuid, jsonb, jsonb, text, jsonb) to service_role;
```

- [ ] **Step 3: Matriz SQL `supabase/tests/pet_adventures.sql`** (Supabase local o `biblioshare-dev`; todo dentro de una transacción con `rollback`; nunca contra prod)

```sql
-- R4a: concesión derivada, funciones de escritura y sus grants. Requiere SET ROLE.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'assertion_failed: %', message; end if; end; $$;

-- Usuarios A (con actividad) y B (sin nada)
insert into auth.users (id, aud, role, email, created_at, updated_at) values
  ('20260908-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'adv-sql-a@example.test', now(), now()),
  ('20260908-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'adv-sql-b@example.test', now(), now());
insert into public.profiles (user_id, username, is_public, role) values
  ('20260908-0000-4000-8000-00000000000a', 'adv_sql_a', true, 'user'),
  ('20260908-0000-4000-8000-00000000000b', 'adv_sql_b', true, 'user');
insert into public.pet_state (user_id, name, class) values ('20260908-0000-4000-8000-00000000000a', 'Nuez', 'wizard');

-- Actividad de A: hoy, hoy-6 (entra), hoy-7 (fuera de ventana). Un pase basta como ancla de sesión.
-- Se usa el primer libro y un pase propio para no depender de fixtures.
insert into public.passes (id, user_id, item_type, item_id, is_active)
select '20260908-0000-4000-8000-0000000000aa', '20260908-0000-4000-8000-00000000000a', 'book', b.id, true
from public.books b order by b.created_at limit 1;
insert into public.progress_sessions (user_id, pass_id, duration_minutes, session_date, position)
select '20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-0000000000aa', 20, d, '{}'::jsonb
from unnest(array[
  (timezone('Europe/Madrid', now()))::date,
  (timezone('Europe/Madrid', now()))::date - 6,
  (timezone('Europe/Madrid', now()))::date - 7
]) as d;

-- Grants
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.get_pet_adventure_days()', 'execute')
  and has_function_privilege('authenticated', 'public.get_pet_adventure_days()', 'execute'),
  'wrapper de concesión: authenticated sí, anon no');
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute'),
  'start_pet_adventure: solo service_role');
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.resolve_pet_adventure(uuid,uuid,jsonb,jsonb,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_pet_adventure(uuid,uuid,jsonb,jsonb,text,jsonb)', 'execute'),
  'resolve_pet_adventure: solo service_role');
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'private.pet_pending_adventure_days(uuid)', 'execute'),
  'la concesión pura no es llamable por authenticated');

-- Concesión como A: dos días (hoy y hoy-6), no hoy-7
select set_config('request.jwt.claims', '{"sub":"20260908-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 2 from public.get_pet_adventure_days()), 'ventana: hoy y hoy-6 entran, hoy-7 no');
select pg_temp.assert_true((select min(day) = (timezone('Europe/Madrid', now()))::date - 6 from public.get_pet_adventure_days()), 'el más antiguo es hoy-6');
select pg_temp.assert_true((select count(*) = 0 from private.pet_adventure_days('20260908-0000-4000-8000-00000000000b')), 'identidad ajena: cero filas');
reset role;

-- Como B (sin actividad): nada pendiente
select set_config('request.jwt.claims', '{"sub":"20260908-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.get_pet_adventure_days()), 'sin actividad no hay aventura');
reset role;

-- Escritura (como postgres, que es quien tiene service_role de facto en el test)
create temp table adv as
select * from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('1', 32),
  '20260908-0000-4000-8000-000000000101', 'brote,caparazon,brote', 'r4.1', repeat('a', 64), '{"name":"Nuez","petClass":"wizard","stage":"young","attributes":{"FUE":0,"CON":0,"INT":0,"SAB":0,"CAR":0,"DES":0},"tier":1,"hpMax":110,"atk":10}'::jsonb);
select pg_temp.assert_true((select count(*) = 1 and min(attempt) = 1 and min(adventure_day) = (timezone('Europe/Madrid', now()))::date - 6 from adv), 'start consume el día pendiente más antiguo como intento 1');
-- Segundo start con otro seed/intent: devuelve el MISMO abierto y no consume otro día
select pg_temp.assert_true((select intent_id = '20260908-0000-4000-8000-000000000101' from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('2', 32), '20260908-0000-4000-8000-000000000102', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'un intento abierto se devuelve; nunca se abre otro');
select pg_temp.assert_true((select count(*) = 1 from public.pet_battles where user_id = '20260908-0000-4000-8000-00000000000a' and kind = 'adventure'), 'sigue habiendo una fila');
-- Pendientes ya solo hoy
select set_config('request.jwt.claims', '{"sub":"20260908-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 1 and min(day) = (timezone('Europe/Madrid', now()))::date from public.get_pet_adventure_days()), 'el día con fila deja de estar pendiente');
reset role;
-- Derrota → el siguiente start es el intento 2 del mismo día
select pg_temp.assert_true((select status = 'resolved' and reward is null from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000101', '[]'::jsonb, '{"outcome":"lose","reason":"ko","fight":1}'::jsonb, repeat('b', 64), '[]'::jsonb)), 'resolver una derrota no da botín');
select pg_temp.assert_true((select attempt = 2 and adventure_day = (timezone('Europe/Madrid', now()))::date - 6 from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('3', 32), '20260908-0000-4000-8000-000000000103', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'tras perder, el mismo día se reintenta como intento 2 antes de consumir otro día');
-- Victoria con permutación: primer no poseído
select pg_temp.assert_true((select reward->>'itemId' = 'heavy_ink_quill' from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000103', '[]'::jsonb, '{"outcome":"win","reason":"ko","fight":3}'::jsonb, repeat('c', 64), '[{"itemId":"heavy_ink_quill","slot":"weapon"},{"itemId":"loan_pendant","slot":"amulet"}]'::jsonb)), 'la victoria entrega el primer objeto de la lista');
-- Resolver otra vez: devuelve la guardada sin cambiarla
select pg_temp.assert_true((select digest = repeat('c', 64) and reward->>'itemId' = 'heavy_ink_quill' from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000103', '[{"seq":0}]'::jsonb, '{"outcome":"lose"}'::jsonb, repeat('d', 64), '[]'::jsonb)), 'un resultado guardado gana sobre el reintento');
-- Tercer start: el día ganado no se reabre; consume hoy
select pg_temp.assert_true((select adventure_day = (timezone('Europe/Madrid', now()))::date and attempt = 1 from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('4', 32), '20260908-0000-4000-8000-000000000104', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'un día ganado no se reabre; se consume el siguiente pendiente');
-- Victoria de hoy: ya se posee heavy_ink_quill → salta al siguiente de la permutación
select pg_temp.assert_true((select reward->>'itemId' = 'loan_pendant' from public.resolve_pet_adventure('20260908-0000-4000-8000-00000000000a', '20260908-0000-4000-8000-000000000104', '[]'::jsonb, '{"outcome":"win","reason":"ko","fight":3}'::jsonb, repeat('e', 64), '[{"itemId":"heavy_ink_quill","slot":"weapon"},{"itemId":"loan_pendant","slot":"amulet"}]'::jsonb)), 'prefiere el primer objeto no poseído');
-- Sin pendientes: cero filas
select pg_temp.assert_true((select count(*) = 0 from public.start_pet_adventure('20260908-0000-4000-8000-00000000000a', repeat('5', 32), '20260908-0000-4000-8000-000000000105', 'brote', 'r4.1', repeat('a', 64), '{}'::jsonb)), 'sin días pendientes no se abre nada');
-- CHECK de forma
do $$ begin
  insert into public.pet_battles (user_id, intent_id, kind, enemy_id, ruleset_version, content_hash, seed, snapshot, attempt)
  values ('20260908-0000-4000-8000-00000000000a', gen_random_uuid(), 'training', 'brote', 'r4.1', repeat('a', 64), repeat('9', 32), '{}'::jsonb, 1);
  raise exception 'assertion_failed: training con attempt debería violar el CHECK';
exception when check_violation then null; end $$;
-- Índice de una victoria por día
do $$ begin
  insert into public.pet_battles (user_id, intent_id, kind, enemy_id, ruleset_version, content_hash, seed, snapshot, status, inputs, result, digest, resolved_at, adventure_day, attempt)
  values ('20260908-0000-4000-8000-00000000000a', gen_random_uuid(), 'adventure', 'brote', 'r4.1', repeat('a', 64), repeat('8', 32), '{}'::jsonb, 'resolved', '[]'::jsonb, '{"outcome":"win"}'::jsonb, repeat('f', 64), now(), (timezone('Europe/Madrid', now()))::date, 9);
  raise exception 'assertion_failed: segunda victoria del mismo día debería violar el índice';
exception when unique_violation then null; end $$;
rollback;
```

- [ ] **Step 4: Aplicar en dev y ejecutar la matriz**

Con el MCP `supabase-dev`: `apply_migration` con nombre `pet_adventures` y el contenido del fichero. Si el MCP no conecta, vía el conector de Supabase de claude.ai con el `project_id` de dev (ver memoria `supabase-mcp-fallback`). Después ejecutar la matriz con `execute_sql` (contenido íntegro de `supabase/tests/pet_adventures.sql`). Expected: sin `assertion_failed`.

Verificación contra objetos reales (guardar la salida para `data-model.md`):

```sql
select
  (select count(*) from pg_attribute where attrelid = 'public.pet_battles'::regclass and attname in ('adventure_day','attempt','reward') and not attisdropped) as cols,
  (select count(*) from pg_indexes where tablename = 'pet_battles' and indexname like 'pet_battles_adventure_%') as idx,
  has_function_privilege('authenticated', 'public.get_pet_adventure_days()', 'execute') as auth_days,
  has_function_privilege('authenticated', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute') as auth_start,
  has_function_privilege('service_role', 'public.start_pet_adventure(uuid,text,uuid,text,text,text,jsonb)', 'execute') as svc_start,
  has_function_privilege('service_role', 'public.resolve_pet_adventure(uuid,uuid,jsonb,jsonb,text,jsonb)', 'execute') as svc_resolve,
  has_column_privilege('authenticated', 'public.pet_battles', 'reward', 'SELECT') as auth_reads_reward;
```

Expected: `3 | 3 | true | false | true | true | true`.

- [ ] **Step 5: Tipos generados**

En `src/lib/supabase/database.types.ts`, `pet_battles`: añadir a `Row` `adventure_day: string | null`, `attempt: number | null`, `reward: Json | null`; a `Insert` y `Update` las mismas como opcionales. En `Functions` (orden alfabético):

```ts
      get_pet_adventure_days: { Args: never; Returns: { day: string }[] }
      resolve_pet_adventure: {
        Args: { p_user: string; p_intent: string; p_inputs: Json; p_result: Json; p_digest: string; p_reward_order: Json }
        Returns: Database["public"]["Tables"]["pet_battles"]["Row"][]
      }
      start_pet_adventure: {
        Args: { p_user: string; p_seed: string; p_intent: string; p_enemies: string; p_ruleset_version: string; p_content_hash: string; p_snapshot: Json }
        Returns: Database["public"]["Tables"]["pet_battles"]["Row"][]
      }
```

Si el MCP funciona, preferir `generate_typescript_types` y comparar el diff con lo anterior.

- [ ] **Step 6: Verificar tipos y commit**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx tsc --noEmit`

```bash
git add supabase/migrations/20260908_pet_adventures.sql supabase/tests/pet_adventures.sql src/lib/supabase/database.types.ts docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md
git commit -m "feat(pet): migración de aventuras: columnas, índices, concesión derivada y escritura serializada por usuario"
```

---
### Task 9: Catálogo de botín y permutación de recompensa

**Files:**
- Create: `src/lib/pet/loot/catalog.ts`
- Create: `src/lib/pet/loot/reward.ts`
- Create: `src/lib/pet/loot/reward.test.ts`

**Interfaces:**
- Produces: `LOOT_ITEMS: readonly LootItem[]` (6), `LootItemId`, `LootSlot = "weapon" | "amulet"`, `Reward = { itemId: LootItemId; slot: LootSlot }`, `isReward(x): x is Reward`, `rewardOrder(seed): Reward[]` (permutación de los 6), `pickReward(order, owned: Iterable<string>): Reward`, `inventoryFrom(rewards: (Reward | null | undefined)[]): InventoryEntry[]` con `InventoryEntry = { itemId; slot; count }` en orden de catálogo.

- [ ] **Step 1: Tests `src/lib/pet/loot/reward.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import { LOOT_ITEMS, isReward } from "./catalog";
import { inventoryFrom, pickReward, rewardOrder } from "./reward";

describe("botín R4a (spec §7)", () => {
  it("el catálogo tiene seis ids únicos, tres por ranura", () => {
    expect(LOOT_ITEMS).toHaveLength(6);
    expect(new Set(LOOT_ITEMS.map((i) => i.id)).size).toBe(6);
    expect(LOOT_ITEMS.filter((i) => i.slot === "weapon")).toHaveLength(3);
    expect(LOOT_ITEMS.filter((i) => i.slot === "amulet")).toHaveLength(3);
  });
  it("rewardOrder es una permutación determinista del catálogo", () => {
    const a = rewardOrder(seedFromIndex(1));
    expect(a).toEqual(rewardOrder(seedFromIndex(1)));
    expect([...a].map((r) => r.itemId).sort()).toEqual(LOOT_ITEMS.map((i) => i.id).sort());
    expect(rewardOrder(seedFromIndex(2))).not.toEqual(a);
    expect(a.every(isReward)).toBe(true);
  });
  it("pickReward prefiere el primer no poseído y cae al primero cuando se posee todo", () => {
    const order = rewardOrder(seedFromIndex(3));
    expect(pickReward(order, [])).toEqual(order[0]);
    expect(pickReward(order, [order[0].itemId])).toEqual(order[1]);
    expect(pickReward(order, order.map((r) => r.itemId))).toEqual(order[0]);
  });
  it("el primer no poseído de una permutación uniforme es uniforme entre los no poseídos", () => {
    const owned = ["sharp_bookmark", "last_page_amulet"];
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) { const r = pickReward(rewardOrder(seedFromIndex(i)), owned); counts.set(r.itemId, (counts.get(r.itemId) ?? 0) + 1); }
    expect([...counts.keys()].sort()).toEqual(["heavy_ink_quill", "librarian_loupe", "loan_pendant", "streak_medallion"]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(400); // 2000/4 = 500 ± margen
  });
  it("inventoryFrom agrupa con recuento en orden de catálogo e ignora nulos", () => {
    const [w1, , , a1] = LOOT_ITEMS;
    expect(inventoryFrom([{ itemId: a1.id, slot: a1.slot }, null, { itemId: w1.id, slot: w1.slot }, { itemId: a1.id, slot: a1.slot }])).toEqual([
      { itemId: w1.id, slot: w1.slot, count: 1 }, { itemId: a1.id, slot: a1.slot, count: 2 },
    ]);
  });
});
```

- [ ] **Step 2: `catalog.ts`**

```ts
// Catálogo de botín de R4a (spec §7). Sin efecto en combate hasta R4b: los ids son
// estables y el comentario de cada uno es la dirección prevista, para que R4b no renombre.
export const LOOT_SLOTS = ["weapon", "amulet"] as const;
export type LootSlot = (typeof LOOT_SLOTS)[number];

export const LOOT_ITEMS = [
  { id: "sharp_bookmark", slot: "weapon" },    // R4b: la interrupción pega más
  { id: "heavy_ink_quill", slot: "weapon" },   // R4b: la ulti de Potencia pega más
  { id: "librarian_loupe", slot: "weapon" },   // R4b: la ventana vulnerable dura más
  { id: "last_page_amulet", slot: "amulet" },  // R4b: usar la ulti concede una barrera pequeña
  { id: "loan_pendant", slot: "amulet" },      // R4b: la habilidad recarga antes tras interrumpir
  { id: "streak_medallion", slot: "amulet" },  // R4b: empezar cada tramo con algo de vida extra
] as const satisfies readonly { id: string; slot: LootSlot }[];

export type LootItemId = (typeof LOOT_ITEMS)[number]["id"];
export interface LootItem { id: LootItemId; slot: LootSlot }
export interface Reward { itemId: LootItemId; slot: LootSlot }

export function isLootItemId(x: unknown): x is LootItemId {
  return typeof x === "string" && LOOT_ITEMS.some((i) => i.id === x);
}
export function isReward(x: unknown): x is Reward {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return isLootItemId(r.itemId) && LOOT_ITEMS.some((i) => i.id === r.itemId && i.slot === r.slot);
}
```

- [ ] **Step 3: `reward.ts`**

```ts
import { nextInt, subStream } from "@/lib/pet/battle/prng";
import { LOOT_ITEMS, type LootSlot, type LootItemId, type Reward } from "./catalog";

export interface InventoryEntry { itemId: LootItemId; slot: LootSlot; count: number }

/** Permutación de los seis, derivada del seed de la aventura (sub-flujo propio, como el puzzle). */
export function rewardOrder(seed: string): Reward[] {
  const rng = subStream(seed, "loot:reward", 0);
  const order = LOOT_ITEMS.map((i) => ({ itemId: i.id, slot: i.slot }));
  for (let i = order.length - 1; i > 0; i--) { const j = nextInt(rng, 0, i); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}

/** La misma regla que resolve_pet_adventure en SQL: primer no poseído; si todo, el primero. */
export function pickReward(order: readonly Reward[], owned: Iterable<string>): Reward {
  const has = new Set(owned);
  return order.find((r) => !has.has(r.itemId)) ?? order[0];
}

export function inventoryFrom(rewards: ReadonlyArray<Reward | null | undefined>): InventoryEntry[] {
  const counts = new Map<string, number>();
  for (const r of rewards) if (r) counts.set(r.itemId, (counts.get(r.itemId) ?? 0) + 1);
  return LOOT_ITEMS.filter((i) => counts.has(i.id)).map((i) => ({ itemId: i.id, slot: i.slot, count: counts.get(i.id)! }));
}
```

- [ ] **Step 4: Ejecutar y commit**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet/loot`
Expected: 5 PASS.

```bash
git add src/lib/pet/loot
git commit -m "feat(pet): catálogo de botín y permutación de recompensa derivada del seed"
```

---

### Task 10: Servicio de aventuras, repositorio, acciones y celebración

**Files:**
- Create: `src/lib/pet/training/shared.ts`; Modify: `src/lib/pet/training/service.ts` (usa `shared.ts`)
- Create: `src/lib/pet/adventure/types.ts`, `repository.ts`, `service.ts`, `get-state.ts`, `actions.ts`, `service.test.ts`
- Modify: `src/lib/celebrations/types.ts`, `src/lib/celebrations/registry.ts`, `src/components/celebrations/celebration-overlay.tsx`, `messages/es.json` (`pet.bubble.pet_adventure_won`)

**Interfaces:**
- Produces:
  - `shared.ts`: `isIntent(v): v is string`; `verifyResolved(battle): Promise<TrainingResponse>` (lo que hoy es `saved()` en el servicio de entrenamiento).
  - `AdventureBattle = TrainingBattle & { adventure: { day: string; attempt: number; reward: Reward | null } }`.
  - `AdventureRepository { pendingDays(): Promise<string[]>; find(intentId): Promise<AdventureBattle | null>; recent(limit): Promise<AdventureBattle[]>; start(input: StartInput): Promise<AdventureBattle | null>; resolve(input: ResolveInput): Promise<AdventureBattle | null> }` con `StartInput = { intentId; seed; enemyId; rulesetVersion; contentHash; snapshot }`, `ResolveInput = { intentId; inputs; result; digest; rewardOrder: Reward[] }`.
  - `createAdventureService({ repository, snapshot, seed, newIntent, onWin? })` → `{ state(), start(), resolve(intentId, rawInputs), replay(intentId) }`; respuestas `AdventureResponse = { ok: true; battle: AdventureBattle; events?: BattleEvent[] } | { ok: false; code: string }`; `AdventureState = { pendingDays: string[]; current: AdventureBattle | null; inventory: InventoryEntry[] }`.
  - Server actions: `getAdventureState()`, `startAdventure()`, `resolveAdventure(intentId, inputs)`, `replayAdventure(intentId)`.
  - `getAdventureStateFor(userId, sessionClient)` en `get-state.ts` para la página.
- Consumes: Task 4 (`getBattleRelease`, `replayBattle`), Task 3 (`pickEnemies`, `enemyList`), Task 8 (RPCs), Task 9.

- [ ] **Step 1: Extraer lo común del entrenamiento**

`src/lib/pet/training/shared.ts`:

```ts
import { replayBattle } from "../battle/replay";
import type { TrainingBattle, TrainingResponse } from "./types";

export const isIntent = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** Una fila resuelta solo se devuelve si su digest se reproduce hoy: nada guardado se cree sin re-simular. */
export async function verifyResolved<B extends TrainingBattle>(battle: B): Promise<{ ok: true; battle: B; events: import("../battle/types").BattleEvent[] } | { ok: false; code: string }> {
  if (battle.status !== "resolved" || !battle.result || !battle.digest) return { ok: false, code: "NOT_RESOLVED" };
  const replay = await replayBattle(battle);
  if (!replay.ok) return replay;
  if (replay.digest !== battle.digest) return { ok: false, code: "DIGEST_MISMATCH" };
  return { ok: true, battle, events: replay.events };
}
```

En `training/service.ts`: borrar `isIntent` y `saved` locales; `import { isIntent, verifyResolved } from "./shared";` y sustituir cada `saved(x)` por `verifyResolved(x)`. Los tests de entrenamiento no cambian.

- [ ] **Step 2: Tests del servicio `src/lib/pet/adventure/service.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createAdventureService } from "./service";
import type { AdventureBattle, AdventureRepository } from "./types";
import { ENEMIES, RULESET, contentHash } from "@/lib/pet/battle/content";
import { parseEnemyList } from "@/lib/pet/battle/adventure";
import { POLICIES, runPolicy } from "@/lib/pet/battle/policies";
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";
import { pickReward, rewardOrder } from "@/lib/pet/loot/reward";

const snapshot = snapshotForProfile("lectora_larga", "wizard");

/** Repositorio en memoria que imita el contrato atómico de las funciones SQL (§6). */
function memoryRepo(pending: string[]) {
  const rows: AdventureBattle[] = [];
  const days = new Set(pending);
  const won = (day: string) => rows.some((r) => r.adventure.day === day && r.status === "resolved" && r.result?.outcome === "win");
  const repo: AdventureRepository = {
    async pendingDays() { return [...days].filter((d) => !rows.some((r) => r.adventure.day === d)).sort(); },
    async find(intentId) { return structuredClone(rows.find((r) => r.intentId === intentId) ?? null); },
    async recent() { return structuredClone([...rows].reverse()); },
    async start(input) {
      const open = rows.find((r) => r.status === "open");
      if (open) return structuredClone(open);
      const retry = rows.filter((r) => !won(r.adventure.day)).sort((a, b) => a.adventure.day.localeCompare(b.adventure.day))[0];
      const day = retry?.adventure.day ?? (await repo.pendingDays())[0];
      if (!day) return null;
      const attempt = retry ? Math.max(...rows.filter((r) => r.adventure.day === day).map((r) => r.adventure.attempt)) + 1 : 1;
      const row: AdventureBattle = { ...input, status: "open", inputs: [], result: null, digest: null, adventure: { day, attempt, reward: null } };
      rows.push(row);
      return structuredClone(row);
    },
    async resolve(input) {
      const row = rows.find((r) => r.intentId === input.intentId);
      if (!row) return null;
      if (row.status === "resolved") return structuredClone(row);
      const owned = rows.flatMap((r) => (r.adventure.reward ? [r.adventure.reward.itemId] : []));
      Object.assign(row, { status: "resolved", inputs: input.inputs, result: input.result, digest: input.digest });
      row.adventure.reward = input.result.outcome === "win" ? pickReward(input.rewardOrder, owned) : null;
      return structuredClone(row);
    },
  };
  return { repo, rows };
}

let intents = 0;
const service = (pending: string[]) => {
  const { repo, rows } = memoryRepo(pending);
  const wins: string[] = [];
  const s = createAdventureService({ repository: repo, snapshot: async () => snapshot, seed: () => seedFromIndex(++intents), newIntent: () => `54e5f63c-68a8-4acf-a790-${String(++intents).padStart(12, "0")}`, onWin: async (b) => { wins.push(b.adventure.day); } });
  return { s, rows, wins };
};

async function playToEnd(s: ReturnType<typeof createAdventureService>, battle: AdventureBattle, policy = POLICIES.interrupt) {
  const enemies = parseEnemyList(battle.enemyId, ENEMIES)!;
  const { inputs } = runPolicy({ seed: battle.seed, snapshot: battle.snapshot, enemies, ruleset: RULESET }, policy);
  return s.resolve(battle.intentId, inputs);
}

describe("servicio de aventuras (spec §6)", () => {
  it("start consume el día más antiguo, guarda una lista de enemigos válida y es idempotente", async () => {
    const { s, rows } = service(["2026-09-05", "2026-09-06"]);
    const a = await s.start();
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.battle.adventure).toMatchObject({ day: "2026-09-05", attempt: 1 });
    expect(a.battle.enemyId.split(",")).toHaveLength(RULESET.adventure.chainLength);
    expect(parseEnemyList(a.battle.enemyId, ENEMIES)).not.toBeNull();
    expect(a.battle.rulesetVersion).toBe(RULESET.version);
    expect(a.battle.contentHash).toBe(await contentHash());
    expect(await s.start()).toEqual(a);
    expect(rows).toHaveLength(1);
  });
  it("sin días pendientes responde NO_ADVENTURE; sin mascota, NO_PET", async () => {
    expect(await service([]).s.start()).toEqual({ ok: false, code: "NO_ADVENTURE" });
    const { repo } = memoryRepo(["2026-09-06"]);
    const noPet = createAdventureService({ repository: repo, snapshot: async () => null, seed: () => seedFromIndex(1), newIntent: () => "54e5f63c-68a8-4acf-a790-000000000001" });
    expect(await noPet.start()).toEqual({ ok: false, code: "NO_PET" });
  });
  it("resolver re-simula, firma el digest, entrega botín al ganar y celebra una vez por día", async () => {
    const { s, wins } = service(["2026-09-06"]);
    // busca un intento que la política interrupt gane
    for (let i = 0; i < 40; i++) {
      const started = await s.start();
      if (!started.ok) throw new Error(started.code);
      const done = await playToEnd(s, started.battle);
      expect(done.ok).toBe(true);
      if (!done.ok) return;
      expect(done.battle.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(done.events?.length).toBeGreaterThan(0);
      if (done.battle.result?.outcome === "win") {
        expect(done.battle.adventure.reward).toEqual(pickReward(rewardOrder(done.battle.seed), []));
        expect(wins).toEqual(["2026-09-06"]);
        // resolver otra vez con inputs distintos devuelve lo guardado
        const again = await s.resolve(started.battle.intentId, []);
        expect(again.ok && again.battle.digest).toBe(done.battle.digest);
        expect(wins).toHaveLength(1);
        return;
      }
      expect(done.battle.adventure.reward).toBeNull();
      // tras perder, el siguiente start es otro intento del mismo día
      const retry = await s.start();
      expect(retry.ok && retry.battle.adventure).toMatchObject({ day: "2026-09-06", attempt: started.battle.adventure.attempt + 1 });
    }
    throw new Error("40 intentos sin victoria: revisar calibración");
  });
  it("rechaza inputs inválidos y un intent ajeno o inexistente", async () => {
    const { s } = service(["2026-09-06"]);
    const a = await s.start();
    if (!a.ok) throw new Error(a.code);
    expect(await s.resolve(a.battle.intentId, "no-es-array")).toEqual({ ok: false, code: "NOT_ARRAY" });
    expect(await s.resolve("54e5f63c-68a8-4acf-a790-999999999999", [])).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await s.resolve("no-uuid", [])).toEqual({ ok: false, code: "INVALID_INTENT" });
  });
  it("state expone pendientes, el intento en curso (abierto o perdido) e inventario derivado", async () => {
    const { s } = service(["2026-09-05", "2026-09-06"]);
    expect(await s.state()).toEqual({ pendingDays: ["2026-09-05", "2026-09-06"], current: null, inventory: [] });
    const a = await s.start();
    if (!a.ok) throw new Error(a.code);
    let st = await s.state();
    expect(st.pendingDays).toEqual(["2026-09-06"]);
    expect(st.current?.intentId).toBe(a.battle.intentId);
    const done = await playToEnd(s, a.battle, POLICIES.never); // never pierde casi siempre
    if (done.ok && done.battle.result?.outcome === "lose") {
      st = await s.state();
      expect(st.current?.status).toBe("resolved");
      expect(st.current?.adventure.day).toBe("2026-09-05");
    }
  });
});
```

- [ ] **Step 3: `types.ts`**

```ts
import type { BattleEvent, BattleInput, BattleResult, BattleSnapshot } from "../battle/types";
import type { TrainingBattle } from "../training/types";
import type { InventoryEntry } from "../loot/reward";
import type { Reward } from "../loot/catalog";

export interface AdventureBattle extends TrainingBattle {
  adventure: { day: string; attempt: number; reward: Reward | null };
}
export interface AdventureState { pendingDays: string[]; current: AdventureBattle | null; inventory: InventoryEntry[] }
export type AdventureResponse = { ok: true; battle: AdventureBattle; events?: BattleEvent[] } | { ok: false; code: string };

export interface StartInput { intentId: string; seed: string; enemyId: string; rulesetVersion: string; contentHash: string; snapshot: BattleSnapshot }
export interface ResolveInput { intentId: string; inputs: BattleInput[]; result: BattleResult; digest: string; rewardOrder: Reward[] }

/** Acotado a un usuario autenticado antes de construir el servicio. Las escrituras son las funciones SQL de §6. */
export interface AdventureRepository {
  pendingDays(): Promise<string[]>;
  find(intentId: string): Promise<AdventureBattle | null>;
  /** Filas de aventura del usuario, más recientes primero. */
  recent(limit: number): Promise<AdventureBattle[]>;
  /** null = sin aventura que empezar (NO_ADVENTURE). Devuelve el abierto existente si lo hay. */
  start(input: StartInput): Promise<AdventureBattle | null>;
  /** null = intento inexistente. Devuelve la fila guardada si ya estaba resuelta. */
  resolve(input: ResolveInput): Promise<AdventureBattle | null>;
}
```

- [ ] **Step 4: `service.ts`**

```ts
import { enemyList, parseEnemyList, pickEnemies } from "../battle/adventure";
import { ENEMIES, RULESET, contentHash } from "../battle/content";
import { isBattleSnapshot } from "../battle/record";
import { getBattleRelease, replayBattle } from "../battle/replay";
import type { BattleSnapshot } from "../battle/types";
import { inventoryFrom, rewardOrder } from "../loot/reward";
import { isIntent, verifyResolved } from "../training/shared";
import type { AdventureBattle, AdventureRepository, AdventureResponse, AdventureState } from "./types";

export function createAdventureService(deps: {
  repository: AdventureRepository;
  snapshot: () => Promise<BattleSnapshot | null>;
  seed: () => string;
  newIntent: () => string;
  /** Efecto tras una victoria confirmada (celebración). Nunca debe lanzar. */
  onWin?: (battle: AdventureBattle) => Promise<void>;
}) {
  const repo = deps.repository;

  async function state(): Promise<AdventureState> {
    const [pendingDays, rows] = await Promise.all([repo.pendingDays(), repo.recent(60)]);
    const wonDays = new Set(rows.filter((r) => r.status === "resolved" && r.result?.outcome === "win").map((r) => r.adventure.day));
    const current = rows.find((r) => r.status === "open") ?? rows.find((r) => !wonDays.has(r.adventure.day)) ?? null;
    return { pendingDays, current, inventory: inventoryFrom(rows.map((r) => r.adventure.reward)) };
  }

  return {
    state,
    async start(): Promise<AdventureResponse> {
      const snapshot = await deps.snapshot();
      if (!snapshot) return { ok: false, code: "NO_PET" };
      if (!isBattleSnapshot(snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
      const seed = deps.seed();
      const battle = await repo.start({
        intentId: deps.newIntent(), seed, enemyId: enemyList(pickEnemies(seed, RULESET.adventure.chainLength, ENEMIES)),
        rulesetVersion: RULESET.version, contentHash: await contentHash(), snapshot,
      });
      if (!battle) return { ok: false, code: "NO_ADVENTURE" };
      if (battle.status === "resolved") return verifyResolved(battle);
      const release = getBattleRelease(battle.rulesetVersion, battle.contentHash);
      if (!release) return { ok: false, code: "UNKNOWN_RELEASE" };
      if (!release.isSnapshot(battle.snapshot)) return { ok: false, code: "INVALID_SNAPSHOT" };
      return { ok: true, battle };
    },
    async resolve(intentId: string, rawInputs: unknown): Promise<AdventureResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const battle = await repo.find(intentId);
      if (!battle) return { ok: false, code: "NOT_FOUND" };
      if (battle.status === "resolved") return verifyResolved(battle);
      const release = getBattleRelease(battle.rulesetVersion, battle.contentHash);
      if (!release) return { ok: false, code: "UNKNOWN_RELEASE" };
      const enemies = parseEnemyList(battle.enemyId, release.enemies);
      if (!enemies) return { ok: false, code: "ENEMIES_MISMATCH" };
      const validated = release.validateInputs(rawInputs, enemies.length);
      if (!validated.ok) return { ok: false, code: validated.code };
      const out = await replayBattle({ ...battle, inputs: validated.inputs });
      if (!out.ok) return out;
      const committed = await repo.resolve({ intentId, inputs: validated.inputs, result: out.result, digest: out.digest, rewardOrder: rewardOrder(battle.seed) });
      if (!committed) return { ok: false, code: "NOT_FOUND" };
      // Otra petición pudo ganar la carrera: lo guardado manda, y se re-verifica igual.
      if (committed.digest !== out.digest) return verifyResolved(committed);
      if (committed.result?.outcome === "win" && deps.onWin) await deps.onWin(committed);
      return { ok: true, battle: committed, events: out.events };
    },
    async replay(intentId: string): Promise<AdventureResponse> {
      if (!isIntent(intentId)) return { ok: false, code: "INVALID_INTENT" };
      const battle = await repo.find(intentId);
      return battle ? verifyResolved(battle) : { ok: false, code: "NOT_FOUND" };
    },
  };
}
```

- [ ] **Step 5: `repository.ts`**

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/lib/supabase/database.types";
import { isReward } from "../loot/catalog";
import type { AdventureBattle, AdventureRepository } from "./types";

type Admin = ReturnType<typeof createServiceRoleClient>;
type Session = Awaited<ReturnType<typeof createClient>>;
type Row = Database["public"]["Tables"]["pet_battles"]["Row"];

function project(row: Row): AdventureBattle {
  const reward = isReward(row.reward) ? row.reward : null;
  return {
    intentId: row.intent_id, status: row.status as AdventureBattle["status"], seed: row.seed,
    snapshot: row.snapshot as unknown as AdventureBattle["snapshot"], rulesetVersion: row.ruleset_version,
    contentHash: row.content_hash, enemyId: row.enemy_id, inputs: (row.inputs ?? []) as unknown as AdventureBattle["inputs"],
    result: row.result as unknown as AdventureBattle["result"], digest: row.digest,
    adventure: { day: row.adventure_day ?? "", attempt: row.attempt ?? 1, reward },
  };
}

/** `session` (cliente de la petición, RLS) lee la concesión; `admin` (service_role) llama a las funciones de escritura. */
export function adventureRepository(admin: Admin, session: Session, userId: string): AdventureRepository {
  return {
    async pendingDays() {
      const { data, error } = await session.rpc("get_pet_adventure_days");
      if (error) throw error;
      return (data ?? []).map((r) => r.day);
    },
    async find(intentId) {
      const { data, error } = await admin.from("pet_battles").select("*").eq("user_id", userId).eq("intent_id", intentId).eq("kind", "adventure").maybeSingle();
      if (error) throw error;
      return data ? project(data) : null;
    },
    async recent(limit) {
      const { data, error } = await admin.from("pet_battles").select("*").eq("user_id", userId).eq("kind", "adventure").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []).map(project);
    },
    async start(input) {
      const { data, error } = await admin.rpc("start_pet_adventure", {
        p_user: userId, p_seed: input.seed, p_intent: input.intentId, p_enemies: input.enemyId,
        p_ruleset_version: input.rulesetVersion, p_content_hash: input.contentHash, p_snapshot: input.snapshot as unknown as Json,
      });
      if (error) throw error;
      return data?.[0] ? project(data[0]) : null;
    },
    async resolve(input) {
      const { data, error } = await admin.rpc("resolve_pet_adventure", {
        p_user: userId, p_intent: input.intentId, p_inputs: input.inputs as unknown as Json, p_result: input.result as unknown as Json,
        p_digest: input.digest, p_reward_order: input.rewardOrder as unknown as Json,
      });
      if (error) throw error;
      return data?.[0] ? project(data[0]) : null;
    },
  };
}
```

- [ ] **Step 6: `get-state.ts` y `actions.ts`**

`get-state.ts` (sin `"use server"`; lo usa la página y las acciones):

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { earnCelebration } from "@/lib/celebrations/earn";
import { getPetSnapshot } from "../get-pet-snapshot";
import { buildSnapshot } from "../battle/power";
import { adventureRepository } from "./repository";
import { createAdventureService } from "./service";
import type { AdventureState } from "./types";

type Session = Awaited<ReturnType<typeof createClient>>;

function seed() {
  let value: string;
  do { value = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); } while (value === "0".repeat(32));
  return value;
}

export function adventureServiceFor(session: Session, userId: string) {
  return createAdventureService({
    repository: adventureRepository(createServiceRoleClient(), session, userId),
    seed, newIntent: () => crypto.randomUUID(),
    snapshot: async () => { const pet = await getPetSnapshot(session, userId); return pet ? buildSnapshot(pet) : null; },
    onWin: async (battle) => { await earnCelebration(session, userId, { event: "pet_adventure_won", key: battle.adventure.day }); },
  });
}

export async function getAdventureStateFor(session: Session, userId: string): Promise<AdventureState> {
  return adventureServiceFor(session, userId).state();
}
```

`actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { adventureServiceFor } from "./get-state";
import type { AdventureResponse, AdventureState } from "./types";

async function withService<T>(operation: (service: ReturnType<typeof adventureServiceFor>) => Promise<T>, fallback: T): Promise<T> {
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return fallback;
    return await operation(adventureServiceFor(client, user.id));
  } catch (error) {
    console.error("pet adventure", error);
    return fallback;
  }
}

export async function getAdventureState(): Promise<AdventureState | null> {
  return withService((s) => s.state(), null);
}
export async function startAdventure(): Promise<AdventureResponse> {
  return withService((s) => s.start(), { ok: false, code: "UNAVAILABLE" });
}
export async function resolveAdventure(intentId: string, inputs: unknown): Promise<AdventureResponse> {
  return withService((s) => s.resolve(intentId, inputs), { ok: false, code: "UNAVAILABLE" });
}
export async function replayAdventure(intentId: string): Promise<AdventureResponse> {
  return withService((s) => s.replay(intentId), { ok: false, code: "UNAVAILABLE" });
}
```

Nota: el `fallback` con `UNAVAILABLE` cubre también «sin sesión» como hace el entrenamiento (`UNAUTHENTICATED`); si se quiere distinguir, devolver `{ ok: false, code: "UNAUTHENTICATED" }` en la rama `!user` con un parámetro extra. Mantener simple.

- [ ] **Step 7: Celebración `pet_adventure_won`**

- `src/lib/celebrations/types.ts`: añadir `| "pet_adventure_won"` al union de eventos.
- `src/lib/celebrations/registry.ts`, tras `pet_achievement`:

```ts
  // Mascota R4a: se gana al resolver una aventura ganada. `key` = día local de la aventura.
  pet_adventure_won: {
    event: "pet_adventure_won",
    intensity: "high",
    durationMs: 1800,
    scope: "key",
    reducedMotionFallback: "static",
  },
```

- `celebration-overlay.tsx`: en el `switch` de texto `case "pet_adventure_won": return "¡Aventura superada!";`; en `staticGlyph` `case "pet_adventure_won": return "⚔";`; en `Visual`, añadir `case "pet_adventure_won":` justo encima de `case "pet_achievement":` (comparten visual).
- `messages/es.json`, dentro de `pet.bubble`: `"pet_adventure_won": "¡Aventura!"`.

- [ ] **Step 8: Ejecutar y commit**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/lib/pet src/lib/celebrations src/components/celebrations; npx tsc --noEmit; npm run lint`
Expected: verde.

```bash
git add src/lib/pet/adventure src/lib/pet/training/shared.ts src/lib/pet/training/service.ts src/lib/celebrations src/components/celebrations/celebration-overlay.tsx messages/es.json
git commit -m "feat(pet): servicio de aventuras sobre las funciones SQL, botín al ganar y celebración"
```

---
### Task 11: Interfaz: panel en modo aventura, sección, inventario y textos

**Files:**
- Modify: `src/components/pet/training/training-panel.tsx`
- Modify: `src/components/pet/training/training-panel.test.tsx` (añadir casos)
- Create: `src/components/pet/adventure/adventure-panel.tsx`, `adventure-section.tsx`, `inventory-list.tsx`, `adventure-section.test.tsx`
- Modify: `src/app/mascota/page.tsx`
- Modify: `messages/es.json` (`pet.adventure.*`, `pet.training.events.FIGHT_ENDED/FIGHT_STARTED`)

**Interfaces:**
- Produces: `TrainingPanel` acepta props opcionales `{ kind?: "training" | "adventure"; actions?: { start; resolve; replay }; storage?: Storage-like; onDone?: () => void; startLabel?: "start" | "resume" | "retry" }`. Sin props se comporta exactamente como hoy.
- Produces: `AdventurePanel({ initial: AdventureState })` (cliente), `AdventureSection({ viewer })` (servidor, `async`), `InventoryList({ inventory })`.
- Consumes: Task 7 (`TrainingSession` con `awaitingContinue`, `continueFight`, `storage`), Task 10 (acciones y `AdventureState`), Task 9 (`LOOT_ITEMS`).

- [ ] **Step 1: Textos** — añadir a `messages/es.json` (vía el agente `i18n-keeper`, que además comprueba que no queda ninguna clave usada sin definir):

Bajo `pet.training.events`: `"FIGHT_ENDED": "Tramo superado. Tu mascota recupera el aliento.", "FIGHT_STARTED": "Empieza el siguiente tramo."`.

Nuevo bloque `pet.adventure`:

```json
"adventure": {
  "title": "Aventuras",
  "intro": "Cada día con lectura, episodios o películas te da una aventura: una cadena de combates seguidos en la que la vida no se recupera entre tramos. Ganar entrega un objeto; perder no quita nada.",
  "pending": "{count, plural, =0 {No tienes aventuras pendientes} one {# aventura pendiente} other {# aventuras pendientes}}",
  "pendingHelp": "Cuentan los últimos siete días con actividad. Una aventura empezada no caduca.",
  "inProgress": "Aventura del {day} en curso",
  "retryAvailable": "Aventura del {day}: puedes reintentarla",
  "start": "Empezar aventura",
  "resume": "Reanudar aventura",
  "retry": "Reintentar aventura",
  "starting": "Preparando aventura…",
  "none": "Registra algo hoy y vuelve: tu mascota tendrá una aventura esperando.",
  "fight": "Tramo {n} de {total}",
  "interlude": "Tramo {n} superado. Te quedan {hp} de {max} de vida. Habilidad y ulti vuelven a estar listas.",
  "continue": "Continuar",
  "loseHint": "La aventura no se pierde: puedes reintentarla desde el principio, con la vida llena y otro seed.",
  "won": "¡Aventura superada!",
  "reward": "Botín: {name}",
  "rewardPending": "Se activa en la siguiente actualización",
  "inventory": "Botín conseguido",
  "inventoryEmpty": "Aún no has ganado ningún objeto.",
  "count": "×{count}",
  "slots": { "weapon": "Arma", "amulet": "Amuleto" },
  "items": {
    "sharp_bookmark": "Marcapáginas afilado",
    "heavy_ink_quill": "Pluma de tinta pesada",
    "librarian_loupe": "Lupa del bibliotecario",
    "last_page_amulet": "Amuleto de la Última Página",
    "loan_pendant": "Colgante del préstamo",
    "streak_medallion": "Medallón de la racha"
  }
}
```

- [ ] **Step 2: Tests del panel en modo aventura** (añadir a `training-panel.test.tsx`; el `vi.mock` de acciones existente sigue sirviendo para el modo entrenamiento)

```ts
import { pickEnemies, enemyList } from "@/lib/pet/battle/adventure";
import { ENEMIES, RULESET } from "@/lib/pet/battle/content";
import { POLICIES, runPolicy } from "@/lib/pet/battle/policies";
import { snapshotForProfile } from "@/lib/pet/battle/profiles";
import { seedFromIndex } from "@/lib/pet/battle/prng";

function chainFixture() {
  const snapshot = snapshotForProfile("lectora_larga", "wizard");
  for (let i = 0; i < 100; i++) {
    const seed = seedFromIndex(i);
    const enemies = pickEnemies(seed, RULESET.adventure.chainLength, ENEMIES);
    const { inputs, events } = runPolicy({ seed, snapshot, enemies, ruleset: RULESET }, POLICIES.interrupt);
    const ended = events.find((e) => e.type === "FIGHT_ENDED");
    if (ended) return { seed, snapshot, enemyId: enemyList(enemies), inputs, endedTick: ended.tick };
  }
  throw new Error("sin cadena que supere el primer tramo");
}

it("modo aventura: marcador de tramo estable, interludio con Continuar y botón de reintento al perder", async () => {
  vi.useFakeTimers();
  const f = chainFixture();
  const battle = { intentId: "adv-1", status: "open", seed: f.seed, snapshot: f.snapshot, rulesetVersion: RULESET.version, contentHash: "x", enemyId: f.enemyId, inputs: [], result: null, digest: null, adventure: { day: "2026-09-07", attempt: 1, reward: null } };
  const actions = { start: vi.fn(async () => ({ ok: true, battle })), resolve: vi.fn(), replay: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} startLabel="start" /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Empezar aventura" })); });
  expect(screen.getByTestId("fight-marker").textContent).toBe("Tramo 1 de 3");
  expect(screen.queryByLabelText(/Elige un rival/)).toBeNull();
  const skill = () => fireEvent.click(screen.getByRole("button", { name: "Golpe interruptor · Usar habilidad" }));
  for (let tick = 0; tick <= f.endedTick; tick++) {
    if (f.inputs.some((x) => x.tick === tick)) skill();
    act(() => { vi.advanceTimersByTime(100); });
  }
  expect(screen.getByTestId("fight-marker").textContent).toBe("Tramo 2 de 3");
  const cont = screen.getByRole("button", { name: "Continuar" });
  const before = screen.getByTestId("training-tick").textContent;
  act(() => { vi.advanceTimersByTime(500); });
  expect(screen.getByTestId("training-tick").textContent).toBe(before);
  fireEvent.click(cont);
  act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByTestId("training-tick").textContent).not.toBe(before);
});

it("modo aventura: al ganar muestra el botín y su etiqueta de pendiente", async () => {
  const battle = { intentId: "adv-2", status: "resolved", seed: seedFromIndex(1), snapshot: snapshotForProfile("social", "bard"), rulesetVersion: RULESET.version, contentHash: "x", enemyId: "brote,brote,brote", inputs: [], result: { outcome: "win", reason: "ko", ticks: 900, petHp: 10, petHpMax: 100, enemyHp: 0, enemyHpMax: 400, damageDealt: 1200, damageTaken: 90, causes: ["charges_interrupted"], fight: 3 }, digest: "d", adventure: { day: "2026-09-07", attempt: 2, reward: { itemId: "loan_pendant", slot: "amulet" } } };
  const actions = { start: vi.fn(async () => ({ ok: true, battle, events: [] })), resolve: vi.fn(), replay: vi.fn() };
  render(<NextIntlClientProvider locale="es" messages={messages}><TrainingPanel kind="adventure" actions={actions} startLabel="resume" /></NextIntlClientProvider>);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reanudar aventura" })); });
  expect(screen.getByText("¡Aventura superada!")).toBeTruthy();
  expect(screen.getByText("Botín: Colgante del préstamo")).toBeTruthy();
  expect(screen.getByText("Se activa en la siguiente actualización")).toBeTruthy();
});
```

- [ ] **Step 3: `TrainingPanel` con modo aventura**

Cambios en `training-panel.tsx`:

```tsx
interface PanelActions { start: (intent: string, enemyId?: string) => Promise<TrainingResponse>; resolve: (intent: string, inputs: BattleInput[]) => Promise<TrainingResponse>; replay: (intent: string) => Promise<TrainingResponse> }
interface Props {
  kind?: "training" | "adventure";
  actions?: PanelActions;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  startLabel?: "start" | "resume" | "retry";
  onDone?: () => void;
}

export function TrainingPanel({ kind = "training", actions, storage, startLabel = "start", onDone }: Props = {}) {
  const t = useTranslations("pet.training");
  const ta = useTranslations("pet.adventure");
  const adventure = kind === "adventure";
  const [session] = useState(() => new TrainingSession(
    actions ?? { start: startBattle, resolve: resolveBattle, replay: replayTrainingBattle },
    () => crypto.randomUUID(),
    adventure ? { storage: storage ?? (typeof window !== "undefined" ? window.localStorage : undefined) } : {},
  ));
```

- Título e intro: `adventure ? ta("title") : t("title")`, `adventure ? ta("intro") : t("intro")`; `aria-labelledby` con id `${kind}-title`; `data-testid={adventure ? "pet-adventure" : "pet-training"}`.
- Selector de enemigo: envolver el `<label>` existente en `{!adventure && (...)}`.
- Botón de inicio: en aventura `ta(phase === "starting" ? "starting" : startLabel)`.
- Tras `useEffect` de `resolving`, uno nuevo: `useEffect(() => { if (phase === "done") onDone?.(); }, [phase, onDone]);`.
- Dentro de la arena, encima de la barra de vida: `{adventure && v && <p data-testid="fight-marker" className="text-center text-sm font-semibold"><ReservedText text={ta("fight", { n: v.fight, total: v.fights })} alternatives={[ta("fight", { n: v.fights, total: v.fights })]} /></p>}`.
- Interludio, justo antes de `{(session.paused || session.hidden) && …}`: `{adventure && session.awaitingContinue && v && <div role="status" className="space-y-2 rounded border border-border p-3 text-sm"><p>{ta("interlude", { n: v.fight - 1, hp: v.petHp, max: v.petHpMax })}</p><button className={buttonVariants()} onClick={() => { session.continueFight(); refresh(); }}>{ta("continue")}</button></div>}`. Deshabilitar el botón de habilidad, la ulti y el de pausa mientras `session.awaitingContinue` (añadir `|| session.awaitingContinue` a sus `disabled`).
- Resultado: sustituir el `<h3>` por `{adventure && result.outcome === "win" ? ta("won") : t(`outcomes.${result.outcome}`)}`; después de las causas, `{adventure && session.battle?.adventure?.reward && <p className="text-sm font-medium">{ta("reward", { name: ta(`items.${session.battle.adventure.reward.itemId}`) })} <span className="text-muted-foreground">· {ta("rewardPending")}</span></p>}` y `{adventure && result.outcome !== "win" && <p className="text-sm text-muted-foreground">{ta("loseHint")}</p>}`.
- Botones finales: en aventura, `{result.outcome !== "win" && <button className={buttonVariants()} onClick={() => void run(() => session.start(true))}>{ta("retry")}</button>}` en lugar de «Nuevo combate»; «Ver repetición» se mantiene.
- `eventText`: sin cambios (las claves nuevas resuelven por `events.${event.type}`).

- [ ] **Step 4: Componentes de aventura**

`inventory-list.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Swords, Shield } from "../training/training-icons";
import type { InventoryEntry } from "@/lib/pet/loot/reward";

export function InventoryList({ inventory }: { inventory: InventoryEntry[] }) {
  const t = useTranslations("pet.adventure");
  if (inventory.length === 0) return <p className="text-sm text-muted-foreground">{t("inventoryEmpty")}</p>;
  return <ul className="grid gap-2 sm:grid-cols-2" data-testid="pet-inventory">
    {inventory.map((e) => <li key={e.itemId} className="flex items-center gap-3 rounded border border-border p-3 text-sm" data-item={e.itemId}>
      {e.slot === "weapon" ? <Swords width={20} height={20} aria-hidden="true" /> : <Shield width={20} height={20} aria-hidden="true" />}
      <span className="flex-1"><strong>{t(`items.${e.itemId}`)}</strong><br /><span className="text-muted-foreground">{t(`slots.${e.slot}`)} · {t("rewardPending")}</span></span>
      {e.count > 1 && <span className="tabular-nums">{t("count", { count: e.count })}</span>}
    </li>)}
  </ul>;
}
```

`adventure-panel.tsx` (cliente):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startAdventure, resolveAdventure, replayAdventure } from "@/lib/pet/adventure/actions";
import type { AdventureState } from "@/lib/pet/adventure/types";
import { TrainingPanel } from "../training/training-panel";
import { InventoryList } from "./inventory-list";

export function AdventurePanel({ initial }: { initial: AdventureState }) {
  const t = useTranslations("pet.adventure");
  const router = useRouter();
  const current = initial.current;
  const startLabel = current?.status === "open" ? "resume" : current ? "retry" : "start";
  const canStart = initial.pendingDays.length > 0 || current !== null;
  return <div className="flex flex-col gap-4">
    <div className="text-sm">
      <p className="font-medium" data-testid="adventure-pending">{t("pending", { count: initial.pendingDays.length })}</p>
      <p className="text-muted-foreground">{t("pendingHelp")}</p>
      {current && <p data-testid="adventure-current">{t(current.status === "open" ? "inProgress" : "retryAvailable", { day: current.adventure.day })}</p>}
      {!canStart && <p>{t("none")}</p>}
    </div>
    {canStart && <TrainingPanel kind="adventure" startLabel={startLabel} onDone={() => router.refresh()} actions={{ start: () => startAdventure(), resolve: (intent, inputs) => resolveAdventure(intent, inputs), replay: (intent) => replayAdventure(intent) }} />}
    <section aria-labelledby="inventory-title"><h3 id="inventory-title" className="font-serif text-lg font-semibold">{t("inventory")}</h3><InventoryList inventory={initial.inventory} /></section>
  </div>;
}
```

`adventure-section.tsx` (servidor):

```tsx
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getAdventureStateFor } from "@/lib/pet/adventure/get-state";
import { AdventurePanel } from "./adventure-panel";

// Depende de la sesión: nunca `use cache`; la página lo envuelve en <Suspense>.
export async function AdventureSection({ viewerId }: { viewerId: string }) {
  const t = await getTranslations("pet.adventure");
  const supabase = await createClient();
  const state = await getAdventureStateFor(supabase, viewerId);
  return <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card" aria-labelledby="adventure-section-title" data-testid="pet-adventures">
    <div><h2 id="adventure-section-title" className="font-serif text-xl font-semibold">{t("title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("intro")}</p></div>
    <AdventurePanel initial={state} />
  </section>;
}
```

`src/app/mascota/page.tsx`: importar `AdventureSection` y cambiar el return con mascota a:

```tsx
  return <>
    <PetDetail pet={pet} burrow={burrow} />
    <Suspense fallback={<div aria-hidden className="h-40 animate-pulse rounded-card bg-surface-muted" />}><AdventureSection viewerId={user.id} /></Suspense>
    <TrainingPanel />
  </>;
```

Test `adventure-section.test.tsx` (`// @vitest-environment jsdom`): renderizar `AdventurePanel` con `initial = { pendingDays: ["2026-09-07"], current: null, inventory: [{ itemId: "sharp_bookmark", slot: "weapon", count: 2 }] }` (mock de `next/navigation` con `useRouter: () => ({ refresh: vi.fn() })` y de `@/lib/pet/adventure/actions`), y comprobar «1 aventura pendiente», el botón «Empezar aventura», «Marcapáginas afilado» y «×2»; con `pendingDays: []` y `current: null`, el texto de `none` y ningún botón.

- [ ] **Step 5: Ejecutar**

Run: `fnm env | Out-String | Invoke-Expression; fnm use 22; npx vitest run src/components/pet; npx tsc --noEmit; npm run lint`
Expected: verde, incluidos los tests previos del panel (modo entrenamiento intacto).

- [ ] **Step 6: Comprobación en navegador (dev contra dev)**

Arrancar `npm run dev` a mano (puerto 3000 libre; regla de higiene) y abrir `/mascota` con una cuenta con actividad de hoy: sección Aventuras con recuento, empezar, ver marcador de tramo, recargar a mitad y comprobar que reanuda en pausa, Continuar entre tramos, resultado con botín o «Reintentar». Capturar `.superpowers/r4a-aventura-desktop.png` y `-mobile.png` (320 px) como en R3. Parar el dev server al terminar.

- [ ] **Step 7: Commit**

```bash
git add src/components/pet src/app/mascota/page.tsx messages/es.json
git commit -m "feat(pet): sección de aventuras en /mascota: tramos, interludio, botín pendiente e inventario"
```

---

### Task 12: E2E: flujo con dos cuentas, autoridad y concurrencia real

**Files:**
- Create: `e2e/mascota-aventuras.spec.ts`
- Modify: `e2e/mascota-batallas-autoridad.spec.ts` (bloque de aventuras)

**Interfaces:**
- Consumes: `withBattleUsers` (`e2e/support/battle-users.ts`), `resolveFinalEmpire` (`e2e/support/book-fixture.ts`), migración de la Task 8 aplicada en dev, UI de la Task 11.

Requisitos: `.env.local` en la worktree; `npm run dev` arrancado a mano en 3000 (memoria «Playwright: arrancar next dev a mano»); ejecutar contra **build de producción** al menos una vez antes de cerrar (`npm run build && npm run start` en vez de `dev`), porque la regla de `use cache` solo revienta en `next start`.

- [ ] **Step 1: Sembrar actividad (helper local del spec)**

```ts
async function seedActivity(request: APIRequestContext, userId: string, daysAgo: number) {
  const book = await resolveFinalEmpire<{ id: string }>(url, headers, "id");
  const pass = await request.post(`${url}/rest/v1/passes`, { headers: { ...headers, Prefer: "return=representation" }, data: { user_id: userId, item_type: "book", item_id: book.id, is_active: true } });
  expect(pass.ok()).toBe(true);
  const [{ id: passId }] = await pass.json() as Array<{ id: string }>;
  const day = new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const session = await request.post(`${url}/rest/v1/progress_sessions`, { headers, data: { user_id: userId, pass_id: passId, duration_minutes: 20, session_date: day, position: {} } });
  expect(session.ok()).toBe(true);
  return day;
}
```

(Las cuentas son desechables: `withBattleUsers` borra el `auth.users` y el cascade se lleva pases, sesiones y `pet_battles`.)

- [ ] **Step 2: Spec `e2e/mascota-aventuras.spec.ts`**

```ts
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { withBattleUsers } from "./support/battle-users";
import { resolveFinalEmpire } from "./support/book-fixture";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// seedActivity: ver Step 1

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/login?next=/mascota");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/mascota$/, { timeout: 30_000 });
}

async function userToken(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${url}/auth/v1/token?grant_type=password`, { headers: { apikey: anon, "Content-Type": "application/json" }, data: { email, password } });
  expect(res.ok()).toBe(true);
  return (await res.json()).access_token as string;
}

test("aventuras: concesión por día, empezar, reanudar tras recargar, resolver, reintentar o cobrar botín", async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await withBattleUsers(url, key, async (createUser) => {
    const a = await createUser("r4adventurea");
    const b = await createUser("r4adventureb");
    for (const u of [a, b]) expect((await request.post(`${url}/rest/v1/pet_state`, { headers, data: { user_id: u.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    await seedActivity(request, a.id, 0);
    await seedActivity(request, a.id, 6);
    await seedActivity(request, a.id, 7); // fuera de ventana

    // Concesión por RPC: A ve dos días, B ninguno
    const tokenA = await userToken(request, a.email, a.password);
    const daysA = await request.post(`${url}/rest/v1/rpc/get_pet_adventure_days`, { headers: { apikey: anon, Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" }, data: {} });
    expect(daysA.ok()).toBe(true);
    expect(await daysA.json()).toHaveLength(2);
    const tokenB = await userToken(request, b.email, b.password);
    const daysB = await request.post(`${url}/rest/v1/rpc/get_pet_adventure_days`, { headers: { apikey: anon, Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" }, data: {} });
    expect(await daysB.json()).toHaveLength(0);

    await page.setViewportSize({ width: 320, height: 844 });
    await login(page, a);
    const section = page.getByTestId("pet-adventures");
    await expect(section.getByTestId("adventure-pending")).toHaveText("2 aventuras pendientes");
    await section.getByRole("button", { name: "Empezar aventura", exact: true }).click();
    await expect(section.getByTestId("fight-marker")).toHaveText(/Tramo 1 de \d/);
    // Una fila abierta del día más antiguo
    const open = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=*`, { headers })).json() as Array<{ intent_id: string; status: string; attempt: number; adventure_day: string; enemy_id: string }>;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ status: "open", attempt: 1 });
    expect(open[0].enemy_id.split(",").length).toBeGreaterThanOrEqual(2);

    // Recargar a mitad: reanuda en pausa con el mismo intent
    await page.waitForTimeout(1500);
    await section.getByRole("button", { name: "Pausar", exact: true }).click();
    const tickBefore = await section.getByTestId("training-tick").textContent();
    await page.reload();
    await expect(page.getByTestId("pet-adventures").getByTestId("adventure-current")).toContainText("en curso");
    await page.getByTestId("pet-adventures").getByRole("button", { name: "Reanudar aventura", exact: true }).click();
    await expect(page.getByTestId("pet-adventures").getByRole("button", { name: "Continuar", exact: true })).toBeVisible();
    expect(await page.getByTestId("pet-adventures").getByTestId("training-tick").textContent()).toBe(tickBefore);
    const stillOpen = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=intent_id,status`, { headers })).json() as Array<{ intent_id: string; status: string }>;
    expect(stillOpen).toEqual([{ intent_id: open[0].intent_id, status: "open" }]);

    // Dejar correr a 2× hasta el final (interrumpir cuando haya carga; pulsar Continuar entre tramos)
    const panel = page.getByTestId("pet-adventures");
    await panel.getByRole("button", { name: "Continuar", exact: true }).click();
    await panel.getByRole("combobox", { name: "Velocidad", exact: true }).selectOption("2");
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      if (await panel.getByRole("button", { name: /Reintentar aventura|Ver repetición/ }).first().isVisible().catch(() => false)) break;
      const cont = panel.getByRole("button", { name: "Continuar", exact: true });
      if (await cont.isVisible().catch(() => false)) { await cont.click(); continue; }
      const skill = panel.getByRole("button", { name: "Golpe interruptor · Usar habilidad" });
      if ((await panel.locator('[data-enemy-phase="windup"]').count()) > 0 && await skill.isEnabled().catch(() => false)) await skill.click();
      await page.waitForTimeout(150);
    }
    const resolved = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=status,result,reward,digest,adventure_day`, { headers })).json() as Array<{ status: string; result: { outcome: string; fight: number } | null; reward: { itemId: string } | null; digest: string | null; adventure_day: string }>;
    expect(resolved).toHaveLength(1);
    expect(resolved[0].status).toBe("resolved");
    expect(resolved[0].digest).toMatch(/^[0-9a-f]{64}$/);
    if (resolved[0].result?.outcome === "win") {
      expect(resolved[0].reward?.itemId).toBeTruthy();
      await expect(panel.getByText("¡Aventura superada!")).toBeVisible();
      await expect(page.getByTestId("pet-inventory")).toBeVisible();
      await expect(page.getByTestId("adventure-pending")).toHaveText("1 aventura pendiente");
    } else {
      expect(resolved[0].reward).toBeNull();
      await panel.getByRole("button", { name: "Reintentar aventura", exact: true }).click();
      await expect(panel.getByTestId("fight-marker")).toHaveText(/Tramo 1 de \d/);
      const rows = await (await request.get(`${url}/rest/v1/pet_battles?user_id=eq.${a.id}&kind=eq.adventure&select=attempt,adventure_day,status&order=attempt`, { headers })).json() as Array<{ attempt: number; adventure_day: string; status: string }>;
      expect(rows.map((r) => r.attempt)).toEqual([1, 2]);
      expect(new Set(rows.map((r) => r.adventure_day)).size).toBe(1);
      // los pendientes no cambian al reintentar
      await expect(page.getByTestId("adventure-pending")).toHaveText("1 aventura pendiente");
    }
    // B no ve nada de A
    const seen = await request.get(`${url}/rest/v1/pet_battles?select=id`, { headers: { apikey: anon, Authorization: `Bearer ${tokenB}` } });
    expect(await seen.json()).toEqual([]);
  });
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Autoridad y concurrencia** (añadir a `e2e/mascota-batallas-autoridad.spec.ts`, dentro del `withBattleUsers` existente o en un `test` nuevo con el mismo patrón)

```ts
test("aventuras: nadie fabrica una fila ni ejecuta las funciones de escritura; dos inicios concurrentes convergen", async ({ request }) => {
  await withBattleUsers(SUPABASE_URL, SERVICE_KEY, async (createUser) => {
    const a = await createUser("r4autha");
    expect((await request.post(`${SUPABASE_URL}/rest/v1/pet_state`, { headers: adminHeaders(true), data: { user_id: a.id, name: "Nuez", class: "wizard" } })).ok()).toBe(true);
    const token = await userToken(request, a.email, a.password);
    // 1. inserción directa de una fila de aventura como usuario: denegada
    const forged = await request.post(REST, { headers: userHeaders(token, true), data: { ...openRow(a.id), kind: "adventure", adventure_day: "2026-09-07", attempt: 1 } });
    expect([401, 403]).toContain(forged.status());
    // 2. las funciones de escritura no son ejecutables con JWT de usuario
    for (const fn of ["start_pet_adventure", "resolve_pet_adventure"]) {
      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { headers: userHeaders(token, true), data: {} });
      expect([401, 403, 404]).toContain(res.status());
    }
    // 3. dos inicios concurrentes con service_role (dos conexiones PostgREST reales) → la misma fila
    // Sembrar dos días de actividad (ver seedActivity del spec de aventuras; copiar el helper).
    const args = (n: string) => ({ p_user: a.id, p_seed: n.repeat(32), p_intent: crypto.randomUUID(), p_enemies: "brote,brote,brote", p_ruleset_version: "r4.1", p_content_hash: "a".repeat(64), p_snapshot: SNAPSHOT });
    const [r1, r2] = await Promise.all([
      request.post(`${SUPABASE_URL}/rest/v1/rpc/start_pet_adventure`, { headers: adminHeaders(true), data: args("1") }),
      request.post(`${SUPABASE_URL}/rest/v1/rpc/start_pet_adventure`, { headers: adminHeaders(true), data: args("2") }),
    ]);
    expect(r1.ok() && r2.ok()).toBe(true);
    const [[row1], [row2]] = await Promise.all([r1.json(), r2.json()]) as Array<Array<{ intent_id: string; adventure_day: string }>>;
    expect(row1.intent_id).toBe(row2.intent_id);
    const all = await (await request.get(`${REST}?user_id=eq.${a.id}&kind=eq.adventure&select=id`, { headers: adminHeaders() })).json() as unknown[];
    expect(all).toHaveLength(1);
    // 4. dos resoluciones concurrentes de una victoria → una sola recompensa, mismo digest
    const resolveArgs = (d: string) => ({ p_user: a.id, p_intent: row1.intent_id, p_inputs: [], p_result: { outcome: "win", reason: "ko", fight: 3 }, p_digest: d.repeat(64), p_reward_order: [{ itemId: "loan_pendant", slot: "amulet" }, { itemId: "sharp_bookmark", slot: "weapon" }] });
    const [s1, s2] = await Promise.all([
      request.post(`${SUPABASE_URL}/rest/v1/rpc/resolve_pet_adventure`, { headers: adminHeaders(true), data: resolveArgs("b") }),
      request.post(`${SUPABASE_URL}/rest/v1/rpc/resolve_pet_adventure`, { headers: adminHeaders(true), data: resolveArgs("c") }),
    ]);
    const [[w1], [w2]] = await Promise.all([s1.json(), s2.json()]) as Array<Array<{ digest: string; reward: { itemId: string } }>>;
    expect(w1.digest).toBe(w2.digest);
    expect(w1.reward).toEqual(w2.reward);
    expect(w1.reward.itemId).toBe("loan_pendant");
    // 5. un nuevo start no reabre el día ganado: consume el otro día pendiente
    const next = await (await request.post(`${SUPABASE_URL}/rest/v1/rpc/start_pet_adventure`, { headers: adminHeaders(true), data: args("3") })).json() as Array<{ adventure_day: string; attempt: number }>;
    expect(next[0].adventure_day).not.toBe(row1.adventure_day);
    expect(next[0].attempt).toBe(1);
  });
});
```

(Este test manipula filas con `service_role` a propósito, como el resto del spec de autoridad: no pasa por el motor. La coherencia motor↔fila la cubre el spec de aventuras.)

- [ ] **Step 4: Ejecutar contra dev y contra build de producción**

```powershell
fnm env | Out-String | Invoke-Expression; fnm use 22
# terminal 1: npm run dev   (o, para el pase final: npm run build; npm run start)
npx playwright test e2e/mascota-aventuras.spec.ts e2e/mascota-batallas-autoridad.spec.ts e2e/mascota-entrenamiento.spec.ts
```

Expected: verdes, sin `skipped` (si hay `skipped`, falta `.env.local`). Guardar las capturas en `.superpowers/`. Parar el servidor al terminar.

- [ ] **Step 5: Commit**

```bash
git add e2e/mascota-aventuras.spec.ts e2e/mascota-batallas-autoridad.spec.ts
git commit -m "test(pet): e2e de aventuras: concesión, reanudación, reintento, botín, autoridad y concurrencia"
```

---
### Task 13: Documentación canónica, grafo e issues

**Files:**
- Modify: `docs/requirements/data-model.md` (§8bis.5 y nuevo §8bis.7)
- Modify: `docs/requirements/backlog.md:337`
- Modify: `docs/requirements/decisiones.md` (append)
- Modify: `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md` (Parte II R4a: estado)
- Modify: `docs/architecture/graph.json` (nodo `m-pet-adventure`, aristas, trampa de reexports en `m-pet-battle`)
- Modify: `docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md` (cabecera: estado implementado; §10 tabla de calibración si no se pegó en la Task 5)
- Issues: cerrar #1086, #1087, #1093; crear R4b y «migración de ids del catálogo».

- [ ] **Step 1: `data-model.md`**

En §8bis.5 (`pet_battles`), añadir un párrafo tras el de RLS:

```markdown
**R4a (2026-09-XX, migración `20260908_pet_adventures.sql`, dev ✓ · prod ⏳):** tres columnas nuevas,
`adventure_day date`, `attempt smallint`, `reward jsonb` ({itemId, slot}; fuera del digest), con CHECK
de forma (`kind = 'adventure'` ⇔ día e intento presentes) y `reward is null or status = 'resolved'`.
Tres índices únicos parciales: `(user_id, adventure_day, attempt)` en aventuras, `(user_id)` en
aventuras abiertas (un solo intento abierto por usuario) y `(user_id, adventure_day)` en aventuras
ganadas (`result->>'outcome' = 'win'`). `kind` toma ahora `'training'` y `'adventure'`; `enemy_id`
guarda en aventuras la lista de enemigos por tramo separada por comas. Grants sin cambio; el `select`
de las columnas nuevas llega a `authenticated` por el grant de tabla. Verificación en dev:
`cols 3 | idx 3 | auth_days true | auth_start false | svc_start true | svc_resolve true | auth_reads_reward true`.
```

Nuevo §8bis.7 «Aventuras — concesión derivada y escritura serializada (#R4a)»:

```markdown
### 8bis.7. Aventuras: `get_pet_adventure_days`, `start_pet_adventure`, `resolve_pet_adventure`

**[Canónico · verificado contra dev el 2026-09-XX · prod pendiente de la aceptación de R3 (#1106)]**

Spec `docs/superpowers/specs/2026-09-06-mascota-r4a-aventuras-design.md` §5–§6. **La concesión no se
guarda**: `private.pet_pending_adventure_days(p_user)` (definer, sin comprobación de identidad, solo
para las funciones de escritura) devuelve los días de `private.pet_lived_activity_days` en
`[hoy − 6, hoy]` Europe/Madrid sin fila `kind = 'adventure'`. `private.pet_adventure_days(p_viewer)`
exige `p_viewer = auth.uid()` y `public.get_pet_adventure_days()` (invoker) toma la sesión: patrón de
`get_burrow_pets`. `authenticated` ejecuta las dos últimas; `anon` ninguna.

**Escritura, solo `service_role`:** `public.start_pet_adventure(...)` y `public.resolve_pet_adventure(...)`
viven en `public` porque PostgREST solo expone ese esquema; el `revoke` a `public, anon, authenticated`
las hace privadas (como `claim_pet_nudges`). Ambas empiezan con **`pg_advisory_xact_lock(20260908,
hashtext(p_user::text))`** — el primer bloqueo consultivo del repo; la clave `20260908` queda reservada
para aventuras. `start` decide bajo el bloqueo: intento abierto → lo devuelve; día con intentos sin
victoria → intento `max + 1`; si no, día pendiente más antiguo → intento 1; sin nada → cero filas.
`resolve` relee el intento bajo el bloqueo, devuelve lo guardado si ya estaba resuelto, y al ganar elige
el botín como primer `{itemId, slot}` de `p_reward_order` que el usuario no posee (o el primero si los
posee todos) en la misma transacción que el compare-and-set `status = 'open'`. Matriz:
`supabase/tests/pet_adventures.sql`; concurrencia real con dos conexiones en
`e2e/mascota-batallas-autoridad.spec.ts`.
```

Actualizar la cabecera de frescura del documento (línea 3) con la fecha.

- [ ] **Step 2: Backlog, decisiones, Parte II, spec**

- `backlog.md`: casilla R4a → `[x]` con «implementada 2026-09-XX (PR #…); calibración: cadena de N tramos; mergear a prod tras #1106». Mantener R4b y R5.
- `decisiones.md` (append): entrada «2026-09-XX — Mascota R4a: longitud de cadena N por calibración, funciones de escritura en `public`, primer bloqueo consultivo» con la tabla de calibración resumida (interrupt/never por longitud) y la razón de `public` (PostgREST).
- Parte II de la hoja de ruta, sección R4a: añadir «**Implementada 2026-09-XX**; longitud de cadena: N tramos (calibración en la spec §10); pendiente aceptación jugable y despliegue a prod tras #1106».
- Spec: cabecera `[… · implementada el 2026-09-XX · pendiente aceptación]`; §10 con la tabla si falta.

- [ ] **Step 3: `graph.json`**

Añadir nodo (junto a `m-pet-training`):

```json
{
  "id": "m-pet-adventure",
  "label": "lib/pet/adventure + lib/pet/loot",
  "layer": "domain",
  "kind": "module",
  "summary": "R4a: aventuras derivadas. Concesión = RPC get_pet_adventure_days (días vividos de la semana sin fila). start/resolve son funciones SQL con pg_advisory_xact_lock por usuario, solo service_role; el servicio re-simula con la versión almacenada y pasa rewardOrder(seed); la SQL elige el primer objeto no poseído. Inventario derivado de las filas ganadas.",
  "files": [
    "src/lib/pet/adventure/actions.ts", "src/lib/pet/adventure/service.ts", "src/lib/pet/adventure/repository.ts",
    "src/lib/pet/adventure/get-state.ts", "src/lib/pet/adventure/types.ts",
    "src/lib/pet/loot/catalog.ts", "src/lib/pet/loot/reward.ts",
    "supabase/migrations/20260908_pet_adventures.sql"
  ],
  "gotchas": [
    "Nunca use cache: todo depende del usuario.",
    "Las funciones de escritura están en public por PostgREST; son privadas por grants, no por esquema.",
    "El botín se decide en SQL bajo el bloqueo; TypeScript solo aporta la permutación del seed.",
    "El log parcial para reanudar vive en localStorage del dispositivo (pet-adventure:<intent>), no en el servidor."
  ]
}
```

Aristas: `m-pet-adventure → m-pet-battle` (`calls`, «re-simula con la versión almacenada»), `m-pet-adventure → m-pet-training` (`calls`, «shared.ts: isIntent, verifyResolved»), `m-pet-adventure → supabase` (o el nodo de datos que use `m-pet-training`), y `web /mascota → m-pet-adventure`. Añadir a `m-pet-battle.gotchas`: «`src/lib/pet/battle/*.ts` son reexports de `versions/<actual>/`: editarlos no cambia nada; publicar versión = `fork`/`golden --version`/`freeze` (#1093)». Añadir un flujo end-to-end «jugar una aventura» con los pasos: `/mascota` → `AdventureSection` → `getAdventureStateFor` → `get_pet_adventure_days` → `startAdventure` → `start_pet_adventure` → cliente simula (`TrainingSession`, log local) → `resolveAdventure` → `replayBattle` → `resolve_pet_adventure` (botín) → `earnCelebration`. Regenerar/validar según `docs/architecture/README.md`.

- [ ] **Step 4: Issues** (con las tres etiquetas obligatorias; cuerpos en fichero con `--body-file`)

```sh
gh issue close 1086 --comment "Cerrada en R4a: el bucle de inputs de versions/r4.1/engine.ts hace switch por acción con default que lanza UNKNOWN_ACTION. r3.1 se conserva tal cual. Test: src/lib/pet/battle/chain.test.ts («una acción desconocida…»)."
gh issue close 1087 --comment "Cerrada: los cuatro casos viven en src/lib/pet/battle/tick-order.test.ts, escritos sobre r3.1 antes de tocar el bucle en r4.1 y verdes en las dos versiones. Fixtures normativos intactos."
gh issue close 1093 --comment "Cerrada: npm run pet:battle -- fork | golden --version | freeze (scripts/pet-battle/freeze.ts, con test). purity.test.ts cuenta por versión; README de versions/ y docs/testing/pet-battle.md actualizados; graph.json con la trampa de los reexports. Primer uso real: r4.1."
gh issue create --label "area:play,tipo:feature,P3" --title "Mascota R4b: primer botín con efecto (seis objetos, dos ranuras, equipar y comparar, iconos y VFX)" --body-file r4b.md
gh issue create --label "area:play,tipo:deuda,P2" --title "Mascota: si R4b renombra o retira un id del catálogo de botín, migrar pet_battles.reward" --body-file ids.md
```

Cuerpo de R4b: contrato heredado de la Parte II (R4b), lista de los seis ids con su dirección prevista (spec §7), prerrequisitos (R4a aceptada; #1106), y que necesita versión r4.2 con `freeze`. Cuerpo de ids: qué pasa hoy (`reward.itemId` guardado como texto, `isReward` descarta lo desconocido → el objeto desaparecería del inventario en silencio), cómo reproducir, y que la migración debe ser `update … set reward = jsonb_set(...)` por id antiguo.

Si la calibración de la Task 5 dejó algo fuera de banda o se descubrió cualquier cosa de refilón, abrirlo aquí también.

- [ ] **Step 5: Commit**

```bash
git add docs/requirements docs/design docs/architecture docs/superpowers/specs
git commit -m "docs(pet): R4a en data-model, backlog, decisiones, hoja de ruta y grafo; issues cerradas y abiertas"
```

---

### Task 14: Producción (bloqueada hasta la aceptación de R3 en #1106)

**Files:** ninguno nuevo. Migración `20260908_pet_adventures.sql` sobre `supabase-prod`; `docs/requirements/data-model.md` (fechas de prod).

- [ ] **Step 1: Precondiciones**

`#1106` cerrada con aceptación jugable del usuario; PR de R4a revisada y mergeada en `main`; puerto 3000 libre; `git worktree list` sin huérfanas.

- [ ] **Step 2: Aplicar en prod y verificar contra objetos reales**

Con el MCP `supabase-prod` (o el conector de claude.ai con el `project_id` de prod), `apply_migration` con el mismo fichero. Ejecutar la consulta de verificación del Step 4 de la Task 8. Expected: `3 | 3 | true | false | true | true | true`. Ejecutar además:

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (('public','get_pet_adventure_days'),('public','start_pet_adventure'),('public','resolve_pet_adventure'),('private','pet_adventure_days'),('private','pet_pending_adventure_days'));
```

Expected: `5`.

- [ ] **Step 3: Comprobación con una cuenta real**

Abrir `/mascota` en producción con la cuenta del usuario: la sección Aventuras muestra el recuento coherente con sus días de actividad de la semana; el entrenamiento sigue funcionando (r4.1 con un tramo). No hace falta jugar una aventura entera para dar por aplicada la migración; sí para la aceptación de R4a, que es del usuario.

- [ ] **Step 4: Documentar y cerrar**

`data-model.md` §8bis.5 y §8bis.7: `prod ✓ 2026-09-XX` con la fila de verificación. Casilla R4a del backlog: «en producción». Commit `docs(pet): R4a aplicada y verificada en prod`.

---

## Autoevaluación del plan (hecha al escribirlo)

- **Cobertura de la spec.** §1–§2 → Tasks 3–5 (decisiones encarnadas en motor y calibración) y 13 (docs). §3 motor → Tasks 3, 4, 6 (fixture), 2 (#1087), 1 (#1093). §4 persistencia → Task 8. §5 concesión → Task 8 (RPC y matriz) y 12 (RPC por PostgREST). §6 servicio → Tasks 8 (SQL), 10 (servicio/acciones), 12 (concurrencia real). §7 botín → Tasks 9, 8 (elección en SQL), 11 (tarjetas). §8 UI → Tasks 7 (sesión, log local, interludio), 11 (panel, sección, celebración, i18n, a11y), 10 (celebración). §9 fuera de alcance → Task 13 (issue R4b). §10 verificación → cada task lleva la suya; calibración en Task 5; e2e contra build en Task 12. §11 orden → el orden de las tasks. §12 definición de hecho → Tasks 13 y 14.
- **Desviaciones deliberadas de la spec, ya corregidas en ella o a corregir en la Task 8/13:** (a) las funciones de escritura están en `public`, no en `private` (PostgREST); (b) `chainLength` vive en `RULESET.adventure.chainLength` y el motor deriva los tramos de `enemies.length`, de modo que el entrenamiento y la aventura comparten versión; (c) `reward` guarda `{itemId, slot}` y `p_reward_order` es `jsonb`.
- **Consistencia de nombres entre tasks:** `pickEnemies`/`enemyList`/`parseEnemyList` (3, 5, 6, 7, 10, 11, 12); `validateInputs(raw, ruleset, fights)` (3, 4, 10); `rewardOrder`/`pickReward`/`inventoryFrom` (9, 10); `AdventureBattle.adventure.{day,attempt,reward}` (7 `TrainingBattle.adventure?`, 10, 11, 12); `awaitingContinue`/`continueFight` (7, 11); RPC `get_pet_adventure_days`, `start_pet_adventure(p_user,p_seed,p_intent,p_enemies,p_ruleset_version,p_content_hash,p_snapshot)`, `resolve_pet_adventure(p_user,p_intent,p_inputs,p_result,p_digest,p_reward_order)` (8, 10, 12); `data-testid`: `pet-adventures`, `adventure-pending`, `adventure-current`, `fight-marker`, `pet-inventory`, `training-tick` (11, 12).
- **Sin placeholders**, salvo `2026-09-XX` (fecha del día en que se ejecute cada paso) y el `contentHash` de r4.1, que solo existe cuando se ejecuta la Task 4/6 y el plan dice de dónde sale.
