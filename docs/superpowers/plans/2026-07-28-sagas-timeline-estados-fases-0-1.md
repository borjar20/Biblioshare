# Sagas · timeline con los cuatro estados — fases 0 y 1 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que elegir un itinerario deje de ser la vista peor del producto — un único componente de orden de lectura, con las cuatro formas de fila del mockup, montado en móvil y al pie del grafo de PC, **sin ninguna migración**.

**Architecture:** todo lo nuevo cae en dos sitios. (1) `deriveTimeline` —función pura— gana un modo de columna (`spine: "curation" | "route"`) y dos formas de fila nuevas (`tandem`, `window`) que se derivan de datos que YA existen en el grafo: el empate de `orderNo` (dos obras que comparten hueco) y las aristas de ventana que ya resuelve `deriveSagaMap`. (2) `ReadingTimeline` se parte en sub-piezas presentacionales que pintan las cuatro formas. Ninguna fase toca `progress.ts`, ni el denominador, ni el esquema.

**Tech Stack:** Next.js 16 (App Router, React Server Components), TypeScript, Tailwind v4, next-intl, Vitest (unitarias), Playwright (e2e), Supabase (solo lectura en estas dos fases).

**Documento de origen:** `docs/superpowers/specs/2026-07-28-sagas-timeline-estados-design.md`. Este plan cubre **solo las fases 0 y 1** de su tabla de fases. Las fases 2 a 6 tocan esquema (`saga_tandems`, `motivo`, opcionales, roles) y tendrán su propio plan cada una: son parables en seco, que es justo por lo que la spec las ordenó así.

## Global Constraints

- **El progreso no se toca.** `src/lib/sagas/progress.ts` sale de estas dos fases byte a byte como entró. Ni el denominador, ni `countedKeys`, ni `isMemberCompleted`. Si un paso parece pedirlo, está mal escrito: para y pregunta.
- **Cero migraciones en la fase 1.** Ni tablas, ni columnas, ni enums, ni RPC. Si hace falta un dato que no está en `SagaGraph`, es señal de que el paso pertenece a la fase 2, 3 o 4.
- **Una sola resolución por ancla.** Un ancla que apunta a un bloque (`s:<uuid>`) se resuelve como ya la resuelve `resolveEntry` en `derive-map.ts` (última obra para un `después de`, primera para un `antes de`). No se escribe una segunda resolución en `derive-timeline.ts`: se consumen las aristas que `deriveSagaMap` ya dejó resueltas.
- **Ni una tercera ancla, ni dos ventanas por entrada.** Lo fijó la fase 2b. Si al construir apetece, se para y se dice en voz alta.
- **Idioma:** todo el texto de usuario en `messages/es.json`, namespace `saga`. Es el único locale del proyecto.
- **Node 22.** El shell abre con Node v20 y eso rompe Vitest: `fnm use 22` antes de `npm test`. Ver `C:\Users\borja\.claude\projects\D--Proyectos-Personal-Biblioshare\memory\biblioshare-node-env.md`.
- **Un solo `next dev`, en el puerto 3000.** Playwright reutiliza el que haya (`reuseExistingServer: true`). No levantes un segundo.
- **Nombres de campo en inglés** en TypeScript (`mode`, `note`, `reason`, `track`), aunque la spec los nombre en castellano (`modo`, `nota`, `motivo`). Es la convención del repo (`afterKey`, `groupSagaId`, `placementInParent`).

---

## File Structure

**Fase 0 — cierre de la #215**

| Fichero | Responsabilidad |
|---|---|
| `e2e/support/qa-seed.ts` (crear) | La línea base de la semilla QA de sagas, como dato, y `restoreQaSeed()` que la reimpone por REST. Nada de Playwright aquí: es un módulo que se puede llamar a mano. |
| `e2e/global-setup.ts` (crear) | Cuatro líneas: llama a `restoreQaSeed()` antes de la suite. |
| `playwright.config.ts` (modificar) | Declarar `globalSetup`. |

**Fase 1 — el motor y el componente**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/sagas/derive-timeline.ts` (modificar) | Las cuatro formas de fila y los dos modos de columna. Sigue siendo puro y sin dependencias de Supabase. |
| `src/lib/sagas/derive-timeline.test.ts` (modificar) | Unitarias del motor. |
| `src/components/saga/reading-timeline.tsx` (modificar) | Cáscara: recorre secciones, construye las etiquetas una vez y delega cada fila en su sub-pieza. |
| `src/components/saga/timeline/timeline-labels.ts` (crear) | El tipo `TimelineLabels` y su constructor desde `getTranslations`. Que las sub-piezas no sean `async` es lo que permite que sean funciones planas y testeables a ojo. |
| `src/components/saga/timeline/timeline-entry-row.tsx` (crear) | Fila `entry` + sus ramas. |
| `src/components/saga/timeline/timeline-tandem-row.tsx` (crear) | Fila `tandem`: corchete y N portadas en un solo hueco. |
| `src/components/saga/timeline/timeline-window-row.tsx` (crear) | Fila `window`: banda y las dos anclas resueltas. |
| `src/components/saga/timeline/timeline-branch.tsx` (crear) | La rama punteada, compartida por `entry` y `tandem`. |
| `src/components/saga/saga-map-tab.tsx` (modificar) | Monta el timeline en móvil (ya lo hacía) y **al pie del grafo en PC**; retira «Como lista lineal»; pasa el grafo del itinerario a `RouteView`. |
| `src/components/saga/route-view.tsx` (modificar) | Conserva cabecera, contador, adoptar y «Sin puesto en este itinerario»; **sustituye** su `<ol>` de pasos por el timeline en modo `route`. |
| `messages/es.json` (modificar) | Claves nuevas del namespace `saga`; se retira `asLinearList`. |
| `e2e/sagas-timeline-estados.spec.ts` (crear) | E2E de la fase 1 + inyección de fallo. |

---

## Task 1: Fase 0 — `globalSetup` que restaura la semilla QA (cierra la #215)

**Por qué va primera:** sin ella, cada tarea siguiente hereda una suite que falla por motivos ajenos y la inyección de fallo —que es lo que de verdad valida los tests— deja de ser fiable. **La semilla está desviada AHORA MISMO**, verificado por `SELECT` contra dev el 2026-07-28: `Libro sin valorar` está `placement='libre'`/`position=null` cuando su línea base es `fijo`/2, y los tres restantes están corridos (Rayuela 1, Libro raro 2, Isabel 3) con Nieta en `position_in_parent=4` en vez de 5.

**Files:**
- Create: `e2e/support/qa-seed.ts`
- Create: `e2e/global-setup.ts`
- Modify: `playwright.config.ts` (bloque `defineConfig`, junto a `testDir`)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `restoreQaSeed(): Promise<void>`, `ERA_UNO_ID: string`, `NIETA_ID: string`, `ERA_UNO_BASELINE: readonly {itemId, title, position}[]` desde `e2e/support/qa-seed.ts`.

- [ ] **Step 1: Escribir el módulo de semilla**

Crear `e2e/support/qa-seed.ts`:

```ts
// Línea base de la semilla QA de sagas y su restauración (issue #215).
//
// El problema medido no era solo el paralelismo (la config ya corre con
// `workers: 1`): cada spec lee su estado de partida al empezar y lo restaura al
// acabar, así que **si arranca sobre una semilla ya sucia, restaura la
// suciedad**. Un spec que muere a mitad deja su `finally` sin correr y
// contamina al siguiente, y esa deriva sobrevive entre sesiones. Reimponer la
// línea base ANTES de la suite cierra las dos causas a la vez.
//
// Los valores salen de lo que documenta `e2e/sagas-ventanas.spec.ts` y de la
// tabla de la #215, verificados con `SELECT` contra dev el 2026-07-28.

export const ERA_UNO_ID = "53118dd4-ccd9-4a9d-8241-5899816a9eab"; // [QA Sagas v2] Era Uno
export const NIETA_ID = "02484dc9-9885-4627-9176-912ac45f85e0"; // [QA Sagas v2] Nieta

/** Las 4 obras directas de Era Uno, en su orden curado. Todas `fijo`,
 *  `optional = false` y `role = null`: cualquier spec que toque uno de esos
 *  tres campos (sagas-rol-narrativo toca `role`; sagas-colocacion-opcionalidad
 *  toca `optional` y `placement`) queda revertido por esto. */
export const ERA_UNO_BASELINE = [
  { itemId: "b397333b-7f8c-40a2-b62e-2aa3eb6bf64a", title: "Rayuela", position: 1 },
  { itemId: "4c076a65-4888-4715-913e-2157374cd227", title: "Libro sin valorar", position: 2 },
  { itemId: "d6d61eab-6ef4-4691-a8f0-b89068508fd4", title: "Libro raro sin match", position: 3 },
  { itemId: "79ddcbd0-3342-44dc-84c0-ffa5c635fbfc", title: "Para leer a Isabel Allende", position: 4 },
] as const;

/** Nieta es el ÚLTIMO hueco de Era Uno: su `position_in_parent` se mueve sola
 *  cuando un spec saca una obra de la secuencia (5 → 4). */
export const NIETA_BASELINE = { position_in_parent: 5, placement_in_parent: "fijo" } as const;

/** No hay ventana en la línea base: `sagas-ventanas.spec.ts` documenta
 *  `saga_placement_windows` vacía para Era Uno. */

// El entorno se lee DENTRO de las funciones, no en el módulo: `playwright.config.ts`
// carga `.env.local` a mano al evaluarse, y leerlo arriba acopla este fichero al
// orden en que Playwright importa los módulos.
function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[qa-seed] faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, key };
}

async function api(path: string, init?: RequestInit) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`[qa-seed] ${init?.method ?? "GET"} ${path}: ${res.status} — ${await res.text()}`);
  }
  return res;
}

/** Guarda de seguridad: esto escribe con la SERVICE KEY, así que antes de tocar
 *  nada comprueba que el UUID que va a modificar SIGUE siendo la saga QA. Si
 *  alguien apunta `.env.local` a otro proyecto, o si el seed se renombra, aborta
 *  en vez de pisar datos reales. Es una comprobación de DATO, no de entorno:
 *  funciona igual apuntando a donde apunte. */
async function assertQaUniverse() {
  const rows = (await (await api(`sagas?id=eq.${ERA_UNO_ID}&select=name`)).json()) as Array<{ name: string }>;
  if (rows[0]?.name !== "[QA Sagas v2] Era Uno") {
    throw new Error(
      `[qa-seed] ABORTADO: ${ERA_UNO_ID} no es "[QA Sagas v2] Era Uno" (es ${JSON.stringify(rows[0]?.name ?? null)}). ` +
        "¿Está .env.local apuntando al proyecto Supabase equivocado?",
    );
  }
}

/** Reimpone la línea base. Idempotente: correrla sobre una semilla limpia no
 *  cambia ninguna fila. */
