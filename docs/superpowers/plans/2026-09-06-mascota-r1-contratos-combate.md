# Mascota R1 — contratos y modelo de combate: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el hito R1 de `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md` (Parte II): la spec ejecutable de R2, con sus tres criterios de salida — un ejemplo normativo completo (seed → inputs → eventos → bytes del hash → resultado), un test de integración que rechaza victorias fabricadas (JWT propio y otra cuenta) y un simulador por CLI con perfiles sintéticos que re-simula sin UI.

**Architecture:** El motor de combate es un paquete PURO en `src/lib/pet/battle/` (sin `Math.random`, sin `Date`, sin Supabase, sin React): PRNG xoshiro128** sembrado por un seed de 128 bits, reloj por ticks de 100 ms, log de inputs `(seq, tick, acción, payload)`, eventos derivados, resultado con causas. El cliente (R2) y el servidor ejecutan el mismo motor; el servidor re-simula seed + inputs y de ahí salen resultado y digest (SHA-256 de un JSON canónico que NO contiene el digest: sin circularidad). La tabla `pet_battles` guarda hechos (seed, snapshot, inputs, resultado, digest); `authenticated` solo lee lo suyo y no tiene NINGÚN grant de escritura — solo escribe el servidor con `service_role` (R2). R1 no tiene UI ni arte.

**Tech Stack:** TypeScript estricto (target ES2017, sin BigInt), Vitest 4 (entorno `node`), Playwright (fixture `request`, sin navegador), Supabase (Postgres + PostgREST, RLS), `crypto.subtle` (Node 22 y navegador), `tsx` para el CLI.

Diseño de referencia: `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md` — Parte I §2.5, §4, §6, §9.1, §16, §17, §18; Parte II «R1» y «R2». Issue de contratos: #1081 (este plan cierra sus puntos R1, R4, R5 y R6).

## Global Constraints

- **Rama:** `feat/mascota-r1-contratos` desde `main` (`bdcdd7c3` o posterior). Un commit por tarea, mensajes `feat(pet):` / `test(pet):` / `docs(pet):` / `chore(pet):`, terminados con la línea `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Node:** el shell de Git Bash NO trae `node` en el PATH y `fnm exec --using=22 npx …` falla («npx not found»). El estado no persiste entre llamadas: **cada comando** `node`/`npx`/`npm` de este plan va precedido, en la misma línea, por `NODE22="$(fnm exec --using=22 node -e "process.stdout.write(process.execPath)")" && export PATH="$(cygpath -u "$(dirname "$NODE22")"):$PATH" &&` (comprobado: node v22.23.2, npx 10.9.8, vitest 4.1.10, tsc 5.9.3). `.env.local` ya está copiado al worktree para los e2e.
- **Pureza del motor:** ningún fichero de `src/lib/pet/battle/` (salvo `*.test.ts`) contiene `Math.random`, `new Date(`, `Date.now`, `process.env` ni importa `@supabase/`. Lo vigila `purity.test.ts` (Task 11).
- **Solo enteros:** toda magnitud del motor es un entero seguro; los porcentajes se expresan en enteros (`%` o puntos básicos) y se aplican con `Math.floor`. `canonicalJson` lanza ante cualquier no-entero.
- **Números en un solo sitio:** todo número de combate vive en `src/lib/pet/battle/content.ts` (como `balance.ts` para la progresión). Cambiar un número = subir `RULESET.version` y regenerar el ejemplo normativo (Task 11).
- **Sin `use cache`** en nada que toque combates (regla #437: todo depende de la sesión).
- **Migraciones:** dev primero (`supabase-dev`), prod después de mergear; verificar contra objetos reales (`pg_class`, `pg_policies`, `has_table_privilege`), nunca contra `list_migrations`.
- **Sin UI, sin arte nuevo, sin recompensas:** R1 entrega motor, contratos, esquema, tests y simulador. La página, la server action y el replay visual son R2.
- **Verde antes de cada commit:** `npx vitest run src/lib/pet` y `npx tsc --noEmit`; `npm run lint` antes de la PR.
- **e2e:** arrancar `npm run dev` a mano en el puerto 3000 y esperar a que responda antes de `npx playwright test` (#1073). Un solo `next dev`.

---

## Contratos que fija este plan (normativo; la spec de la Task 14 los copia)

**C1. Autoridad.** El servidor crea el combate (seed, snapshot inmutable, versión, `intent_id`) y lo re-simula desde seed + inputs; solo de esa re-simulación salen resultado, digest y, en R4, recompensas. El cliente envía únicamente el log de inputs. `pet_battles` no tiene políticas ni grants de INSERT/UPDATE/DELETE para `authenticated` ni `anon`; escribe solo `service_role` desde el servidor. Ninguna RPC accesible al cliente inserta combates (#1081 R1).

**C2. Seed y PRNG.** Seed = 32 caracteres hex en minúsculas (128 bits), generado por el servidor; se rechaza el seed todo ceros. PRNG xoshiro128** con estado = las cuatro palabras big-endian del seed. Tiradas: `nextU32`, `nextInt(lo, hi)` = `lo + u32 % (hi − lo + 1)` (módulo directo, normativo), `nextBp` = `u32 % 10000`. **Orden de consumo:** tirada 1 en `createBattle` (reposo inicial); después, en cada transición del enemigo: al entrar en reposo una tirada `nextInt(idleMin, idleMax)`, al salir del reposo una tirada `nextBp` (carga si `< chargeBp`, guardia si no). Añadir una tirada exige subir `RULESET.version`. Sub-flujos (minijuegos): `subStream(seed, etiqueta, tick)`.

**C3. Reloj.** `tickMs = 100`; `maxTicks = 600` (60 s); segundos = `ticks × tickMs / 1000`. Los cooldowns cuentan ticks de simulación: pausar no avanza ticks.

**C4. Log de inputs.** Lista de `{ seq, tick, action, payload }`: `seq` = índice (0, 1, 2…), `tick` entero en `[0, maxTicks]` no decreciente, `action ∈ {"skill"}` en R2, `payload` objeto plano con valores enteros o cadenas (`{}` en R2). Máximo 64 inputs. Todo input debe caer en un tick simulado: un input posterior al fin del combate invalida el log (`INPUTS_AFTER_END`). Dos inputs en el mismo tick se procesan en orden de `seq`.

**C5. Orden de resolución de un tick T** (`stepBattle`): (0) en T = 0, `BATTLE_STARTED`; (1) transiciones del enemigo cuyo `phaseUntil === T` — primero expiran/resuelven (carga que aterriza, guardia que termina, aturdimiento que expira → reposo), y un reposo que termina elige anuncio; (2) inputs de T en orden de `seq`; (3) básica de la mascota si `T === nextBasic`; (4) básica del enemigo si está en reposo y `T === nextBasic`; (5) si `T === maxTicks`, fin por límite. Un KO termina el tick en el acto: nada posterior se procesa. El daño registrado en un evento es el efectivo (acotado a la vida restante): la vida nunca es negativa.

**C6. Kit genérico de R2.** Mascota: básica cada 15 ticks, daño `atk`; habilidad «pulsar ahora» con cooldown 90 ticks: durante la carga del enemigo (`windup`) la interrumpe y hace `4 × atk` (el enemigo queda aturdido 20 ticks); durante la guardia se desperdicia (0 daño) y el enemigo castiga con el 25 % de la vida máxima de la mascota; en reposo o aturdimiento hace `2 × atk`. Con cooldown: `SKILL_IGNORED`. Enemigo «Brote de zarza»: vida `42 × atk`; en reposo (20–40 ticks) pega cada 20 ticks el 4 % de la vida máxima de la mascota; anuncia con probabilidad 50/50 una **carga** (15 ticks; si aterriza, 40 % de la vida máxima) o una **guardia** (25 ticks; las básicas de la mascota hacen `max(1, floor(atk / 4))`). Ventana de interrupción: ticks `[inicio, resolvesAt − 1]`; un input en `resolvesAt` llega tarde.

**C7. Poder de combate.** `combatPower = Σ` de los seis atributos **sin bonus de clase**; `tier = levelFor(combatPower)` (misma curva que el nivel, sobre otra magnitud; no es el nivel visible y no se guarda). `hpMax = 100 + 10 × tier`, `atk = 8 + 2 × tier`. En R2 la clase no altera stats (identidad de clase = R6); los seis perfiles sintéticos comprueban que la decisión correcta gana en todos los tramos (#1081 R6).

**C8. Fin y resultado.** KO del que llega a 0. En el límite gana quien conserve mayor fracción de vida (`petHp × enemyHpMax` frente a `enemyHp × petHpMax`), empate = `draw`. `BattleResult` lleva `outcome`, `reason`, `ticks`, vidas, daño hecho y recibido y hasta dos `causes` (victoria: `charges_interrupted` o `steady_damage`; derrota: `skill_unused` si nunca se pulsó y aterrizó alguna carga, después `charges_landed` / `skill_wasted_on_guard` por daño, y `time_limit`).

**C9. Canónico y digest.** `canonicalJson`: claves ordenadas por code units, sin espacios, solo enteros seguros, sin `undefined` (lanza). `digest = sha256(canonicalJson({ rulesetVersion, contentHash, enemyId, seed, snapshot, inputs, events, result }))` en hex; los `events` son los re-simulados y el material NO contiene el digest. `contentHash = sha256(canonicalJson({ ruleset, enemies }))`. Reproducir eventos guardados no sustituye a re-simular: la BD no guarda eventos.

**C10. Identificador por intención.** `intent_id` (uuid v4 generado por el cliente por cada intención de combatir) con `unique (user_id, intent_id)`: un reintento con el mismo `intent_id` recupera el combate en vez de crear otro. El identificador no da al cliente autoridad sobre seed ni resultado (#1081 R4). El flujo en R2: `startBattle(intentId)` → fila `open` (seed, snapshot, versión, hash) → cliente simula → `resolveBattle(intentId, inputs)` → el servidor valida, re-simula, escribe `inputs`, `result`, `digest`, `status = resolved`.

**C11. Minijuego (para R3).** `minigameInstance(seed, tick, familia)` deriva la instancia de `subStream(seed, "ulti:" + familia, tick)`: `k ≤ 4` fichas, `tokens` en el orden mostrado y `solution` (ficha → hueco). El servidor la regenera y puntúa la asignación enviada; el cliente nunca envía una puntuación.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `src/lib/pet/battle/prng.ts` | xoshiro128**, seeds, `nextInt`/`nextBp`, `subStream`, `seedFromIndex` |
| `src/lib/pet/battle/canonical.ts` | `canonicalJson` |
| `src/lib/pet/battle/hash.ts` | `sha256Hex` sobre `crypto.subtle` |
| `src/lib/pet/battle/types.ts` | todos los tipos compartidos del motor y del registro |
| `src/lib/pet/battle/content.ts` | `RULESET`, `BROTE`, `ENEMIES`, `contentHash()` — el único sitio con números |
| `src/lib/pet/battle/power.ts` | poder sin bonus, tramo, stats, `buildSnapshot` |
| `src/lib/pet/battle/profiles.ts` | seis perfiles sintéticos como `PetCounts` |
| `src/lib/pet/battle/inputs.ts` | `validateInputs` |
| `src/lib/pet/battle/engine.ts` | `createBattle`, `stepBattle`, `viewOf`, `simulate` |
| `src/lib/pet/battle/policies.ts` | políticas `never` / `spam` / `interrupt`, `runPolicy` |
| `src/lib/pet/battle/calibration.ts` | matriz perfil × clase × política, umbrales, informe |
| `src/lib/pet/battle/record.ts` | `battleDigest`, `resimulate` |
| `src/lib/pet/battle/minigame.ts` | `minigameInstance`, `scoreAssignment` |
| `src/lib/pet/battle/__fixtures__/normative.json` | el ejemplo normativo (generado por el CLI, congelado por test) |
| `scripts/pet-battle/simulate.ts` | CLI: `run`, `calibrate`, `replay`, `golden` |
| `supabase/migrations/20260907_pet_battles.sql` | tabla, RLS de lectura propia, sin grants de escritura |
| `e2e/mascota-batallas-autoridad.spec.ts` | test de integración de autoridad (dos cuentas + anónimo) |
| `docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md` | la spec ejecutable de R2 |

Tests unitarios junto a cada módulo (`<módulo>.test.ts`), patrón `derive.test.ts` (Vitest, `describe`/`it` en castellano).

---

### Task 1: Rama, `tsx` y PRNG determinista

**Files:**
- Create: `src/lib/pet/battle/prng.ts`
- Test: `src/lib/pet/battle/prng.test.ts`
- Modify: `package.json` (devDependency `tsx`, script `pet:battle`)

**Interfaces:**
- Produces: `PrngState { s: [number, number, number, number] }`, `isSeed(x): x is string`, `seedFromHex(seed): PrngState` (lanza `INVALID_SEED`), `seedFromIndex(i): string`, `nextU32(st): number`, `nextInt(st, lo, hi): number` (ambos incluidos), `nextBp(st): number` (0..9999), `subStream(seed, label, tick): PrngState`.

- [ ] **Step 1: Crear la rama y añadir `tsx`**

```bash
git checkout -b feat/mascota-r1-contratos main
npm install --save-dev tsx@^4
```

En `package.json`, dentro de `"scripts"`, añadir tras `"test:e2e:club"`:

```json
    "pet:battle": "tsx scripts/pet-battle/simulate.ts"
```

- [ ] **Step 2: Escribir el test del PRNG**

`src/lib/pet/battle/prng.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSeed, nextBp, nextInt, nextU32, seedFromHex, seedFromIndex, subStream } from "./prng";

const SEED = "0123456789abcdef0123456789abcdef";

describe("seedFromHex", () => {
  it("acepta 32 hex en minúsculas y rechaza lo demás", () => {
    expect(isSeed(SEED)).toBe(true);
    expect(isSeed(SEED.toUpperCase())).toBe(false);
    expect(isSeed(SEED.slice(1))).toBe(false);
    expect(() => seedFromHex("0".repeat(32))).toThrow("INVALID_SEED");
    expect(() => seedFromHex("zz")).toThrow("INVALID_SEED");
  });

  it("parte el seed en cuatro palabras big-endian", () => {
    expect(seedFromHex(SEED).s).toEqual([0x01234567, 0x89abcdef, 0x01234567, 0x89abcdef]);
  });
});

