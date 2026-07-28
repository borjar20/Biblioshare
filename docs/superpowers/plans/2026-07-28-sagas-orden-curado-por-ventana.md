# Orden curado sensible a las ventanas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una ventana curada (`a partir de X, antes de Y`) coloque de verdad a su sujeto en el orden de lectura propuesto, en vez de mandarlo al final como hoy.

**Architecture:** Una función pura nueva (`place-by-window.ts`) escribe la regla UNA vez y la aplican los dos órdenes que la necesitan: el orden curado (`createCuratedOrder`, que alimenta el itinerario generado, la expansión de bloque en un itinerario y el «siguiente» de Mi Biblioteca) y, a grano de bloque, la numeración `orderNo` del mapa/timeline. La ficha no cambia: lo `libre` sigue viviendo en «Cuando quieras».

**Tech Stack:** TypeScript, Next.js, Vitest, Playwright, Supabase.

**Spec:** `docs/superpowers/specs/2026-07-28-sagas-orden-curado-por-ventana-design.md` — léelo si dudas del *porqué*; este plan es el *cómo*.

## Global Constraints

- **La regla vive en UN sitio.** `place-by-window.ts` es la única implementación. Copiarla en otro fichero reabre la familia de issues #91 / #203 / #245 (dos pantallas ordenando la misma saga por su cuenta).
- **Manda el ancla `antes de`.** Con las dos anclas presentes, el sujeto se coloca lo más tarde que la ventana permite. Aplica a `place-by-window.ts`, a `orderBlocksForLayout` (group-members.ts) y a `deriveTimeline`.
- **Guarda «solo lo `libre` tiene ventana».** Ningún CHECK de BD puede imponerla (cruza dos tablas). Todo consumidor de una ventana comprueba el `placement` actual del sujeto antes de hacerle caso, igual que ya hacen `deriveSagaMap` y la ficha.
- **Dos formatos de clave, y no se mezclan.** `createCuratedOrder` habla en `<tipo>:<uuid>` (sin prefijo) de cara a sus consumidores; las ventanas y `deriveSagaMap` hablan en `i:<tipo>:<uuid>`. El post-pase traduce al entrar y al salir.
- **Cero migraciones.** Esta rama no toca el esquema.
- **Determinismo.** Ningún resultado puede depender del orden de iteración de `Object.entries(windows)` ni del orden en que Postgres devuelva filas.
- **Node 22 obligatorio antes de cualquier test.** El shell resuelve Node v20 y vitest muere al arrancar (`node:util no exporta styleText`). Exporta esto en CADA sesión de shell antes de `npx vitest` / `npx tsc` / Playwright:
  ```bash
  export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
  node --version   # tiene que decir v22.x
  ```

---

## Estructura de ficheros

| fichero | responsabilidad |
|---|---|
| `src/lib/sagas/place-by-window.ts` (**nuevo**) | La regla. Puro. Además, `entryKeyOf` (la clave de entrada compartida) y `orderWindowsFromRows` (filas crudas → ventanas, sin títulos). |
| `src/lib/sagas/place-by-window.test.ts` (**nuevo**) | La regla, caso a caso, incluido el Cosmere entero. |
| `src/lib/sagas/group-members.ts` | `orderBlocksForLayout`: `before` pasa a mandar sobre `after`. |
| `src/lib/sagas/derive-map.ts` | La pre-pasada de `orderNo` recorre el orden window-aware de bloques. |
| `src/lib/sagas/derive-timeline.ts` | La fila de ventana también prefiere el ancla `antes de`. |
| `src/lib/sagas/curated-order.ts` | Recibe `windows`, emite el bloque de cada clave y aplica el post-pase. |
| `src/lib/sagas/get-saga-detail.ts` | `placement` en `orderMemberships`; `resolveWindows` usa `entryKeyOf`. |
| `src/lib/sagas/route-actions.ts`, `src/components/saga/route-view.tsx` | Pasan `detail.windows`. |
| `src/lib/sagas/build-library-saga-cards.ts`, `src/lib/sagas/get-followed-sagas.ts` | `placement` en `LibMembership`, parámetro `windows`, y la query bulk que lo alimenta. |

---

### Task 1: La regla — `place-by-window.ts`

**Files:**
- Create: `src/lib/sagas/place-by-window.ts`
- Test: `src/lib/sagas/place-by-window.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores. Solo `import type { ItemType } from "@/lib/catalog/types"`.
- Produces:
  - `export type OrderWindow = { afterKey: string | null; beforeKey: string | null }`
  - `export type OrderUnit = { key: string; blockId: string | null }`
  - `export type RawOrderWindowRow` (ver el código del paso 3)
  - `export function entryKeyOf(itemType: ItemType | null, itemId: string | null, childSagaId: string | null): string | null`
  - `export function orderWindowsFromRows(rows: RawOrderWindowRow[]): Record<string, OrderWindow>`
  - `export function placeByWindow(units: OrderUnit[], windows: Record<string, OrderWindow>, isFreeSubject: (subjectKey: string) => boolean): OrderUnit[]`

- [ ] **Step 1: Escribe el fichero de test completo**

Crea `src/lib/sagas/place-by-window.test.ts` con exactamente esto:

```ts
import { describe, expect, it } from "vitest";
import {
  orderWindowsFromRows,
  placeByWindow,
  type OrderUnit,
  type OrderWindow,
  type RawOrderWindowRow,
} from "./place-by-window";

// Helpers. `u` construye una unidad; `claves` extrae las claves para comparar
// listas cortas y legibles; `libre` es el caso normal (el sujeto SÍ es libre) —
// la guarda de placement se prueba aparte.
const u = (key: string, blockId: string | null = null): OrderUnit => ({ key, blockId });
const claves = (units: OrderUnit[]) => units.map((x) => x.key);
const libre = () => true;

// El Cosmere real (consultado en producción el 2026-07-28), con claves legibles
// en vez de uuids. Cuatro ventanas, tres formas distintas de sujeto:
//   - `s:era2`          bloque libre CON huecos
//   - `i:book:aliento`  obra libre que es el único miembro de un bloque libre
//   - `i:book:esquirla` obra libre dentro de un bloque COLOCADO
//   - `i:book:hombre`   obra libre dentro de un bloque libre con hermanas
const COSMERE: OrderUnit[] = [
  u("i:book:elantris", "elantris"),
  u("i:book:imperio", "era1"),
  u("i:book:pozo", "era1"),
  u("i:book:heroe", "era1"),
  u("i:book:camino", "archivo"),
  u("i:book:palabras", "archivo"),
  u("i:book:juramentada", "archivo"),
  u("i:book:ritmo", "archivo"),
  u("i:book:viento", "archivo"),
  u("i:book:esquirla", "archivo"),
  u("i:book:aleacion", "era2"),
  u("i:book:sombras", "era2"),
  u("i:book:brazales", "era2"),
  u("i:book:metal", "era2"),
  u("i:book:aliento", "aliento"),
  u("i:book:hombre", "novelas"),
  u("i:book:islas", "novelas"),
  u("i:book:trenza", "novelas"),
  u("i:book:yumi", "novelas"),
  u("i:book:arcanum", null),
];

const VENTANAS_COSMERE: Record<string, OrderWindow> = {
  "i:book:esquirla": { afterKey: "i:book:juramentada", beforeKey: "i:book:ritmo" },
  "s:era2": { afterKey: "s:era1", beforeKey: "i:book:viento" },
  "i:book:aliento": { afterKey: "s:era1", beforeKey: "i:book:juramentada" },
  "i:book:hombre": { afterKey: "i:book:ritmo", beforeKey: "i:book:viento" },
};