export async function restoreQaSeed(): Promise<void> {
  await assertQaUniverse();

  for (const item of ERA_UNO_BASELINE) {
    // `position` y `placement` van en el MISMO PATCH: el CHECK
    // `saga_items_placement_position` exige `position IS NOT NULL` cuando
    // `placement = 'fijo'`, así que separarlos rebota. No hay índice único
    // sobre (saga_id, position) —un tándem es justo un empate—, así que los
    // PATCH secuenciales no chocan entre sí aunque crucen posiciones.
    await api(`saga_items?saga_id=eq.${ERA_UNO_ID}&item_type=eq.book&item_id=eq.${item.itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ position: item.position, placement: "fijo", optional: false, role: null }),
    });
  }

  await api(`sagas?id=eq.${NIETA_ID}`, { method: "PATCH", body: JSON.stringify(NIETA_BASELINE) });

  await api(`saga_placement_windows?saga_id=eq.${ERA_UNO_ID}`, { method: "DELETE" });
}
```

- [ ] **Step 2: Escribir el `globalSetup`**

Crear `e2e/global-setup.ts`:

```ts
import { restoreQaSeed } from "./support/qa-seed";

// Playwright ejecuta esto UNA vez, antes de toda la suite. Si falla, la suite
// no arranca — y eso es lo que se quiere: correr sobre una semilla desviada es
// lo que produjo la #215.
export default async function globalSetup() {
  await restoreQaSeed();
}
```

- [ ] **Step 3: Declararlo en la config**

En `playwright.config.ts`, dentro de `defineConfig({...})`, justo después de `testDir`:

```ts
  testDir: "./e2e",
  // Issue #215: la semilla QA de sagas se corrompía entre specs y ENTRE
  // SESIONES (un spec que muere a mitad deja su `finally` sin correr, y el
  // siguiente lee esa suciedad como su estado de partida y la restaura). Esto
  // reimpone la línea base antes de la suite. No sustituye a la limpieza de
  // cada spec: la hace componible.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
```

- [ ] **Step 4: Inyección de fallo — desviar la semilla a propósito y comprobar que la suite la recupera**

Primero, romperla desde PowerShell (`$env:` ya lo tiene `.env.local`; si no, exporta a mano):

```powershell
$env:SUPABASE_URL = (Select-String -Path .env.local -Pattern '^NEXT_PUBLIC_SUPABASE_URL=(.*)$').Matches.Groups[1].Value
$env:SERVICE_KEY  = (Select-String -Path .env.local -Pattern '^SUPABASE_SERVICE_ROLE_KEY=(.*)$').Matches.Groups[1].Value
Invoke-RestMethod -Method Patch -Uri "$env:SUPABASE_URL/rest/v1/saga_items?saga_id=eq.53118dd4-ccd9-4a9d-8241-5899816a9eab&item_id=eq.b397333b-7f8c-40a2-b62e-2aa3eb6bf64a" -Headers @{ apikey = $env:SERVICE_KEY; Authorization = "Bearer $env:SERVICE_KEY"; "Content-Type" = "application/json" } -Body '{"position": 9}'
```

Esperado: la semilla queda con Rayuela en la posición 9.

- [ ] **Step 5: Correr la suite de sagas y comprobar que pasa desde una semilla sucia**

Run: `npx playwright test e2e/sagas-ventanas.spec.ts e2e/sagas-editor-secuencia.spec.ts e2e/sagas-colocacion-opcionalidad.spec.ts e2e/sagas-colocacion-bloques.spec.ts --reporter=line`

Expected: **todos pasan**. Antes de esta tarea, la #215 documenta entre 4 y 6 fallos, con `sagas-editor-secuencia.spec.ts:113` («bajar un hueco renumera») esperando *Rayuela* en la 2ª fila y encontrando *Libro raro sin match*.

- [ ] **Step 6: Comprobar que la semilla quedó en su línea base**

Run (PowerShell):

```powershell
Invoke-RestMethod -Uri "$env:SUPABASE_URL/rest/v1/saga_items?saga_id=eq.53118dd4-ccd9-4a9d-8241-5899816a9eab&select=item_id,position,placement,optional,role&order=position" -Headers @{ apikey = $env:SERVICE_KEY; Authorization = "Bearer $env:SERVICE_KEY" } | ConvertTo-Json
```

Expected: cuatro filas, `position` 1,2,3,4 en el orden Rayuela / Libro sin valorar / Libro raro sin match / Para leer a Isabel Allende, todas `placement = "fijo"`, `optional = false`, `role = null`.

- [ ] **Step 7: Comprobar la guarda de seguridad**

Corre el `globalSetup` con un UUID que no es el QA, para ver que aborta en vez de escribir:

Run: `node --input-type=module -e "process.env.NEXT_PUBLIC_SUPABASE_URL='https://ejemplo.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY='x'; const m = await import('./e2e/support/qa-seed.ts'); await m.restoreQaSeed().catch(e => { console.log('OK:', e.message); process.exit(0); }); console.log('FALLO: no abortó'); process.exit(1)"`

Expected: imprime `OK: [qa-seed] GET sagas?…` (falla en la primera petición, antes de cualquier escritura). Si tu Node no traga TypeScript directo, vale igual con comprobarlo a ojo: `restoreQaSeed` llama a `assertQaUniverse()` en su **primera** línea y todos los `PATCH`/`DELETE` van después.

- [ ] **Step 8: Cerrar la issue #215 diciendo qué se hizo**

Run:

```bash
gh issue close 215 --comment "Cerrada con el \`globalSetup\` de Playwright (\`e2e/global-setup.ts\` + \`e2e/support/qa-seed.ts\`): reimpone la línea base de \`[QA Sagas v2] Era Uno\` antes de la suite, que era la salida (1) de las tres que proponía la issue. Verificado desviando la semilla a mano (Rayuela a position 9) y comprobando que los 4 specs de sagas pasan y que la semilla queda en 1,2,3,4 con Nieta en 5.

La limpieza por spec NO se ha tocado: sigue siendo correcta, y ahora compone porque su estado de partida ya no puede llegar sucio."
```

- [ ] **Step 9: Commit**

```bash
git add e2e/support/qa-seed.ts e2e/global-setup.ts playwright.config.ts
git commit -m "test(e2e): restaurar la semilla QA de sagas antes de la suite (#215)"
```

---

## Task 2: El motor — cuatro formas de fila y los dos modos de columna

**Files:**
- Modify: `src/lib/sagas/derive-timeline.ts:19-115`
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Consumes: `SagaGraph`, `SagaGraphNode` (`src/lib/sagas/map-types.ts`), sin cambios.
- Produces:
  ```ts
  export type TimelineSpine = "curation" | "route";
  export type TandemMode = "simultaneo" | "indistinto";
  export type WindowReason = "spoiler" | "contexto";
  export type TimelineTrack = { fromPct: number; toPct: number; youPct: number | null; notice: "antes" | "dentro" | "pasada" };
  export type TimelineBranch = { node: SagaGraphNode; edgeType: "opcional" | "requisito" };
  export type TimelineRow =
    | { kind: "entry"; no: number | null; node: SagaGraphNode; branches: TimelineBranch[] }
    | { kind: "tandem"; no: number | null; nodes: SagaGraphNode[]; mode: TandemMode | null; note: string | null; branches: TimelineBranch[] }
    | { kind: "window"; no: number | null; node: SagaGraphNode; after: SagaGraphNode | null; before: SagaGraphNode | null; reason: WindowReason | null; track: TimelineTrack | null }
    | { kind: "bridge"; node: SagaGraphNode };
  export function deriveTimeline(graph: SagaGraph, opts?: { spine?: TimelineSpine }): TimelineSection[];
  ```
  `TimelineSection` no cambia de forma.

**Contexto que el implementador necesita y no puede adivinar:**

1. **`mode`, `note`, `reason` y `track` son SIEMPRE `null` en la fase 1.** Las formas nacen completas para no rehacer el tipo en la fase 2, pero los campos que dependen de columnas nuevas (`saga_tandems.modo`, `saga_placement_windows.motivo`) se rellenan más tarde. No inventes valores por defecto: `null` significa «todavía no hay dónde curarlo».
2. **`no` es el número que se PINTA**, y arregla de paso un off-by-one real: hoy `deriveSagaMap` arranca su `orderCounter` en 0, así que la primera obra del timeline móvil se pinta como «Nº 0». En modo `curation`, `no = node.orderNo + 1` (equivale exactamente al rango 1..N de la columna, porque `orderCounter` incrementa una vez por hueco y sin saltos). En modo `route`, `no = node.step`. Una fila `window` no lleva número en modo `curation` (`no: null`): no tiene puesto — eso es lo que la hace ventana.
3. **Modo `route`: la columna son los pasos, y NADA más.** Nodos con `step !== null`, ordenados por `step`, en **una sola sección sin cabecera** (`groupSagaId: null`, `groupName: null`, `accent: "beige"`). Sin ramas, sin puentes: lo que el itinerario no nombra lo enseña «Sin puesto en este itinerario», que es de `RouteView` y no se toca. La subsaga baja de cabecera a etiqueta de fila y ese dato ya viaja en el nodo (`groupName`, `accent`).
4. **Un paso que no se ve no es una fila, y no renumera.** `deriveSagaMap` solo pone `step` en nodos que existen, así que un paso fantasma (obra borrada) o un paso que nombra un bloque entero no produce nodo — y por tanto no produce fila. El número sigue siendo la posición del paso en el itinerario: **si el paso 5 no se ve, el 6 sigue siendo el 6**. Es la misma regla que ya aplica `derive-map.ts:380-384`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/lib/sagas/derive-timeline.test.ts`, dentro de un `describe` nuevo al final del bloque `describe("deriveTimeline", …)`:

```ts
describe("deriveTimeline · numeración y columna por pasos", () => {
  it("modo curation: el número que se pinta es 1..N, no el orderNo crudo (que empieza en 0)", () => {
    const tl = deriveTimeline(graph([node("a", { orderNo: 0 }), node("b", { orderNo: 1 })]));
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.no)).toEqual([1, 2]);
  });

  it("modo route: la columna son los pasos, en su orden, aunque contradiga la curación", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0, step: 3 }),
        node("b", { orderNo: 1, step: 1 }),
        node("c", { orderNo: 2, step: 2 }),
      ]),
      { spine: "route" },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.node.id)).toEqual(["b", "c", "a"]);
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.no)).toEqual([1, 2, 3]);
  });

  it("modo route: una sola sección, sin cabecera de subsaga", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0, step: 1 }),
        node("c", { orderNo: 1, step: 2, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
      ]),
      { spine: "route" },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].groupName).toBeNull();
    expect(tl[0].groupSagaId).toBeNull();
  });

  it("modo route: un paso que no resuelve a nodo no produce fila, y el resto conserva SU número", () => {
    // El paso 2 es una obra borrada: deriveSagaMap nunca le puso `step` a nadie.
    const tl = deriveTimeline(
      graph([node("a", { orderNo: 0, step: 1 }), node("c", { orderNo: 1, step: 3 })]),
      { spine: "route" },
    );
    expect(tl[0].rows.map((r) => r.kind === "entry" && r.no)).toEqual([1, 3]);
  });

  it("modo route: lo que el itinerario no nombra no aparece (ni rama ni puente)", () => {
    const tl = deriveTimeline(
      graph(
        [
          node("a", { orderNo: 0, step: 1 }),
          node("spin", { orderNo: null }),
          node("hub", { orderNo: null, groupSagaId: null, groupName: null, accent: "beige" }),
        ],
        [{ id: "e", source: "a", target: "spin", type: "opcional", accent: "ambar" }],
      ),
      { spine: "route" },
    );
    expect(tl).toHaveLength(1);
    expect(tl[0].rows).toHaveLength(1);
  });

  it("modo curation por defecto: sin opts se comporta como hoy", () => {
    const tl = deriveTimeline(graph([node("a", { orderNo: 0 }), node("c", { orderNo: 1, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" })]));
    expect(tl).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-timeline.test.ts`
Expected: FAIL. El primero por `expect([undefined, undefined]).toEqual([1, 2])` (`no` no existe todavía); los de `spine` porque `deriveTimeline` solo acepta un argumento.

- [ ] **Step 3: Implementar los tipos y los dos modos**

En `src/lib/sagas/derive-timeline.ts`, sustituir el bloque de tipos (líneas 19-28) por:

```ts
export type TimelineSpine = "curation" | "route";

/** Modo del tándem. Vive en `saga_tandems.modo` (fase 2): en la fase 1 es
 *  SIEMPRE null — el tándem se detecta por el empate de `position`, que ya
 *  existe, pero no hay dónde curar si es «a la vez» o «cualquier orden». */
export type TandemMode = "simultaneo" | "indistinto";

/** Motivo de una ventana. Vive en `saga_placement_windows.motivo` (fase 3):
 *  null en la fase 1, y nullable también en BD — las 4 ventanas de producción
 *  no lo tienen declarado y nadie lo decidió por ellas. */
export type WindowReason = "spoiler" | "contexto";

/** Mini-track de la ventana (fase 3). En la fase 1 es siempre null. */
export type TimelineTrack = {
  fromPct: number;
  toPct: number;
  /** Posición del lector; null sin sesión — la ficha es pública. */
  youPct: number | null;
  notice: "antes" | "dentro" | "pasada";
};

export type TimelineBranch = { node: SagaGraphNode; edgeType: "opcional" | "requisito" };

export type TimelineRow =
  /** Obra con puesto. */
  | { kind: "entry"; no: number | null; node: SagaGraphNode; branches: TimelineBranch[] }
  /** N obras que comparten hueco. `mode`/`note` llegan en la fase 2. */
  | { kind: "tandem"; no: number | null; nodes: SagaGraphNode[]; mode: TandemMode | null; note: string | null; branches: TimelineBranch[] }
  /** Sujeto `libre` con ventana; anclas YA resueltas a nodo. `reason`/`track`, fases 3. */
  | {
      kind: "window";
      no: number | null;
      node: SagaGraphNode;
      after: SagaGraphNode | null;
      before: SagaGraphNode | null;
      reason: WindowReason | null;
      track: TimelineTrack | null;
    }
  /** Nexo entre secciones. */
  | { kind: "bridge"; node: SagaGraphNode };

export type TimelineSection = {
  groupSagaId: string | null;
  groupName: string | null;
  accent: SagaAccentToken;
  rows: TimelineRow[];
};
```

Y sustituir la firma y el arranque de la función (líneas 30-36) por:

```ts
export function deriveTimeline(graph: SagaGraph, opts: { spine?: TimelineSpine } = {}): TimelineSection[] {
  const spineMode = opts.spine ?? "curation";
  const items = graph.nodes.filter((n) => n.kind === "item");

  // Columna por PASOS del itinerario (spec §1): 1..N del itinerario, sección
  // única sin cabecera, y la subsaga baja de cabecera de sección a etiqueta de
  // fila (el dato ya viaja en el nodo: groupName/accent). Sin ramas ni
  // puentes: lo que el itinerario no nombra lo enseña «Sin puesto en este
  // itinerario», que es de RouteView.
  if (spineMode === "route") {
    const steps = items.filter((n) => n.step !== null).sort((a, b) => a.step! - b.step!);
    if (steps.length === 0) return [];
    const rows: TimelineRow[] = steps.map((n) => ({ kind: "entry", no: n.step, node: n, branches: [] }));
    return [{ groupSagaId: null, groupName: null, accent: "beige", rows }];
  }

  const spine = items
    .filter((n) => n.orderNo !== null)
    .sort((a, b) => (a.orderNo! - b.orderNo!) || a.label.localeCompare(b.label));
  if (spine.length === 0) return [];
```

En el bucle de secciones (líneas 57-63), añadir `no` a la fila:

```ts
  for (const n of spine) {
    const last = sections.at(-1);
    // `orderNo` es 0-based (deriveSagaMap arranca su `orderCounter` en 0) y no
    // tiene saltos: incrementa una vez por hueco. Así que +1 ES el rango 1..N
    // de la columna. Antes se pintaba crudo y la primera obra salía como «Nº 0».
    const row: Extract<TimelineRow, { kind: "entry" }> = { kind: "entry", no: n.orderNo! + 1, node: n, branches: [] };
    rowByNodeId.set(n.id, row);
    if (last && last.groupSagaId === n.groupSagaId) last.rows.push(row);
    else sections.push({ groupSagaId: n.groupSagaId, groupName: n.groupName, accent: n.accent, rows: [row] });
  }
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-timeline.test.ts`
Expected: PASS, todos. `npx tsc --noEmit` también, aunque `reading-timeline.tsx` todavía no pinte las formas nuevas: su `row.kind !== "entry" ? null` sigue compilando.

- [ ] **Step 5: Abrir la issue del «Nº 0» y enlazarla**

El off-by-one existía antes de esta feature y se ha encontrado al reescribir la numeración. Se arregla aquí porque el número es justo lo que esta tarea reescribe, pero **queda escrito** para quien lo busque:

```bash
gh issue create --title "El timeline móvil numeraba desde «Nº 0»" --body "## Qué falla

\`deriveSagaMap\` arranca su \`orderCounter\` en 0 (\`derive-map.ts\`, \`let orderCounter = 0\`), y \`reading-timeline.tsx\` pintaba \`t(\"orderNo\", { n: row.node.orderNo })\` crudo. La primera obra de la columna se veía como «Nº 0».

## Cómo reproducirlo (antes del arreglo)

Ficha de cualquier saga con \`show_map\`, móvil, pestaña «Mapa de lectura», ruta «Orden de lectura»: la primera tarjeta dice «Nº 0».

## Qué lo acota

- El mapa 2D no se ve afectado: \`orderNo\` ahí es un índice lógico, no se pinta.
- Ningún e2e lo cubría (no hay ninguna aserción sobre «Nº» en \`e2e/\`), y ninguna unitaria de \`derive-timeline.test.ts\` afirmaba nada sobre el valor.

## Estado

Arreglado en la fase 1 del plan \`docs/superpowers/plans/2026-07-28-sagas-timeline-estados-fases-0-1.md\` (Task 2): \`TimelineRow\` gana \`no\`, que en modo \`curation\` es \`orderNo + 1\` y en modo \`route\` es el paso del itinerario. Cubierto por la unitaria «el número que se pinta es 1..N, no el orderNo crudo»."
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): deriveTimeline gana columna por pasos y numeración 1..N"
```

---

## Task 3: El componente pinta las cuatro formas

Va **antes** que la agrupación del tándem y la colocación de la ventana a propósito: si el motor empezara a producir filas que la vista no sabe pintar, `reading-timeline.tsx` las devolvería como `null` y desaparecerían de la pantalla sin que nada fallara.

**Files:**
- Create: `src/components/saga/timeline/timeline-labels.ts`
- Create: `src/components/saga/timeline/timeline-branch.tsx`
- Create: `src/components/saga/timeline/timeline-entry-row.tsx`
- Create: `src/components/saga/timeline/timeline-tandem-row.tsx`
- Create: `src/components/saga/timeline/timeline-window-row.tsx`
- Modify: `src/components/saga/reading-timeline.tsx` (entero)
- Modify: `messages/es.json` (namespace `saga`)

**Interfaces:**
- Consumes: `TimelineSection`, `TimelineRow`, `TimelineBranch` de la Task 2.
- Produces: `type TimelineLabels`, `buildTimelineLabels(t)`, y los cuatro componentes `TimelineEntryRow`, `TimelineTandemRow`, `TimelineWindowRow`, `TimelineBranchRow`, todos **funciones planas (no `async`)** que reciben `labels`.

**Detalle que hay que respetar:** el raíl pasa a colorearse por **`node.accent`, no por `section.accent`**. En modo `curation` es equivalente por construcción (una sección agrupa nodos con el mismo `groupSagaId`, y el acento sale del nodo), y es lo que permite que en modo `route` —sección única sin cabecera— cada fila conserve el color de SU subsaga. La cabecera de sección sigue usando `section.accent`.

- [ ] **Step 1: Añadir las claves de texto**

En `messages/es.json`, namespace `saga`, junto a `"orderNo"`:

```json
    "timelineTandemTitle": "Leer en tándem",
    "timelineTandemCount": "{count} títulos",
    "timelineWindowTitle": "Ventana recomendada",
    "timelineWindowAfter": "después de {title}",
    "timelineWindowBefore": "antes de {title}",
    "timelineWindowFree": "Libre dentro de la ventana",
```

- [ ] **Step 2: Escribir el constructor de etiquetas**

Crear `src/components/saga/timeline/timeline-labels.ts`:

```ts
// Las sub-piezas del timeline son funciones PLANAS, no componentes `async`:
// reciben las etiquetas ya resueltas. La cáscara llama a `getTranslations` una
// vez y construye esto; así una fila no dispara una resolución de traducciones
// por cada tarjeta pintada.
export type TimelineLabels = {
  orderNo: (n: number) => string;
  branchRequisite: string;
  tandemTitle: string;
  tandemCount: (count: number) => string;
  windowTitle: string;
  windowAfter: (title: string) => string;
  windowBefore: (title: string) => string;
  windowFree: string;
};

type Translator = (key: string, values?: Record<string, string | number>) => string;

export function buildTimelineLabels(t: Translator): TimelineLabels {
  return {
    orderNo: (n) => t("orderNo", { n }),
    branchRequisite: t("branchRequisite"),
    tandemTitle: t("timelineTandemTitle"),
    tandemCount: (count) => t("timelineTandemCount", { count }),
    windowTitle: t("timelineWindowTitle"),
    windowAfter: (title) => t("timelineWindowAfter", { title }),
    windowBefore: (title) => t("timelineWindowBefore", { title }),
    windowFree: t("timelineWindowFree"),
  };
}
```

- [ ] **Step 3: Extraer la rama a su propia pieza**

Crear `src/components/saga/timeline/timeline-branch.tsx` con **exactamente** el marcado que hoy vive en `reading-timeline.tsx:103-133`, parametrizado:

```tsx
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { SagaAccentToken } from "@/lib/sagas/accents";
import type { TimelineBranch } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "../role-chip";
import type { TimelineLabels } from "./timeline-labels";

// Rama punteada: fuera de la columna principal, nunca bloquea al siguiente
// título. Issue #167: "requisito" se mantiene porque es un dato REAL y curado
// (la arista dice "léelo antes"). "Spin-off · opcional" se derogó: se pintaba
// para cualquier arista no-requisito, incluidas las `principal`. Ahora, o hay
// rol curado, o no se dice nada.
export function TimelineBranchRow({
  branch,
  accent,
  labels,
}: {
  branch: TimelineBranch;
  accent: SagaAccentToken;
  labels: TimelineLabels;
}) {
  return (
    <div className="relative ml-10 py-1.5 pl-6">
      <span
        className={`absolute -top-2 left-0 h-10 w-4 rounded-bl-lg border-b-[2.5px] border-l-[2.5px] border-dashed ${SAGA_ACCENT[accent].border}`}
      />
      <Link
        href={branch.node.href}
        className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-surface px-3 py-2"
      >
        <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded">
          {branch.node.coverUrl && (
            <Image src={branch.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />
          )}
        </span>
        <span className="min-w-0">
          {branch.edgeType === "requisito" ? (
            <span className="inline-block rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold">
              {labels.branchRequisite}
            </span>
          ) : (
            <RoleChip role={branch.node.role} />
          )}
          <span className="mt-1 block truncate text-[13px] font-semibold">{branch.node.label}</span>
        </span>
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Extraer la fila `entry`**

Crear `src/components/saga/timeline/timeline-entry-row.tsx`. Es el marcado de `reading-timeline.tsx:59-134`, con tres cambios: el acento sale de `row.node.accent`, el número sale de `row.no` (no de `row.node.orderNo`), y la subsaga se pinta como etiqueta de fila cuando la sección no tiene cabecera:

```tsx
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { TimelineBranchRow } from "./timeline-branch";
import type { TimelineLabels } from "./timeline-labels";

type EntryRow = Extract<TimelineRow, { kind: "entry" }>;

// `showGroupLabel` lo pone la cáscara cuando la sección NO lleva cabecera —
// modo `route`, donde la columna son los pasos del itinerario y la subsaga baja
// de cabecera de sección a etiqueta de fila (spec §1: repetir «Magos» dos veces
// porque el itinerario parte el hilo rompe más de lo que explica).
export function TimelineEntryRow({
  row,
  labels,
  showGroupLabel,
}: {
  row: EntryRow;
  labels: TimelineLabels;
  showGroupLabel: boolean;
}) {
  const accent = row.node.accent;
  return (
    <div>
      <div className="relative flex gap-3 py-2">
        <div className="relative flex w-6 shrink-0 justify-center">
          <span className={`absolute -bottom-2 -top-2 w-[2.5px] ${SAGA_ACCENT[accent].bg}`} />
          <span
            className={`z-10 mt-6 h-[15px] w-[15px] rounded-full ring-4 ring-background ${
              row.node.status === "in_progress"
                ? "border-4 border-accent bg-surface"
                : row.node.status === "completed"
                  ? SAGA_ACCENT[accent].bg
                  : `border-[2.5px] border-dashed bg-surface ${SAGA_ACCENT[accent].border}`
            }`}
          />
        </div>
        <Link
          href={row.node.href}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border bg-surface px-3 py-2 ${
            row.node.status === "in_progress" ? "border-accent/50 shadow-md" : "border-border"
          } ${row.node.status === null ? "opacity-60" : ""}`}
        >
          <span className="relative h-[66px] w-[44px] shrink-0 overflow-hidden rounded shadow">
            {row.node.coverUrl && <Image src={row.node.coverUrl} alt="" fill sizes="44px" className="object-cover" />}
            {row.node.status === "completed" && (
              <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white">
                ✓
              </span>
            )}
            {row.node.status === "in_progress" && (
              <span className="absolute inset-0 grid place-items-center bg-foreground/40 text-sm text-white">◉</span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            {row.no !== null && (
              <span className="block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {labels.orderNo(row.no)}
              </span>
            )}
            <span className="block truncate font-serif text-[14.5px] font-semibold leading-tight">{row.node.label}</span>
            {showGroupLabel && row.node.groupName && (
              <span className="block truncate font-mono text-[9px] text-muted-foreground">{row.node.groupName}</span>
            )}
          </span>
          <span className="text-base text-muted-foreground">›</span>
        </Link>
      </div>
      {row.branches.map((b) => (
        <TimelineBranchRow key={b.node.id} branch={b} accent={accent} labels={labels} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Escribir la fila `tandem`**

Crear `src/components/saga/timeline/timeline-tandem-row.tsx`. Estado 01 del mockup: un corchete que abraza las N obras del hueco, un solo número (comparten puesto):

```tsx
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { TimelineBranchRow } from "./timeline-branch";
import type { TimelineLabels } from "./timeline-labels";

type TandemRow = Extract<TimelineRow, { kind: "tandem" }>;

// Estado 01 del mockup: N obras que comparten hueco. Un solo número, porque
// comparten puesto — es exactamente lo que las hace tándem.
//
// `row.mode` y `row.note` son null hasta la fase 2 (`saga_tandems`): la fila se
// agrupa desde la fase 1 porque el empate de `position` YA existe, pero
// «a la vez» vs «cualquier orden» todavía no se puede curar en ningún sitio, y
// pintar uno de los dos a ciegas sería afirmar lo que nadie ha dicho.
export function TimelineTandemRow({
  row,
  labels,
  showGroupLabel,
}: {
  row: TandemRow;
  labels: TimelineLabels;
  showGroupLabel: boolean;
}) {
  const accent = row.nodes[0]?.accent ?? "beige";
  return (
    <div>
      <div className="relative flex gap-3 py-2">
        <div className="relative flex w-6 shrink-0 justify-center">
          <span className={`absolute -bottom-2 -top-2 w-[2.5px] ${SAGA_ACCENT[accent].bg}`} />
          {/* Corchete: el raíl se abre para abrazar las N obras del hueco. */}
          <span
            className={`absolute bottom-3 top-3 left-1/2 w-2 rounded-l-md border-b-[2.5px] border-l-[2.5px] border-t-[2.5px] ${SAGA_ACCENT[accent].border}`}
          />
        </div>
        <div
          data-testid="timeline-tandem"
          className={`min-w-0 flex-1 rounded-xl border border-dashed bg-surface px-3 py-2.5 ${SAGA_ACCENT[accent].border}`}
        >
          <div className="flex items-baseline gap-2">
            {row.no !== null && (
              <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {labels.orderNo(row.no)}
              </span>
            )}
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {labels.tandemTitle} · {labels.tandemCount(row.nodes.length)}
            </span>
          </div>
          {row.note && <p className="mt-1 text-[11px] italic text-muted-foreground">{row.note}</p>}
          <ul className="mt-2 flex flex-col gap-2">
            {row.nodes.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="flex items-center gap-3">
                  <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded shadow">
                    {n.coverUrl && <Image src={n.coverUrl} alt="" fill sizes="38px" className="object-cover" />}
                    {n.status === "completed" && (
                      <span className="absolute bottom-0.5 right-0.5 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[13.5px] font-semibold leading-tight">
                      {n.label}
                    </span>
                    {showGroupLabel && n.groupName && (
                      <span className="block truncate font-mono text-[9px] text-muted-foreground">{n.groupName}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {row.branches.map((b) => (
        <TimelineBranchRow key={b.node.id} branch={b} accent={accent} labels={labels} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Escribir la fila `window`**

Crear `src/components/saga/timeline/timeline-window-row.tsx`. Estado 02 del mockup, sin mini-track (fase 3):

```tsx
import Image from "next/image";
import Link from "next/link";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineRow } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "../role-chip";
import type { TimelineLabels } from "./timeline-labels";

type WindowRow = Extract<TimelineRow, { kind: "window" }>;

// Estado 02 del mockup: lectura libre dentro de un tramo. Sin número: no tiene
// puesto, y eso es justo lo que la hace ventana.
//
// `row.track` es null hasta la fase 3 (el mini-track y sus tres avisos) y
// `row.reason` hasta que exista `saga_placement_windows.motivo`. Las anclas SÍ
// llegan resueltas desde la fase 1: son las que ya resolvió `deriveSagaMap`.
export function TimelineWindowRow({ row, labels }: { row: WindowRow; labels: TimelineLabels }) {
  const accent = row.node.accent;
  return (
    <div className="relative flex gap-3 py-2">
      <div className="relative flex w-6 shrink-0 justify-center">
        {/* Banda: el tramo dentro del que la obra es libre. */}
        <span className={`absolute -bottom-2 -top-2 w-[2.5px] border-l-[2.5px] border-dashed ${SAGA_ACCENT[accent].border}`} />
      </div>
      <div
        data-testid="timeline-window"
        className={`min-w-0 flex-1 rounded-xl border border-dashed bg-surface px-3 py-2.5 ${SAGA_ACCENT[accent].border}`}
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          {labels.windowTitle}
        </span>
        <Link href={row.node.href} className="mt-2 flex items-center gap-3">
          <span className="relative h-[57px] w-[38px] shrink-0 overflow-hidden rounded shadow">
            {row.node.coverUrl && <Image src={row.node.coverUrl} alt="" fill sizes="38px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif text-[13.5px] font-semibold leading-tight">{row.node.label}</span>
            <span className="mt-0.5 block">
              <RoleChip role={row.node.role} />
            </span>
          </span>
        </Link>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {labels.windowFree}
          {row.after && <>: {labels.windowAfter(row.after.label)}</>}
          {row.after && row.before && <>, </>}
          {!row.after && row.before && <>: </>}
          {row.before && labels.windowBefore(row.before.label)}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Reescribir la cáscara**

Sustituir `src/components/saga/reading-timeline.tsx` entero por:

```tsx
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { TimelineSection } from "@/lib/sagas/derive-timeline";
import { RoleChip } from "./role-chip";
import { TimelineEntryRow } from "./timeline/timeline-entry-row";
import { buildTimelineLabels } from "./timeline/timeline-labels";
import { TimelineTandemRow } from "./timeline/timeline-tandem-row";
import { TimelineWindowRow } from "./timeline/timeline-window-row";

// Componente ÚNICO de orden de lectura (spec 2026-07-28): las mismas cuatro
// formas de fila en móvil y al pie del grafo de PC. Dos componentes se
// desincronizarían — todo lo que cuesta (el render de los cuatro estados) es
// común.
//
// Ojo con el vocabulario: este comentario decía "opcionales" y "nexos", las dos
// palabras que la issue #167 derogó precisamente porque se derivaban de
// heurísticas que etiquetaban mal. Una rama o un puente son posiciones en el
// layout, no afirmaciones sobre qué es la obra: eso solo lo dice el rol curado,
// vía RoleChip.
export async function ReadingTimeline({ sections }: { sections: TimelineSection[] }) {
  const t = await getTranslations("saga");
  const labels = buildTimelineLabels(t);

  return (
    <div data-testid="reading-timeline">
      {sections.map((section, si) => {
        // Sin cabecera de sección (modo `route`: una sola sección sin nombre),
        // la subsaga baja a etiqueta de fila.
        const showGroupLabel = section.groupName === null;
        return section.rows[0]?.kind === "bridge" ? (
          <div
            key={`bridge-${section.rows[0].node.id}`}
            className="my-3.5 flex items-center gap-3 rounded-xl border border-border bg-gradient-to-r from-spine/20 to-surface px-3.5 py-3"
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-spine">
              {section.rows[0].node.coverUrl && (
                <Image src={section.rows[0].node.coverUrl} alt="" fill sizes="40px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0">
              <Link href={section.rows[0].node.href} className="block font-serif text-sm font-semibold">
                {section.rows[0].node.label}
              </Link>
              {/* Issue #167: `bridgeHint` se derogó. Ahora solo habla el rol curado, si lo hay. */}
              <span className="mt-0.5 block">
                <RoleChip role={section.rows[0].node.role} />
              </span>
            </span>
          </div>
        ) : (
          <section key={`${section.groupSagaId ?? "direct"}-${si}`}>
            {section.groupName && (
              <div className="mb-1 mt-3.5 flex items-center gap-2">
                <span className={`h-4 w-1 rounded-full ${SAGA_ACCENT[section.accent].tick}`} />
                <h3 className="font-serif text-base font-semibold">{section.groupName}</h3>
              </div>
            )}
            <div>
              {section.rows.map((row) => {
                if (row.kind === "entry") {
                  return (
                    <TimelineEntryRow key={row.node.id} row={row} labels={labels} showGroupLabel={showGroupLabel} />
                  );
                }
                if (row.kind === "tandem") {
                  return (
                    <TimelineTandemRow
                      key={`tandem-${row.nodes.map((n) => n.id).join("|")}`}
                      row={row}
                      labels={labels}
                      showGroupLabel={showGroupLabel}
                    />
                  );
                }
                if (row.kind === "window") {
                  return <TimelineWindowRow key={`window-${row.node.id}`} row={row} labels={labels} />;
                }
                return null;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 8: Comprobar que compila y que la suite unitaria sigue verde**

Run: `fnm use 22; npx tsc --noEmit; npx vitest run; npx eslint src/components/saga src/lib/sagas`
Expected: sin errores. Ninguna unitaria cambia de resultado: la Task 3 no toca el motor.

- [ ] **Step 9: Commit**

```bash
git add src/components/saga/timeline src/components/saga/reading-timeline.tsx messages/es.json
git commit -m "feat(sagas): el timeline se parte en sub-piezas y sabe pintar tándem y ventana"
```

---

## Task 4: Agrupación del tándem

**Files:**
- Modify: `src/lib/sagas/derive-timeline.ts` (bucle de secciones, y el bloque `route`)
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Consumes: `TimelineRow` (Task 2), `deriveSagaMap` (sin cambios).
- Produces: filas `kind: "tandem"` en las dos columnas.

**Regla, una sola para los dos modos:** dos o más filas **consecutivas de la columna** que comparten `orderNo` (no nulo) se funden en una fila `tandem`. En modo `curation` el empate de `orderNo` implica que salen juntas al ordenar; en modo `route`, además tienen que ser pasos consecutivos — si el itinerario mete otra obra en medio, el itinerario manda y no hay tándem que pintar. **Esto es una decisión que la spec no fijaba** (solo dice que la fila se agrupa desde la fase 1 porque el empate de `position` ya existe): queda escrita aquí, y es la lectura conservadora — el itinerario manda sobre lo que dice.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `src/lib/sagas/derive-timeline.test.ts`:

```ts
describe("deriveTimeline · tándem", () => {
  it("dos obras que comparten hueco producen UNA fila tandem con las dos", () => {
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0 }),
        node("t1", { orderNo: 1, label: "Imperio de Tormentas" }),
        node("t2", { orderNo: 1, label: "Torre del Alba" }),
        node("z", { orderNo: 2 }),
      ]),
    );
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "tandem", "entry"]);
    const tandem = tl[0].rows[1];
    if (tandem.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(tandem.nodes.map((n) => n.id)).toEqual(["t1", "t2"]);
    expect(tandem.no).toBe(2);
    expect(tandem.mode).toBeNull();
    expect(tandem.note).toBeNull();
  });

  it("un tándem que cruza subsagas no puede pasar: el hueco es de un bloque", () => {
    // Defensa del invariante, no capricho: si dos nodos con el mismo orderNo
    // tuvieran groupSagaId distinto, agruparlos fundiría dos secciones. Se
    // agrupa SOLO dentro de la sección.
    const tl = deriveTimeline(
      graph([
        node("a", { orderNo: 0 }),
        node("b", { orderNo: 1, groupSagaId: "g2", groupName: "Era Dos", accent: "terracota" }),
      ]),
    );
    expect(tl).toHaveLength(2);
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry"]);
    expect(tl[1].rows.map((r) => r.kind)).toEqual(["entry"]);
  });

  it("modo route: dos pasos consecutivos que comparten hueco son un tándem", () => {
    const tl = deriveTimeline(
      graph([
        node("t1", { orderNo: 1, step: 1 }),
        node("t2", { orderNo: 1, step: 2 }),
        node("z", { orderNo: 2, step: 3 }),
      ]),
      { spine: "route" },
    );
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["tandem", "entry"]);
    const tandem = tl[0].rows[0];
    if (tandem.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(tandem.no).toBe(1);
  });

  it("modo route: si el itinerario mete algo en medio del hueco, NO hay tándem", () => {
    const tl = deriveTimeline(
      graph([
        node("t1", { orderNo: 1, step: 1 }),
        node("z", { orderNo: 2, step: 2 }),
        node("t2", { orderNo: 1, step: 3 }),
      ]),
      { spine: "route" },
    );
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "entry", "entry"]);
  });

  it("las ramas de las obras del tándem cuelgan de la fila del tándem", () => {
    const spin = node("spin", { orderNo: null, label: "Spin" });
    const tl = deriveTimeline(
      graph(
        [node("t1", { orderNo: 0 }), node("t2", { orderNo: 0 }), spin],
        [{ id: "e", source: "t1", target: "spin", type: "opcional", accent: "ambar" }],
      ),
    );
    const tandem = tl[0].rows[0];
    if (tandem.kind !== "tandem") throw new Error("se esperaba un tándem");
    expect(tandem.branches.map((b) => b.node.id)).toEqual(["spin"]);
  });
});
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-timeline.test.ts`
Expected: FAIL — `expect(["entry","entry","entry"]).toEqual(["entry","tandem","entry"])`.

- [ ] **Step 3: Implementar la agrupación**

En `derive-timeline.ts`, el mapa `rowByNodeId` pasa a apuntar a la fila que **contiene** el nodo (`entry` o `tandem`), porque el mecanismo de ramas cuelga de ella. Sustituir el bucle de secciones por:

```ts
  // Secciones por subsaga consecutiva a lo largo de la columna. Dos o más nodos
  // que comparten `orderNo` comparten hueco: eso ES un tándem (hoy uno solo en
  // toda la producción, Trono de Cristal hueco 5), y se funden en una sola
  // fila. `mode`/`note` llegan en la fase 2 con `saga_tandems`.
  const sections: TimelineSection[] = [];
  type RowWithBranches = Extract<TimelineRow, { kind: "entry" | "tandem" }>;
  const rowByNodeId = new Map<string, RowWithBranches>();
  for (const n of spine) {
    const last = sections.at(-1);
    const lastRow = last?.rows.at(-1);
    // Empate de `orderNo` con la fila anterior DE LA MISMA SECCIÓN: se funde.
    // Fuera de la sección no se mira: un hueco pertenece a un bloque, así que
    // dos nodos con el mismo orderNo y distinto groupSagaId no pueden existir —
    // y si existieran, fundirlos borraría el límite entre dos secciones.
    if (last && last.groupSagaId === n.groupSagaId && lastRow && lastRow.kind !== "bridge") {
      const prevOrder = lastRow.kind === "entry" ? lastRow.node.orderNo : lastRow.nodes[0].orderNo;
      if (prevOrder === n.orderNo) {
        const merged: Extract<TimelineRow, { kind: "tandem" }> =
          lastRow.kind === "tandem"
            ? lastRow
            : { kind: "tandem", no: lastRow.no, nodes: [lastRow.node], mode: null, note: null, branches: lastRow.branches };
        if (lastRow.kind === "entry") {
          last.rows[last.rows.length - 1] = merged;
          rowByNodeId.set(lastRow.node.id, merged);
        }
        merged.nodes.push(n);
        rowByNodeId.set(n.id, merged);
        continue;
      }
    }
    const row: Extract<TimelineRow, { kind: "entry" }> = { kind: "entry", no: n.orderNo! + 1, node: n, branches: [] };
    rowByNodeId.set(n.id, row);
    if (last && last.groupSagaId === n.groupSagaId) last.rows.push(row);
    else sections.push({ groupSagaId: n.groupSagaId, groupName: n.groupName, accent: n.accent, rows: [row] });
  }
```

Y en el bloque de la columna por pasos, sustituir el `steps.map(...)` por la misma fusión, esta vez exigiendo pasos consecutivos (que en un array ya ordenado por `step` es «la fila anterior»):

```ts
  if (spineMode === "route") {
    const steps = items.filter((n) => n.step !== null).sort((a, b) => a.step! - b.step!);
    if (steps.length === 0) return [];
    const rows: TimelineRow[] = [];
    for (const n of steps) {
      const lastRow = rows.at(-1);
      // Mismo hueco (empate de `orderNo`) Y pasos consecutivos. Si el
      // itinerario mete otra obra en medio, el itinerario manda: no hay tándem
      // que pintar.
      if (lastRow && lastRow.kind !== "bridge" && n.orderNo !== null) {
        const prevOrder = lastRow.kind === "entry" ? lastRow.node.orderNo : lastRow.nodes[0].orderNo;
        if (prevOrder === n.orderNo) {
          if (lastRow.kind === "tandem") lastRow.nodes.push(n);
          else {
            rows[rows.length - 1] = {
              kind: "tandem",
              no: lastRow.no,
              nodes: [lastRow.node, n],
              mode: null,
              note: null,
              branches: lastRow.branches,
            };
          }
          continue;
        }
      }
      rows.push({ kind: "entry", no: n.step, node: n, branches: [] });
    }
    return [{ groupSagaId: null, groupName: null, accent: "beige", rows }];
  }
```

Por último, el bloque que cuelga las ramas (líneas ~77-89 del original) ya no puede asumir `entry`: cambia `rowByNodeId.get(conn.spineNode.id)!.branches.push(...)` — sigue valiendo tal cual porque el tipo `RowWithBranches` tiene `branches` en las dos formas. Y el `sections.find(...).rows.filter(r => r.kind === "entry")` del caso «suelto dentro de su subsaga» pasa a aceptar las dos:

```ts
    // Suelto dentro de su subsaga: cuelga del último de su sección (si existe).
    const section = sections.find((s) => s.groupSagaId === n.groupSagaId);
    const lastEntry = section?.rows.filter((r): r is RowWithBranches => r.kind === "entry" || r.kind === "tandem").at(-1);
    lastEntry?.branches.push({ node: n, edgeType: "opcional" });
```

Y el bucle de ordenación de ramas (`for (const row of rowByNodeId.values())`) sigue igual: opera sobre `branches`, que las dos formas tienen. **Ojo:** `rowByNodeId` puede tener dos claves apuntando a la MISMA fila `tandem`, así que ese bucle ordenaría sus ramas dos veces — es idempotente, pero deduplica con un `Set` para no confundir a quien lo lea:

```ts
  for (const row of new Set(rowByNodeId.values())) {
    row.branches.sort((a, b) => a.node.label.localeCompare(b.node.label));
  }
```

El `sections.findIndex` de los puentes también busca `r.kind === "entry" && r.node.id === …`; pasa a:

```ts
      const idx = sections.findIndex((s) =>
        s.rows.some(
          (r) =>
            (r.kind === "entry" && r.node.id === conn.spineNode.id) ||
            (r.kind === "tandem" && r.nodes.some((x) => x.id === conn.spineNode.id)),
        ),
      );
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-timeline.test.ts && npx tsc --noEmit`
Expected: PASS, incluidas las unitarias viejas (ninguna montaba dos nodos con el mismo `orderNo`, así que ninguna cambia de resultado).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): el timeline agrupa en una fila las obras que comparten hueco"
```

---

## Task 5: La ventana cae en la columna, no en una rama

**Files:**
- Modify: `src/lib/sagas/derive-timeline.ts` (bloque de nodos fuera de columna)
- Test: `src/lib/sagas/derive-timeline.test.ts`

**Interfaces:**
- Consumes: aristas de ventana que ya produce `deriveSagaMap` (`derive-map.ts:330-364`).
- Produces: filas `kind: "window"`.

**Cómo se reconoce una ventana sin dato nuevo — léelo antes de escribir código.** `deriveSagaMap` es el ÚNICO productor de `SagaGraph`, y solo emite aristas `requisito`/`opcional` para las ventanas (la cadena es `principal`, los saltos del itinerario son `itinerario`). Y las emite con una dirección fija:

| Ancla | Arista que emite `deriveSagaMap` | Cómo se lee desde el sujeto `n` |
|---|---|---|
| `después de` | `after → subject`, tipo `requisito` | arista con `target === n.id` y `type === "requisito"` → el ancla es `source` |
| `antes de` | `subject → before`, tipo `opcional` | arista con `source === n.id` y `type === "opcional"` → el ancla es `target` |

Las dos llegan **ya resueltas a nodo** por `resolveEntry` (última obra del bloque para un `después de`, primera para un `antes de`). Por eso esta tarea NO resuelve anclas: las lee. Escribir aquí una segunda resolución es exactamente lo que la spec prohíbe.

**Dónde cae, en este orden:** (1) justo **después** de la fila de su ancla `después de`; (2) si solo tiene `antes de`, justo **antes** de esa fila; (3) si no resuelve ninguna, **cae a rama, como hoy**.

**Límite asumido y consciente:** solo son fila `window` los sujetos con `orderNo === null`, es decir las **obras** `libre`. Un **bloque** `libre` con ventana (fase 4, #216) tiene obras con `orderNo`, así que sigue viviendo en la columna como hasta ahora. Cambiar eso movería secciones enteras y no está en el alcance de la fase 1 — **ábrelo como issue** al terminar esta tarea (Step 5).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
describe("deriveTimeline · ventana", () => {
  const withWindow = (edges: SagaGraph["edges"]) =>
    deriveTimeline(
      graph(
        [
          node("a", { orderNo: 0, label: "Uno" }),
          node("b", { orderNo: 1, label: "Dos" }),
          node("c", { orderNo: 2, label: "Tres" }),
          node("w", { orderNo: null, label: "Ventana" }),
        ],
        edges,
      ),
    );

  it("con ancla «después de», la fila cae JUSTO DESPUÉS de esa fila", () => {
    const tl = withWindow([{ id: "e", source: "a", target: "w", type: "requisito", accent: "beige" }]);
    expect(tl[0].rows.map((r) => (r.kind === "window" ? "window" : r.kind === "entry" ? r.node.id : r.kind))).toEqual([
      "a",
      "window",
      "b",
      "c",
    ]);
    const win = tl[0].rows[1];
    if (win.kind !== "window") throw new Error("se esperaba una ventana");
    expect(win.after?.id).toBe("a");
    expect(win.before).toBeNull();
    expect(win.no).toBeNull();
    expect(win.reason).toBeNull();
    expect(win.track).toBeNull();
  });

  it("con las dos anclas, manda el «después de»", () => {
    const tl = withWindow([
      { id: "e1", source: "a", target: "w", type: "requisito", accent: "beige" },
      { id: "e2", source: "w", target: "c", type: "opcional", accent: "ambar" },
    ]);
    expect(tl[0].rows.map((r) => (r.kind === "window" ? "window" : r.kind === "entry" ? r.node.id : r.kind))).toEqual([
      "a",
      "window",
      "b",
      "c",
    ]);
    const win = tl[0].rows[1];
    if (win.kind !== "window") throw new Error("se esperaba una ventana");
    expect(win.after?.id).toBe("a");
    expect(win.before?.id).toBe("c");
  });

  it("con solo «antes de», la fila cae JUSTO ANTES de esa fila", () => {
    const tl = withWindow([{ id: "e", source: "w", target: "c", type: "opcional", accent: "ambar" }]);
    expect(tl[0].rows.map((r) => (r.kind === "window" ? "window" : r.kind === "entry" ? r.node.id : r.kind))).toEqual([
      "a",
      "b",
      "window",
      "c",
    ]);
  });

  it("sin ancla que resuelva, sigue cayendo a rama como hoy", () => {
    // Arista de la columna HACIA el nodo con tipo `opcional`: no es una ventana
    // (una ventana `antes de` sale DEL sujeto), es el mecanismo de ramas de #167.
    const tl = withWindow([{ id: "e", source: "a", target: "w", type: "opcional", accent: "ambar" }]);
    expect(tl[0].rows.map((r) => r.kind)).toEqual(["entry", "entry", "entry"]);
    const rowA = tl[0].rows[0];
    if (rowA.kind !== "entry") throw new Error("se esperaba entry");
    expect(rowA.branches.map((b) => b.node.id)).toEqual(["w"]);
  });

  it("integración: deriveSagaMap → deriveTimeline coloca la ventana tras su ancla", () => {
    const w = (id: string, position: number | null, placement: "fijo" | "libre"): DetailMember => ({
      itemType: "book", itemId: id, title: id, coverUrl: null, href: `/libro/${id}`,
      position, role: null, placement, optional: false, status: null, groupSagaId: "saga-Era", ownerSagaId: "owner", year: null,
    });
    const groups: MemberGroup[] = [
      {
        sagaId: "saga-Era",
        name: "Era",
        accent: "beige",
        members: [w("A", 1, "fijo"), w("B", 2, "fijo"), w("L", null, "libre")],
        positionInParent: 1,
        placementInParent: "fijo",
      },
    ];
    const derived = deriveSagaMap(
      groups,
      { "i:book:L": { afterKey: "i:book:A", beforeKey: null } as never },
      { groupAccent: new Map(), groupName: new Map() },
    );
    const tl = deriveTimeline(derived);
    expect(tl[0].rows.map((r) => (r.kind === "window" ? "window" : r.kind === "entry" ? r.node.id : r.kind))).toEqual([
      "i:book:A",
      "window",
      "i:book:B",
    ]);
  });
});
```

> Si el tipo real de `ResolvedWindow` pide más campos que `afterKey`/`beforeKey`, quita el `as never` y rellénalos leyendo `src/lib/sagas/types.ts`. El `as never` está para que el test no invente una forma: mira el tipo antes de escribirlo.

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-timeline.test.ts`
Expected: FAIL — la ventana sale hoy como rama de `a`, así que la primera aserción da `["a","b","c"]`.

- [ ] **Step 3: Implementar la colocación**

En `derive-timeline.ts`, **antes** del bucle «Nodos-ítem fuera de columna», añadir el reconocimiento de ventanas y su inserción; y en ese bucle, saltarse los nodos ya colocados:

```ts
  // Ventanas: un sujeto `libre` (sin orderNo) con al menos un ancla resuelta.
  // Las anclas NO se resuelven aquí — se LEEN de las aristas que ya dejó
  // resueltas `deriveSagaMap` (`resolveEntry`: última obra del bloque para un
  // `después de`, primera para un `antes de`). Dos resoluciones distintas del
  // mismo ancla acabarían discrepando, que es justo lo que la spec prohíbe.
  //
  // `deriveSagaMap` es el único productor de SagaGraph y solo emite
  // `requisito`/`opcional` para ventanas, con dirección fija:
  //   `después de`: after → subject, tipo requisito
  //   `antes de`:   subject → before, tipo opcional
  const windowAnchors = (nodeId: string): { after: SagaGraphNode | null; before: SagaGraphNode | null } => {
    let after: SagaGraphNode | null = null;
    let before: SagaGraphNode | null = null;
    for (const e of graph.edges) {
      if (e.target === nodeId && e.type === "requisito") after = byId.get(e.source) ?? after;
      if (e.source === nodeId && e.type === "opcional") before = byId.get(e.target) ?? before;
    }
    return { after, before };
  };

  /** Coloca una fila justo después (o justo antes) de la fila que contiene a
   *  `anchorId`. Devuelve false si el ancla no está en ninguna sección. */
  const insertRelativeTo = (anchorId: string, row: TimelineRow, where: "after" | "before"): boolean => {
    for (const section of sections) {
      const idx = section.rows.findIndex(
        (r) =>
          (r.kind === "entry" && r.node.id === anchorId) ||
          (r.kind === "tandem" && r.nodes.some((x) => x.id === anchorId)),
      );
      if (idx === -1) continue;
      section.rows.splice(where === "after" ? idx + 1 : idx, 0, row);
      return true;
    }
    return false;
  };

  const placedAsWindow = new Set<string>();
  for (const n of items) {
    if (n.orderNo !== null) continue;
    const { after, before } = windowAnchors(n.id);
    if (after === null && before === null) continue;
    const row: TimelineRow = { kind: "window", no: null, node: n, after, before, reason: null, track: null };
    // 1) justo DESPUÉS de su ancla `después de`; 2) si solo hay `antes de`,
    // justo ANTES de esa fila; 3) si ninguna resuelve, cae a rama (abajo).
    const placed =
      (after !== null && insertRelativeTo(after.id, row, "after")) ||
      (after === null && before !== null && insertRelativeTo(before.id, row, "before"));
    if (placed) placedAsWindow.add(n.id);
  }
```

Y en el bucle de nodos fuera de columna, primera línea del cuerpo:

```ts
  for (const n of items) {
    if (n.orderNo !== null) continue;
    if (placedAsWindow.has(n.id)) continue; // ya es una fila de la columna
    const conn = earliestSpineFor(n.id);
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `fnm use 22; npx vitest run src/lib/sagas/derive-timeline.test.ts && npx tsc --noEmit && npx vitest run`
Expected: PASS. Comprueba en especial que `derive-map.test.ts` sigue verde: esta tarea no toca `derive-map.ts`.

- [ ] **Step 5: Abrir la issue del límite asumido**

```bash
gh issue create --title "El timeline no pinta como ventana un BLOQUE libre con ventana" --body "## Qué pasa

La fase 1 del timeline (plan \`docs/superpowers/plans/2026-07-28-sagas-timeline-estados-fases-0-1.md\`, Task 5) convierte en fila \`window\` a los sujetos con \`orderNo === null\` — es decir, las OBRAS \`libre\`. Un **bloque** \`libre\` con ventana (la que añadió la fase 4, #216) tiene obras con \`orderNo\`, así que sigue viviendo en la columna como una sección normal, sin banda ni anclas.

## Qué SÍ funciona

- Una obra \`libre\` con ventana cae en su sitio y muestra sus dos anclas.
- El mapa 2D sigue pintando la arista de la ventana del bloque: esto es solo el timeline.

## Cómo reproducirlo

Ficha de una saga con un bloque \`libre\` con ventana (en producción: *Nacidos de la Bruma. Era 2* bajo Cosmere), móvil, pestaña «Mapa de lectura».

## Por qué se dejó fuera

Pintarlo como ventana implica mover una SECCIÓN entera, no una fila, y eso cambia el modelo de secciones del timeline. No cabía en una fase sin migración."
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): la ventana cae en la columna junto a su ancla, no como rama"
```

---

## Task 6: Montaje en las cuatro ubicaciones

**Files:**
- Modify: `src/components/saga/saga-map-tab.tsx:92-175`
- Modify: `src/components/saga/route-view.tsx:18-26` (firma) y `:118-161` (la lista de pasos)
- Modify: `messages/es.json` (retirar `asLinearList`)

**Interfaces:**
- Consumes: `ReadingTimeline` (Task 3), `deriveTimeline(graph, { spine })` (Tasks 2/4/5).
- Produces: `RouteView` acepta una prop nueva `graph: SagaGraph | null`.

| Dónde | Hoy | Después |
|---|---|---|
| Móvil · «lectura» | timeline pobre + «Como lista lineal» | timeline nuevo, columna por curación |
| Móvil · itinerario | **solo la lista de `RouteView`** | timeline nuevo dentro de `RouteView`, columna por pasos |
| PC · «lectura» | grafo + leyenda | **+ el mismo timeline al pie** |
| PC · itinerario | grafo + leyenda + `RouteView` | igual, y `RouteView` ya lo lleva dentro |

**Dos cosas que no son obvias:**
1. `curatedGraph` ya se calcula en `saga-map-tab.tsx` (líneas 48-65) y **se calcula en el servidor pase lo que pase**, aunque hoy solo lo pinte la rama de PC: pasarlo a `RouteView` no añade ni una consulta. `RouteView` **no** debe derivarlo por su cuenta — sería un segundo `getRouteEntries` por render.
2. Si `curatedGraph` es `null` (la saga no tiene nada curado, o tiene `show_map` apagado, que `resolveSagaGraph` ya resuelve en el origen), `RouteView` **conserva su lista de hoy**. Apagar el mapa no puede hacer desaparecer los pasos del itinerario.

- [ ] **Step 1: `RouteView` acepta el grafo y pinta el timeline en vez de su lista**

En `src/components/saga/route-view.tsx`, la firma:

```tsx
export async function RouteView({
  detail,
  slug,
  canEdit,
  graph,
}: {
  detail: SagaDetail;
  slug: string;
  canEdit?: boolean;
  /** Grafo del itinerario activo (con `step` en cada nodo por el que pasa), ya
   *  derivado por `SagaMapTab`. `null` cuando la saga no tiene nada curado o
   *  tiene el mapa apagado: entonces se conserva la lista de pasos de siempre —
   *  apagar el mapa no puede hacer desaparecer el itinerario. */
  graph: SagaGraph | null;
}) {
```

y el import:

```tsx
import { deriveTimeline } from "@/lib/sagas/derive-timeline";
import type { SagaGraph } from "@/lib/sagas/map-types";
import { ReadingTimeline } from "./reading-timeline";
```

Sustituir el bloque de los pasos (el ternario `resolved.steps.length === 0 ? … : <ol>…</ol>`) por:

```tsx
      {resolved.steps.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{t("routeEmpty")}</p>
      ) : timelineSections !== null ? (
        // El timeline SUSTITUYE la lista de pasos, no se suma a ella: verlos
        // dos veces seguidos es el ruido que la fase 4 evitó al no numerar por
        // duplicado. Lo que solo tiene RouteView —nombre, resumen, «Llevas X de
        // Y», adoptar y «Sin puesto en este itinerario»— se queda.
        <ReadingTimeline sections={timelineSections} />
      ) : (
        // El `<ol>` de hoy, `route-view.tsx:121-160`, íntegro y sin tocar una
        // línea: es el camino de respaldo cuando no hay grafo que derivar.
        <ol className="flex flex-col gap-2">{/* …resolved.steps.map(...), tal cual… */}</ol>
      )}
```

y calcular `timelineSections` justo antes del `return`:

```tsx
  // Columna por PASOS (spec §1): `deriveTimeline` construía la columna con
  // `orderNo` —el orden curado—, así que con un itinerario activo la columna
  // salía en un orden y los números en otro. Es justo lo que hace que el lector
  // se pierda.
  const timelineSections = graph === null ? null : deriveTimeline(graph, { spine: "route" });
```

- [ ] **Step 2: `SagaMapTab` pasa el grafo, monta el pie de PC y retira «Como lista lineal»**

En `src/components/saga/saga-map-tab.tsx`:

(a) La rama de PC de la ruta «lectura» (líneas 148-155) gana el timeline al pie:

```tsx
          {/* PC: grafo embebido con la leyenda como barra inferior del marco
              (frame E), y el MISMO componente de orden de lectura al pie — el
              impacto gráfico que el móvil recupera, aquí debajo del grafo. */}
          <div className="hidden flex-col lg:flex">
            <div className="overflow-hidden rounded-2xl border border-border">
              <SagaGraphLazy graph={graph} className="h-[640px] w-full" />
            </div>
            <div className="mt-3">
              <GraphLegend graph={graph} />
            </div>
            <div className="mt-4">
              <ReadingTimeline sections={deriveTimeline(graph)} />
            </div>
          </div>
```

(b) En la rama de móvil (líneas 98-146), borrar todo lo que va desde el `<h3>` de `t("asLinearList")` hasta el `</ol>` que lo cierra, dejando:

```tsx
          <div className="flex flex-col lg:hidden">
            <MapCta graph={graph} href={`${base}/mapa`} />
            {/* «Como lista lineal» se retira: con el timeline nuevo era un
                duplicado de los mismos títulos, uno debajo del otro. */}
            <ReadingTimeline sections={deriveTimeline(graph)} />
          </div>
```

(c) La rama de itinerario pasa el grafo:

```tsx
          <RouteView detail={detail} slug={activeRoute} canEdit={canEdit} graph={curatedGraph} />
```

(d) Quedan imports sin usar (`RoleChip` y quizá `Image`/`Link` si nada más los usa en el fichero). Bórralos: `npx eslint` lo señala.

- [ ] **Step 3: Retirar la clave de texto muerta**

En `messages/es.json`, borrar la línea `"asLinearList": "Como lista lineal",`.

Run: `grep -rn "asLinearList" src messages`
Expected: sin resultados.

- [ ] **Step 4: Comprobar que compila y pasa el lint**

Run: `fnm use 22; npx tsc --noEmit; npx eslint src messages 2>/dev/null || npx eslint src; npx vitest run`
Expected: sin errores, unitarias verdes.

- [ ] **Step 5: Verlo funcionar de verdad**

Arranca el dev server (solo uno, en el 3000) y mira las cuatro ubicaciones de la tabla:

Run: `Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object OwningProcess` — si hay uno tuyo, reutilízalo; si no, `npm run dev`.

Mira `/saga/<id de un universo con show_map>?tab=mapa`:
- ancho de móvil: timeline con números empezando en «Nº 1» y **sin** «Como lista lineal» debajo;
- ancho de PC: grafo, leyenda, y el timeline al pie;
- con `?ruta=<slug>` de un itinerario: en móvil, la columna son los pasos del itinerario; en PC, lo mismo bajo el grafo.

- [ ] **Step 6: Commit**

```bash
git add src/components/saga/saga-map-tab.tsx src/components/saga/route-view.tsx messages/es.json
git commit -m "feat(sagas): el orden de lectura se pinta en móvil, en el itinerario y al pie del grafo"
```

---

## Task 7: E2E y su inyección de fallo

**Files:**
- Create: `e2e/sagas-timeline-estados.spec.ts`

**Interfaces:**
- Consumes: `data-testid="reading-timeline"` (Task 3), el patrón de siembra/limpieza de `e2e/sagas-orden-designado.spec.ts`.

**Universo QA:** `[QA Sagas v2] Universo` (`69c07496-9b1a-4203-b3da-15d22a09c039`). Verificado por `SELECT` contra dev el 2026-07-28:

- `show_map = true` — hace falta: `resolveSagaGraph` devuelve `graph = null` con el interruptor apagado, y sin grafo no hay timeline que mirar. `[QA Sagas v2] Era Uno` tiene `show_map = false`, así que **no sirve** para este spec.
- Sus **2 miembros directos** (*Trilogía La casa de los espíritus*, *Para leer a Isabel Allende*) están **sin clasificar**: `position = null`, `placement = null`. Eso no estorba — un paso del itinerario recibe su `step` por CLAVE (`i:book:<uuid>`), tenga hueco o no, así que la columna por pasos los pinta igual. Sí importa para el otro test: los números de la ruta «lectura» salen de las obras de las subsagas (Era Uno tiene 4 con hueco), no de estos dos.
- Cero itinerarios propios, así que el que siembra este spec es el único de la saga mientras corre.

El spec siembra su propio itinerario y lo borra, exactamente como `sagas-orden-designado.spec.ts`.

**La prueba que de verdad importa** no es «hay un timeline», es **«la columna son los pasos del itinerario, aunque contradigan la curación»**. Por eso el itinerario se siembra en el **orden inverso** al curado: si el componente cayera de nuevo en la columna por `orderNo`, el test lo caza.

- [ ] **Step 1: Escribir el spec**

Crear `e2e/sagas-timeline-estados.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

// E2E de la fase 1 del timeline con los cuatro estados: el componente único de
// orden de lectura, montado en móvil y al pie del grafo de PC.
//
// Mismo patrón que sagas-orden-designado.spec.ts: `fetch` nativo (NO el fixture
// `request` de Playwright, que muere con el contexto del test y dejaría filas
// huérfanas en un timeout), `res.ok` comprobado en cada escritura (#180/#182) y
// la semilla devuelta exactamente a como estaba.
//
// Universo QA: "[QA Sagas v2] Universo" — el único con `show_map = true`.
const UNIVERSO_ID = "69c07496-9b1a-4203-b3da-15d22a09c039";
const ROUTE_SLUG = "qa-timeline";
const ROUTE_NAME = "QA Timeline";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let routeId: string;
/** Títulos de los pasos sembrados, en el orden del ITINERARIO. */
let stepTitles: string[] = [];

async function loginAsDevtest(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText} — ${await res.text()}`);
  return res;
}

test.beforeAll(async () => {
  // Miembros REALES del universo, resueltos por REST: un item_id inventado
  // pasaría el insert (no hay FK contra saga_items) pero `resolveRoute` lo
  // descartaría por colgante y el test seguiría en verde demostrando otra cosa.
  const members = (await (
    await api(`saga_items?saga_id=eq.${UNIVERSO_ID}&select=item_type,item_id,position&order=position&limit=2`)
  ).json()) as Array<{ item_type: string; item_id: string }>;
  if (members.length < 2) throw new Error("beforeAll: el Universo QA necesita ≥2 miembros directos — ¿cambió el seed?");

  const inserted = (await (
    await api("saga_routes", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ saga_id: UNIVERSO_ID, slug: ROUTE_SLUG, name: ROUTE_NAME, summary: null, position: 1 }),
    })
  ).json()) as Array<{ id: string }>;
  routeId = inserted[0].id;

  // ORDEN INVERSO al curado, a propósito: es lo que distingue «la columna son
  // los pasos» de «la columna sigue siendo la curación y por casualidad
  // coincide».
  const reversed = [...members].reverse();
  await api("saga_route_entries", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      reversed.map((m, i) => ({
        route_id: routeId,
        position: i + 1,
        item_type: m.item_type,
        item_id: m.item_id,
        child_saga_id: null,
        note: null,
      })),
    ),
  });

  const books = (await (
    await api(`books?id=in.(${reversed.map((m) => m.item_id).join(",")})&select=id,title`)
  ).json()) as Array<{ id: string; title: string }>;
  stepTitles = reversed.map((m) => books.find((b) => b.id === m.item_id)!.title);
});

test.afterAll(async () => {
  // Los pasos se van solos por `on delete cascade` de saga_route_entries.route_id.
  await api(`saga_routes?id=eq.${routeId}`, { method: "DELETE" });
});

/** El timeline VISIBLE. Las dos cáscaras (móvil y PC) se montan a la vez y se
 *  ocultan por breakpoint (regla de los dos árboles): sin `:visible` este
 *  locator encuentra dos. */
function timeline(page: Page) {
  return page.locator('[data-testid="reading-timeline"]:visible');
}

test.describe("timeline · fase 1", () => {
  test("móvil, con itinerario activo: la columna son SUS pasos, en su orden", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=${ROUTE_SLUG}`);

    const tl = timeline(page);
    await expect(tl).toBeVisible();

    // El orden del itinerario, que es el INVERSO del curado.
    const titles = await tl.locator("a span.font-serif").allInnerTexts();
    const found = stepTitles.map((t) => titles.findIndex((x) => x.trim() === t));
    expect(found.every((i) => i !== -1)).toBe(true);
    expect([...found].sort((a, b) => a - b)).toEqual(found);
  });

  test("móvil, ruta «lectura»: el timeline numera desde 1 y ya no hay «Como lista lineal»", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(timeline(page)).toBeVisible();
    await expect(timeline(page).getByText("Nº 1", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Como lista lineal")).toHaveCount(0);
  });

  test("PC: el mismo timeline al pie del grafo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsDevtest(page);
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(timeline(page)).toBeVisible();
  });

  // Riesgo 5 de la spec: la ficha es PÚBLICA, y es fácil construir el timeline
  // mirando solo la vista con sesión. Sin login se tiene que ver ENTERO — sin
  // estados de lectura, pero con todas sus filas y sus números.
  test("sin sesión: el timeline se ve igual, con sus filas y su numeración", async ({ browser }) => {
    const page = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/saga/${UNIVERSO_ID}?tab=mapa&ruta=lectura`);

    await expect(timeline(page)).toBeVisible();
    await expect(timeline(page).getByText("Nº 1", { exact: true }).first()).toBeVisible();
    await page.close();
  });
});
```

- [ ] **Step 2: Correr el spec y ver que pasa**

Run: `npx playwright test e2e/sagas-timeline-estados.spec.ts --reporter=line`
Expected: 4 passed.

- [ ] **Step 3: Inyección de fallo nº 1 — romper la columna por pasos**

En `src/components/saga/route-view.tsx`, cambia `{ spine: "route" }` por `{ spine: "curation" }`.

Run: `npx playwright test e2e/sagas-timeline-estados.spec.ts --reporter=line`
Expected: **falla exactamente** «móvil, con itinerario activo: la columna son SUS pasos, en su orden». Si pasa, el test no vale: no está mirando el orden. Deshaz el cambio.

- [ ] **Step 4: Inyección de fallo nº 2 — romper la numeración**

En `src/lib/sagas/derive-timeline.ts`, cambia `no: n.orderNo! + 1` por `no: n.orderNo!`.

Run: `npx playwright test e2e/sagas-timeline-estados.spec.ts --reporter=line`
Expected: **falla exactamente** «el timeline numera desde 1…». Deshaz el cambio.

- [ ] **Step 5: Inyección de fallo nº 3 — quitar el pie de PC**

En `src/components/saga/saga-map-tab.tsx`, borra el `<div className="mt-4"><ReadingTimeline …/></div>` de la rama de PC.

Run: `npx playwright test e2e/sagas-timeline-estados.spec.ts --reporter=line`
Expected: **falla exactamente** «PC: el mismo timeline al pie del grafo». Deshaz el cambio.

> Si alguna de las tres roturas NO tumba su test, el test no vale: arréglalo antes de seguir. En la fase 4 esta técnica destapó que una de las tres roturas previstas no tumbaba ningún test (#214).

- [ ] **Step 6: Correr la suite entera de sagas**

Run: `npx playwright test e2e/sagas-*.spec.ts --reporter=line`
Expected: todo verde. Si algo falla, mira primero si es la semilla (Task 1) y no el producto.

- [ ] **Step 7: Commit**

```bash
git add e2e/sagas-timeline-estados.spec.ts
git commit -m "test(e2e): la columna del timeline son los pasos del itinerario"
```

---

## Task 8: Cerrar la doc (definición de «hecho»)

**Files:**
- Modify: `docs/requirements/backlog.md`
- Modify: `docs/requirements/decisiones.md`
- Modify: `docs/architecture/graph.json` (por el chequeo de deriva)

- [ ] **Step 1: Marcar el estado en el backlog**

Marca la casilla de la feature del timeline de sagas. La narrativa de **cómo** se hizo NO va aquí: va en la spec (que ya existe) y en este plan.

- [ ] **Step 2: Añadir las decisiones al final de `decisiones.md`**

Append-only, sin reescribir las anteriores. Tres entradas, cada una con su porqué:

1. **La columna del timeline con un itinerario activo son sus pasos, y la subsaga baja a etiqueta de fila.** Porque `deriveTimeline` construía la columna con `orderNo` y los números salían de otro sitio: el lector veía dos órdenes a la vez.
2. **Un tándem se agrupa por el empate de `orderNo`, y en modo `route` además exige pasos consecutivos.** El itinerario manda sobre lo que dice; si mete una obra en medio del hueco, no hay tándem que pintar.
3. **Las anclas de una ventana se LEEN de las aristas de `deriveSagaMap`, no se resuelven otra vez.** Dos resoluciones del mismo ancla acabarían discrepando — es la familia del #91/#185/#203.

- [ ] **Step 3: Correr el chequeo de deriva**

Run: `/drift-check` (o el procedimiento de `docs/DRIFT-CHECK.md`), que incluye mantener `docs/architecture/graph.json` al día: esta fase añade nodos (`src/components/saga/timeline/*`) y cambia el flujo «derivar el mapa de una saga».

Expected: sin discrepancias pendientes. `docs/requirements/data-model.md` **no** se toca: no ha habido ni un cambio de esquema.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(sagas): cerrar la doc de las fases 0 y 1 del timeline"
```

---

## Lo que este plan NO hace (y dónde está escrito)

De la tabla de fases de la spec, quedan fuera y **necesitan su propio plan**, cada uno con migración:

| Fase | Qué | Por qué no va aquí |
|---|---|---|
| 2 | `saga_tandems`, RPC de 7 argumentos + su `drop` posterior, controles en el editor | Migración + el baile de la sobrecarga, ya pagado dos veces (fases 2b y 4) |
| 3 | `motivo` de la ventana y el mini-track (`windowTrack`) | Migración; el track además LEE el estado con `isMemberCompleted`, sin tocar el denominador |
| 4 | `saga_optional_skips`, `profiles.show_optional_readings`, las tres acciones y el interruptor | Migración + tres acciones nuevas |
| 5 | Enum de roles ampliado (`novela_corta`, `companero`, `crossover`; se retira `paralela`), cinta en portada, chip y filtro | Recrear el enum obliga a mirar a `save_saga_sequence`, que castea `(e->>'role')::public.saga_item_role` |
| 6 | Frame D: los estados en el grafo 2D | Separable por diseño |

Y del alcance de la spec, descartado **a sabiendas** en todas las fases: el progreso no se toca (ni «progreso con o sin opcionales», ni que `saltado` mueva el denominador), no hay roles personalizados, y no hay tercera ancla ni segunda ventana por entrada.