describe("xoshiro128**", () => {
  // Vector calculado a mano en el plan (Task 1): s1·5 = 0xB05B05AB, rotl7 = 0x2D82D5D8,
  // ·9 = 0x99998498. Si falla, revisar la implementación contra el C de referencia
  // ANTES de tocar este número.
  it("primera tirada del seed de referencia", () => {
    expect(nextU32(seedFromHex(SEED))).toBe(0x99998498);
  });

  it("es determinista y distinto por seed", () => {
    const a = seedFromHex(SEED);
    const b = seedFromHex(SEED);
    const c = seedFromHex("fedcba9876543210fedcba9876543210");
    const seqA = [nextU32(a), nextU32(a), nextU32(a)];
    const seqB = [nextU32(b), nextU32(b), nextU32(b)];
    const seqC = [nextU32(c), nextU32(c), nextU32(c)];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it("nextInt y nextBp respetan sus rangos", () => {
    const st = seedFromHex(SEED);
    for (let i = 0; i < 10_000; i++) {
      const n = nextInt(st, 20, 40);
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(40);
      const bp = nextBp(st);
      expect(bp).toBeGreaterThanOrEqual(0);
      expect(bp).toBeLessThan(10_000);
    }
  });
});

describe("subStream", () => {
  it("mismo (seed, etiqueta, tick) → misma secuencia; otro tick u otra etiqueta → otra", () => {
    const a = subStream(SEED, "ulti:A", 120);
    const b = subStream(SEED, "ulti:A", 120);
    expect(nextU32(a)).toBe(nextU32(b));
    expect(nextU32(subStream(SEED, "ulti:A", 120))).not.toBe(nextU32(subStream(SEED, "ulti:A", 121)));
    expect(nextU32(subStream(SEED, "ulti:A", 120))).not.toBe(nextU32(subStream(SEED, "ulti:B", 120)));
  });

  it("no toca el flujo principal", () => {
    const main = seedFromHex(SEED);
    const before = [...main.s];
    subStream(SEED, "ulti:A", 5);
    expect(main.s).toEqual(before);
  });
});

describe("seedFromIndex", () => {
  it("da seeds válidos, distintos y estables", () => {
    expect(isSeed(seedFromIndex(0))).toBe(true);
    expect(seedFromIndex(0)).toBe(seedFromIndex(0));
    expect(seedFromIndex(0)).not.toBe(seedFromIndex(1));
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/pet/battle/prng.test.ts`
Expected: FAIL — `Failed to resolve import "./prng"`.

- [ ] **Step 4: Implementar `prng.ts`**

```ts
// PRNG del combate (Parte I §16.1): xoshiro128** sembrado con 128 bits. Sin
// Math.random en ningún sitio del motor. Cada tirada tiene un orden documentado
// (contrato C2): añadir una exige subir RULESET.version.

export interface PrngState {
  /** Cuatro palabras uint32; nunca las cuatro a cero. */
  s: [number, number, number, number];
}

const SEED_RE = /^[0-9a-f]{32}$/;

export function isSeed(x: unknown): x is string {
  return typeof x === "string" && SEED_RE.test(x);
}

/** 32 hex → estado (big-endian por palabra). Lanza INVALID_SEED si no es hex o es todo ceros. */
export function seedFromHex(seed: string): PrngState {
  if (!isSeed(seed)) throw new Error("INVALID_SEED");
  const s = [0, 1, 2, 3].map((i) => parseInt(seed.slice(i * 8, i * 8 + 8), 16) >>> 0) as [
    number,
    number,
    number,
    number,
  ];
  if (s.every((w) => w === 0)) throw new Error("INVALID_SEED");
  return { s };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Referencia (Blackman & Vigna): result = rotl(s1·5, 7)·9; t = s1 << 9;
 *  s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11). */
export function nextU32(st: PrngState): number {
  const s = st.s;
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Entero en [lo, hi], ambos incluidos. Módulo directo a propósito: el sesgo es
 *  despreciable con rangos < 2^16 y la simplicidad es parte del contrato. */
export function nextInt(st: PrngState, lo: number, hi: number): number {
  return lo + (nextU32(st) % (hi - lo + 1));
}

/** Puntos básicos 0..9999, para comparar con probabilidades enteras. */
export function nextBp(st: PrngState): number {
  return nextU32(st) % 10_000;
}

function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Sub-flujo derivado de (seed, etiqueta, tick): mismo triple → misma secuencia,
 *  independiente del flujo principal. Para instancias de minijuego (§16.3). */
export function subStream(seed: string, label: string, tick: number): PrngState {
  const base = seedFromHex(seed).s;
  const mix = splitmix32((fnv1a32(label) ^ (tick >>> 0)) >>> 0);
  const s = base.map((w) => (w ^ mix()) >>> 0) as [number, number, number, number];
  if (s.every((w) => w === 0)) s[0] = 1;
  return { s };
}

/** Seeds reproducibles para tests y calibración: el i-ésimo siempre es el mismo. */
export function seedFromIndex(i: number): string {
  const mix = splitmix32(i >>> 0);
  let hex = "";
  for (let k = 0; k < 4; k++) hex += mix().toString(16).padStart(8, "0");
  return hex === "0".repeat(32) ? seedFromIndex(i + 1) : hex;
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/pet/battle/prng.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/pet/battle/prng.ts src/lib/pet/battle/prng.test.ts
git commit -m "feat(pet): PRNG xoshiro128** del combate y dependencia tsx (R1)"
```

---

### Task 2: JSON canónico y SHA-256

**Files:**
- Create: `src/lib/pet/battle/canonical.ts`, `src/lib/pet/battle/hash.ts`
- Test: `src/lib/pet/battle/canonical.test.ts`, `src/lib/pet/battle/hash.test.ts`

**Interfaces:**
- Produces: `canonicalJson(value: unknown): string` (lanza `CANON_NOT_INTEGER`, `CANON_UNDEFINED`, `CANON_TYPE`); `sha256Hex(text: string): Promise<string>` (64 hex).

- [ ] **Step 1: Tests**

`src/lib/pet/battle/canonical.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";

describe("canonicalJson", () => {
  it("ordena claves, no mete espacios y anida", () => {
    expect(canonicalJson({ b: 1, a: { z: [1, "x", null], y: true } })).toBe(
      '{"a":{"y":true,"z":[1,"x",null]},"b":1}',
    );
  });

  it("el orden de inserción no cambia la salida", () => {
    expect(canonicalJson({ tick: 5, seq: 0 })).toBe(canonicalJson({ seq: 0, tick: 5 }));
  });

  it("solo enteros seguros", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(() => canonicalJson(1.5)).toThrow("CANON_NOT_INTEGER");
    expect(() => canonicalJson(NaN)).toThrow("CANON_NOT_INTEGER");
    expect(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1)).toThrow("CANON_NOT_INTEGER");
  });

  it("rechaza undefined y tipos no JSON en vez de omitirlos", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow("CANON_UNDEFINED");
    expect(() => canonicalJson(() => 1)).toThrow("CANON_TYPE");
    expect(() => canonicalJson(Symbol("x"))).toThrow("CANON_TYPE");
  });

  it("escapa cadenas como JSON", () => {
    expect(canonicalJson('a"b\n')).toBe('"a\\"b\\n"');
  });
});
```

`src/lib/pet/battle/hash.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("vectores conocidos", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/lib/pet/battle/canonical.test.ts src/lib/pet/battle/hash.test.ts`
Expected: FAIL — imports sin resolver.

- [ ] **Step 3: Implementar**

`src/lib/pet/battle/canonical.ts`:

```ts
// JSON canónico (contrato C9): la misma estructura produce SIEMPRE los mismos
// bytes. Claves ordenadas por code units (Object.keys().sort()), sin espacios,
// solo enteros seguros. Lo ambiguo se rechaza, no se repara: un float o un
// undefined en un registro de combate es un bug del que lo construyó.

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Error("CANON_NOT_INTEGER");
      return Object.is(value, -0) ? "0" : String(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(record).sort()) {
        const v = record[key];
        if (v === undefined) throw new Error("CANON_UNDEFINED");
        parts.push(JSON.stringify(key) + ":" + canonicalJson(v));
      }
      return "{" + parts.join(",") + "}";
    }
    default:
      throw new Error("CANON_TYPE");
  }
}
```

`src/lib/pet/battle/hash.ts`:

```ts
// SHA-256 en hex sobre UTF-8, con crypto.subtle: existe en Node 22 y en el
// navegador (contexto seguro: localhost y https). Es async y por eso vive fuera
// del motor: el motor es síncrono y puro; el digest se calcula sobre su salida.

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Ver que pasan**

Run: `npx vitest run src/lib/pet/battle/canonical.test.ts src/lib/pet/battle/hash.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/battle/canonical.ts src/lib/pet/battle/canonical.test.ts src/lib/pet/battle/hash.ts src/lib/pet/battle/hash.test.ts
git commit -m "feat(pet): JSON canónico y sha256 para el digest de combate (R1)"
```

---

### Task 3: Tipos del motor y contenido (el único sitio con números)

**Files:**
- Create: `src/lib/pet/battle/types.ts`, `src/lib/pet/battle/content.ts`
- Test: `src/lib/pet/battle/content.test.ts`

**Interfaces:**
- Consumes: `PrngState` (Task 1), `canonicalJson` y `sha256Hex` (Task 2), `PetAttributes`, `PetClass`, `PetStage` de `src/lib/pet/classes.ts`.
- Produces: todos los tipos de abajo; `RULESET: Ruleset`, `BROTE: EnemyDef`, `ENEMIES: Record<string, EnemyDef>`, `contentHash(): Promise<string>`.

- [ ] **Step 1: Escribir `types.ts`**

```ts
// Tipos del combate (Parte I §16; contratos C3–C10 del plan R1). Todo entero.
import type { PetAttributes, PetClass, PetStage } from "../classes";
import type { PrngState } from "./prng";

/** R2: una sola acción. R3 añade "ulti" y "ulti_assign". */
export type BattleAction = "skill";

/** Una entrada del log (C4). `payload` vacío en R2; valores enteros o cadenas. */
export interface BattleInput {
  seq: number;
  tick: number;
  action: BattleAction;
  payload: Record<string, number | string>;
}

/** Foto inmutable de la mascota al crear el combate; se guarda en pet_battles.snapshot. */
export interface BattleSnapshot {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  /** Atributos crudos, sin bonus de clase. */
  attributes: PetAttributes;
  /** powerTier(attributes): NO es el nivel visible (C7). */
  tier: number;
  hpMax: number;
  atk: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** vida = hpPerAtk × atk de la mascota */
  hpPerAtk: number;
  /** básica en reposo = % de la vida máxima de la mascota */
  basicPct: number;
  /** carga no interrumpida = % de la vida máxima */
  chargePct: number;
  /** castigo por habilidad durante la guardia = % de la vida máxima */
  punishPct: number;
  /** probabilidad de carga (frente a guardia), en puntos básicos */
  chargeBp: number;
  idleMin: number;
  idleMax: number;
  windupTicks: number;
  guardTicks: number;
  staggerTicks: number;
  /** ticks entre básicas del enemigo en reposo */
  basicInterval: number;
}

export interface Ruleset {
  version: string;
  tickMs: number;
  maxTicks: number;
  maxInputs: number;
  pet: {
    basicInterval: number;
    skillCooldown: number;
    skillIdleMul: number;
    skillInterruptMul: number;
    guardBasicDiv: number;
  };
}

export type EnemyPhase = "idle" | "windup" | "guard" | "stagger";
export type TelegraphKind = "charge" | "guard";
export type SkillEffect = "interrupt" | "hit" | "wasted";
export type BattleOutcome = "win" | "lose" | "draw";
export type EndReason = "ko" | "limit";
export type BattleCause =
  | "charges_landed"
  | "skill_wasted_on_guard"
  | "skill_unused"
  | "charges_interrupted"
  | "steady_damage"
  | "time_limit";

interface Ev<T extends string> {
  seq: number;
  tick: number;
  type: T;
}

export type BattleEvent =
  | (Ev<"BATTLE_STARTED"> & { petHp: number; enemyHp: number })
  | (Ev<"PET_BASIC"> & { damage: number; enemyHp: number; guarded: boolean })
  | (Ev<"ENEMY_BASIC"> & { damage: number; petHp: number })
  | (Ev<"TELEGRAPH_STARTED"> & { kind: TelegraphKind; resolvesAt: number })
  | (Ev<"TELEGRAPH_RESOLVED"> & { kind: TelegraphKind; damage: number; petHp: number })
  | (Ev<"SKILL_USED"> & { effect: SkillEffect; damage: number; enemyHp: number; petHp: number })
  | (Ev<"SKILL_IGNORED"> & { reason: "cooldown" })
  | (Ev<"STATUS_APPLIED"> & { status: "stagger"; until: number })
  | (Ev<"STATUS_EXPIRED"> & { status: "stagger" })
  | (Ev<"BATTLE_ENDED"> & { outcome: BattleOutcome; reason: EndReason; petHp: number; enemyHp: number });

export interface BattleResult {
  outcome: BattleOutcome;
  reason: EndReason;
  ticks: number;
  petHp: number;
  petHpMax: number;
  enemyHp: number;
  enemyHpMax: number;
  damageDealt: number;
  damageTaken: number;
  /** Hasta dos causas (C8), para el resultado legible de R2. */
  causes: BattleCause[];
}

export interface BattleState {
  tick: number;
  nextSeq: number;
  ended: boolean;
  rng: PrngState;
  pet: { hp: number; hpMax: number; atk: number; nextBasic: number; skillReadyAt: number; skillUses: number };
  enemy: { hp: number; hpMax: number; phase: EnemyPhase; phaseUntil: number; nextBasic: number };
  tally: { chargesLanded: number; chargesInterrupted: number; skillWasted: number; damageDealt: number; damageTaken: number };
  result: BattleResult | null;
}

/** Lo que un cliente sabe legítimamente en cada tick: alimenta la UI (R2) y las políticas del simulador. */
export interface BattleView {
  tick: number;
  petHp: number;
  petHpMax: number;
  enemyHp: number;
  enemyHpMax: number;
  enemyPhase: EnemyPhase;
  enemyPhaseUntil: number;
  skillReadyAt: number;
  ended: boolean;
}

export interface BattleInit {
  seed: string;
  snapshot: BattleSnapshot;
  enemy: EnemyDef;
  ruleset: Ruleset;
}

/** Lo que se persiste (pet_battles) y lo que firma el digest junto a los eventos re-simulados (C9). */
export interface BattleRecord {
  rulesetVersion: string;
  contentHash: string;
  enemyId: string;
  seed: string;
  snapshot: BattleSnapshot;
  inputs: BattleInput[];
  result: BattleResult;
}
```

- [ ] **Step 2: Test del contenido**

`src/lib/pet/battle/content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BROTE, ENEMIES, RULESET, contentHash } from "./content";

describe("contenido de combate", () => {
  it("los números son enteros y el anuncio es 50/50", () => {
    const flat = [
      RULESET.tickMs, RULESET.maxTicks, RULESET.maxInputs,
      ...Object.values(RULESET.pet),
      BROTE.hpPerAtk, BROTE.basicPct, BROTE.chargePct, BROTE.punishPct, BROTE.chargeBp,
      BROTE.idleMin, BROTE.idleMax, BROTE.windupTicks, BROTE.guardTicks, BROTE.staggerTicks, BROTE.basicInterval,
    ];
    expect(flat.every((n) => Number.isSafeInteger(n) && n > 0)).toBe(true);
    expect(BROTE.chargeBp).toBe(5000);
    expect(BROTE.idleMin).toBeLessThanOrEqual(BROTE.idleMax);
    expect(ENEMIES[BROTE.id]).toBe(BROTE);
  });

  // Si esto cambia, cambió el contenido: hay que subir RULESET.version y regenerar
  // el ejemplo normativo (Task 11). Vitest rellena el snapshot en la primera pasada.
  it("el hash del contenido está fijado", async () => {
    expect(RULESET.version).toBe("r2.1");
    expect(await contentHash()).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 3: Ver que falla**

Run: `npx vitest run src/lib/pet/battle/content.test.ts`
Expected: FAIL — `./content` sin resolver.

- [ ] **Step 4: Escribir `content.ts`**

```ts
// EL ÚNICO sitio con números del combate (como balance.ts para la progresión).
// Contrato C6 del plan R1. Cambiar cualquiera = subir `version` y regenerar el
// ejemplo normativo: el contentHash cambia y normative.test.ts lo dice.
import { canonicalJson } from "./canonical";
import { sha256Hex } from "./hash";
import type { EnemyDef, Ruleset } from "./types";

export const RULESET: Ruleset = {
  version: "r2.1",
  tickMs: 100,
  maxTicks: 600,
  maxInputs: 64,
  pet: {
    basicInterval: 15,
    skillCooldown: 90,
    skillIdleMul: 2,
    skillInterruptMul: 4,
    guardBasicDiv: 4,
  },
};

/** El enemigo de R2: dos anuncios contrarios (§4.3). Carga que conviene
 *  interrumpir, guardia durante la que conviene esperar. */
export const BROTE: EnemyDef = {
  id: "brote",
  name: "Brote de zarza",
  hpPerAtk: 42,
  basicPct: 4,
  chargePct: 40,
  punishPct: 25,
  chargeBp: 5000,
  idleMin: 20,
  idleMax: 40,
  windupTicks: 15,
  guardTicks: 25,
  staggerTicks: 20,
  basicInterval: 20,
};

export const ENEMIES: Record<string, EnemyDef> = { [BROTE.id]: BROTE };

/** Hash del contenido con el que se simula; se guarda con cada combate (C9). */
export function contentHash(): Promise<string> {
  return sha256Hex(canonicalJson({ ruleset: RULESET, enemies: ENEMIES }));
}
```

- [ ] **Step 5: Ejecutar dos veces**

Run: `npx vitest run src/lib/pet/battle/content.test.ts`
Expected: la primera pasada escribe el inline snapshot en el test (Vitest lo rellena: `toMatchInlineSnapshot('"<64 hex>"')`); la segunda pasada PASS (2 tests) sin cambios en el fichero.

- [ ] **Step 6: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/lib/pet/battle/types.ts src/lib/pet/battle/content.ts src/lib/pet/battle/content.test.ts
git commit -m "feat(pet): tipos del motor de combate y contenido de R2 con hash (R1)"
```

---

### Task 4: Poder de combate sin bonus de clase y perfiles sintéticos

**Files:**
- Create: `src/lib/pet/battle/power.ts`, `src/lib/pet/battle/profiles.ts`
- Test: `src/lib/pet/battle/power.test.ts`, `src/lib/pet/battle/profiles.test.ts`

**Interfaces:**
- Consumes: `deriveAttributes`, `levelFor`, `xpFor` de `../derive`; `PetCounts`, `EMPTY_COUNTS` de `../counts`; `PET_ATTRIBUTES`, `PET_CLASSES` de `../classes`; `BattleSnapshot`, `EnemyDef` (Task 3).
- Produces: `combatPower(attrs): number`, `powerTier(attrs): number`, `fighterStats(tier): { hpMax; atk }`, `enemyStats(enemy, pet: { hpMax; atk }): { hpMax; basic; charge; punish }`, `buildSnapshot({ name, petClass, stage, attributes }): BattleSnapshot`; `ProfileId`, `PROFILE_IDS`, `SYNTHETIC_PROFILES`, `snapshotForProfile(id, petClass): BattleSnapshot`.

- [ ] **Step 1: Tests**

`src/lib/pet/battle/power.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "../classes";
import { EMPTY_COUNTS } from "../counts";
import { deriveAttributes, levelFor, xpFor } from "../derive";
import { BROTE } from "./content";
import { buildSnapshot, combatPower, enemyStats, fighterStats, powerTier } from "./power";

const attrs = deriveAttributes({ ...EMPTY_COUNTS, sessionUnits: 300, finishedPasses: 20, notes: 30 });

describe("combatPower / powerTier", () => {
  it("suma los seis atributos sin bonus de clase", () => {
    expect(combatPower(attrs)).toBe(attrs.FUE + attrs.CON + attrs.INT + attrs.SAB + attrs.CAR + attrs.DES);
    expect(powerTier(attrs)).toBe(levelFor(combatPower(attrs)));
  });

  it("el nivel visible sí depende de la clase; el tramo no (#1081 R6)", () => {
    const levels = new Set(PET_CLASSES.map((cls) => levelFor(xpFor(attrs, cls))));
    expect(levels.size).toBeGreaterThan(1);
    // Sin bonus (×1,5) el tramo nunca supera el mejor nivel visible entre las seis clases.
    expect(powerTier(attrs)).toBeLessThanOrEqual(Math.max(...PET_CLASSES.map((cls) => levelFor(xpFor(attrs, cls)))));
    expect(combatPower(deriveAttributes(EMPTY_COUNTS))).toBe(0);
    expect(powerTier(deriveAttributes(EMPTY_COUNTS))).toBe(1);
  });
});

describe("stats", () => {
  it("crecen con el tramo y el enemigo escala con la mascota", () => {
    const t1 = fighterStats(1);
    const t14 = fighterStats(14);
    expect(t1).toEqual({ hpMax: 110, atk: 10 });
    expect(t14).toEqual({ hpMax: 240, atk: 36 });
    expect(enemyStats(BROTE, t1)).toEqual({ hpMax: 420, basic: 4, charge: 44, punish: 27 });
    expect(enemyStats(BROTE, t14)).toEqual({ hpMax: 1512, basic: 9, charge: 96, punish: 60 });
  });

  it("buildSnapshot copia atributos y deriva tramo y stats", () => {
    const s = buildSnapshot({ name: "Nuez", petClass: "wizard", stage: "adult", attributes: attrs });
    expect(s.tier).toBe(powerTier(attrs));
    expect(s.hpMax).toBe(fighterStats(s.tier).hpMax);
    expect(s.attributes).toEqual(attrs);
    expect(s.attributes).not.toBe(attrs);
  });
});
```

`src/lib/pet/battle/profiles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROFILE_IDS, SYNTHETIC_PROFILES, snapshotForProfile } from "./profiles";

describe("perfiles sintéticos", () => {
  it("cubren el rango de tramos: nueva en 1, importadora abajo, seriéfila y lectora arriba", () => {
    const tier = (id: (typeof PROFILE_IDS)[number]) => snapshotForProfile(id, "wizard").tier;
    expect(tier("nueva")).toBe(1);
    expect(tier("importadora")).toBeLessThan(tier("cinefila"));
    expect(tier("cinefila")).toBeLessThan(tier("lectora_larga"));
    expect(tier("social")).toBeLessThan(tier("lectora_larga"));
    expect(tier("seriefila")).toBeGreaterThanOrEqual(tier("lectora_larga"));
    expect(tier("seriefila")).toBeLessThanOrEqual(16);
  });

  it("la dote del historial va con tope: la importadora no domina por volumen", () => {
    expect(SYNTHETIC_PROFILES.importadora.counts.historicalPasses).toBeGreaterThan(50);
    expect(snapshotForProfile("importadora", "wizard").tier).toBeLessThanOrEqual(7);
  });

  it("la clase cambia el nombre de la ficha, no el tramo", () => {
    expect(snapshotForProfile("social", "bard").tier).toBe(snapshotForProfile("social", "barbarian").tier);
    expect(PROFILE_IDS).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/lib/pet/battle/power.test.ts src/lib/pet/battle/profiles.test.ts`
Expected: FAIL — imports sin resolver.

- [ ] **Step 3: Implementar `power.ts`**

```ts
// Poder de combate (contrato C7, #1081 R6): magnitud interna SIN bonus de clase.
// El nivel visible (xpFor + levelFor) no se toca (Parte I §2.3); esto escala al
// enemigo y nada más. No se guarda: se deriva al crear el combate y viaja en el
// snapshot.
import { PET_ATTRIBUTES, type PetAttributes, type PetClass, type PetStage } from "../classes";
import { levelFor } from "../derive";
import type { BattleSnapshot, EnemyDef } from "./types";

export function combatPower(attrs: PetAttributes): number {
  let power = 0;
  for (const key of PET_ATTRIBUTES) power += Math.max(0, Math.round(attrs[key]));
  return power;
}

/** Misma curva que el nivel (levelFor) sobre el poder sin bonus. */
export function powerTier(attrs: PetAttributes): number {
  return levelFor(combatPower(attrs));
}

export function fighterStats(tier: number): { hpMax: number; atk: number } {
  return { hpMax: 100 + 10 * tier, atk: 8 + 2 * tier };
}

/** El enemigo se mide contra la mascota: vida en múltiplos de su atk, golpes en % de su vida. */
export function enemyStats(
  enemy: EnemyDef,
  pet: { hpMax: number; atk: number },
): { hpMax: number; basic: number; charge: number; punish: number } {
  return {
    hpMax: enemy.hpPerAtk * pet.atk,
    basic: Math.floor((pet.hpMax * enemy.basicPct) / 100),
    charge: Math.floor((pet.hpMax * enemy.chargePct) / 100),
    punish: Math.floor((pet.hpMax * enemy.punishPct) / 100),
  };
}

export function buildSnapshot(p: {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  attributes: PetAttributes;
}): BattleSnapshot {
  const tier = powerTier(p.attributes);
  const { hpMax, atk } = fighterStats(tier);
  return { name: p.name, petClass: p.petClass, stage: p.stage, attributes: { ...p.attributes }, tier, hpMax, atk };
}
```

- [ ] **Step 4: Implementar `profiles.ts`**

```ts
// Perfiles sintéticos (Parte II «Cómo se usa esta parte»): contadores plausibles
// para calibrar sin mirar cuentas reales. Se construyen con deriveAttributes, así
// que si cambia balance.ts cambian con él.
import type { PetClass } from "../classes";
import { EMPTY_COUNTS, type PetCounts } from "../counts";
import { deriveAttributes } from "../derive";
import { buildSnapshot } from "./power";
import type { BattleSnapshot } from "./types";

export const PROFILE_IDS = ["nueva", "importadora", "cinefila", "social", "lectora_larga", "seriefila"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export const SYNTHETIC_PROFILES: Record<ProfileId, { label: string; counts: PetCounts }> = {
  nueva: {
    label: "Recién eclosionada",
    counts: { ...EMPTY_COUNTS, sessionUnits: 2, activeDays: 1 },
  },
  importadora: {
    label: "Importadora de historial",
    counts: { ...EMPTY_COUNTS, historicalPasses: 400, historicalWorks: 400, finishedPasses: 2, activeDays: 5, ratings: 300 },
  },
  cinefila: {
    label: "Espectadora de películas",
    counts: { ...EMPTY_COUNTS, sessionUnits: 120, finishedPasses: 80, distinctGenres: 12, activeDays: 90, notes: 5, ratings: 80, newWorks: 80, newAuthors: 30 },
  },
  social: {
    label: "Usuaria social",
    counts: { ...EMPTY_COUNTS, posts: 150, votes: 300, polls: 10, events: 8, follows: 40, activeDays: 120, finishedPasses: 10, reviews: 12, newWorks: 15 },
  },
  lectora_larga: {
    label: "Lectora de libros largos",
    counts: { ...EMPTY_COUNTS, sessionUnits: 400, activeDays: 200, dailyGoalDays: 120, streakMilestones: 6, finishedPasses: 30, completedSagas: 2, distinctGenres: 8, notes: 40, quotes: 20, reviews: 10, ratings: 30, posts: 5, follows: 3, newWorks: 35, newAuthors: 20 },
  },
  seriefila: {
    label: "Consumidora de series",
    counts: { ...EMPTY_COUNTS, episodes: 600, activeDays: 150, dailyGoalDays: 40, finishedPasses: 15, distinctGenres: 6, ratings: 15, newWorks: 20 },
  },
};

export function snapshotForProfile(id: ProfileId, petClass: PetClass): BattleSnapshot {
  const profile = SYNTHETIC_PROFILES[id];
  return buildSnapshot({ name: profile.label, petClass, stage: "adult", attributes: deriveAttributes(profile.counts) });
}
```

- [ ] **Step 5: Ver que pasan**

Run: `npx vitest run src/lib/pet/battle/power.test.ts src/lib/pet/battle/profiles.test.ts`
Expected: PASS (7 tests). Si el test de orden de tramos falla, imprimir los seis tramos con `console.log(PROFILE_IDS.map((id) => [id, snapshotForProfile(id, "wizard").tier]))` y corregir los CONTADORES del perfil que se sale (no los umbrales del test): los tramos esperados con `balance.ts` de hoy son nueva 1, importadora 6, cinefila 10, social 10, lectora 13, seriéfila 14.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pet/battle/power.ts src/lib/pet/battle/power.test.ts src/lib/pet/battle/profiles.ts src/lib/pet/battle/profiles.test.ts
git commit -m "feat(pet): poder de combate sin bonus de clase y perfiles sintéticos (R1)"
```

---

### Task 5: Validación del log de inputs

**Files:**
- Create: `src/lib/pet/battle/inputs.ts`
- Test: `src/lib/pet/battle/inputs.test.ts`

**Interfaces:**
- Consumes: `BattleInput`, `Ruleset` (Task 3).
- Produces: `InputsError`, `validateInputs(raw: unknown, ruleset: Ruleset): { ok: true; inputs: BattleInput[] } | { ok: false; code: InputsError; index?: number }`.

- [ ] **Step 1: Test**

`src/lib/pet/battle/inputs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RULESET } from "./content";
import { validateInputs } from "./inputs";

const ok = (ticks: number[]) => ticks.map((tick, seq) => ({ seq, tick, action: "skill", payload: {} }));

describe("validateInputs", () => {
  it("acepta un log bien formado y devuelve copias tipadas", () => {
    const raw = ok([3, 3, 120]);
    const v = validateInputs(raw, RULESET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.inputs).toEqual(raw);
      expect(v.inputs[0]).not.toBe(raw[0]);
    }
  });

  it("vacío es válido", () => {
    expect(validateInputs([], RULESET).ok).toBe(true);
  });

  it.each([
    ["NOT_ARRAY", {}],
    ["TOO_MANY", ok(Array.from({ length: RULESET.maxInputs + 1 }, (_, i) => i))],
    ["BAD_SHAPE", [{ seq: 0, tick: 1, action: "skill" }]],
    ["BAD_SHAPE", [{ seq: 0, tick: 1, action: "skill", payload: {}, extra: 1 }]],
    ["BAD_SEQ", [{ seq: 1, tick: 1, action: "skill", payload: {} }]],
    ["BAD_TICK", [{ seq: 0, tick: -1, action: "skill", payload: {} }]],
    ["BAD_TICK", [{ seq: 0, tick: RULESET.maxTicks + 1, action: "skill", payload: {} }]],
    ["BAD_TICK", [{ seq: 0, tick: 1.5, action: "skill", payload: {} }]],
    ["TICK_ORDER", ok([10, 5])],
    ["BAD_ACTION", [{ seq: 0, tick: 1, action: "ulti", payload: {} }]],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: { x: 1.5 } }]],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: null }]],
    ["BAD_PAYLOAD", [{ seq: 0, tick: 1, action: "skill", payload: [1] }]],
  ])("rechaza %s", (code, raw) => {
    const v = validateInputs(raw, RULESET);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe(code);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/pet/battle/inputs.test.ts`
Expected: FAIL — `./inputs` sin resolver.

- [ ] **Step 3: Implementar `inputs.ts`**

```ts
// Contrato C4: el servidor NUNCA simula un log sin pasar por aquí. Devuelve
// copias (el objeto del cliente no entra en el motor) y un código, no un texto:
// el código viaja al cliente y a los tests.
import type { BattleInput, Ruleset } from "./types";

export type InputsError =
  | "NOT_ARRAY"
  | "TOO_MANY"
  | "BAD_SHAPE"
  | "BAD_SEQ"
  | "BAD_TICK"
  | "TICK_ORDER"
  | "BAD_ACTION"
  | "BAD_PAYLOAD";

const KEYS = "action,payload,seq,tick";

export function validateInputs(
  raw: unknown,
  ruleset: Ruleset,
): { ok: true; inputs: BattleInput[] } | { ok: false; code: InputsError; index?: number } {
  if (!Array.isArray(raw)) return { ok: false, code: "NOT_ARRAY" };
  if (raw.length > ruleset.maxInputs) return { ok: false, code: "TOO_MANY" };
  const inputs: BattleInput[] = [];
  let lastTick = 0;
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return { ok: false, code: "BAD_SHAPE", index: i };
    }
    if (Object.keys(item).sort().join(",") !== KEYS) return { ok: false, code: "BAD_SHAPE", index: i };
    const { seq, tick, action, payload } = item as Record<string, unknown>;
    if (seq !== i) return { ok: false, code: "BAD_SEQ", index: i };
    if (!Number.isSafeInteger(tick) || (tick as number) < 0 || (tick as number) > ruleset.maxTicks) {
      return { ok: false, code: "BAD_TICK", index: i };
    }
    if ((tick as number) < lastTick) return { ok: false, code: "TICK_ORDER", index: i };
    if (action !== "skill") return { ok: false, code: "BAD_ACTION", index: i };
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    const copy: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (typeof value === "string" || Number.isSafeInteger(value)) copy[key] = value as number | string;
      else return { ok: false, code: "BAD_PAYLOAD", index: i };
    }
    lastTick = tick as number;
    inputs.push({ seq: i, tick: tick as number, action: "skill", payload: copy });
  }
  return { ok: true, inputs };
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/pet/battle/inputs.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/battle/inputs.ts src/lib/pet/battle/inputs.test.ts
git commit -m "feat(pet): validación del log de inputs del combate (R1)"
```

---

### Task 6: Motor determinista (`createBattle`, `stepBattle`, `simulate`)

**Files:**
- Create: `src/lib/pet/battle/engine.ts`
- Test: `src/lib/pet/battle/engine.test.ts`

**Interfaces:**
- Consumes: `seedFromHex`, `nextInt`, `nextBp` (Task 1); `enemyStats` (Task 4); tipos (Task 3).
- Produces: `createBattle(ctx: BattleInit): BattleState`, `stepBattle(ctx, st, inputsAtTick: readonly BattleInput[]): BattleEvent[]` (lanza `BATTLE_ENDED` si ya terminó), `viewOf(st): BattleView`, `simulate(ctx, inputs): { events: BattleEvent[]; result: BattleResult }` (lanza `INPUTS_AFTER_END`).

- [ ] **Step 1: Test**

`src/lib/pet/battle/engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { BROTE, RULESET } from "./content";
import { createBattle, simulate, stepBattle, viewOf } from "./engine";
import { enemyStats } from "./power";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import type { BattleEvent, BattleInit, BattleInput, TelegraphKind } from "./types";