describe("placeByWindow", () => {
  it("un bloque libre retrocede al principio del bloque que partiría", () => {
    // «antes de b2» caería entre b1 y b2, partiendo el bloque `B`. Como el
    // `a partir de` (fin de `A`) lo permite, retrocede al principio de `B`.
    const units = [
      u("i:book:a1", "A"),
      u("i:book:b1", "B"),
      u("i:book:b2", "B"),
      u("i:book:l1", "L"),
      u("i:book:l2", "L"),
    ];
    const out = placeByWindow(units, { "s:L": { afterKey: "s:A", beforeKey: "i:book:b2" } }, libre);
    expect(claves(out)).toEqual(["i:book:a1", "i:book:l1", "i:book:l2", "i:book:b1", "i:book:b2"]);
  });

  it("una obra que no puede retroceder corta el bloque", () => {
    // Las dos anclas viven DENTRO de `B`: retroceder al principio de `B`
    // incumpliría el «a partir de b1», así que se acepta el corte.
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:z", "Z")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:b1", beforeKey: "i:book:b2" } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:z", "i:book:b2"]);
  });

  it("un sujeto BLOQUE retrocede aunque eso incumpla el `a partir de`", () => {
    // Un bloque solo puede aterrizar en límites entre bloques (spec §5), así
    // que cuando ningún límite cumple las dos anclas gana el `antes de`.
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:l1", "L")];
    const out = placeByWindow(units, { "s:L": { afterKey: "i:book:b1", beforeKey: "i:book:b2" } }, libre);
    expect(claves(out)).toEqual(["i:book:l1", "i:book:b1", "i:book:b2"]);
  });

  it("solo `a partir de`: se coloca detrás del ancla y avanza al final del bloque que partiría", () => {
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:z", "Z")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:b1", beforeKey: null } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:b2", "i:book:z"]);
  });

  it("sin ninguna ventana la secuencia sale intacta", () => {
    expect(claves(placeByWindow(COSMERE, {}, libre))).toEqual(claves(COSMERE));
  });

  it("un sujeto que ya no es `libre` se ignora, aunque quede su fila de ventana", () => {
    // Fila rancia: ningún CHECK de BD impide que sobreviva.
    const out = placeByWindow(COSMERE, VENTANAS_COSMERE, () => false);
    expect(claves(out)).toEqual(claves(COSMERE));
  });

  it("un ancla que no está en la secuencia se ignora y manda la otra", () => {
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:z", "Z")];
    // El `antes de` apunta fuera de la secuencia: queda el `a partir de b1`.
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:b1", beforeKey: "i:book:fantasma" } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:b2", "i:book:z"]);
  });

  it("si ninguna ancla está en la secuencia, el sujeto no se mueve", () => {
    const units = [u("i:book:z", "Z"), u("i:book:b1", "B")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:x", beforeKey: "i:book:y" } }, libre);
    expect(claves(out)).toEqual(["i:book:z", "i:book:b1"]);
  });

  it("un sujeto anclado a sí mismo no se mueve", () => {
    const units = [u("i:book:b1", "B"), u("i:book:z", "Z")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:z", beforeKey: null } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:z"]);
  });

  it("dos sujetos que caen en el mismo punto conservan el orden que ya tenían", () => {
    const units = [
      u("i:book:a1", "A"),
      u("i:book:b1", "B"),
      u("i:book:p", "P"),
      u("i:book:q", "Q"),
    ];
    const out = placeByWindow(
      units,
      {
        "i:book:p": { afterKey: null, beforeKey: "i:book:b1" },
        "i:book:q": { afterKey: null, beforeKey: "i:book:b1" },
      },
      libre,
    );
    expect(claves(out)).toEqual(["i:book:a1", "i:book:p", "i:book:q", "i:book:b1"]);
  });

  it("un sujeto anclado a otro sujeto libre ve al primero ya movido", () => {
    const units = [u("i:book:a1", "A"), u("i:book:b1", "B"), u("i:book:p", "P"), u("i:book:q", "Q")];
    const out = placeByWindow(
      units,
      {
        "i:book:p": { afterKey: null, beforeKey: "i:book:b1" },
        "i:book:q": { afterKey: null, beforeKey: "i:book:p" },
      },
      libre,
    );
    expect(claves(out)).toEqual(["i:book:a1", "i:book:q", "i:book:p", "i:book:b1"]);
  });

  it("un ciclo no cuelga: cada sujeto se mueve exactamente una vez", () => {
    const units = [u("i:book:a1", "A"), u("i:book:x", "X"), u("i:book:y", "Y")];
    const out = placeByWindow(
      units,
      {
        "i:book:x": { afterKey: null, beforeKey: "i:book:y" },
        "i:book:y": { afterKey: null, beforeKey: "i:book:x" },
      },
      libre,
    );
    // Determinista y sin colgarse; no se exige que satisfaga las dos ventanas.
    expect(claves(out)).toEqual(["i:book:a1", "i:book:y", "i:book:x"]);
  });

  it("el Cosmere entero sale como dice el spec", () => {
    expect(claves(placeByWindow(COSMERE, VENTANAS_COSMERE, libre))).toEqual([
      "i:book:elantris",
      "i:book:imperio",
      "i:book:pozo",
      "i:book:heroe",
      "i:book:aleacion",
      "i:book:sombras",
      "i:book:brazales",
      "i:book:metal",
      "i:book:aliento",
      "i:book:camino",
      "i:book:palabras",
      "i:book:juramentada",
      "i:book:esquirla",
      "i:book:ritmo",
      "i:book:hombre",
      "i:book:viento",
      "i:book:islas",
      "i:book:trenza",
      "i:book:yumi",
      "i:book:arcanum",
    ]);
  });
});

describe("orderWindowsFromRows", () => {
  const fila = (over: Partial<RawOrderWindowRow>): RawOrderWindowRow => ({
    item_type: null,
    item_id: null,
    child_saga_id: null,
    after_item_type: null,
    after_item_id: null,
    after_child_saga_id: null,
    before_item_type: null,
    before_item_id: null,
    before_child_saga_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  });

  it("traduce sujeto y anclas, obra o bloque, a claves de entrada", () => {
    const out = orderWindowsFromRows([
      fila({
        item_type: "book",
        item_id: "z",
        after_child_saga_id: "era1",
        before_item_type: "book",
        before_item_id: "jur",
      }),
      fila({ child_saga_id: "era2", after_child_saga_id: "era1" }),
    ]);
    expect(out).toEqual({
      "i:book:z": { afterKey: "s:era1", beforeKey: "i:book:jur" },
      "s:era2": { afterKey: "s:era1", beforeKey: null },
    });
  });

  it("con dos filas para el mismo sujeto gana la MÁS ANTIGUA, llegue en el orden que llegue", () => {
    // Los uniques de saga_placement_windows son POR SAGA, así que dos sagas
    // hermanas pueden tener cada una su fila para la misma obra compartida.
    const vieja = fila({
      item_type: "book",
      item_id: "z",
      after_child_saga_id: "era1",
      created_at: "2026-01-01T00:00:00Z",
    });
    const nueva = fila({
      item_type: "book",
      item_id: "z",
      after_child_saga_id: "era2",
      created_at: "2026-06-01T00:00:00Z",
    });
    expect(orderWindowsFromRows([nueva, vieja])).toEqual({ "i:book:z": { afterKey: "s:era1", beforeKey: null } });
    expect(orderWindowsFromRows([vieja, nueva])).toEqual({ "i:book:z": { afterKey: "s:era1", beforeKey: null } });
  });

  it("una fila sin ninguna ancla no produce ventana", () => {
    expect(orderWindowsFromRows([fila({ item_type: "book", item_id: "z" })])).toEqual({});
  });
});
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/place-by-window.test.ts
```

Esperado: FAIL — `Failed to resolve import "./place-by-window"`.

- [ ] **Step 3: Escribe `src/lib/sagas/place-by-window.ts`**

```ts
import type { ItemType } from "@/lib/catalog/types";

// La REGLA de colocación del orden propuesto (spec
// docs/superpowers/specs/2026-07-28-sagas-orden-curado-por-ventana-design.md §2):
// un sujeto `libre` con ventana se mueve a donde su ventana dice, y evita partir
// un bloque por la mitad cuando la ventana deja sitio para no hacerlo.
//
// PURA y sin dependencias del dominio: no conoce Supabase, ni `MemberGroup`, ni
// `OrderMembership`. Recibe una secuencia ya construida y la devuelve
// recolocada.
//
// Vive en su propio fichero, y no dentro de curated-order.ts, porque la regla es
// justo lo que NO puede estar escrito dos veces: la familia de issues
// #91 / #203 / #245 es, siempre, dos pantallas ordenando la misma saga por su
// cuenta y acabando en desacuerdo.

/** Las dos anclas de una ventana, y nada más. `ResolvedWindow` (types.ts) es
 *  estructuralmente compatible —lleva además los títulos, que la ficha pinta y
 *  el orden no necesita—, así que quien ya tiene un
 *  `Record<string, ResolvedWindow>` lo pasa tal cual, sin convertir nada. */
export type OrderWindow = { afterKey: string | null; beforeKey: string | null };

/** Una entrada de la secuencia.
 *  - `key`: formato de ENTRADA (`i:<tipo>:<uuid>`), el mismo que usan las
 *    ventanas, el borrador de secuencia y `deriveSagaMap`.
 *  - `blockId`: la saga que emitió la clave, o `null` para un miembro directo de
 *    la raíz (el grupo «Nexo»). Define dónde están los LÍMITES entre bloques,
 *    que es lo único que esta función sabe de la estructura. */