const snapshot = snapshotForProfile("lectora_larga", "wizard");
const es = enemyStats(BROTE, snapshot);
const init = (seed: string, ruleset = RULESET): BattleInit => ({ seed, snapshot, enemy: BROTE, ruleset });
const skill = (tick: number, seq = 0): BattleInput => ({ seq, tick, action: "skill", payload: {} });

function firstTelegraph(seed: string) {
  const ev = simulate(init(seed), []).events.find((e) => e.type === "TELEGRAPH_STARTED");
  if (!ev || ev.type !== "TELEGRAPH_STARTED") throw new Error("sin anuncio");
  return ev;
}
function seedWhoseFirstTelegraphIs(kind: TelegraphKind): string {
  for (let i = 0; i < 1000; i++) if (firstTelegraph(seedFromIndex(i)).kind === kind) return seedFromIndex(i);
  throw new Error("no hay seed");
}
/** Vida de la mascota según el último evento anterior a `index` que la lleve. */
function petHpBefore(events: BattleEvent[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    const e = events[i];
    if ("petHp" in e) return e.petHp;
  }
  return snapshot.hpMax;
}

describe("arranque y básica", () => {
  it("BATTLE_STARTED con vidas completas; primera básica en el tick 15 por atk", () => {
    const { events } = simulate(init(seedFromIndex(0)), []);
    expect(events[0]).toEqual({ seq: 0, tick: 0, type: "BATTLE_STARTED", petHp: snapshot.hpMax, enemyHp: es.hpMax });
    const basic = events.find((e) => e.type === "PET_BASIC");
    expect(basic).toMatchObject({ tick: 15, damage: snapshot.atk, guarded: false });
  });
});

describe("determinismo e invariantes", () => {
  it("mismos inputs → mismos eventos y resultado (50 seeds)", () => {
    for (let i = 0; i < 50; i++) {
      const a = simulate(init(seedFromIndex(i)), [skill(5), skill(100, 1)]);
      const b = simulate(init(seedFromIndex(i)), [skill(5), skill(100, 1)]);
      expect(canonicalJson(a)).toBe(canonicalJson(b));
    }
  });

  it("seq contiguos, ticks no decrecientes, vida nunca negativa, termina con BATTLE_ENDED", () => {
    for (let i = 0; i < 50; i++) {
      const { events, result } = simulate(init(seedFromIndex(i)), i % 2 ? [skill(5), skill(100, 1), skill(200, 2)] : []);
      events.forEach((e, idx) => {
        expect(e.seq).toBe(idx);
        if (idx > 0) expect(e.tick).toBeGreaterThanOrEqual(events[idx - 1].tick);
        if ("petHp" in e) expect(e.petHp).toBeGreaterThanOrEqual(0);
        if ("enemyHp" in e) expect(e.enemyHp).toBeGreaterThanOrEqual(0);
      });
      const last = events[events.length - 1];
      expect(last.type).toBe("BATTLE_ENDED");
      expect(last.tick).toBe(result.ticks);
      expect(result.ticks).toBeLessThanOrEqual(RULESET.maxTicks);
    }
  });
});

describe("la habilidad y los dos anuncios", () => {
  it("durante la carga interrumpe: 4×atk, aturde 20 ticks y la carga no aterriza", () => {
    const seed = seedWhoseFirstTelegraphIs("charge");
    const t = firstTelegraph(seed);
    const { events } = simulate(init(seed), [skill(t.tick + 1)]);
    const used = events.findIndex((e) => e.type === "SKILL_USED");
    expect(events[used]).toMatchObject({ tick: t.tick + 1, effect: "interrupt", damage: snapshot.atk * RULESET.pet.skillInterruptMul });
    expect(events[used + 1]).toMatchObject({ type: "STATUS_APPLIED", status: "stagger", until: t.tick + 1 + BROTE.staggerTicks });
    const expired = events.find((e) => e.type === "STATUS_EXPIRED");
    expect(expired).toMatchObject({ tick: t.tick + 1 + BROTE.staggerTicks });
    const landed = events.find((e) => e.type === "TELEGRAPH_RESOLVED" && e.kind === "charge" && e.tick < t.tick + 1 + BROTE.staggerTicks);
    expect(landed).toBeUndefined();
  });

  it("en resolvesAt llega tarde: la carga aterriza (40 %) y la habilidad pega en reposo", () => {
    const seed = seedWhoseFirstTelegraphIs("charge");
    const t = firstTelegraph(seed);
    const { events } = simulate(init(seed), [skill(t.resolvesAt)]);
    const resolved = events.findIndex((e) => e.type === "TELEGRAPH_RESOLVED");
    expect(events[resolved]).toMatchObject({ tick: t.resolvesAt, kind: "charge", damage: es.charge });
    expect(events[resolved].type === "TELEGRAPH_RESOLVED" && events[resolved].petHp).toBe(petHpBefore(events, resolved) - es.charge);
    const used = events.find((e) => e.type === "SKILL_USED");
    expect(used).toMatchObject({ tick: t.resolvesAt, effect: "hit", damage: snapshot.atk * RULESET.pet.skillIdleMul });
    expect(used!.seq).toBeGreaterThan(events[resolved].seq);
  });

  it("durante la guardia: habilidad desperdiciada con castigo, básicas a un cuarto", () => {
    const seed = seedWhoseFirstTelegraphIs("guard");
    const t = firstTelegraph(seed);
    const { events } = simulate(init(seed), [skill(t.tick + 1)]);
    const used = events.findIndex((e) => e.type === "SKILL_USED");
    expect(events[used]).toMatchObject({ tick: t.tick + 1, effect: "wasted", damage: 0 });
    const ev = events[used];
    expect(ev.type === "SKILL_USED" && ev.petHp).toBe(petHpBefore(events, used) - es.punish);
    const guarded = events.find((e) => e.type === "PET_BASIC" && e.guarded);
    expect(guarded).toMatchObject({ damage: Math.max(1, Math.floor(snapshot.atk / RULESET.pet.guardBasicDiv)) });
    expect(guarded!.tick).toBeGreaterThanOrEqual(t.tick);
    expect(guarded!.tick).toBeLessThan(t.resolvesAt);
  });

  it("cooldown: dos inputs en el mismo tick → el segundo se ignora; listo justo en readyAt", () => {
    const cd = RULESET.pet.skillCooldown;
    const { events } = simulate(init(seedFromIndex(3)), [skill(5, 0), skill(5, 1), skill(5 + cd - 1, 2), skill(5 + cd, 3)]);
    const skills = events.filter((e) => e.type === "SKILL_USED" || e.type === "SKILL_IGNORED");
    expect(skills.map((e) => [e.tick, e.type])).toEqual([
      [5, "SKILL_USED"],
      [5, "SKILL_IGNORED"],
      [5 + cd - 1, "SKILL_IGNORED"],
      [5 + cd, "SKILL_USED"],
    ]);
  });
});