export type OrderUnit = { key: string; blockId: string | null };

/** Clave de entrada de un sujeto o de un ancla, a partir de las tres columnas
 *  con las que `saga_placement_windows` señala a una obra o a un bloque.
 *
 *  Exportada y compartida con `resolveWindows` (get-saga-detail.ts) a propósito:
 *  las dos resoluciones tienen que producir la MISMA clave, o el orden y la
 *  ficha estarían hablando de sujetos distintos sin que nada lo delate. */
export function entryKeyOf(
  itemType: ItemType | null,
  itemId: string | null,
  childSagaId: string | null,
): string | null {
  if (itemId !== null && itemType !== null) return `i:${itemType}:${itemId}`;
  return childSagaId !== null ? `s:${childSagaId}` : null;
}

/** Fila cruda de `saga_placement_windows` reducida a lo que el ORDEN necesita.
 *  La ficha usa `resolveWindows` (get-saga-detail.ts), que además resuelve los
 *  títulos para pintarlos; el orden no pinta nada, así que no los pide — y un
 *  ancla que no aparezca en la secuencia la ignora `placeByWindow` de todos
 *  modos. */
export type RawOrderWindowRow = {
  item_type: ItemType | null;
  item_id: string | null;
  child_saga_id: string | null;
  after_item_type: ItemType | null;
  after_item_id: string | null;
  after_child_saga_id: string | null;
  before_item_type: ItemType | null;
  before_item_id: string | null;
  before_child_saga_id: string | null;
  created_at: string;
};

export function orderWindowsFromRows(rows: RawOrderWindowRow[]): Record<string, OrderWindow> {
  // Mismo desempate que `resolveWindows`: los uniques de la tabla son POR SAGA,
  // así que dos sagas hermanas pueden tener cada una su fila para la MISMA obra
  // compartida. Gana la más antigua, no la que Postgres devuelva primero.
  const ordenadas = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const out: Record<string, OrderWindow> = {};
  for (const r of ordenadas) {
    const sujeto = entryKeyOf(r.item_type, r.item_id, r.child_saga_id);
    if (sujeto === null || out[sujeto] !== undefined) continue;
    const afterKey = entryKeyOf(r.after_item_type, r.after_item_id, r.after_child_saga_id);
    const beforeKey = entryKeyOf(r.before_item_type, r.before_item_id, r.before_child_saga_id);
    if (afterKey === null && beforeKey === null) continue;
    out[sujeto] = { afterKey, beforeKey };
  }
  return out;
}

/**
 * Recoloca los sujetos `libre` con ventana dentro de `units`.
 *
 * `isFreeSubject` es la guarda «solo lo `libre` tiene ventana», la MISMA que
 * aplican `deriveSagaMap` y la ficha. Ningún CHECK de BD puede imponerla (cruza
 * dos tablas), así que una fila rancia de un sujeto que dejó de ser `libre`
 * puede llegar hasta aquí; sin la guarda, el orden movería algo que la ficha ni
 * siquiera pinta.
 */
export function placeByWindow(
  units: OrderUnit[],
  windows: Record<string, OrderWindow>,
  isFreeSubject: (subjectKey: string) => boolean,
): OrderUnit[] {
  // Sujetos a mover, en el orden en que aparecen HOY en la secuencia. Ese orden
  // ES el desempate del spec §4: dos sujetos que acaben en el mismo punto
  // conservan el orden que ya tenían, porque el segundo se inserta contra una
  // lista donde el primero ya está colocado.
  //
  // No se recorre `Object.keys(windows)`: eso ataría el resultado al orden de
  // iteración del objeto, que no es una garantía sobre la que construir.
  const sujetos: string[] = [];
  const vistos = new Set<string>();
  for (const u of units) {
    const candidatos = u.blockId === null ? [u.key] : [`s:${u.blockId}`, u.key];
    for (const clave of candidatos) {
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      if (windows[clave] === undefined) continue;
      if (!isFreeSubject(clave)) continue;
      sujetos.push(clave);
    }
  }

  let out = units;
  for (const sujeto of sujetos) out = moverSujeto(out, sujeto, windows[sujeto]);
  return out;
}

/** Mueve UN sujeto. Devuelve la lista intacta si no hay nada que mover. */
function moverSujeto(units: OrderUnit[], subjectKey: string, w: OrderWindow): OrderUnit[] {
  const bloqueSujeto = subjectKey.startsWith("s:") ? subjectKey.slice(2) : null;

  // Tramo que se mueve: una unidad si el sujeto es una obra; el primer tramo
  // CONTIGUO del bloque si es un bloque.
  const desde =
    bloqueSujeto !== null
      ? units.findIndex((u) => u.blockId === bloqueSujeto)
      : units.findIndex((u) => u.key === subjectKey);
  if (desde === -1) return units;
  let hasta = desde + 1;
  if (bloqueSujeto !== null) {
    while (hasta < units.length && units[hasta].blockId === bloqueSujeto) hasta++;
  }
  const movido = units.slice(desde, hasta);
  const resto = [...units.slice(0, desde), ...units.slice(hasta)];

  // Las anclas se buscan sobre `resto`, SIN el sujeto: así un sujeto anclado a
  // sí mismo (o a una obra de su propio bloque) no resuelve y no se mueve, en
  // vez de calcular una posición contra su propia sombra.
  const indiceDelAncla = (clave: string | null, borde: "inicio" | "fin"): number | null => {
    if (clave === null) return null;
    if (clave.startsWith("s:")) {
      const id = clave.slice(2);
      const primero = resto.findIndex((u) => u.blockId === id);
      if (primero === -1) return null;
      if (borde === "inicio") return primero;
      let ultimo = primero;
      while (ultimo + 1 < resto.length && resto[ultimo + 1].blockId === id) ultimo++;
      return ultimo;
    }
    const i = resto.findIndex((u) => u.key === clave);
    return i === -1 ? null : i;
  };

  // `a partir de` → SUELO: la primera posición válida es justo detrás del ancla.
  // `antes de` → BASE: justo delante del ancla. Manda la base (spec §2).
  const finDelAfter = indiceDelAncla(w.afterKey, "fin");
  const suelo = finDelAfter === null ? null : finDelAfter + 1;
  const base = indiceDelAncla(w.beforeKey, "inicio");
  if (suelo === null && base === null) return units;

  const parteBloque = (i: number) =>
    i > 0 &&
    i < resto.length &&
    resto[i - 1].blockId !== null &&
    resto[i - 1].blockId === resto[i].blockId;
  const inicioDelBloque = (i: number) => {
    let j = i;
    while (j > 0 && resto[j - 1].blockId === resto[i].blockId) j--;
    return j;
  };
  const finDelBloque = (i: number) => {
    let j = i;
    while (j + 1 < resto.length && resto[j + 1].blockId === resto[i].blockId) j++;
    return j + 1;
  };

  let destino: number;
  if (base !== null) {
    destino = base;
    if (parteBloque(destino)) {
      const atras = inicioDelBloque(destino);
      // Un sujeto BLOQUE retrocede SIEMPRE: solo puede aterrizar en límites
      // entre bloques (spec §5), así que cuando ningún límite cumple las dos
      // anclas gana el `antes de`. Un sujeto OBRA, en cambio, prefiere cortar
      // antes que incumplir la ventana.
      if (bloqueSujeto !== null || suelo === null || atras >= suelo) destino = atras;
    }
  } else {
    destino = suelo!;
    // Sin techo no hay nada que comprobar: avanzar al final del bloque que
    // partiría cumple el `a partir de` por construcción.
    if (parteBloque(destino)) destino = finDelBloque(destino);
  }

  return [...resto.slice(0, destino), ...movido, ...resto.slice(destino)];
}
```

- [ ] **Step 4: Ejecuta el test hasta verlo verde**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/place-by-window.test.ts
```

Esperado: PASS, 15 tests.

- [ ] **Step 5: Typecheck y lint**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx tsc --noEmit && npx next lint --file src/lib/sagas/place-by-window.ts
```

Esperado: sin errores. **Nota:** `src/app/(auth)/signup/signup-form.tsx:23` tiene un error de eslint PREEXISTENTE en `main` (issue #247) — si aparece en un lint del proyecto entero, no es tuyo y no lo arregles aquí.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/place-by-window.ts src/lib/sagas/place-by-window.test.ts
git commit -m "feat(sagas): la regla de colocación por ventana, pura y en un solo sitio"
```

---

### Task 2: `orderBlocksForLayout` — `antes de` pasa a mandar