describe("fin", () => {
  it("límite: con maxTicks 10 nadie ha pegado → draw; con 16 la mascota ya pegó → win", () => {
    expect(simulate(init(seedFromIndex(0), { ...RULESET, maxTicks: 10 }), []).result).toMatchObject({ outcome: "draw", reason: "limit", ticks: 10 });
    expect(simulate(init(seedFromIndex(0), { ...RULESET, maxTicks: 16 }), []).result).toMatchObject({ outcome: "win", reason: "limit", ticks: 16 });
  });

  it("sin pulsar nunca se pierde por KO y la primera causa es skill_unused", () => {
    for (let i = 0; i < 20; i++) {
      const { result } = simulate(init(seedFromIndex(i)), []);
      if (result.outcome === "lose") {
        expect(result.reason).toBe("ko");
        expect(result.causes[0]).toBe("skill_unused");
        return;
      }
    }
    throw new Error("ninguna derrota en 20 seeds sin pulsar: revisar C6");
  });

  it("un input posterior al final invalida el log", () => {
    // Un seed cuyo combate sin inputs acaba por KO antes del límite.
    const seed = Array.from({ length: 50 }, (_, i) => seedFromIndex(i)).find(
      (s) => simulate(init(s), []).result.reason === "ko",
    );
    expect(seed).toBeDefined();
    expect(() => simulate(init(seed!), [skill(RULESET.maxTicks)])).toThrow("INPUTS_AFTER_END");
  });

  it("stepBattle sobre un combate terminado lanza; viewOf expone fase y cooldown", () => {
    const ctx = init(seedFromIndex(0));
    const st = createBattle(ctx);
    expect(viewOf(st)).toMatchObject({ tick: 0, enemyPhase: "idle", skillReadyAt: 0, ended: false });
    while (!st.ended) stepBattle(ctx, st, []);
    expect(() => stepBattle(ctx, st, [])).toThrow("BATTLE_ENDED");
    expect(viewOf(st).ended).toBe(true);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/pet/battle/engine.test.ts`
Expected: FAIL — `./engine` sin resolver.

- [ ] **Step 3: Implementar `engine.ts`**

```ts
// Motor de combate (Parte I §16.1–16.2; contratos C5–C8). Puro: sin Math.random,
// sin Date, sin red. El cliente lo ejecuta para animar en vivo; el servidor lo
// ejecuta para decidir. Un tick = stepBattle; el orden de dentro es normativo.
import { nextBp, nextInt, seedFromHex } from "./prng";
import { enemyStats } from "./power";
import type {
  BattleCause,
  BattleEvent,
  BattleInit,
  BattleInput,
  BattleOutcome,
  BattleResult,
  BattleState,
  BattleView,
  EndReason,
} from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventBody = DistributiveOmit<BattleEvent, "seq" | "tick">;

/** Estado inicial. Consume la PRIMERA tirada del PRNG (duración del reposo inicial). */
export function createBattle(ctx: BattleInit): BattleState {
  const rng = seedFromHex(ctx.seed);
  const es = enemyStats(ctx.enemy, ctx.snapshot);
  const idle = nextInt(rng, ctx.enemy.idleMin, ctx.enemy.idleMax);
  return {
    tick: 0,
    nextSeq: 0,
    ended: false,
    rng,
    pet: {
      hp: ctx.snapshot.hpMax,
      hpMax: ctx.snapshot.hpMax,
      atk: ctx.snapshot.atk,
      nextBasic: ctx.ruleset.pet.basicInterval,
      skillReadyAt: 0,
      skillUses: 0,
    },
    enemy: { hp: es.hpMax, hpMax: es.hpMax, phase: "idle", phaseUntil: idle, nextBasic: ctx.enemy.basicInterval },
    tally: { chargesLanded: 0, chargesInterrupted: 0, skillWasted: 0, damageDealt: 0, damageTaken: 0 },
    result: null,
  };
}

export function viewOf(st: BattleState): BattleView {
  return {
    tick: st.tick,
    petHp: st.pet.hp,
    petHpMax: st.pet.hpMax,
    enemyHp: st.enemy.hp,
    enemyHpMax: st.enemy.hpMax,
    enemyPhase: st.enemy.phase,
    enemyPhaseUntil: st.enemy.phaseUntil,
    skillReadyAt: st.pet.skillReadyAt,
    ended: st.ended,
  };
}

/** Un tick. `inputs`: los de ESTE tick, validados y en orden de seq. Devuelve sus eventos.
 *  Orden (C5): 0 arranque · 1 transiciones del enemigo · 2 inputs · 3 básica de la
 *  mascota · 4 básica del enemigo · 5 límite. Un KO corta el tick en el acto. */
export function stepBattle(ctx: BattleInit, st: BattleState, inputs: readonly BattleInput[]): BattleEvent[] {
  if (st.ended) throw new Error("BATTLE_ENDED");
  const T = st.tick;
  const R = ctx.ruleset;
  const E = ctx.enemy;
  const es = enemyStats(E, ctx.snapshot);
  const out: BattleEvent[] = [];

  const emit = (body: EventBody) => {
    out.push({ seq: st.nextSeq++, tick: T, ...body } as BattleEvent);
  };
  const hurtPet = (dmg: number) => {
    const d = Math.min(dmg, st.pet.hp);
    st.pet.hp -= d;
    st.tally.damageTaken += d;
    return d;
  };
  const hurtEnemy = (dmg: number) => {
    const d = Math.min(dmg, st.enemy.hp);
    st.enemy.hp -= d;
    st.tally.damageDealt += d;
    return d;
  };
  const finish = (reason: EndReason, outcome: BattleOutcome) => {
    st.ended = true;
    st.result = {
      outcome,
      reason,
      ticks: T,
      petHp: st.pet.hp,
      petHpMax: st.pet.hpMax,
      enemyHp: st.enemy.hp,
      enemyHpMax: st.enemy.hpMax,
      damageDealt: st.tally.damageDealt,
      damageTaken: st.tally.damageTaken,
      causes: causesFor(st, outcome, reason, es),
    };
    emit({ type: "BATTLE_ENDED", outcome, reason, petHp: st.pet.hp, enemyHp: st.enemy.hp });
  };
  const koCheck = (): boolean => {
    if (st.pet.hp === 0) {
      finish("ko", "lose");
      return true;
    }
    if (st.enemy.hp === 0) {
      finish("ko", "win");
      return true;
    }
    return false;
  };
  const toIdle = () => {
    st.enemy.phase = "idle";
    st.enemy.phaseUntil = T + nextInt(st.rng, E.idleMin, E.idleMax);
    st.enemy.nextBasic = T + E.basicInterval;
  };

  // 0. Arranque
  if (T === 0) emit({ type: "BATTLE_STARTED", petHp: st.pet.hp, enemyHp: st.enemy.hp });

  // 1. Transiciones del enemigo: primero lo que expira o resuelve, después el reposo que termina
  if (st.enemy.phaseUntil === T) {
    switch (st.enemy.phase) {
      case "windup": {
        const d = hurtPet(es.charge);
        st.tally.chargesLanded++;
        emit({ type: "TELEGRAPH_RESOLVED", kind: "charge", damage: d, petHp: st.pet.hp });
        if (koCheck()) return out;
        toIdle();
        break;
      }
      case "guard":
        emit({ type: "TELEGRAPH_RESOLVED", kind: "guard", damage: 0, petHp: st.pet.hp });
        toIdle();
        break;
      case "stagger":
        emit({ type: "STATUS_EXPIRED", status: "stagger" });
        toIdle();
        break;
      case "idle": {
        const charge = nextBp(st.rng) < E.chargeBp;
        st.enemy.phase = charge ? "windup" : "guard";
        st.enemy.phaseUntil = T + (charge ? E.windupTicks : E.guardTicks);
        emit({ type: "TELEGRAPH_STARTED", kind: charge ? "charge" : "guard", resolvesAt: st.enemy.phaseUntil });
        break;
      }
    }
  }

  // 2. Inputs de este tick
  for (const _input of inputs) {
    if (T < st.pet.skillReadyAt) {
      emit({ type: "SKILL_IGNORED", reason: "cooldown" });
      continue;
    }
    st.pet.skillReadyAt = T + R.pet.skillCooldown;
    st.pet.skillUses++;
    if (st.enemy.phase === "windup") {
      const d = hurtEnemy(st.pet.atk * R.pet.skillInterruptMul);
      st.tally.chargesInterrupted++;
      st.enemy.phase = "stagger";
      st.enemy.phaseUntil = T + E.staggerTicks;
      emit({ type: "SKILL_USED", effect: "interrupt", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp });
      emit({ type: "STATUS_APPLIED", status: "stagger", until: st.enemy.phaseUntil });
    } else if (st.enemy.phase === "guard") {
      hurtPet(es.punish);
      st.tally.skillWasted++;
      emit({ type: "SKILL_USED", effect: "wasted", damage: 0, enemyHp: st.enemy.hp, petHp: st.pet.hp });
    } else {
      const d = hurtEnemy(st.pet.atk * R.pet.skillIdleMul);
      emit({ type: "SKILL_USED", effect: "hit", damage: d, enemyHp: st.enemy.hp, petHp: st.pet.hp });
    }
    if (koCheck()) return out;
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
    emit({ type: "ENEMY_BASIC", damage: d, petHp: st.pet.hp });
    if (koCheck()) return out;
  }

  // 5. Límite de tiempo: gana la mayor fracción de vida; empate = draw
  if (T === R.maxTicks) {
    const pet = st.pet.hp * st.enemy.hpMax;
    const enemy = st.enemy.hp * st.pet.hpMax;
    finish("limit", pet > enemy ? "win" : pet < enemy ? "lose" : "draw");
    return out;
  }

  st.tick = T + 1;
  return out;
}

function causesFor(
  st: BattleState,
  outcome: BattleOutcome,
  reason: EndReason,
  es: { charge: number; punish: number },
): BattleCause[] {
  const t = st.tally;
  if (outcome === "win") return [t.chargesInterrupted > 0 ? "charges_interrupted" : "steady_damage"];
  const causes: BattleCause[] = [];
  if (st.pet.skillUses === 0 && t.chargesLanded > 0) causes.push("skill_unused");
  const byDamage: Array<[BattleCause, number]> = [
    ["charges_landed", t.chargesLanded * es.charge],
    ["skill_wasted_on_guard", t.skillWasted * es.punish],
  ];
  byDamage.sort((a, b) => b[1] - a[1]);
  for (const [cause, dmg] of byDamage) if (dmg > 0) causes.push(cause);
  if (reason === "limit") causes.push("time_limit");
  return causes.slice(0, 2);
}

/** Simulación completa: la del servidor (y la del CLI). `inputs` validados y ordenados por tick. */
export function simulate(ctx: BattleInit, inputs: readonly BattleInput[]): { events: BattleEvent[]; result: BattleResult } {
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

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/pet/battle/engine.test.ts`
Expected: PASS (11 tests). Si «sin pulsar nunca se pierde» falla, es que C6 no castiga bastante: NO tocar el test; anotar y seguir a la Task 7, cuya calibración dice qué número mover.

- [ ] **Step 5: Typecheck y commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
git add src/lib/pet/battle/engine.ts src/lib/pet/battle/engine.test.ts
git commit -m "feat(pet): motor determinista de combate por ticks con log de inputs (R1)"
```

---

### Task 7: Políticas del simulador y calibración con perfiles

**Files:**
- Create: `src/lib/pet/battle/policies.ts`, `src/lib/pet/battle/calibration.ts`
- Test: `src/lib/pet/battle/policies.test.ts`, `src/lib/pet/battle/calibration.test.ts`

**Interfaces:**
- Consumes: `createBattle`, `stepBattle`, `viewOf` (Task 6); `PROFILE_IDS`, `snapshotForProfile` (Task 4); `seedFromIndex` (Task 1); `RULESET`, `BROTE` (Task 3); `PET_CLASSES`.
- Produces: `PolicyId = "never" | "spam" | "interrupt"`, `POLICY_IDS`, `Policy = (view: BattleView) => boolean`, `POLICIES: Record<PolicyId, Policy>`, `runPolicy(ctx, policy): { inputs; events; result }`; `CALIBRATION`, `CalibrationCell`, `CalibrationReport`, `calibrate({ seeds, profiles?, classes? }): CalibrationReport`, `checkCalibration(report): { ok; failures: string[] }`, `formatReport(report): string`.

- [ ] **Step 1: Tests**

`src/lib/pet/battle/policies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { BROTE, RULESET } from "./content";
import { simulate } from "./engine";
import { POLICIES, POLICY_IDS, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";

const snapshot = snapshotForProfile("cinefila", "cleric");
const ctx = (i: number) => ({ seed: seedFromIndex(i), snapshot, enemy: BROTE, ruleset: RULESET });

describe("runPolicy", () => {
  it("never no genera inputs y coincide con simulate([])", () => {
    const run = runPolicy(ctx(1), POLICIES.never);
    expect(run.inputs).toEqual([]);
    expect(canonicalJson(run.events)).toBe(canonicalJson(simulate(ctx(1), []).events));
  });

  it("lo que graba una política se re-simula igual: el log ES el estado", () => {
    for (const id of POLICY_IDS) {
      for (let i = 0; i < 20; i++) {
        const run = runPolicy(ctx(i), POLICIES[id]);
        const again = simulate(ctx(i), run.inputs);
        expect(canonicalJson(again)).toBe(canonicalJson({ events: run.events, result: run.result }));
      }
    }
  });

  it("interrupt solo pulsa durante la carga; si gana, la causa es charges_interrupted", () => {
    // El primer seed cuyo combate trae alguna carga (con 8 anuncios sin carga sería 1 entre 256).
    const run = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => runPolicy(ctx(i), POLICIES.interrupt)).find((r) => r.events.some((e) => e.type === "SKILL_USED"))!;
    const used = run.events.filter((e) => e.type === "SKILL_USED");
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((e) => e.type === "SKILL_USED" && e.effect === "interrupt")).toBe(true);
    if (run.result.outcome === "win") expect(run.result.causes).toEqual(["charges_interrupted"]);
  });

  it("spam pulsa en cuanto puede: empieza en el tick 0, nunca SKILL_IGNORED, cabe en maxInputs", () => {
    const run = runPolicy(ctx(4), POLICIES.spam);
    expect(run.inputs[0]).toMatchObject({ seq: 0, tick: 0 });
    expect(run.events.some((e) => e.type === "SKILL_IGNORED")).toBe(false);
    expect(run.inputs.length).toBeLessThanOrEqual(RULESET.maxInputs);
  });
});
```

`src/lib/pet/battle/calibration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calibrate, checkCalibration, formatReport } from "./calibration";

// Matriz reducida (40 seeds por celda) para que corra en segundos; el CLI usa 200.
describe("calibración de R2", () => {
  it("interrumpir gana, pulsar a ciegas pierde, no pulsar pierde; duración en rango", () => {
    const report = calibrate({ seeds: 40 });
    const check = checkCalibration(report);
    if (!check.ok) console.log(formatReport(report));
    expect(check.failures).toEqual([]);
  }, 60_000);
});
```

- [ ] **Step 2: Ver que fallan**

Run: `npx vitest run src/lib/pet/battle/policies.test.ts src/lib/pet/battle/calibration.test.ts`
Expected: FAIL — imports sin resolver.

- [ ] **Step 3: Implementar `policies.ts`**

```ts
// Políticas = clientes de mentira: deciden en cada tick, viendo lo mismo que vería
// la UI (BattleView), si pulsan la habilidad. Sirven para calibrar (Task 7) y
// para demostrar que el log de inputs reproduce el combate (C4).
import { createBattle, stepBattle, viewOf } from "./engine";
import type { BattleEvent, BattleInit, BattleInput, BattleResult, BattleView } from "./types";

export const POLICY_IDS = ["never", "spam", "interrupt"] as const;
export type PolicyId = (typeof POLICY_IDS)[number];
export type Policy = (view: BattleView) => boolean;

export const POLICIES: Record<PolicyId, Policy> = {
  /** Espectador puro: nunca interviene. */
  never: () => false,
  /** Pulsa en cuanto el cooldown lo permite, esté el enemigo como esté. */
  spam: (v) => v.tick >= v.skillReadyAt,
  /** Guarda la habilidad y la suelta solo durante la carga. */
  interrupt: (v) => v.tick >= v.skillReadyAt && v.enemyPhase === "windup",
};

export function runPolicy(
  ctx: BattleInit,
  policy: Policy,
): { inputs: BattleInput[]; events: BattleEvent[]; result: BattleResult } {
  const st = createBattle(ctx);
  const inputs: BattleInput[] = [];
  const events: BattleEvent[] = [];
  while (!st.ended) {
    const at: BattleInput[] = [];
    if (policy(viewOf(st))) {
      const input: BattleInput = { seq: inputs.length, tick: st.tick, action: "skill", payload: {} };
      inputs.push(input);
      at.push(input);
    }
    events.push(...stepBattle(ctx, st, at));
  }
  return { inputs, events, result: st.result as BattleResult };
}
```

- [ ] **Step 4: Implementar `calibration.ts`**

```ts
// Calibración de R2 «con perfiles sintéticos, no a ojo» (Parte II R1). Una celda
// = perfil × clase × política sobre N seeds reproducibles. Los umbrales son el
// criterio de salida de R2 en números: si la decisión correcta no gana o pulsar
// a ciegas gana, el contenido está mal, no el test.
import { PET_CLASSES, type PetClass } from "../classes";
import { BROTE, RULESET } from "./content";
import { POLICIES, POLICY_IDS, runPolicy, type PolicyId } from "./policies";
import { PROFILE_IDS, snapshotForProfile, type ProfileId } from "./profiles";
import { seedFromIndex } from "./prng";

export const CALIBRATION = {
  seeds: 200,
  win: { interruptMin: 0.85, spamMax: 0.35, neverMax: 0.05 },
  ticks: { interruptMeanMin: 300, interruptMeanMax: 560 },
} as const;

export interface CalibrationCell {
  profile: ProfileId;
  petClass: PetClass;
  policy: PolicyId;
  fights: number;
  wins: number;
  draws: number;
  meanTicks: number;
}

export interface CalibrationReport {
  seeds: number;
  cells: CalibrationCell[];
}

export function calibrate(opts: {
  seeds: number;
  profiles?: readonly ProfileId[];
  classes?: readonly PetClass[];
}): CalibrationReport {
  const profiles = opts.profiles ?? PROFILE_IDS;
  const classes = opts.classes ?? PET_CLASSES;
  const cells: CalibrationCell[] = [];
  for (const profile of profiles) {
    for (const petClass of classes) {
      const snapshot = snapshotForProfile(profile, petClass);
      for (const policy of POLICY_IDS) {
        let wins = 0;
        let draws = 0;
        let ticks = 0;
        for (let i = 0; i < opts.seeds; i++) {
          const { result } = runPolicy({ seed: seedFromIndex(i), snapshot, enemy: BROTE, ruleset: RULESET }, POLICIES[policy]);
          if (result.outcome === "win") wins++;
          else if (result.outcome === "draw") draws++;
          ticks += result.ticks;
        }
        cells.push({ profile, petClass, policy, fights: opts.seeds, wins, draws, meanTicks: Math.round(ticks / opts.seeds) });
      }
    }
  }
  return { seeds: opts.seeds, cells };
}

interface Aggregate {
  fights: number;
  wins: number;
  ticks: number;
}

/** Agrega por política × perfil (las clases son idénticas en R2 y solo dispersarían). */
function aggregate(report: CalibrationReport): Map<string, Aggregate> {
  const map = new Map<string, Aggregate>();
  for (const c of report.cells) {
    const key = `${c.policy}|${c.profile}`;
    const a = map.get(key) ?? { fights: 0, wins: 0, ticks: 0 };
    a.fights += c.fights;
    a.wins += c.wins;
    a.ticks += c.meanTicks * c.fights;
    map.set(key, a);
  }
  return map;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function checkCalibration(report: CalibrationReport): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const W = CALIBRATION.win;
  const K = CALIBRATION.ticks;
  for (const [key, a] of aggregate(report)) {
    const [policy, profile] = key.split("|");
    const rate = a.wins / a.fights;
    const mean = a.ticks / a.fights;
    if (policy === "interrupt" && rate < W.interruptMin) failures.push(`${profile}: interrupt gana ${pct(rate)} < ${pct(W.interruptMin)}`);
    if (policy === "spam" && rate > W.spamMax) failures.push(`${profile}: spam gana ${pct(rate)} > ${pct(W.spamMax)}`);
    if (policy === "never" && rate > W.neverMax) failures.push(`${profile}: never gana ${pct(rate)} > ${pct(W.neverMax)}`);
    if (policy === "interrupt" && (mean < K.interruptMeanMin || mean > K.interruptMeanMax)) {
      failures.push(`${profile}: interrupt dura ${Math.round(mean)} ticks de media, fuera de [${K.interruptMeanMin}, ${K.interruptMeanMax}]`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function formatReport(report: CalibrationReport): string {
  const lines = [`seeds por celda: ${report.seeds}`, "política      perfil           victorias  media ticks"];
  for (const [key, a] of aggregate(report)) {
    const [policy, profile] = key.split("|");
    lines.push(`${policy.padEnd(13)} ${profile.padEnd(16)} ${pct(a.wins / a.fights).padStart(9)}  ${String(Math.round(a.ticks / a.fights)).padStart(11)}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 5: Ejecutar y calibrar**

Run: `npx vitest run src/lib/pet/battle/policies.test.ts src/lib/pet/battle/calibration.test.ts`
Expected: PASS (5 tests).

Si `calibration.test.ts` falla, el informe impreso dice qué umbral se rompe. Mover UN número de `content.ts` cada vez, en este orden, y repetir hasta verde (después de cada cambio: `contentHash` cambia → actualizar el inline snapshot de `content.test.ts` con `npx vitest run src/lib/pet/battle/content.test.ts -u`):

| Fallo | Número que se mueve | Sentido |
|---|---|---|
| interrupt dura demasiado / poco | `BROTE.hpPerAtk` (42) | bajar acorta, subir alarga (±4 por paso) |
| never gana demasiado | `BROTE.chargePct` (40) | subir (+5) |
| spam gana demasiado | `BROTE.punishPct` (25) | subir (+5); si no basta, `RULESET.pet.skillIdleMul` 2 → 1 |
| interrupt gana poco | `RULESET.pet.skillCooldown` (90) | bajar (−10) |

Anotar en el resumen de la tarea los valores finales: la spec (Task 14) los copia de `content.ts`, no de este plan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pet/battle/policies.ts src/lib/pet/battle/policies.test.ts src/lib/pet/battle/calibration.ts src/lib/pet/battle/calibration.test.ts src/lib/pet/battle/content.ts src/lib/pet/battle/content.test.ts
git commit -m "feat(pet): políticas del simulador y calibración perfil × clase × política (R1)"
```

---

### Task 8: Registro, digest sin circularidad y re-simulación

**Files:**
- Create: `src/lib/pet/battle/record.ts`
- Test: `src/lib/pet/battle/record.test.ts`

**Interfaces:**
- Consumes: `canonicalJson`, `sha256Hex` (Task 2); `simulate` (Task 6); `validateInputs` (Task 5); `isSeed` (Task 1); `BattleRecord`, `BattleEvent`, `BattleResult`, `Ruleset`, `EnemyDef` (Task 3).
- Produces: `digestMaterial(record, events): string`, `battleDigest(record, events): Promise<string>`, `ResimError`, `BattleContent { ruleset; enemies; contentHash }`, `resimulate(record, content): Promise<{ ok: true; events; result; digest } | { ok: false; code: ResimError }>`.

- [ ] **Step 1: Test**

`src/lib/pet/battle/record.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BROTE, ENEMIES, RULESET, contentHash } from "./content";
import { POLICIES, runPolicy } from "./policies";
import { snapshotForProfile } from "./profiles";
import { seedFromIndex } from "./prng";
import { battleDigest, digestMaterial, resimulate } from "./record";
import type { BattleRecord } from "./types";

const snapshot = snapshotForProfile("social", "bard");

async function makeRecord(i = 0, policy = POLICIES.interrupt) {
  const seed = seedFromIndex(i);
  const run = runPolicy({ seed, snapshot, enemy: BROTE, ruleset: RULESET }, policy);
  const record: BattleRecord = {
    rulesetVersion: RULESET.version,
    contentHash: await contentHash(),
    enemyId: BROTE.id,
    seed,
    snapshot,
    inputs: run.inputs,
    result: run.result,
  };
  return { record, events: run.events };
}
const content = async () => ({ ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });

describe("digest", () => {
  it("es estable, hex de 64 y el material no contiene ningún digest", async () => {
    const { record, events } = await makeRecord();
    const d1 = await battleDigest(record, events);
    expect(d1).toBe(await battleDigest(record, events));
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(digestMaterial(record, events)).not.toContain("digest");
    expect(digestMaterial(record, events).startsWith('{"contentHash":"')).toBe(true);
  });

  it("cambia si cambia un input, el seed o el resultado", async () => {
    const { record, events } = await makeRecord();
    const base = await battleDigest(record, events);
    const inputs = record.inputs.map((x, i) => (i === 0 ? { ...x, tick: x.tick + 1 } : x));
    expect(await battleDigest({ ...record, inputs }, events)).not.toBe(base);
    expect(await battleDigest({ ...record, seed: seedFromIndex(9) }, events)).not.toBe(base);
    const result = { ...record.result, damageDealt: record.result.damageDealt + 1 };
    expect(await battleDigest({ ...record, result }, events)).not.toBe(base);
  });
});

describe("resimulate", () => {
  it("acepta un registro honesto y reproduce eventos y digest", async () => {
    const { record, events } = await makeRecord(1);
    const out = await resimulate(record, await content());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.events).toEqual(events);
      expect(out.digest).toBe(await battleDigest(record, events));
    }
  });

  it("rechaza una victoria fabricada y un resultado retocado", async () => {
    const { record } = await makeRecord(2, POLICIES.never);
    const flipped = { ...record.result, outcome: record.result.outcome === "win" ? ("lose" as const) : ("win" as const) };
    expect(await resimulate({ ...record, result: flipped }, await content())).toEqual({ ok: false, code: "RESULT_MISMATCH" });
    const retouched = { ...record.result, damageDealt: record.result.damageDealt + 1 };
    expect(await resimulate({ ...record, result: retouched }, await content())).toEqual({ ok: false, code: "RESULT_MISMATCH" });
  });

  it("rechaza enemigo, versión, hash, seed e inputs inválidos con su código", async () => {
    const { record } = await makeRecord(3);
    const c = await content();
    expect(await resimulate({ ...record, enemyId: "dragon" }, c)).toEqual({ ok: false, code: "UNKNOWN_ENEMY" });
    expect(await resimulate({ ...record, rulesetVersion: "r0" }, c)).toEqual({ ok: false, code: "RULESET_MISMATCH" });
    expect(await resimulate({ ...record, contentHash: "0".repeat(64) }, c)).toEqual({ ok: false, code: "CONTENT_MISMATCH" });
    expect(await resimulate({ ...record, seed: "0".repeat(32) }, c)).toEqual({ ok: false, code: "INVALID_SEED" });
    const badInputs = record.inputs.map((x) => ({ ...x, seq: x.seq + 1 }));
    expect(await resimulate({ ...record, inputs: badInputs }, c)).toEqual({ ok: false, code: "INVALID_INPUTS" });
  });

  it("rechaza un input posterior al final del combate", async () => {
    for (let i = 0; i < 10; i++) {
      const { record } = await makeRecord(i);
      if (record.result.reason !== "ko") continue;
      const inputs = [...record.inputs, { seq: record.inputs.length, tick: RULESET.maxTicks, action: "skill" as const, payload: {} }];
      expect(await resimulate({ ...record, inputs }, await content())).toEqual({ ok: false, code: "INPUTS_AFTER_END" });
      return;
    }
    throw new Error("ningún KO en 10 seeds con interrupt");
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/pet/battle/record.test.ts`
Expected: FAIL — `./record` sin resolver.

- [ ] **Step 3: Implementar `record.ts`**

```ts
// Registro de combate (C9, C10): lo que persiste pet_battles y lo que firma el
// digest. El digest se calcula sobre el registro MÁS los eventos re-simulados y
// nunca contiene un digest: sin circularidad por construcción (#1081 R5).
// `resimulate` es lo que hace el servidor en R2 y el CLI en `replay`.
import { canonicalJson } from "./canonical";
import { simulate } from "./engine";
import { sha256Hex } from "./hash";
import { validateInputs } from "./inputs";
import { isSeed } from "./prng";
import type { BattleEvent, BattleRecord, BattleResult, EnemyDef, Ruleset } from "./types";

export function digestMaterial(record: BattleRecord, events: readonly BattleEvent[]): string {
  return canonicalJson({ ...record, events });
}

export async function battleDigest(record: BattleRecord, events: readonly BattleEvent[]): Promise<string> {
  return sha256Hex(digestMaterial(record, events));
}

export type ResimError =
  | "UNKNOWN_ENEMY"
  | "RULESET_MISMATCH"
  | "CONTENT_MISMATCH"
  | "INVALID_SEED"
  | "INVALID_INPUTS"
  | "INPUTS_AFTER_END"
  | "RESULT_MISMATCH";

export interface BattleContent {
  ruleset: Ruleset;
  enemies: Record<string, EnemyDef>;
  contentHash: string;
}

export async function resimulate(
  record: BattleRecord,
  content: BattleContent,
): Promise<{ ok: true; events: BattleEvent[]; result: BattleResult; digest: string } | { ok: false; code: ResimError }> {
  const enemy = content.enemies[record.enemyId];
  if (!enemy) return { ok: false, code: "UNKNOWN_ENEMY" };
  if (record.rulesetVersion !== content.ruleset.version) return { ok: false, code: "RULESET_MISMATCH" };
  if (record.contentHash !== content.contentHash) return { ok: false, code: "CONTENT_MISMATCH" };
  if (!isSeed(record.seed) || record.seed === "0".repeat(32)) return { ok: false, code: "INVALID_SEED" };
  const validated = validateInputs(record.inputs, content.ruleset);
  if (!validated.ok) return { ok: false, code: "INVALID_INPUTS" };
  let sim: { events: BattleEvent[]; result: BattleResult };
  try {
    sim = simulate({ seed: record.seed, snapshot: record.snapshot, enemy, ruleset: content.ruleset }, validated.inputs);
  } catch {
    return { ok: false, code: "INPUTS_AFTER_END" };
  }
  if (canonicalJson(sim.result) !== canonicalJson(record.result)) return { ok: false, code: "RESULT_MISMATCH" };
  const digest = await battleDigest({ ...record, inputs: validated.inputs }, sim.events);
  return { ok: true, events: sim.events, result: sim.result, digest };
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/pet/battle/record.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/battle/record.ts src/lib/pet/battle/record.test.ts
git commit -m "feat(pet): registro de combate, digest sin circularidad y re-simulación (R1)"
```

---

### Task 9: Instancia de minijuego derivada de seed y tick (lista para R3)

**Files:**
- Create: `src/lib/pet/battle/minigame.ts`
- Test: `src/lib/pet/battle/minigame.test.ts`

**Interfaces:**
- Consumes: `subStream`, `nextInt` (Task 1).
- Produces: `MinigameFamily = "A" | "B"`, `MinigameInstance { family; tick; tokens: number[]; solution: number[] }`, `minigameInstance(seed, tick, family, k = 4)`, `scoreAssignment(instance, assignment: number[]): number`.

- [ ] **Step 1: Test**

`src/lib/pet/battle/minigame.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { minigameInstance, scoreAssignment } from "./minigame";
import { seedFromIndex } from "./prng";

const seed = seedFromIndex(7);

describe("minigameInstance", () => {
  it("misma (seed, tick, familia) → misma instancia; otro tick → otra", () => {
    expect(minigameInstance(seed, 120, "A")).toEqual(minigameInstance(seed, 120, "A"));
    expect(new Set(Array.from({ length: 20 }, (_, t) => minigameInstance(seed, 100 + t, "A").solution.join(""))).size).toBeGreaterThan(1);
    expect(Array.from({ length: 20 }, (_, t) => minigameInstance(seed, 100 + t, "B").solution.join(""))).not.toEqual(Array.from({ length: 20 }, (_, t) => minigameInstance(seed, 100 + t, "A").solution.join("")));
  });

  it("tokens y solution son permutaciones de 0..k−1, k entre 2 y 4", () => {
    const inst = minigameInstance(seed, 40, "B", 3);
    expect([...inst.tokens].sort()).toEqual([0, 1, 2]);
    expect([...inst.solution].sort()).toEqual([0, 1, 2]);
    expect(minigameInstance(seed, 40, "A").tokens).toHaveLength(4);
    expect(() => minigameInstance(seed, 40, "A", 5)).toThrow("MINIGAME_K");
    expect(() => minigameInstance(seed, 40, "A", 1)).toThrow("MINIGAME_K");
  });

  it("scoreAssignment cuenta huecos acertados; la asignación viaja, la puntuación no", () => {
    const inst = minigameInstance(seed, 40, "A");
    expect(scoreAssignment(inst, inst.solution)).toBe(4);
    expect(scoreAssignment(inst, inst.solution.map((s) => (s + 1) % 4))).toBe(0);
    expect(() => scoreAssignment(inst, [0, 1])).toThrow("MINIGAME_ASSIGNMENT");
    expect(() => scoreAssignment(inst, [0, 0, 1, 2])).toThrow("MINIGAME_ASSIGNMENT");
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `npx vitest run src/lib/pet/battle/minigame.test.ts`
Expected: FAIL — `./minigame` sin resolver.

- [ ] **Step 3: Implementar `minigame.ts`**

```ts
// Instancia del minijuego de la ulti (Parte I §6 regla 4, §16.3; contrato C11):
// sale de (seed, tick, familia), nunca la elige el cliente. R3 le pone tema y
// widget; aquí solo la derivación y la puntuación que el servidor recalcula.
import { nextInt, subStream, type PrngState } from "./prng";

export type MinigameFamily = "A" | "B";

export interface MinigameInstance {
  family: MinigameFamily;
  tick: number;
  /** Fichas en el orden en que se muestran. */
  tokens: number[];
  /** solution[ficha] = hueco correcto. */
  solution: number[];
}

function shuffle(rng: PrngState, items: number[]): number[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function minigameInstance(seed: string, tick: number, family: MinigameFamily, k = 4): MinigameInstance {
  if (!Number.isInteger(k) || k < 2 || k > 4) throw new Error("MINIGAME_K");
  const rng = subStream(seed, `ulti:${family}`, tick);
  const base = Array.from({ length: k }, (_, i) => i);
  const solution = shuffle(rng, base);
  const tokens = shuffle(rng, base);
  return { family, tick, tokens, solution };
}

/** Huecos acertados (0..k). `assignment[ficha] = hueco`; debe ser una permutación. */
export function scoreAssignment(inst: MinigameInstance, assignment: number[]): number {
  const k = inst.solution.length;
  if (assignment.length !== k || new Set(assignment).size !== k || assignment.some((h) => !Number.isInteger(h) || h < 0 || h >= k)) {
    throw new Error("MINIGAME_ASSIGNMENT");
  }
  let score = 0;
  for (let i = 0; i < k; i++) if (assignment[i] === inst.solution[i]) score++;
  return score;
}
```

- [ ] **Step 4: Ver que pasa**

Run: `npx vitest run src/lib/pet/battle/minigame.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/battle/minigame.ts src/lib/pet/battle/minigame.test.ts
git commit -m "feat(pet): instancia de minijuego derivada de seed y tick (R1, para R3)"
```

---

### Task 10: CLI del simulador (`run`, `calibrate`, `replay`, `golden`)

**Files:**
- Create: `scripts/pet-battle/simulate.ts`

**Interfaces:**
- Consumes: todo lo anterior. Sin red, sin Supabase: solo el motor.
- Produces: `npm run pet:battle -- run|calibrate|replay|golden`. `golden` escribe `src/lib/pet/battle/__fixtures__/normative.json` (lo consume la Task 11).

- [ ] **Step 1: Escribir el CLI**

`scripts/pet-battle/simulate.ts`:

```ts
// Simulador de combate por CLI (criterio de salida de R1: re-simular sin UI).
//   npm run pet:battle -- run [--seed <32 hex>] [--profile lectora_larga] [--class wizard] [--policy interrupt] [--events] [--json]
//   npm run pet:battle -- calibrate [--seeds 200]
//   npm run pet:battle -- replay <fichero.json>      (salida de `run --json` o registro de pet_battles)
//   npm run pet:battle -- golden                      (escribe el ejemplo normativo)
// Requiere Node 22 (ver «Node» en el plan de R1). Sin red ni Supabase: solo el motor.
import { readFileSync, writeFileSync } from "node:fs";
import { PET_CLASSES, isPetClass, type PetClass } from "../../src/lib/pet/classes";
import { CALIBRATION, calibrate, checkCalibration, formatReport } from "../../src/lib/pet/battle/calibration";
import { canonicalJson } from "../../src/lib/pet/battle/canonical";
import { BROTE, ENEMIES, RULESET, contentHash } from "../../src/lib/pet/battle/content";
import { simulate } from "../../src/lib/pet/battle/engine";
import { POLICIES, POLICY_IDS, runPolicy, type PolicyId } from "../../src/lib/pet/battle/policies";
import { PROFILE_IDS, snapshotForProfile, type ProfileId } from "../../src/lib/pet/battle/profiles";
import { isSeed, seedFromIndex } from "../../src/lib/pet/battle/prng";
import { battleDigest, resimulate } from "../../src/lib/pet/battle/record";
import type { BattleRecord } from "../../src/lib/pet/battle/types";

const NORMATIVE_PATH = "src/lib/pet/battle/__fixtures__/normative.json";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function pickProfile(): ProfileId {
  const p = arg("profile", "lectora_larga") as string;
  if (!(PROFILE_IDS as readonly string[]).includes(p)) fail(`perfil desconocido: ${p} (${PROFILE_IDS.join(", ")})`);
  return p as ProfileId;
}
function pickClass(): PetClass {
  const c = arg("class", "wizard") as string;
  if (!isPetClass(c)) fail(`clase desconocida: ${c} (${PET_CLASSES.join(", ")})`);
  return c;
}
function pickPolicy(): PolicyId {
  const p = arg("policy", "interrupt") as string;
  if (!(POLICY_IDS as readonly string[]).includes(p)) fail(`política desconocida: ${p} (${POLICY_IDS.join(", ")})`);
  return p as PolicyId;
}

async function run() {
  const seed = arg("seed", seedFromIndex(0)) as string;
  if (!isSeed(seed)) fail("--seed: 32 hex en minúsculas");
  const snapshot = snapshotForProfile(pickProfile(), pickClass());
  const ctx = { seed, snapshot, enemy: BROTE, ruleset: RULESET };
  const { inputs, events, result } = runPolicy(ctx, POLICIES[pickPolicy()]);
  const record: BattleRecord = { rulesetVersion: RULESET.version, contentHash: await contentHash(), enemyId: BROTE.id, seed, snapshot, inputs, result };
  const digest = await battleDigest(record, events);
  console.log(`seed ${seed} · ${snapshot.name} (${snapshot.petClass}, tramo ${snapshot.tier}, ${snapshot.hpMax} PV, atk ${snapshot.atk}) vs ${BROTE.name} (${result.enemyHpMax} PV)`);
  console.log(`resultado: ${result.outcome} por ${result.reason} en ${result.ticks} ticks (${(result.ticks * RULESET.tickMs) / 1000} s) · causas: ${result.causes.join(", ") || "—"}`);
  console.log(`daño hecho ${result.damageDealt}/${result.enemyHpMax} · recibido ${result.damageTaken}/${result.petHpMax} · inputs ${inputs.length} · eventos ${events.length}`);
  console.log(`digest ${digest}`);
  if (flag("events")) for (const e of events) console.log(JSON.stringify(e));
  if (flag("json")) console.log(JSON.stringify({ record, events, digest }, null, 2));
}

async function calib() {
  const seeds = Number(arg("seeds", String(CALIBRATION.seeds)));
  if (!Number.isInteger(seeds) || seeds < 1) fail("--seeds: entero positivo");
  const report = calibrate({ seeds });
  console.log(formatReport(report));
  const check = checkCalibration(report);
  if (!check.ok) {
    for (const f of check.failures) console.error(`✗ ${f}`);
    process.exit(1);
  }
  console.log("✓ calibración dentro de umbrales");
}

async function replay(file: string | undefined) {
  if (!file) fail("replay <fichero.json>");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { record?: BattleRecord; digest?: string } & Partial<BattleRecord>;
  const record = (parsed.record ?? parsed) as BattleRecord;
  const out = await resimulate(record, { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });
  if (!out.ok) fail(`re-simulación rechazada: ${out.code}`);
  console.log(`re-simulado: ${out.result.outcome} por ${out.result.reason} en ${out.result.ticks} ticks · ${out.events.length} eventos · digest ${out.digest}`);
  if (parsed.digest && parsed.digest !== out.digest) fail(`digest distinto del guardado (${parsed.digest})`);
  console.log("✓ coincide");
}

/** Ejemplo normativo: el primer seed cuyos dos primeros anuncios son carga y luego
 *  guardia (así el ejemplo enseña las dos decisiones), con la política interrupt. */
async function golden() {
  const snapshot = snapshotForProfile("lectora_larga", "wizard");
  for (let i = 0; i < 10_000; i++) {
    const seed = seedFromIndex(i);
    const ctx = { seed, snapshot, enemy: BROTE, ruleset: RULESET };
    const kinds = simulate(ctx, [])
      .events.filter((e) => e.type === "TELEGRAPH_STARTED")
      .map((e) => (e.type === "TELEGRAPH_STARTED" ? e.kind : ""));
    if (kinds[0] !== "charge" || kinds[1] !== "guard") continue;
    const { inputs, events, result } = runPolicy(ctx, POLICIES.interrupt);
    const record: BattleRecord = { rulesetVersion: RULESET.version, contentHash: await contentHash(), enemyId: BROTE.id, seed, snapshot, inputs, result };
    const digest = await battleDigest(record, events);
    const material = canonicalJson({ ...record, events });
    writeFileSync(
      NORMATIVE_PATH,
      JSON.stringify({ seedIndex: i, record, events, digest, canonicalHead: material.slice(0, 240), canonicalLength: material.length }, null, 2) + "\n",
    );
    console.log(`escrito ${NORMATIVE_PATH}: seed ${seed} (índice ${i}), ${events.length} eventos, ${result.outcome} en ${result.ticks} ticks, digest ${digest}`);
    return;
  }
  fail("ningún seed en 10 000 empieza con carga y después guardia");
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "run") return run();
  if (cmd === "calibrate") return calib();
  if (cmd === "replay") return replay(process.argv[3]);
  if (cmd === "golden") return golden();
  fail("uso: run | calibrate [--seeds N] | replay <fichero> | golden");
}

main().catch((e: unknown) => fail(String(e instanceof Error ? e.stack : e)));
```

- [ ] **Step 2: Probar `run` y `calibrate`**

Run: `npm run pet:battle -- run --profile seriefila --class barbarian --policy interrupt`
Expected: cuatro líneas: cabecera con tramo 14, resultado `win por ko` (o `lose` en un seed desafortunado) con ticks entre 300 y 600, daños, y un digest de 64 hex.

Run: `npm run pet:battle -- run --policy never`
Expected: `lose por ko` con causas `skill_unused, charges_landed`.

Run: `npm run pet:battle -- calibrate`
Expected: la tabla política × perfil (18 filas) y `✓ calibración dentro de umbrales`; salida 0. Pegar la tabla en el resumen de la tarea (la spec la cita).

- [ ] **Step 3: Probar `replay` con un fichero de `run --json`**

```bash
mkdir -p .superpowers/tmp
npm run pet:battle -- run --policy spam --json > .superpowers/tmp/spam.txt
```

Recortar a mano `.superpowers/tmp/spam.txt` dejando solo el JSON (desde la primera `{`) en `.superpowers/tmp/spam.json`, y:

Run: `npm run pet:battle -- replay .superpowers/tmp/spam.json`
Expected: `re-simulado: … · digest <mismo>` y `✓ coincide`.

Editar `.superpowers/tmp/spam.json` cambiando `"outcome"` del `result` por el valor contrario y repetir: Expected: `re-simulación rechazada: RESULT_MISMATCH`, salida 1.

- [ ] **Step 4: Lint y commit**

Run: `npm run lint`
Expected: sin errores en `scripts/pet-battle/simulate.ts` ni en `src/lib/pet/battle/`.

```bash
git add scripts/pet-battle/simulate.ts
git commit -m "feat(pet): simulador de combate por CLI: run, calibrate, replay, golden (R1)"
```

---

### Task 11: Ejemplo normativo congelado y guardia de pureza

**Files:**
- Create (generado): `src/lib/pet/battle/__fixtures__/normative.json`
- Test: `src/lib/pet/battle/normative.test.ts`, `src/lib/pet/battle/purity.test.ts`

**Interfaces:**
- Consumes: `golden` del CLI (Task 10); `resimulate`, `battleDigest`, `digestMaterial` (Task 8).
- Produces: el fixture que la spec (Task 14) cita: `{ seedIndex, record, events, digest, canonicalHead, canonicalLength }`.

- [ ] **Step 1: Generar el ejemplo**

Run: `npm run pet:battle -- golden`
Expected: `escrito src/lib/pet/battle/__fixtures__/normative.json: seed <32 hex> (índice N), <n> eventos, win en <ticks> ticks, digest <64 hex>`.

- [ ] **Step 2: Revisar el fixture a mano contra los contratos (checklist; anotar lo comprobado en el resumen)**

Abrir el JSON y comprobar, con `atk` y `hpMax` del `record.snapshot`:

1. `events[0]` es `BATTLE_STARTED` en el tick 0 con `petHp = hpMax` y `enemyHp = 42 × atk` (C6).
2. El primer `PET_BASIC` está en el tick 15 con `damage = atk` y `guarded = false` (C5.3, C6).
3. El primer `TELEGRAPH_STARTED` es `charge`, en un tick `T0 ∈ [20, 40]` (reposo inicial, C2 tirada 1) con `resolvesAt = T0 + 15`.
4. `record.inputs[0].tick = T0 + 1` y justo después del `TELEGRAPH_STARTED` hay `SKILL_USED { effect: "interrupt", damage: 4 × atk }` seguido de `STATUS_APPLIED { status: "stagger", until: T0 + 21 }`; hay un `STATUS_EXPIRED` en el tick `T0 + 21` y ningún `TELEGRAPH_RESOLVED` de `charge` antes (C6).
5. El segundo `TELEGRAPH_STARTED` es `guard`; entre su tick y su `resolvesAt` hay algún `PET_BASIC` con `guarded = true` y `damage = max(1, floor(atk / 4))`, y ningún `SKILL_USED` (la política espera).
6. El último evento es `BATTLE_ENDED` con `tick = record.result.ticks` y `outcome = "win"`, `causes = ["charges_interrupted"]`.
7. `canonicalHead` empieza por `{"contentHash":"` y `canonicalLength` coincide con la longitud de `canonicalJson({ ...record, events })` (lo comprueba el test del paso 3).

Si algún punto falla, el fallo está en el motor o en el CLI, no en el fixture: volver a la Task 6/10, arreglar, regenerar.

Run: `npm run pet:battle -- replay src/lib/pet/battle/__fixtures__/normative.json`
Expected: `re-simulado: win por ko en <ticks> ticks · <n> eventos · digest <el del fichero>` y `✓ coincide`.

- [ ] **Step 3: Tests que congelan el ejemplo y vigilan la pureza**

`src/lib/pet/battle/normative.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import normative from "./__fixtures__/normative.json";
import { canonicalJson } from "./canonical";
import { ENEMIES, RULESET, contentHash } from "./content";
import { battleDigest, digestMaterial, resimulate } from "./record";
import type { BattleEvent, BattleRecord } from "./types";

const record = normative.record as unknown as BattleRecord;
const events = normative.events as unknown as BattleEvent[];

describe("ejemplo normativo (spec R1 §12)", () => {
  it("es del contenido de hoy: si esto falla, regenerar con `pet:battle golden` y subir RULESET.version", async () => {
    expect(record.rulesetVersion).toBe(RULESET.version);
    expect(record.contentHash).toBe(await contentHash());
  });

  it("re-simular reproduce exactamente eventos, resultado y digest", async () => {
    const out = await resimulate(record, { ruleset: RULESET, enemies: ENEMIES, contentHash: await contentHash() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(canonicalJson(out.events)).toBe(canonicalJson(events));
    expect(canonicalJson(out.result)).toBe(canonicalJson(record.result));
    expect(out.digest).toBe(normative.digest);
    expect(await battleDigest(record, events)).toBe(normative.digest);
  });

  it("los bytes del hash empiezan como dice la spec", () => {
    const material = digestMaterial(record, events);
    expect(material.slice(0, 240)).toBe(normative.canonicalHead);
    expect(material.length).toBe(normative.canonicalLength);
  });

  it("enseña las dos decisiones: interrumpe la primera carga y espera la primera guardia", () => {
    const kinds = events.filter((e) => e.type === "TELEGRAPH_STARTED").map((e) => (e.type === "TELEGRAPH_STARTED" ? e.kind : ""));
    expect(kinds.slice(0, 2)).toEqual(["charge", "guard"]);
    expect(events.find((e) => e.type === "SKILL_USED")).toMatchObject({ effect: "interrupt" });
    expect(events.some((e) => e.type === "SKILL_USED" && e.effect === "wasted")).toBe(false);
    expect(record.result).toMatchObject({ outcome: "win", causes: ["charges_interrupted"] });
  });
});
```

`src/lib/pet/battle/purity.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Parte I §16.1 hecho test: el motor no toca azar, reloj, entorno, Supabase ni
// React. Se miran los fuentes sin comentarios, así que los comentarios pueden
// nombrar lo prohibido.
const dir = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/Math\.random/, /new Date\(/, /Date\.now/, /process\.env/, /@supabase\//, /from "react"/, /from "next/];
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("pureza del motor", () => {
  it("ningún módulo del motor importa ni usa lo que lo haría no determinista", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThanOrEqual(13);
    for (const f of files) {
      const src = stripComments(readFileSync(join(dir, f), "utf8"));
      for (const re of FORBIDDEN) expect(src, `${f} contiene ${re}`).not.toMatch(re);
    }
  });
});
```

- [ ] **Step 4: Ejecutar todo el paquete**

Run: `npx vitest run src/lib/pet/battle`
Expected: PASS, 13 ficheros de test. Después `npx tsc --noEmit` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/battle/__fixtures__/normative.json src/lib/pet/battle/normative.test.ts src/lib/pet/battle/purity.test.ts
git commit -m "test(pet): ejemplo normativo congelado y guardia de pureza del motor (R1)"
```

---

### Task 12: Migración `pet_battles`, tipos y verificación en dev

**Files:**
- Create: `supabase/migrations/20260907_pet_battles.sql`
- Modify: `src/lib/supabase/database.types.ts` (bloque `pet_battles` en `Tables`)

**Interfaces:**
- Produces: tabla `public.pet_battles` con SELECT propio para `authenticated` y **cero** grants de escritura para `anon`/`authenticated`; `unique (user_id, intent_id)`. La escribe `service_role` desde el servidor (R2). Consumida por la Task 13 (test de autoridad) y por R2.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260907_pet_battles.sql`:

```sql
-- Mascota R1 (docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md §13).
--
-- Un combate es un HECHO: seed, snapshot inmutable de la mascota, versión de reglas,
-- hash del contenido, log de inputs y resultado RE-SIMULADO en servidor, con su digest.
-- Los eventos NO se guardan: se derivan volviendo a simular (Parte I §16.5).
--
-- Autoridad (#1081 R1): el cliente solo LEE lo suyo (necesita seed y snapshot para
-- simular en vivo). No hay política ni grant de INSERT/UPDATE/DELETE para
-- authenticated ni anon: escribe únicamente el servidor con service_role, después
-- de re-simular. Ninguna RPC accesible al cliente inserta aquí.

create table public.pet_battles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Identificador por INTENCIÓN (uuid v4 que genera el cliente por cada «pelear»):
  -- un reintento trae el mismo intent_id y recupera el combate (#1081 R4).
  intent_id uuid not null,
  -- text, no enum: 'training' hoy; R4 añade 'adventure' sin migración de tipo.
  kind text not null default 'training',
  enemy_id text not null,
  ruleset_version text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  seed text not null check (seed ~ '^[0-9a-f]{32}$'),
  snapshot jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  inputs jsonb,
  result jsonb,
  digest text check (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (user_id, intent_id),
  -- Abierto = sin inputs/resultado/digest; resuelto = con los tres y su fecha.
  check (
    (status = 'open' and inputs is null and result is null and digest is null and resolved_at is null)
    or (status = 'resolved' and inputs is not null and result is not null and digest is not null and resolved_at is not null)
  )
);

create index pet_battles_user_created_idx on public.pet_battles (user_id, created_at desc);

comment on table public.pet_battles is
  'Mascota RPG: combates como hechos (seed, snapshot, versión, inputs, resultado re-simulado, digest). Solo escribe el servidor (service_role); authenticated lee los suyos. Eventos no se guardan: se re-simulan. Spec 2026-09-06-mascota-r1-contratos-combate.';

alter table public.pet_battles enable row level security;

create policy "pet_battles select own" on public.pet_battles
  for select to authenticated using ((select auth.uid()) = user_id);

-- Sin políticas de escritura A PROPÓSITO (#1081 R1). service_role no pasa por RLS.
revoke all on public.pet_battles from anon, authenticated;
grant select on public.pet_battles to authenticated;
```

- [ ] **Step 2: Aplicar en dev**

Con el MCP `supabase-dev`: `apply_migration` con `name = "pet_battles"` y el SQL de arriba tal cual (o vía el agente `supabase-schema`). Si el MCP no conecta, usar el conector de claude.ai con el `project_id` de dev (ver memoria «Supabase: vía alternativa si cae el MCP»). No aplicar en prod todavía.

- [ ] **Step 3: Verificar contra objetos reales (no contra el ledger)**

`execute_sql` en dev:

```sql
select
  (select relrowsecurity from pg_class where oid = 'public.pet_battles'::regclass)              as rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pet_battles') as policies,
  has_table_privilege('authenticated', 'public.pet_battles', 'select')                            as auth_select,
  has_table_privilege('authenticated', 'public.pet_battles', 'insert')                            as auth_insert,
  has_table_privilege('authenticated', 'public.pet_battles', 'update')                            as auth_update,
  has_table_privilege('authenticated', 'public.pet_battles', 'delete')                            as auth_delete,
  has_table_privilege('anon', 'public.pet_battles', 'select')                                     as anon_select,
  has_table_privilege('service_role', 'public.pet_battles', 'insert')                             as service_insert,
  (select count(*) from pg_indexes where tablename = 'pet_battles' and indexname = 'pet_battles_user_created_idx') as idx;
```

Expected: `true | 1 | true | false | false | false | false | true | 1`. Pegar la fila en el resumen de la tarea (la Task 14 la copia a `data-model.md`).

- [ ] **Step 4: Tipos**

Preferido: `generate_typescript_types` del MCP `supabase-dev` y sustituir `src/lib/supabase/database.types.ts` entero (revisar en el diff que SOLO aparece `pet_battles`). Alternativa a mano, insertando en `Tables` justo antes de `pet_daily_missions: {` (línea ~1636):

```ts
      pet_battles: {
        Row: {
          content_hash: string
          created_at: string
          digest: string | null
          enemy_id: string
          id: string
          inputs: Json | null
          intent_id: string
          kind: string
          resolved_at: string | null
          result: Json | null
          ruleset_version: string
          seed: string
          snapshot: Json
          status: string
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          digest?: string | null
          enemy_id: string
          id?: string
          inputs?: Json | null
          intent_id: string
          kind?: string
          resolved_at?: string | null
          result?: Json | null
          ruleset_version: string
          seed: string
          snapshot: Json
          status?: string
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          digest?: string | null
          enemy_id?: string
          id?: string
          inputs?: Json | null
          intent_id?: string
          kind?: string
          resolved_at?: string | null
          result?: Json | null
          ruleset_version?: string
          seed?: string
          snapshot?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
```

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260907_pet_battles.sql src/lib/supabase/database.types.ts
git commit -m "feat(pet): tabla pet_battles: hechos de combate, lectura propia, sin escritura de cliente (R1)"
```

---

### Task 13: Test de integración de autoridad (JWT propio, otra cuenta, anónimo)

**Files:**
- Create: `e2e/mascota-batallas-autoridad.spec.ts`

**Interfaces:**
- Consumes: la tabla de la Task 12 aplicada en dev; `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: el criterio de salida «un JWT normal que intenta fabricar una victoria es rechazado; otra cuenta, también», en verde.

- [ ] **Step 1: Escribir el spec**

`e2e/mascota-batallas-autoridad.spec.ts`:

```ts
import { expect, test, type APIRequestContext } from "@playwright/test";

// R1 (contrato C1, #1081 R1): pet_battles la escribe SOLO el servidor. Este spec
// habla con PostgREST directamente, sin navegador: dos cuentas desechables (patrón
// de avisos-por-persona.spec.ts), una fila creada con service_role, y después
// cada cosa que un cliente podría intentar para fabricarse una victoria.
// Necesita el dev server arrancado (globalSetup) aunque no abra ninguna página.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const REST = `${SUPABASE_URL}/rest/v1/pet_battles`;

function adminHeaders(json = false) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...(json ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
  };
}

function userHeaders(token: string, json = false) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json", Prefer: "return=representation" } : {}),
  };
}

async function createUser(request: APIRequestContext, username: string) {
  const email = `${username}@example.com`;
  const password = "TestPassword123!";
  const auth = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: adminHeaders(),
    data: { email, password, email_confirm: true },
  });
  expect(auth.ok()).toBe(true);
  const user = await auth.json();
  const profile = await request.post(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: adminHeaders(true),
    data: { user_id: user.id, username, is_public: true },
  });
  expect(profile.ok()).toBe(true);
  return { id: user.id as string, username, email, password };
}

async function userToken(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).access_token as string;
}

async function deleteUser(id: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: adminHeaders() });
}

const SEED = "0123456789abcdef0123456789abcdef";
const SNAPSHOT = {
  name: "Nuez",
  petClass: "wizard",
  stage: "young",
  attributes: { FUE: 0, CON: 0, INT: 0, SAB: 0, CAR: 0, DES: 0 },
  tier: 1,
  hpMax: 110,
  atk: 10,
};

function openRow(userId: string) {
  return {
    user_id: userId,
    intent_id: crypto.randomUUID(),
    kind: "training",
    enemy_id: "brote",
    ruleset_version: "r2.1",
    content_hash: "0".repeat(64),
    seed: SEED,
    snapshot: SNAPSHOT,
  };
}

test("pet_battles: el cliente lee lo suyo y no puede insertar, editar, borrar ni ver lo ajeno", async ({ request }) => {
  test.setTimeout(60_000);
  const stamp = Date.now();
  const a = await createUser(request, `batallaa${stamp}`.slice(0, 20));
  const b = await createUser(request, `batallab${stamp}`.slice(0, 20));
  try {
    const tokenA = await userToken(request, a.email, a.password);
    const tokenB = await userToken(request, b.email, b.password);

    // Solo el servidor (service_role) crea combates.
    const created = await request.post(REST, { headers: adminHeaders(true), data: openRow(a.id) });
    expect(created.ok()).toBe(true);
    const [row] = (await created.json()) as Array<{ id: string }>;

    // A ve su combate, con seed y snapshot: los necesita para simular en vivo.
    const mine = await request.get(`${REST}?select=id,seed,status,result&user_id=eq.${a.id}`, { headers: userHeaders(tokenA) });
    expect(mine.status()).toBe(200);
    const rows = (await mine.json()) as Array<{ id: string; seed: string; status: string; result: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: row.id, seed: SEED, status: "open", result: null });

    // A no puede fabricarse una victoria: ni insertando…
    const insert = await request.post(REST, { headers: userHeaders(tokenA, true), data: openRow(a.id) });
    expect(insert.status()).toBe(403);
    expect((await insert.json()).code).toBe("42501");

    // …ni resolviendo su combate a mano…
    const patch = await request.patch(`${REST}?id=eq.${row.id}`, {
      headers: userHeaders(tokenA, true),
      data: { status: "resolved", inputs: [], result: { outcome: "win" }, digest: "0".repeat(64), resolved_at: new Date().toISOString() },
    });
    expect(patch.status()).toBe(403);
    expect((await patch.json()).code).toBe("42501");

    // …ni borrándolo.
    const del = await request.delete(`${REST}?id=eq.${row.id}`, { headers: userHeaders(tokenA) });
    expect(del.status()).toBe(403);

    // B no ve los combates de A ni puede crearle uno.
    const theirs = await request.get(`${REST}?select=id&user_id=eq.${a.id}`, { headers: userHeaders(tokenB) });
    expect(theirs.status()).toBe(200);
    expect(await theirs.json()).toEqual([]);
    const forge = await request.post(REST, { headers: userHeaders(tokenB, true), data: openRow(a.id) });
    expect(forge.status()).toBe(403);

    // Sin sesión, nada.
    const anon = await request.get(`${REST}?select=id`, { headers: { apikey: ANON_KEY } });
    expect([401, 403]).toContain(anon.status());

    // La fila sigue intacta después de todos los intentos.
    const after = await request.get(`${REST}?select=status,result&id=eq.${row.id}`, { headers: adminHeaders() });
    expect(await after.json()).toEqual([{ status: "open", result: null }]);
  } finally {
    await deleteUser(a.id);
    await deleteUser(b.id);
  }
});
```

- [ ] **Step 2: Arrancar el dev server y correr el spec**

En una terminal aparte (y solo una): `npm run dev`. Esperar a que `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` devuelva `200`.

Run: `npx playwright test e2e/mascota-batallas-autoridad.spec.ts`
Expected: `1 passed`. Si el POST del usuario devuelve `401` en vez de `403`, PostgREST está tratando el JWT como anónimo: comprobar que `userToken` devolvió un `access_token` (el login por contraseña debe estar habilitado en el proyecto dev; el e2e `avisos-por-persona` usa el mismo camino por navegador).

- [ ] **Step 3: Commit**

```bash
git add e2e/mascota-batallas-autoridad.spec.ts
git commit -m "test(pet): autoridad de pet_battles: ni JWT propio ni otra cuenta fabrican una victoria (R1)"
```

---

### Task 14: La spec ejecutable de R2 y la sincronización documental

**Files:**
- Create: `docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md`
- Modify: `docs/requirements/data-model.md` (§8bis), `docs/requirements/backlog.md` (bloque **Mascota**), `docs/requirements/decisiones.md` (append), `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md` (Parte II), `README.md` (fila de la hoja de ruta), `docs/architecture/graph.json` (+ `map.html` regenerado)

**Interfaces:**
- Consumes: `content.ts` (números finales), la tabla de `calibrate` (Task 10), `normative.json` (Task 11), la fila de verificación de dev (Task 12).
- Produces: la spec que R2 implementa; la doc canónica diciendo la verdad.

- [ ] **Step 1: Escribir la spec**

`docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md`, con este esqueleto (los textos entre «» se rellenan con los artefactos citados; nada más se inventa):

```markdown
# Mascota R1: contratos y modelo de combate (la spec de R2)

> **[Canónico · verificado «fecha de cierre»]** Contratos del combate de la mascota
> (Parte I §16 de `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md`), cerrados
> en el hito R1 con código y tests en `src/lib/pet/battle/`. Es lo que implementa R2.
> Si contradice al código, manda el código; los números mandan en `content.ts`.

## Criterio
Una sola frase: el cliente simula, el servidor decide; nada calculado en local cuenta.

## 1–11. Contratos
Los once contratos C1–C11 de `docs/superpowers/plans/2026-09-06-mascota-r1-contratos-combate.md`,
copiados tal cual, con los números de C6 sustituidos por los finales de `content.ts` y
la tabla de `calibrate` (Task 10) pegada al final de C7.

## 12. Ejemplo normativo
Del fixture `src/lib/pet/battle/__fixtures__/normative.json`: seed e índice, snapshot
(nombre, clase, tramo, hpMax, atk), la lista de inputs, los doce primeros eventos y el
último, el resultado, `canonicalHead` (los primeros 240 bytes del material del hash, en
UTF-8), `canonicalLength` y el digest. Frase fija: «El material del hash es
canonicalJson({ rulesetVersion, contentHash, enemyId, seed, snapshot, inputs, events,
result }); no contiene el digest. `normative.test.ts` lo recalcula».

## 13. Datos
La migración `supabase/migrations/20260907_pet_battles.sql` explicada columna a columna y
la fila de verificación de la Task 12. Flujo de R2 (C10): startBattle → open;
resolveBattle → validateInputs → resimulate → resolved. Sin `use cache`.

## 14. Qué implementa R2 con esto
Lista cerrada: server action `startBattle(intentId)` (service_role, snapshot desde
getPetSnapshot con buildSnapshot, seed con crypto.getRandomValues, idempotente por
intent_id); server action `resolveBattle(intentId, inputs)` (recupera si ya está
resuelto; valida; re-simula; persiste inputs/result/digest); página de entrenamiento en
/mascota con el motor en cliente (stepBattle + viewOf), pausa y velocidad; resultado
legible (result.causes); replay desde eventos re-simulados. Criterios de salida de R2:
los de la Parte II.

## 15. Pruebas
Tabla fichero → qué fija (los 13 tests de `src/lib/pet/battle/`, el e2e de autoridad).
Cómo correr el CLI.

## 16. Límites asumidos
- El seed es legible por el dueño: un cliente modificado puede precalcular el momento
  óptimo; solo importa en PvP y rankings, fuera del roadmap activo (§16.2).
- Los eventos no se guardan; el replay re-simula (C9).
- `kind` es texto sin CHECK: R4 añade 'adventure' sin migración de tipo.
- El tramo de poder no se guarda: viaja en el snapshot de cada combate.
```

- [ ] **Step 2: `data-model.md`**

Añadir al final de «8bis. Mascota» (antes de `## 9. Seguridad`), con el siguiente número libre (8bis.5, o 8bis.6 si S1 ya ocupó el 5):

```markdown
### 8bis.N. `pet_battles` (dev «fecha»; prod pendiente hasta mergear)

Mascota R1 (spec `docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md`,
issue #1081). Migración `supabase/migrations/20260907_pet_battles.sql`. Un combate es un
**hecho**: `seed` (32 hex), `snapshot` (jsonb inmutable de la mascota), `ruleset_version`,
`content_hash`, `inputs` (jsonb, el log `(seq, tick, action, payload)`), `result` (jsonb) y
`digest` (sha256 del registro más los eventos re-simulados). **Los eventos no se guardan**:
se derivan re-simulando. `intent_id` + `unique (user_id, intent_id)` = idempotencia por
intención (#1081 R4). `status` `open` → `resolved` con CHECK de coherencia. `kind` texto
sin CHECK (`training` hoy).

**RLS** activa, **una** política: `select` propio para `authenticated`. **Sin**
insert/update/delete para `authenticated` ni `anon`: escribe solo el servidor con
`service_role` tras re-simular (contrato C1). Como `pet_nudges`, **no aparece en la
superficie 6 de `DRIFT-CHECK.md`** (solo mira tablas donde `authenticated` tiene algún
grant de escritura); se anota aquí con su control. Verificación en dev («fecha») contra
objetos reales: `true | 1 | true | false | false | false | false | true | 1` (RLS, políticas,
select/insert/update/delete de `authenticated`, select de `anon`, insert de `service_role`,
índice). El e2e `e2e/mascota-batallas-autoridad.spec.ts` lo comprueba desde PostgREST.
```

- [ ] **Step 3: `backlog.md`**

Sustituir la línea `- [ ] Mascota RPG (hoja de ruta viva en …` del bloque **Mascota** por:

```markdown
- [ ] Mascota RPG (hoja de ruta viva en [RPG de mascota: visión y hoja de ruta](../design/2026-09-06-mascota-rpg-evolucion-por-fases.md), Parte II; dirección adoptada el 2026-09-06 en la PR #1079). Combate automático con intervenciones de un toque y ulti con minijuego; simulación en cliente y re-simulación en servidor. **R1 contratos cerrado el «fecha»** (PR #«N»): motor determinista en `src/lib/pet/battle/`, spec `docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md`, tabla `pet_battles`, CLI `npm run pet:battle`, e2e de autoridad. Hito activo: **R2 combate mínimo universal** (kit genérico para las seis clases, un enemigo con dos anuncios contrarios, entrenamiento sin recompensa, sin arte nuevo). Seguimiento #1082. Los hitos R no renumeran las fases 1–3 ya implementadas.
```

- [ ] **Step 4: `decisiones.md` (append al final)**

```markdown
## «fecha» — Mascota R1: contratos del combate cerrados en código

**Decisión.** Los contratos de R1 (Parte II) se cierran como código con tests, no como
prosa: motor puro en `src/lib/pet/battle/`, ejemplo normativo congelado
(`__fixtures__/normative.json`), CLI `npm run pet:battle` y test de autoridad e2e. La
spec `2026-09-06-mascota-r1-contratos-combate-design.md` cita esos artefactos.

**Lo que fija y por qué.**
- PRNG xoshiro128** con orden de tiradas documentado; seed de 128 bits del servidor.
- Reloj de 100 ms, 600 ticks; orden de resolución por tick normativo (transiciones →
  inputs → básica mascota → básica enemigo → límite). Un KO corta el tick.
- Log de inputs `(seq, tick, action, payload)` validado en servidor; un input tras el fin
  invalida el log. Los eventos no se guardan: se re-simulan.
- Digest = sha256 del JSON canónico de registro + eventos, sin el digest dentro (#1081 R5).
- Poder de combate = suma de atributos sin bonus de clase; el nivel visible no se toca
  (#1081 R6). En R2 la clase no altera stats: identidad de clase = R6.
- Enemigo medido contra la mascota (vida en múltiplos de atk, golpes en % de vida): la
  decisión gana en todos los tramos y la calibración lo comprueba con seis perfiles.
- `pet_battles` sin grants de escritura para el cliente; escribe service_role (#1081 R1);
  `intent_id` único por usuario (#1081 R4).

**Qué sustituye.** Los §3–§6 de la spec aparcada del 2026-09-04 (stats por atributo,
actitudes, técnicas por clase, HMAC del seed, INSERT propio).

**Consecuencia.** R2 no diseña: implementa. Cambiar un número de `content.ts` exige subir
`RULESET.version` y regenerar el ejemplo normativo; el test lo recuerda.
```

- [ ] **Step 5: Parte II del doc canónico, README y graph.json**

En `docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md`:
- En «## R1 — Contratos y modelo de combate», tras los criterios de salida, añadir el párrafo `**Cerrado el «fecha»** (PR #«N»): spec `docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md`; motor, CLI, tabla y tests en el repo. Hito activo: R2.`
- En la tabla «Resumen», fila R1: `| R1 Contratos y modelo de combate | la spec ejecutable de R2 — **cerrado «fecha»** | criterios | ninguno |`.
- En «Relación con las issues», fila #1081: `| #1081 | contratos: cerrada el «fecha» con R1 (sus R1, R4, R5 y R6); sus R2, R3 y R7 pasan a #«M» para R7 |`.
- Actualizar la cabecera: `Parte II (hoja de ruta) viva, revisada el «fecha»`.

En `README.md`, fila de la hoja de ruta (línea ~59): estado `Diseño de producto · Parte II viva · R1 cerrado, R2 en curso`.

En `docs/architecture/graph.json`, añadir tras el nodo `m-pet` (misma capa `domain`):

```json
    {
      "id": "m-pet-battle",
      "label": "lib/pet/battle",
      "layer": "domain",
      "kind": "module",
      "size": 13,
      "summary": "Motor de combate de la mascota (R1, spec 2026-09-06-mascota-r1-contratos-combate). PURO: xoshiro128** sembrado por un seed de 128 bits del servidor, reloj de 100 ms, log de inputs (seq, tick, action, payload), eventos derivados, resultado con causas. El cliente lo ejecuta para animar (stepBattle + viewOf) y el servidor para decidir (resimulate): digest = sha256 del JSON canónico de registro + eventos, sin circularidad. content.ts es el único sitio con números; cambiar uno = subir RULESET.version y regenerar __fixtures__/normative.json. CLI: scripts/pet-battle/simulate.ts (run, calibrate, replay, golden).",
      "files": [
        "src/lib/pet/battle/prng.ts",
        "src/lib/pet/battle/canonical.ts",
        "src/lib/pet/battle/hash.ts",
        "src/lib/pet/battle/types.ts",
        "src/lib/pet/battle/content.ts",
        "src/lib/pet/battle/power.ts",
        "src/lib/pet/battle/profiles.ts",
        "src/lib/pet/battle/inputs.ts",
        "src/lib/pet/battle/engine.ts",
        "src/lib/pet/battle/policies.ts",
        "src/lib/pet/battle/calibration.ts",
        "src/lib/pet/battle/record.ts",
        "src/lib/pet/battle/minigame.ts"
      ],
      "gotchas": [
        "Ningún fichero del motor puede importar Supabase, React, Date ni Math.random: purity.test.ts lo vigila.",
        "Los eventos NO se guardan en pet_battles: reproducir eventos guardados no es re-simular."
      ]
    },
```

tras el nodo `t-pet-nudges` (capa `db`):

```json
    {
      "id": "t-pet-battles",
      "label": "pet_battles",
      "layer": "db",
      "kind": "table",
      "summary": "Un combate como hecho: seed, snapshot inmutable, versión, hash del contenido, log de inputs, resultado re-simulado y digest. authenticated solo lee los suyos; escribe únicamente el servidor con service_role tras re-simular. unique (user_id, intent_id) = idempotencia por intención.",
      "columns": ["id", "user_id", "intent_id", "kind", "enemy_id", "ruleset_version", "content_hash", "seed", "snapshot", "status", "inputs", "result", "digest", "created_at", "resolved_at"],
      "gotchas": [
        "Sin grants de INSERT/UPDATE/DELETE para authenticated ni anon a propósito (#1081 R1): no aparece en la superficie 6 de DRIFT-CHECK."
      ]
    },
```

y en `edges`:

```json
    { "from": "m-pet-battle", "to": "m-pet", "kind": "reads", "label": "deriveAttributes / levelFor (poder sin bonus)" },
    { "from": "m-pet-battle", "to": "t-pet-battles", "kind": "writes", "label": "R2: service_role tras resimulate" },
```

Run: `node docs/architecture/sync.mjs`
Expected: sin errores de integridad; `docs/architecture/map.html` regenerado.

- [ ] **Step 6: Issues**

Crear la issue que hereda lo que no es de R1 (guardar el cuerpo en `.superpowers/tmp/issue-r7.md`; sin etiquetas no se crea):

```bash
gh issue create --label "area:play,tipo:deuda,P3" \
  --title "Mascota R7: contratos de los jefes de reto (raid, edición del reto, ventana e importación) — heredados de #1081" \
  --body-file .superpowers/tmp/issue-r7.md
```

Cuerpo: qué son los puntos R2 (vida persistente del jefe: `maxHp`/`initialHp`, distribución de intentos), R3 (editar, rebalancear o borrar el reto no reescribe una victoria: congelar la edición del encuentro al activarlo) y R7 (ventana, historial, importación, `rawCompleted`, relecturas, retos superpuestos) de #1081, copiados de su texto; que se resuelven en la spec de R7 (Parte II) y no antes; qué SÍ está cerrado (R1: autoridad, seed, log, digest, poder sin bonus, `intent_id`).

Comentar en #1081 con la tabla «punto → dónde se cierra» (R1, R4, R5, R6 → la spec de R1 con enlace a la sección; R2, R3, R7 → #«M») y cerrarla: `gh issue close 1081 --comment "..."`. Comentar en #1082: R1 cerrado, R2 es el siguiente, enlace a la spec.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-06-mascota-r1-contratos-combate-design.md docs/requirements/data-model.md docs/requirements/backlog.md docs/requirements/decisiones.md docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md README.md docs/architecture/graph.json docs/architecture/map.html
git commit -m "docs(pet): spec ejecutable de R2 (contratos R1), data-model, backlog, decisiones, Parte II y grafo"
```

---

### Task 15: PR, y prod después del merge

**Files:** ninguno nuevo.

- [ ] **Step 1: Verde completo y push**

Run: `npx vitest run` → todo verde. `npm run lint` → sin errores. `npx tsc --noEmit` → sin errores.

```bash
git push -u origin feat/mascota-r1-contratos
```

- [ ] **Step 2: Abrir la PR**

```bash
gh pr create --base main --head feat/mascota-r1-contratos \
  --title "feat(pet): R1 — motor determinista, contratos de combate, pet_battles y simulador (#1081)" \
  --body-file .superpowers/tmp/pr-r1.md
```

Cuerpo (`.superpowers/tmp/pr-r1.md`): qué cierra (R1 de la Parte II; #1081 R1/R4/R5/R6), los tres criterios de salida con su evidencia (ruta del fixture y del test, salida de `calibrate` pegada, nombre del e2e), la respuesta escrita a las dos preguntas de `use cache` de AGENTS.md («no hay ningún `use cache`: todo depende de la sesión»), la nota de migración (aplicada en dev, verificada con la fila de la Task 12; **prod pendiente** hasta el merge), y el footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 3: Tras el merge: prod**

Aplicar `supabase/migrations/20260907_pet_battles.sql` en prod (`supabase-prod`, `apply_migration`), repetir la consulta de verificación de la Task 12 (mismo resultado esperado) y actualizar en `data-model.md` la cabecera de la subsección a `(dev y **prod**, «fecha»)` con la fila de prod. Es aditiva pura: el código de `main` no escribe en la tabla hasta R2.

Limpiar el worktree si se usó uno (`git worktree remove`, comprobando antes que `node_modules` de la raíz es una carpeta real, #277).

---

## Self-review del plan (hecho al escribirlo)

- **Cobertura de la Parte II R1:** autoridad → Task 12 + 13; seed y snapshot → Task 1, 4; log de inputs → Task 5, 6; replay y checksum sin circularidad → Task 8, 11; versión y hash → Task 3; identificador por intención → Task 12 (esquema) y C10 (flujo de R2); poder de combate calibrado con perfiles → Task 4, 7; instancia de minijuego → Task 9. Criterios de salida: ejemplo normativo → Task 11; test de integración → Task 13; CLI → Task 10.
- **Nombres cruzados:** `seedFromIndex`, `subStream` (Task 1) ↔ Task 7, 9, 10; `enemyStats`/`buildSnapshot` (Task 4) ↔ Task 6, 10; `validateInputs` (Task 5) ↔ Task 8; `createBattle`/`stepBattle`/`viewOf`/`simulate` (Task 6) ↔ Task 7, 8, 10; `runPolicy`/`POLICIES`/`POLICY_IDS` (Task 7) ↔ Task 8, 10; `resimulate`/`battleDigest`/`digestMaterial` (Task 8) ↔ Task 10, 11.
- **Lo que NO está aquí a propósito:** server actions, página y replay visual (R2); animaciones (R3); aventuras, botín y bellotas (R4–R5).