**Files:**
- Modify: `src/lib/sagas/group-members.ts` (dentro de `orderBlocksForLayout`, el bloque de `lado`/`clave`)
- Test: `src/lib/sagas/group-members.test.ts:314`

**Interfaces:**
- Consumes: nada de la Task 1 (este cambio es independiente; comparten la regla conceptual, no código).
- Produces: `orderBlocksForLayout` con la misma firma y la preferencia de ancla invertida.

- [ ] **Step 1: Da la vuelta al test que fija la preferencia vieja**

En `src/lib/sagas/group-members.test.ts`, sustituye el test que hoy empieza en la línea 314 (`it("`after` manda sobre `before` cuando la ventana trae los dos", ...)`) por este:

```ts
  it("`before` manda sobre `after` cuando la ventana trae los dos", () => {
    // Cambio del 2026-07-28: «antes de Y» coloca el bloque lo más tarde que la
    // ventana permite, y es la misma regla que sigue el orden curado
    // (place-by-window.ts). Antes mandaba «a partir de», y las dos reglas
    // conviviendo son la familia #91/#203.
    const uno = bloque("Uno", "fijo", ["a"]);
    const dos = bloque("Dos", "fijo", ["b"]);
    const libre = bloque("Libre", "libre", ["l"]);
    const orden = orderBlocksForLayout([uno, dos], [libre], {
      "s:saga-Libre": ventana("s:saga-Dos", "s:saga-Uno"),
    });
    expect(nombres(orden)).toEqual(["Libre", "Uno", "Dos"]);
  });
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/group-members.test.ts
```

Esperado: FAIL en ese test — recibido `["Uno","Dos","Libre"]`, esperado `["Libre","Uno","Dos"]`. Los demás tests del fichero pasan.

- [ ] **Step 3: Invierte la preferencia**

En `src/lib/sagas/group-members.ts`, dentro de `orderBlocksForLayout`, sustituye estas dos líneas y el comentario que las precede:

```ts
      // `after` manda sobre `before`: «a partir de X» sitúa el bloque, mientras
      // que «antes de Y» solo pone un techo.
      const lado = w?.afterKey != null ? "after" : w?.beforeKey != null ? "before" : null;
      const clave = lado === "after" ? w!.afterKey! : lado === "before" ? w!.beforeKey! : null;
```

por:

```ts
      // `before` manda sobre `after` (spec 2026-07-28, §2): «antes de Y» coloca
      // el bloque lo más tarde que la ventana permite. Hasta el 2026-07-28 era
      // al revés, y esa preferencia contradecía a la del orden curado
      // (place-by-window.ts) en cuanto las dos anclas caían en bloques
      // distintos — dos reglas para la misma pregunta es la familia #91/#203.
      const lado = w?.beforeKey != null ? "before" : w?.afterKey != null ? "after" : null;
      const clave = lado === "before" ? w!.beforeKey! : lado === "after" ? w!.afterKey! : null;
```

No toques nada más del cuerpo: las dos ramas de inserción (`after` con el contador `detrasDe`, `before` sin él) siguen siendo correctas tal cual.

- [ ] **Step 4: Ejecuta los tests que tocan el orden de bloques**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/group-members.test.ts src/lib/sagas/derive-map.test.ts src/lib/sagas/layout-map.test.ts src/lib/sagas/derive-timeline.test.ts
```

Esperado: PASS. Si alguno falla, será porque su fixture da las DOS anclas y esperaba la colocación vieja: actualiza el valor esperado a la colocación nueva (delante del bloque del ancla `antes de`) y di en el informe cuál cambió y por qué. **No** relajes una aserción para que pase.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/group-members.ts src/lib/sagas/group-members.test.ts
git commit -m "feat(sagas): el ancla «antes de» manda al ordenar los bloques del mapa"
```

---

### Task 3: `orderNo` sigue el orden window-aware de bloques

**Files:**
- Modify: `src/lib/sagas/derive-map.ts` (el comentario largo sobre `orderNo` y el `for` de la pre-pasada, alrededor de las líneas 128-149)
- Test: `src/lib/sagas/derive-map.test.ts:278`

**Interfaces:**
- Consumes: `orderBlocksForLayout` ya invertido (Task 2). La variable local `blocks` ya existe en `deriveSagaMap` (línea 100).
- Produces: nodos cuyo `orderNo` numera los bloques en el orden en que el mapa los pinta.

- [ ] **Step 1: Sustituye el test que fija el comportamiento viejo**

En `src/lib/sagas/derive-map.test.ts`, sustituye el test que hoy empieza en la línea 278 (`it("subir de fila NO mueve el orderNo: ...")`) por este:

```ts
  it("subir de fila TAMBIÉN mueve el orderNo: el timeline lee lo libre en su sitio", () => {
    // Cambio del 2026-07-28 (issue #245): hasta hoy `orderNo` recorría
    // `[...ordered, ...free]`, así que el mapa podía pintar un bloque libre en
    // la fila 1 mientras el timeline de móvil lo numeraba el último — la misma
    // saga contada de dos maneras. Ahora los dos recorren `blocks`.
    const map = deriveSagaMap(
      groups([
        block("Uno", 1, [work("A", 1)]),
        block("Dos", 2, [work("B", 1)]),
        freeBlock("Libre", [work("L", 1)]),
      ]),
      { "s:saga-Libre": { afterKey: "i:book:A", afterTitle: "A", beforeKey: null, beforeTitle: null, reason: null } },
      lookup(),
    );
    const orden = (id: string) => map.nodes.find((n) => n.id === id)!.orderNo;
    expect(orden("i:book:A")).toBe(0);
    expect(orden("i:book:L")).toBe(1);
    expect(orden("i:book:B")).toBe(2);
  });
```

- [ ] **Step 2: Ejecuta el test para verlo fallar**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/derive-map.test.ts
```

Esperado: FAIL en ese test — `orden("i:book:L")` devuelve 2 y se espera 1.

- [ ] **Step 3: Cambia la pre-pasada**

En `src/lib/sagas/derive-map.ts`, sustituye el párrafo del comentario que empieza en «Por eso se calcula AQUÍ, en una pre-pasada sobre `[...ordered, ...free]`…» y la línea `for (const group of [...ordered, ...free]) {` por:

```ts
  // Por eso se calcula AQUÍ, en una pre-pasada aparte y no dentro del `forEach`
  // de pintado: el `forEach` puede apilar un tándem en varias filas, así que un
  // contador que lo siguiera numeraría por FILA y no por hueco.
  //
  // La pre-pasada recorre `blocks` —el mismo orden que el pintado— desde el
  // 2026-07-28: hasta entonces recorría `[...ordered, ...free]`, y por eso el
  // mapa podía dibujar un bloque libre en la fila 1 mientras el timeline de
  // móvil lo numeraba el último (issue #245). El grano de esto es el BLOQUE, no
  // la obra: solo se numeran las obras CON hueco, así que un bloque libre sin
  // huecos (*El Aliento de los Dioses*, *Novelas secretas* en el Cosmere) no
  // tiene ningún `orderNo` que mover — a sus obras las coloca el mecanismo de
  // filas de ventana de `deriveTimeline`.
  //
  // Todos los miembros de un mismo hueco (un tándem) comparten `orderNo`: es la
  // pertenencia al hueco, y `deriveMapOverlays` la lee así para dibujar la
  // cápsula.
  const orderNoDeCadaObra = new Map<string, number>();
  let orderCounter = 0;
  for (const group of blocks) {
```

Deja intacto el cuerpo del bucle (`for (const hueco of huecosDe(group)) { ... }`).

**Cuidado:** las variables `ordered` y `free` siguen usándose en la línea 100 (`orderBlocksForLayout(ordered, free, windows)`), así que NO las borres.

- [ ] **Step 4: Ejecuta los tests**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/derive-map.test.ts src/lib/sagas/derive-timeline.test.ts src/lib/sagas/map-overlays.test.ts
```

Esperado: PASS. Si algún test con un bloque libre esperaba `orderNo` al final, actualiza el valor y di cuál en el informe.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-map.ts src/lib/sagas/derive-map.test.ts
git commit -m "fix(sagas): orderNo numera los bloques en el orden en que el mapa los pinta"
```

---

### Task 4: La fila de ventana del timeline prefiere el ancla `antes de`

**Files:**
- Modify: `src/lib/sagas/derive-timeline.ts` (el bloque `const placed = ...`, alrededor de la línea 300)
- Test: `src/lib/sagas/derive-timeline.test.ts:338`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `deriveTimeline` con la misma firma; solo cambia dónde cae la fila `window` cuando la ventana trae las dos anclas.

- [ ] **Step 1: Da la vuelta al test**

En `src/lib/sagas/derive-timeline.test.ts`, sustituye el test que hoy empieza en la línea 338 (`it("con las dos anclas, manda el «después de»", ...)`) entero por este:

```ts
  it("con las dos anclas, manda el «antes de»", () => {
    // Cambio del 2026-07-28: la misma preferencia que `orderBlocksForLayout` y
    // que `placeByWindow`. La fila cae justo DELANTE del ancla «antes de» (c)
    // en vez de justo detrás de la «a partir de» (a).
    const tl = withWindow([
      { id: "e1", source: "a", target: "w", type: "requisito", accent: "beige" },
      { id: "e2", source: "w", target: "c", type: "opcional", accent: "ambar" },
    ]);
    expect(shape(tl)).toEqual(["a", "b", "window", "c"]);
    const win = tl[0].rows[2];
    if (win.kind !== "window") throw new Error("se esperaba una ventana");
    expect(win.after?.id).toBe("a");
    expect(win.before?.id).toBe("c");
  });
```

Los otros tres tests de `describe("deriveTimeline · ventana")` traen una sola ancla y no cambian; el de integración de la línea 365 tampoco (su ventana solo tiene `after`).

- [ ] **Step 2: Ejecuta el test para verlo fallar**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/derive-timeline.test.ts
```

Esperado: FAIL solo en ese test.

- [ ] **Step 3: Invierte la preferencia**

En `src/lib/sagas/derive-timeline.ts`, sustituye:

```ts
    // 1) justo DESPUÉS de su ancla `después de`; 2) si solo hay `antes de`,
    // justo ANTES de esa fila; 3) si ninguna resuelve, cae a rama (abajo).
    const placed =
      (after !== null && insertRelativeTo(after.id, row, "after")) ||
      (after === null && before !== null && insertRelativeTo(before.id, row, "before"));
```

por:

```ts
    // 1) justo ANTES de su ancla `antes de`; 2) si solo hay `a partir de`,
    // justo DESPUÉS de esa fila; 3) si ninguna resuelve, cae a rama (abajo).
    //
    // Manda el `antes de` desde el 2026-07-28 (spec §3.4), por lo mismo que en
    // `orderBlocksForLayout` y `placeByWindow`: una sola respuesta a «¿qué ancla
    // coloca?» en todo el proyecto. Con las cinco ventanas de producción no
    // mueve ninguna fila —sus dos anclas son consecutivas—, pero deja de haber
    // dos reglas conviviendo.
    const placed =
      (before !== null && insertRelativeTo(before.id, row, "before")) ||
      (before === null && after !== null && insertRelativeTo(after.id, row, "after"));
```

- [ ] **Step 4: Ejecuta los tests**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/derive-timeline.test.ts src/lib/sagas/window-track.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/derive-timeline.ts src/lib/sagas/derive-timeline.test.ts
git commit -m "feat(sagas): la fila de ventana del timeline también prefiere el ancla «antes de»"
```

---

### Task 5: `createCuratedOrder` aplica la regla

**Files:**
- Modify: `src/lib/sagas/curated-order.ts`
- Test: `src/lib/sagas/curated-order.test.ts`, `src/lib/sagas/derive-map.test.ts:332`

**Interfaces:**
- Consumes: `placeByWindow`, `OrderWindow`, `OrderUnit` de `./place-by-window` (Task 1).
- Produces:
  - `OrderMembership` gana `placement: SagaPlacement | null` (**obligatorio**).
  - `createCuratedOrder(sagas, memberships, titleOf, windows)` — cuarto parámetro **obligatorio**, `Record<string, OrderWindow>`. Obligatorio a propósito: un llamante que lo olvide tiene que romper la compilación, no perder la feature en silencio.

- [ ] **Step 1: Escribe los tests nuevos**

En `src/lib/sagas/curated-order.test.ts`:

1. Añade `placement` al helper `member` (línea 30). Queda así:

```ts
const member = (
  sagaId: string,
  itemId: string,
  position: number | null,
  placement: SagaPlacement | null = "fijo",
): OrderMembership => ({
  sagaId,
  itemType: "book",
  itemId,
  position,
  placement,
});
```

(añade `import type { SagaPlacement } from "./types";` si no está ya).

2. Añade `{}` como cuarto argumento a TODAS las llamadas existentes a `createCuratedOrder` del fichero.

3. Añade al final del fichero:

```ts
describe("createCuratedOrder con ventanas", () => {
  // Cosmere reducido: dos bloques colocados y un bloque libre cuya única obra
  // tiene ventana «a partir del bloque 1, antes de la segunda obra del bloque 2».
  const sagas: OrderSaga[] = [
    { id: "R", name: "R", parentSagaId: null, positionInParent: null, placementInParent: null },
    { id: "b1", name: "Uno", parentSagaId: "R", positionInParent: 1, placementInParent: "fijo" },
    { id: "b2", name: "Dos", parentSagaId: "R", positionInParent: 2, placementInParent: "fijo" },
    { id: "lib", name: "Libre", parentSagaId: "R", positionInParent: null, placementInParent: "libre" },
  ];
  const memberships: OrderMembership[] = [
    member("b1", "a1", 1),
    member("b2", "c1", 1),
    member("b2", "c2", 2),
    member("lib", "l1", null, "libre"),
  ];

  it("sin ventanas, el orden es exactamente el de siempre", () => {
    const order = createCuratedOrder(sagas, memberships, (k) => k, {});
    expect(order("R")).toEqual(["book:a1", "book:c1", "book:c2", "book:l1"]);
  });

  it("con ventana, la obra libre retrocede al principio del bloque que partiría", () => {
    const order = createCuratedOrder(sagas, memberships, (k) => k, {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:c2" },
    });
    expect(order("R")).toEqual(["book:a1", "book:l1", "book:c1", "book:c2"]);
  });

  it("una ventana sobre algo que ya no es `libre` no mueve nada", () => {
    const fijas = memberships.map((m) => ({ ...m, placement: "fijo" as const }));
    const order = createCuratedOrder(sagas, fijas, (k) => k, {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:c2" },
    });
    expect(order("R")).toEqual(["book:a1", "book:c1", "book:c2", "book:l1"]);
  });

  it("un miembro directo de la raíz no es un bloque: no hace de límite", () => {
    // El «Nexo» llega con blockId null, así que insertar delante de él nunca
    // cuenta como partir un bloque.
    const conDirecto: OrderMembership[] = [...memberships, member("R", "nexo", 1)];
    const order = createCuratedOrder(sagas, conDirecto, (k) => k, {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:nexo" },
    });
    expect(order("R")).toEqual(["book:a1", "book:c1", "book:c2", "book:l1", "book:nexo"]);
  });
});
```

- [ ] **Step 2: Ejecuta para verlo fallar**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/curated-order.test.ts
```

Esperado: FAIL — `createCuratedOrder` no acepta cuatro argumentos.

- [ ] **Step 3: Cambia `curated-order.ts`**

3a. Imports y tipo. Añade arriba:

```ts
import { placeByWindow, type OrderUnit, type OrderWindow } from "./place-by-window";
```

3b. `OrderMembership` gana `placement`:

```ts
export type OrderMembership = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  position: number | null;
  /** Colocación de la obra en ESA saga (`saga_items.placement`). La necesita la
   *  guarda «solo lo `libre` tiene ventana» del post-pase, la MISMA que aplican
   *  `deriveSagaMap` y la ficha: ningún CHECK de BD puede imponerla porque cruza
   *  dos tablas, así que una fila rancia puede llegar hasta aquí. */
  placement: SagaPlacement | null;
};
```

(el fichero ya importa `SagaPlacement` de `./types`).

3c. Firma:

```ts
export function createCuratedOrder(
  sagas: OrderSaga[],
  memberships: OrderMembership[],
  titleOf: (key: string) => string,
  // Ventanas del subárbol, por clave de SUJETO en formato de entrada
  // (`i:<tipo>:<uuid>` / `s:<uuid>`). Obligatorio a propósito: un llamante que
  // se lo dejara perdería la colocación por ventana EN SILENCIO, que es
  // exactamente cómo nacen las issues de la familia #203.
  windows: Record<string, OrderWindow>,
): (rootId: string) => string[] {
```

3d. `walk` emite además la saga que produjo cada clave. Sustituye su firma, su tipo de retorno y su último `push`:

```ts
  /** Una clave y la saga que la emitió: el post-pase de ventanas necesita saber
   *  dónde están los límites entre bloques, y eso solo lo sabe quien recorre. */
  type WalkUnit = { key: string; sagaId: string };

  function walk(sagaId: string, depth: number, visited: Set<string>): WalkUnit[] {
    if (depth > MAX_DEPTH || visited.has(sagaId)) return [];
    visited.add(sagaId);
    const out: WalkUnit[] = [];
```

y, al final de `walk`, sustituye

```ts
    out.push(...direct.map((m) => itemKey(m.itemType, m.itemId)));
```

por

```ts
    out.push(...direct.map((m) => ({ key: itemKey(m.itemType, m.itemId), sagaId })));
```

(el resto del cuerpo —`const direct = ...`, `const children = ...`, el bucle de hijas— no cambia).

3e. Guarda de `libre` y post-pase. Sustituye el `return function curatedOrder(...)` entero por:

```ts
  // Placement por clave de obra: basta con que UNA membresía sea `libre` para
  // que la obra pueda tener ventana — mismo criterio que `buildWindowOwners`
  // (window-owners.ts).
  const obrasLibres = new Set<string>();
  for (const m of memberships) {
    if (m.placement === "libre") obrasLibres.add(`i:${itemKey(m.itemType, m.itemId)}`);
  }
  const esLibre = (subjectKey: string): boolean =>
    subjectKey.startsWith("s:")
      ? sagaById.get(subjectKey.slice(2))?.placementInParent === "libre"
      : obrasLibres.has(subjectKey);

  /** Claves `item_type:item_id` del orden principal de `rootId`, deduplicadas y
   *  con los sujetos `libre` ya recolocados por su ventana. */
  return function curatedOrder(rootId: string): string[] {
    // Dedup conservando la PRIMERA aparición (y con ella el bloque que la
    // emitió): una obra miembro de dos sagas del subárbol sale una sola vez.
    const vistas = new Set<string>();
    const units: OrderUnit[] = [];
    for (const wu of walk(rootId, 0, new Set())) {
      if (vistas.has(wu.key)) continue;
      vistas.add(wu.key);
      units.push({
        // `placeByWindow` habla en claves de ENTRADA; esta función habla en
        // `<tipo>:<uuid>` de cara a sus tres consumidores. Se traduce aquí y se
        // destraduce abajo; el prefijo mide exactamente dos caracteres.
        key: `i:${wu.key}`,
        // La raíz no es un bloque: sus miembros directos son el «Nexo», y para
        // el orden eso significa "sin bloque" — igual que `groupSagaId: null`
        // en el mapa. Sin esto, insertar delante de un miembro directo contaría
        // como partir un bloque que no existe.
        blockId: wu.sagaId === rootId ? null : wu.sagaId,
      });
    }
    return placeByWindow(units, windows, esLibre).map((u) => u.key.slice(2));
  };
```

- [ ] **Step 4: Arregla los otros llamantes de test y ejecuta**

`src/lib/sagas/derive-map.test.ts:332` llama a `createCuratedOrder` con tres argumentos y con `OrderMembership` sin `placement`. Añade `placement: "fijo"` a sus tres membresías y `{}` como cuarto argumento.

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/curated-order.test.ts src/lib/sagas/derive-map.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Añade el test de INVARIANTE**

Al final de `src/lib/sagas/curated-order.test.ts`:

```ts
describe("invariante: la columna del timeline no contradice al orden curado", () => {
  // Lo único que impide que la #245 se reabra en silencio. Si se filtra el orden
  // curado dejando solo las obras que tienen `orderNo`, tiene que salir
  // exactamente la columna del timeline. No se compara contra el orden de FILAS
  // del mapa: el mapa ordena bloques y el orden curado obras, y divergen a
  // propósito (spec §5).
  it("para una saga con un bloque libre con huecos, los dos órdenes coinciden", () => {
    const sagas: OrderSaga[] = [
      { id: "R", name: "R", parentSagaId: null, positionInParent: null, placementInParent: null },
      { id: "b1", name: "Uno", parentSagaId: "R", positionInParent: 1, placementInParent: "fijo" },
      { id: "b2", name: "Dos", parentSagaId: "R", positionInParent: 2, placementInParent: "fijo" },
      { id: "lib", name: "Libre", parentSagaId: "R", positionInParent: null, placementInParent: "libre" },
    ];
    const memberships: OrderMembership[] = [
      member("b1", "a1", 1),
      member("b2", "c1", 1),
      member("b2", "c2", 2),
      member("lib", "l1", 1),
    ];
    const windows = { "s:lib": { afterKey: "s:b1", beforeKey: "i:book:c2" } };

    const curado = createCuratedOrder(sagas, memberships, (k) => k, windows);
    expect(curado("R")).toEqual(["book:a1", "book:l1", "book:c1", "book:c2"]);
  });
});
```

Ejecuta:

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/curated-order.test.ts
```

Esperado: PASS. El valor esperado se corresponde con la columna que produce `deriveSagaMap` para esa misma forma: `a1(0) · l1(1) · c1(2) · c2(3)`, porque `orderBlocksForLayout` coloca el bloque libre delante del bloque de su ancla `antes de`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/curated-order.ts src/lib/sagas/curated-order.test.ts src/lib/sagas/derive-map.test.ts
git commit -m "feat(sagas): el orden curado recoloca los sujetos libres por su ventana"
```

---

### Task 6: Los dos consumidores de servidor pasan las ventanas

**Files:**
- Modify: `src/lib/sagas/get-saga-detail.ts` (el `keyOf` local de `resolveWindows`, y `orderMemberships` en la línea 641)
- Modify: `src/lib/sagas/route-actions.ts:359`
- Modify: `src/components/saga/route-view.tsx:86`

**Interfaces:**
- Consumes: `entryKeyOf` de `./place-by-window` (Task 1); la firma de cuatro parámetros de `createCuratedOrder` (Task 5).
- Produces: `SagaDetail.orderMemberships` con `placement`. `SagaDetail.windows` ya existía y no cambia de forma.

- [ ] **Step 1: `resolveWindows` usa la clave compartida**

En `src/lib/sagas/get-saga-detail.ts`, añade el import:

```ts
import { entryKeyOf } from "./place-by-window";
```

y borra el `keyOf` local que hay dentro de `resolveWindows` (la constante que empieza en la línea 189), sustituyendo sus usos por `entryKeyOf`. Son cuatro: el de `resolveTitle`, el de `subjectKey`, y los dos de `afterKey`/`beforeKey`. Añade sobre la función este comentario:

```ts
  // La clave la construye `entryKeyOf` (place-by-window.ts), compartida con el
  // orden: las dos resoluciones tienen que producir la MISMA clave o el orden y
  // la ficha estarían hablando de sujetos distintos sin que nada lo delate.
```

- [ ] **Step 2: `orderMemberships` lleva el placement**

En `src/lib/sagas/get-saga-detail.ts`, sustituye:

```ts
  const orderMemberships: OrderMembership[] = rows.map((r) => ({
    sagaId: r.saga_id,
    itemType: r.item_type,
    itemId: r.item_id,
    position: r.position,
  }));
```

por:

```ts
  const orderMemberships: OrderMembership[] = rows.map((r) => ({
    sagaId: r.saga_id,
    itemType: r.item_type,
    itemId: r.item_id,
    position: r.position,
    // Lo consume la guarda «solo lo `libre` tiene ventana» de createCuratedOrder.
    placement: r.placement,
  }));
```

- [ ] **Step 3: Los dos llamantes pasan `detail.windows`**

En `src/lib/sagas/route-actions.ts`, sustituye la línea 359 por:

```ts
  const mainOrder = createCuratedOrder(
    detail.orderSagas,
    detail.orderMemberships,
    (k) => titleByKey.get(k) ?? "",
    // Las ventanas curadas colocan a los sujetos `libre` en el itinerario
    // generado, en vez de mandarlos todos al final.
    detail.windows,
  );
```

En `src/components/saga/route-view.tsx`, sustituye la llamada de la línea 86 por:

```ts
  const mainOrder = createCuratedOrder(
    detail.orderSagas,
    detail.orderMemberships,
    (k) => members.get(k)?.title ?? "",
    detail.windows,
  );
```

- [ ] **Step 4: Typecheck y suite completa de sagas**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx tsc --noEmit && npx vitest run src/lib/sagas
```

Esperado: sin errores de tipos y todos los tests de `src/lib/sagas` en verde. Si `get-saga-detail.test.ts` falla por `placement` faltante en algún fixture, añádelo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sagas/get-saga-detail.ts src/lib/sagas/route-actions.ts src/components/saga/route-view.tsx src/lib/sagas/get-saga-detail.test.ts
git commit -m "feat(sagas): el itinerario generado y la expansión de bloque respetan las ventanas"
```

---

### Task 7: Mi Biblioteca — el «siguiente» respeta la ventana

**Files:**
- Modify: `src/lib/sagas/build-library-saga-cards.ts` (tipo `LibMembership`, firma de `buildLibrarySagaCards`, llamada a `createCuratedOrder` en la línea 135)
- Modify: `src/lib/sagas/get-followed-sagas.ts` (select de `saga_items`, query nueva de ventanas, llamada final)
- Test: `src/lib/sagas/build-library-saga-cards.test.ts`

**Interfaces:**
- Consumes: `orderWindowsFromRows`, `OrderWindow`, `RawOrderWindowRow` de `./place-by-window` (Task 1); la firma de cuatro parámetros de `createCuratedOrder` (Task 5).
- Produces: `buildLibrarySagaCards(..., routeChoices?, windows?)` — noveno parámetro, `Record<string, OrderWindow>`, con `{}` por defecto.

- [ ] **Step 1: Escribe el test**

En `src/lib/sagas/build-library-saga-cards.test.ts`, añade `placement: "fijo"` allí donde el fichero construya `LibMembership` (si tiene un helper, basta con tocarlo una vez) y añade al final:

```ts
describe("el «siguiente» respeta la ventana curada", () => {
  it("propone la obra libre antes del bloque que su ventana no deja partir", () => {
    const sagas: LibSaga[] = [
      { id: "R", parentSagaId: null, name: "R", accentColor: null, optionalInParent: false, positionInParent: null, placementInParent: null, showMap: false },
      { id: "b1", parentSagaId: "R", name: "Uno", accentColor: null, optionalInParent: false, positionInParent: 1, placementInParent: "fijo", showMap: false },
      { id: "b2", parentSagaId: "R", name: "Dos", accentColor: null, optionalInParent: false, positionInParent: 2, placementInParent: "fijo", showMap: false },
      { id: "lib", parentSagaId: "R", name: "Libre", accentColor: null, optionalInParent: false, positionInParent: null, placementInParent: "libre", showMap: false },
    ];
    const memberships: LibMembership[] = [
      { sagaId: "b1", itemType: "book", itemId: "a1", position: 1, optional: false, placement: "fijo" },
      { sagaId: "b2", itemType: "book", itemId: "c1", position: 1, optional: false, placement: "fijo" },
      { sagaId: "b2", itemType: "book", itemId: "c2", position: 2, optional: false, placement: "fijo" },
      { sagaId: "lib", itemType: "book", itemId: "l1", position: null, optional: false, placement: "libre" },
    ];
    const items: LibItemMeta[] = ["a1", "c1", "c2", "l1"].map((id) => ({
      itemType: "book" as const,
      itemId: id,
      title: id,
      coverUrl: null,
      year: null,
    }));
    // `a1` ya leída: el «siguiente» es la primera pendiente del orden.
    const entries: LibEntry[] = [
      { itemType: "book", itemId: "a1", status: "completed", everCompleted: true, updatedAt: "2026-07-01T00:00:00Z" },
    ];

    const sinVentana = buildLibrarySagaCards(["R"], sagas, memberships, items, entries, [], [], [], {});
    expect(sinVentana[0].next).toMatchObject({ kind: "next", itemId: "c1" });

    const conVentana = buildLibrarySagaCards(["R"], sagas, memberships, items, entries, [], [], [], {
      "i:book:l1": { afterKey: "s:b1", beforeKey: "i:book:c2" },
    });
    expect(conVentana[0].next).toMatchObject({ kind: "next", itemId: "l1" });
  });
});
```

- [ ] **Step 2: Ejecuta para verlo fallar**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run src/lib/sagas/build-library-saga-cards.test.ts
```

Esperado: FAIL — `buildLibrarySagaCards` no acepta nueve argumentos.

- [ ] **Step 3: Cambia `build-library-saga-cards.ts`**

3a. Import:

```ts
import type { OrderWindow } from "./place-by-window";
```

3b. `LibMembership` gana `placement`:

```ts
export type LibMembership = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  position: number | null;
  /** true = NO cuenta en el denominador del progreso. */
  optional: boolean;
  /** Colocación de la obra en ESA saga. La consume la guarda «solo lo `libre`
   *  tiene ventana» de `createCuratedOrder`. */
  placement: SagaPlacement | null;
};
```

3c. Firma:

```ts
  routeChoices: LibRouteChoice[] = [],
  // Ventanas del subárbol seguido, por clave de sujeto. Con `{}` el orden es
  // exactamente el de antes de esta fase.
  windows: Record<string, OrderWindow> = {},
): LibrarySagaCard[] {
```

3d. La llamada de la línea 135:

```ts
  const mainOrder = createCuratedOrder(sagas, memberships, titleOf, windows);
```

- [ ] **Step 4: Cambia `get-followed-sagas.ts`**

4a. Import:

```ts
import { orderWindowsFromRows, type RawOrderWindowRow } from "./place-by-window";
```

4b. El select de `saga_items` pasa a pedir `placement`, y el mapeo lo arrastra:

```ts
  const { data: membershipsData } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id, position, optional, placement")
    .in("saga_id", allIds)
    .order("saga_id");
  const memberships: LibMembership[] = (membershipsData ?? []).map((m) => ({
    sagaId: m.saga_id,
    itemType: m.item_type as ItemType,
    itemId: m.item_id,
    position: m.position,
    optional: m.optional,
    placement: m.placement,
  }));
```

4c. Justo antes del `return buildLibrarySagaCards(...)`, añade:

```ts
  // Ventanas del subárbol seguido, para que el ORDEN principal de estas cards
  // sea el mismo que el de la ficha y el del itinerario generado — si no, la
  // card diría «siguiente: X» mientras el itinerario generado dice «Y» sobre la
  // misma saga (familia #91/#203). Sin títulos: el orden no pinta las anclas,
  // solo las coloca, y un ancla que no esté en la secuencia la ignora
  // `placeByWindow`.
  const { data: windowRows } = await supabase
    .from("saga_placement_windows")
    .select(
      "item_type, item_id, child_saga_id, after_item_type, after_item_id, after_child_saga_id, before_item_type, before_item_id, before_child_saga_id, created_at",
    )
    .in("saga_id", allIds);
  const windows = orderWindowsFromRows((windowRows ?? []) as RawOrderWindowRow[]);
```

4d. La llamada final pasa a:

```ts
  return buildLibrarySagaCards(
    followedIds,
    sagas,
    memberships,
    items,
    entries,
    ratings,
    creators,
    routeChoices,
    windows,
  );
```

- [ ] **Step 5: Ejecuta tests y typecheck**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx tsc --noEmit && npx vitest run src/lib/sagas
```

Esperado: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sagas/build-library-saga-cards.ts src/lib/sagas/build-library-saga-cards.test.ts src/lib/sagas/get-followed-sagas.ts
git commit -m "feat(sagas): el «siguiente» de Mi Biblioteca respeta la ventana curada"
```

---

### Task 8: Verificación end-to-end, documentación e issues

**Files:**
- Modify: `docs/requirements/decisiones.md` (append)
- Modify: `docs/requirements/backlog.md` (una entrada nueva tras la línea 67)
- Modify: `docs/architecture/graph.json`
- Posible: `e2e/sagas-mapa-derivado.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación canónica al día e issues abiertas para lo que queda vivo.

- [ ] **Step 1: Suite completa de unidad**

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx vitest run
```

Esperado: todo verde. Cualquier fallo fuera de `src/lib/sagas` es un efecto colateral inesperado: investígalo, no lo silencies.

- [ ] **Step 2: e2e**

Comprueba que `.env.local` está en el worktree antes de fiarte de nada (sin él los specs con login se auto-saltan y la suite sale **verde sin probar nada**):

```bash
ls -la .env.local
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npx playwright test e2e/sagas-mapa-derivado.spec.ts e2e/sagas-ventanas.spec.ts e2e/sagas-itinerarios.spec.ts
```

Esperado: PASS, y **cero** tests «skipped». Si `sagas-mapa-derivado.spec.ts` falla en «el generador crea un itinerario recorrible a partir de la curación», compara el orden nuevo con el que el spec esperaba y actualízalo — la saga de ese universo QA no tiene ventanas curadas, así que un cambio ahí significa que algo se movió que no debía.

- [ ] **Step 3: Verificación visual del mapa del Cosmere**

Esta fase mueve UNA fila del mapa 2D en producción (*Novelas secretas* pasa de detrás a delante de *El Archivo*), y la geometría de columnas la calcula `alignRowsToLongEdges` a partir del orden de filas — un cambio de fila puede mover columnas. Levanta el servidor y **pide al responsable que lo mire**; no des la tarea por cerrada con una captura propia si no puedes autenticarte:

```bash
export PATH="/c/Users/borja/AppData/Roaming/fnm/node-versions/v22.23.1/installation:$PATH"
npm run dev
```

Rutas a mirar: `/saga/ba761e54-ab39-49cd-865c-97bf6ef74d47` (Cosmere) — pestaña de mapa (2D y timeline móvil) y pestaña Info. Lo que hay que ver: la columna del timeline numera *Era 2* como 5-8; la ficha sigue teniendo *El Aliento*, *Era 2* y *Novelas secretas* en «Cuando quieras»; y el mapa 2D no ha empeorado.

- [ ] **Step 4: `decisiones.md`**

Añade AL FINAL del fichero (es append-only; no reescribas filas anteriores) esta fila de la tabla:

```
| 2026-07-28 | El ancla «antes de» manda sobre «a partir de» al colocar un sujeto `libre`, en las tres reglas de orden del proyecto | Una ventana curada no influía en ningún orden de lectura: lo `libre` iba siempre al final. Se decidió que el sujeto se coloque lo más TARDE que la ventana permita (`before` manda), y que retroceda al principio del bloque que partiría siempre que el «a partir de» lo permita — así una recomendación como «El Aliento de los Dioses, a partir de Era 1 y antes de Juramentada» entra antes de que empiece El Archivo en vez de cortarlo. Cuando la ventana vive ENTERA dentro de un bloque (El Hombre Iluminado, Esquirla del Amanecer) sí se corta: incumplir la ventana es peor que cortar. La regla vive una sola vez (`place-by-window.ts`) y la aplican el orden curado, `orderBlocksForLayout` y la colocación de la fila de ventana de `deriveTimeline`. Dos consecuencias asumidas: el mapa 2D ordena BLOQUES y el orden curado ordena OBRAS, así que ante una obra con ventana dentro de un bloque libre el mapa arrastra el bloque entero y el orden curado saca solo la obra (no es un bug, son dos preguntas distintas); y un sujeto BLOQUE nunca parte otro bloque, así que si su ventana viviera entera dentro de otro bloque incumpliría su «a partir de». Spec: `docs/superpowers/specs/2026-07-28-sagas-orden-curado-por-ventana-design.md` |
```

- [ ] **Step 5: `backlog.md`**

Inserta esta entrada INMEDIATAMENTE DESPUÉS de la línea 67 (la entrada `- [x] **Sagas, timeline con los cuatro estados: fase 6 de 6 ...`):

```
- [x] **Sagas: las ventanas mandan en el orden propuesto** (2026-07-28). **Sin migraciones.** Hasta aquí una ventana curada (`a partir de X, antes de Y`) se pintaba —frase en la ficha, arista en el mapa— pero no movía ningún orden de lectura: lo `libre` iba siempre al final, así que en el Cosmere *El Aliento de los Dioses* salía el número 15 del itinerario generado, mucho después de su propio «antes de Juramentada». Ahora manda el ancla «antes de» (el sujeto se coloca lo más tarde que la ventana permite) y el sujeto retrocede al principio del bloque que partiría siempre que el «a partir de» lo permita; cuando la ventana vive entera dentro de un bloque, corta. La regla vive UNA vez, en `src/lib/sagas/place-by-window.ts`, y la aplican el orden curado (`createCuratedOrder`, que alimenta el itinerario generado, la expansión de bloque en `route-view` y el «siguiente» de Mi Biblioteca — esta última con una consulta bulk nueva a `saga_placement_windows`), el orden de filas del mapa (`orderBlocksForLayout`) y la colocación de la fila de ventana del timeline. `orderNo` pasa a numerar los bloques en el orden en que el mapa los pinta, lo que cierra el caso real de la **#245**. La ficha NO cambia: lo `libre` sigue viviendo en «Cuando quieras». Spec: `docs/superpowers/specs/2026-07-28-sagas-orden-curado-por-ventana-design.md`
```

- [ ] **Step 6: `graph.json`**

En el nodo `m-sagas`:

1. Añade a `files`: `"src/lib/sagas/place-by-window.ts"` y `"src/lib/sagas/curated-order.ts"`.
2. Añade a `gotchas`:

```
"La regla de «donde va un sujeto libre con ventana» vive SOLO en place-by-window.ts y manda el ancla `antes de`. La aplican tres sitios: createCuratedOrder (orden curado), orderBlocksForLayout (orden de filas del mapa) y deriveTimeline (fila de ventana). El mapa ordena BLOQUES y el orden curado ordena OBRAS, asi que ante una obra con ventana dentro de un bloque libre el mapa arrastra el bloque entero y el orden curado saca solo la obra: divergen a proposito.",
"createCuratedOrder habla en claves `<tipo>:<uuid>` (sin prefijo) y las ventanas en `i:<tipo>:<uuid>`. El post-pase traduce en los dos sentidos; mezclarlos da un orden que no mueve nada y no falla."
```

3. En el flujo de la saga (el que hoy nombra `deriveSagaMap` y `deriveTimeline`), añade un paso:

```
{ "node": "m-sagas", "action": "placeByWindow recoloca los sujetos `libre` con ventana dentro del orden ya construido: manda el ancla `antes de` y retrocede al principio del bloque que partiria si el `a partir de` lo permite", "file": "src/lib/sagas/place-by-window.ts" }
```

Valida que el JSON sigue siendo válido:

```bash
node -e "JSON.parse(require('fs').readFileSync('docs/architecture/graph.json','utf8')); console.log('ok')"
```

- [ ] **Step 7: Abre las issues de lo que queda vivo**

Dos, con `gh issue create`. Escríbelas para quien las lea dentro de seis meses sin este contexto: qué falla, qué se esperaba, cómo reproducirlo, y qué SÍ funciona.

1. **«El mapa arrastra el bloque entero donde el orden curado saca solo la obra»** — el límite del spec §5. Reproducible hoy en el Cosmere: el mapa 2D pega *Novelas secretas* a *El Archivo* porque *El Hombre Iluminado* tiene ventana, mientras el itinerario generado saca solo a *El Hombre Iluminado* y deja a *Islas*, *Trenza* y *Yumi* al final. Ninguna de las dos está mal; la issue es para decidir algún día si conviene unificarlo. Menciona que el invariante que sí se prueba es «columna del timeline ↔ orden curado» (`curated-order.test.ts`), no «mapa ↔ orden curado».

2. **«Un sujeto BLOQUE con la ventana entera dentro de otro bloque incumple su `a partir de`»** — consecuencia del §5: un bloque solo aterriza en límites entre bloques, así que retrocede al principio del bloque que partiría aunque eso lo deje por delante de su ancla `a partir de`. Cero casos en producción hoy. Está cubierto por el test `"un sujeto BLOQUE retrocede aunque eso incumpla el `a partir de`"` de `place-by-window.test.ts`, así que si algún día se cambia el criterio, ese test es el que hay que tocar.

- [ ] **Step 8: Commit**

```bash
git add docs/ e2e/
git commit -m "docs(sagas): registra el orden curado por ventana en backlog, decisiones y grafo"
```

---

## Self-review del plan

**Cobertura del spec:**

| sección del spec | tarea |
|---|---|
| §2 la regla | Task 1 |
| §3.1 `place-by-window.ts` | Task 1 |
| §3.2 flip de `orderBlocksForLayout` | Task 2 |
| §3.3 `orderNo` window-aware | Task 3 |
| §3.4 flip de `deriveTimeline` | Task 4 |
| §3.5 `createCuratedOrder` + los tres consumidores | Tasks 5, 6, 7 |
| §4 casos límite | Task 1, tests 5-12 |
| §5 límite asumido | Task 1 (test del sujeto BLOQUE) + Task 8 (issues) |
| §6 efecto en producción | Task 1 (test del Cosmere) + Task 8 (verificación visual) |
| §7 pruebas | Tasks 1-7 + el invariante en Task 5 |
| §8 riesgos | Task 8 pasos 2-3 |

**Consistencia de tipos:** `OrderWindow` / `OrderUnit` / `RawOrderWindowRow` se definen en Task 1 y se consumen con esos mismos nombres en Tasks 5, 6 y 7. `placement` se añade a `OrderMembership` (Task 5) y a `LibMembership` (Task 7); `LibMembership` sigue siendo estructuralmente asignable a `OrderMembership`, que es lo que permite que `buildLibrarySagaCards` le pase sus membresías a `createCuratedOrder` sin convertir nada.
