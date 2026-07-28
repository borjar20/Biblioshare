# Sagas · timeline con los cuatro estados · fase 6 — los estados en el grafo 2D

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos usan
> casillas (`- [ ]`) para llevar la cuenta.

**Objetivo:** que el grafo 2D diga los mismos cuatro estados que ya dice el timeline —tándem,
ventana recomendada, opcional y rol—, sin tocar el motor de derivación del mapa ni el progreso.

**Arquitectura:** `SagaGraph` **no cambia**: los tres consumidores (vista 2D, timeline móvil,
mini-preview del CTA) siguen recibiendo exactamente el mismo tipo. Los adornos nuevos —la cápsula
del tándem y el marco de la ventana— son DIBUJO, y se derivan de las coordenadas que el grafo ya
trae, en un módulo puro nuevo (`map-overlays.ts`) que **solo llama la vista 2D**. Lo que es estado
del nodo (rol, opcional, saltado) se pinta en el propio nodo, con el vocabulario i18n que ya
escribieron las fases 2, 3 y 5.

**Stack:** Next.js 16 (App Router, RSC), `@xyflow/react`, Tailwind, next-intl, Vitest, Playwright.

**Base:** `main` a `658eba5`, con la fase 5 desplegada y sus dos migraciones aplicadas en prod.

---

## Global Constraints

Copiadas literalmente de la spec (`docs/superpowers/specs/2026-07-28-sagas-timeline-estados-design.md`)
y de las restricciones vigentes del proyecto. **Aplican a todas las tareas.**

- **`src/lib/sagas/progress.ts` no se toca.** Ni `companero` deja de computar, ni el `saltado` mueve
  el denominador, ni existe «progreso con o sin opcionales». Reabrir el denominador es la familia de
  fallo del #91, el #185 y la fase 1. El mockup pide lo contrario en dos sitios y **se descarta a
  sabiendas**.
- **`SagaGraph` (`src/lib/sagas/map-types.ts`) no gana campos en esta fase.** Todo lo que la fase
  necesita ya viaja en el nodo (`tandem`, `windowReason`, `optional`, `skipped`, `role`, `orderNo`)
  o se deduce de las aristas. Si al construir hiciera falta un campo nuevo, **se para y se dice en
  voz alta**: el tipo lo comparten tres consumidores.
- **`deriveSagaMap` no cambia de firma ni de salida.** Esta fase consume el grafo, no lo produce.
- **Ninguna migración.** La fase 6 no toca la base de datos (spec, tabla de fases).
- **Sin sesión hay que ver el grafo entero.** La ficha es pública: la cápsula, el marco y las
  etiquetas de rol no dependen de que haya usuario. Solo el estado de lectura (✓, ◉) lo hace, y eso
  ya funciona así.
- **Un `next dev`, en el puerto 3000.** `npm run test:e2e` reutiliza el que haya.
- Vocabulario de roles: una sola lista, `src/lib/sagas/roles.ts` (fase 5). No se escribe una segunda.

---

## Lo que hay hoy, medido

**Medido leyendo el código en `658eba5` y ejecutando `deriveSagaMap` sobre la forma real de los dos
mapas de producción** (los datos de forma salen de `SELECT` de solo lectura contra prod el
2026-07-28; las coordenadas, de correr la derivación con esa forma).

| Estado | ¿Viaja en el nodo? | ¿Se dibuja hoy en el grafo 2D? |
|---|---|---|
| Tándem | sí — `tandem: {mode, note}`, y el empate de `orderNo` | **no**. Los dos miembros se apilan en la misma columna y nada dice que compartan hueco |
| Ventana | sí — `windowReason` en el sujeto, y las dos aristas | a medias: las **aristas** sí (`requisito` punteada, `opcional` a rayas), el sujeto no se distingue |
| Opcional | sí — `optional`, `skipped` | a medias: `optional` ya se traduce en `level: "menor"` (medallón en vez de portada). `skipped` **no se dibuja en absoluto** |
| Rol | sí — `role` | **no**. El grafo es el único sitio del producto donde un rol curado no se ve |

Y dos hechos de producción que gobiernan el diseño:

| | |
|---|---|
| tándems en toda la producción | **1**: Trono de Cristal, hueco 5, con metadatos ya curados (`modo = simultaneo`, `nota = null`) |
| ventanas | **5**: 4 con sujeto obra, **1 con sujeto BLOQUE** (Nacidos de la Bruma. Era 2, bajo Cosmere) |
| obras con rol en sagas con mapa | 2 de las 8 (`La Espada de la Asesina` → precuela; `Esquirla del Amanecer` → relato) |
| sagas con `show_map` | 4 (Cosmere, Maasverse, Mundodisco, Trono de Cristal) |

---

## Decisiones, con su porqué

### D1 · El adorno se deriva aparte, no se mete en `SagaGraph`

Meter nodos sintéticos de cápsula en `graph.nodes` los colaría en `countRoles`, en el `optionalCount`
de la pestaña y en `deriveTimeline`, que iteran el mismo array. La cápsula y el marco son dibujo del
lienzo 2D y de nadie más: viven en `src/lib/sagas/map-overlays.ts`, puro y testeable, y solo lo llama
`saga-graph-view.tsx`. Es la misma línea que separó `windowTrack` de `deriveTimeline`.

### D2 · La cápsula agrupa por empate de `orderNo`, no por la fila de `saga_tandems`

`node.tandem` es `null` cuando el curador **no declaró** metadatos, aunque el hueco esté compartido de
verdad — `deriveSagaMap` solo lo rellena si hay fila en `saga_tandems`. La pertenencia al tándem tiene
una sola fuente de verdad, el empate de `position`, que llega al nodo como `orderNo`. Agrupar por la
tabla de metadatos dejaría sin cápsula a un tándem real sin curar, que es justo el caso en el que más
falta hace explicarlo. Es además la regla que ya usa `deriveTimeline` para fundir su fila `tandem`:
dos reglas distintas para «qué es un tándem» acabarían discrepando (#91/#185/#203).

Los metadatos (`mode`, `note`) se leen del **primer miembro**, igual que hace la fila del timeline
(están denormalizados en los N nodos del hueco).

### D3 · La ventana **no** se dibuja como zona entre las dos anclas — [MEDIDO]

Es la única desviación de forma respecto al frame D, y no es una preferencia: la caja envolvente de
{ancla-después, sujeto, ancla-antes} no cabe en el layout real.

**Por qué, estructuralmente:** el sujeto de una ventana es por definición una obra `libre`
(`position = null`), y `deriveSagaMap` la coloca en la **fila propia de sueltas de su bloque**, debajo
de toda la cadena; sus anclas son obras con hueco, en las filas de cadena, casi siempre de un bloque
anterior. La caja va por tanto **siempre** desde la fila del ancla hasta la fila de sueltas, cruzando
entera cualquier fila que quede en medio.

**Medido**, corriendo `deriveSagaMap` con la forma real de los dos mapas:

| Ventana | Caja envolvente | % del lienzo | Nodos AJENOS dentro |
|---|---|---|---|
| Trono de Cristal · *La Espada de la Asesina* | 438×556 | **45 %** | 1 de 8 |
| Cosmere · *Esquirla del Amanecer* | 438×336 | 11 % | 2 de 20 |
| Cosmere · *El Aliento de los Dioses* | 438×556 | 18 % | 3 de 20 |
| Cosmere · *El Hombre Iluminado* | 798×996 | **60 %** | **12 de 20** |

El mapa más pequeño de producción (8 nodos) ya pinta una zona que ocupa media pantalla y encierra una
obra que no tiene nada que ver con la ventana; el caso peor encierra 12 de 20. Una zona que dice
«esto de aquí dentro es la ventana» y mete dentro doce obras que no lo son **miente**, y miente en la
dirección más cara: el lector deduce una regla de lectura que nadie ha curado. La tidiez del frame D
(340×170) es un artefacto de tener los nodos colocados a mano.

**Lo que se hace en su lugar:** el sujeto lleva su propio **marco rayado** —el mismo tratamiento
visual del mockup: trazo discontinuo y trama diagonal— con la etiqueta `◇ Ventana · después de X ·
antes de Y`. El tramo lo siguen contando las **dos aristas**, que ya existen, ya tienen patrones de
trazo distintos y ya están en la leyenda. Se conserva el vocabulario visual del mockup y se pierde
solo la afirmación que no se sostiene.

Queda dicho para quien lo lea luego: si algún día el layout coloca al sujeto **junto** a sus anclas,
la zona vuelve a ser dibujable y esta decisión hay que releerla.

### D4 · Solo lleva marco el sujeto que es una obra `libre`

`deriveSagaMap` resuelve un sujeto-BLOQUE a la **primera obra del bloque**, que es una fila normal de
la cadena; por eso ya se niega a colgarle el `windowReason` («colgarle ahí el motivo pintaría una
ventana donde no la hay», límite abierto en la issue **#221**). El marco sigue exactamente el mismo
criterio: se pinta solo si el nodo sujeto tiene `orderNo === null`. En producción eso deja fuera una
de las cinco ventanas —la de Nacidos de la Bruma. Era 2— y es el comportamiento correcto hasta que la
#221 se resuelva.

### D5 · Lo opcional **no** gana trazo punteado: ya está dicho, y el punteado significa otra cosa

El frame D pide «trazo punteado y nodo atenuado» para lo opcional. En el grafo de hoy el borde
discontinuo y la atenuación **ya significan «no empezado»** (`status === null`, en `CoverNode` y
`MedallionNode`), y eso se ve en todos los mapas, no en los pocos nodos opcionales. Reutilizar el
mismo trazo para «opcional» dejaría dos estados distintos con el mismo dibujo, y el más común
—pendiente— ganaría la lectura.

Lo opcional ya tiene su propia traducción en el grafo, y es anterior a esta fase: `level: "menor"`,
o sea medallón de 58 px en vez de portada de 78×116. Lo que falta es **decirlo con palabras**, y eso
lo hace la etiqueta de D6. Mismo criterio con que la fase 5 descartó la paleta de colores por rol:
el color ya significa subsaga.

### D6 · Una sola etiqueta bajo el nodo, que acumula rol + opcional + saltado

El frame D pinta `Precuela · opcional` y `Spin-off · saltado` como una tira bajo el nodo. Se hace tal
cual, con una sola etiqueta que concatena lo que sea cierto, en ese orden. Ventajas: un nodo con rol y
opcional no acumula dos adornos, y un nodo sin nada que decir no pinta nada — que es el caso de 361
de las 367 filas.

Copia: **ni una cadena nueva**. `roleShort.*`, `timelineOptionalTag` y `timelineSkippedTag` ya existen
desde las fases 4 y 5, y son las mismas palabras que usa el timeline sobre la misma obra.

### D7 · El saltado se tacha; no desaparece

Coherente con la fila del timeline y con el límite duro: saltar es visual. En el grafo se tacha la
etiqueta y se atenúa el nodo. **No** se oculta: un nodo que desaparece deja sus aristas colgando y
rompe la cadena — es la familia del hallazgo de la issue **#238**.

### D8 · La lente de rol atenúa, no filtra

La fase 5 dejó el `?rol=` gobernando el timeline y **no** el grafo: con la lente puesta, las dos
mitades de la misma pestaña cuentan cosas distintas. Se cierra aquí, pero **atenuando** los nodos que
no son del rol, no quitándolos: quitar nodos de un grafo 2D deja aristas huérfanas y parte la cadena,
que es exactamente el fallo que la #238 documenta en el timeline. La lente cambia el énfasis, no la
estructura.

### D9 · Las medidas del nodo pasan a estar escritas una vez

La cápsula necesita saber cuánto mide un nodo para envolverlo. Hoy 78×116 y 58×58 están escritos como
clases Tailwind literales dentro de `graph-nodes.tsx`, y `derive-map.ts` los repite en comentarios
para justificar `NODE_STEP_X`/`NODE_STEP_Y`. Un tercer sitio que los repita en silencio es cómo se
desincronizan: la cápsula quedaría corta el día que la portada crezca. Van a `graph-metrics.ts`, y
`graph-nodes.tsx` los aplica como estilo en línea con los MISMOS números de hoy — cero cambio visual,
y el acoplamiento pasa a ser real en vez de comentado. Es lo que hizo la fase 5 con `roles.ts`.

---

## Estructura de ficheros

**Crear**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/sagas/graph-metrics.ts` | Las medidas del nodo en píxeles, en un solo sitio (D9) |
| `src/lib/sagas/map-overlays.ts` | Derivación PURA de cápsulas y marcos a partir del grafo (D1–D4) |
| `src/lib/sagas/map-overlays.test.ts` | Sus pruebas |
| `src/components/saga/graph/overlay-nodes.tsx` | Las dos piezas de dibujo: cápsula y marco |
| `src/components/saga/graph/node-tag.tsx` | La etiqueta bajo el nodo (D6) |
| `e2e/sagas-grafo-estados.spec.ts` | E2E de la fase |

**Modificar**

| Fichero | Qué |
|---|---|
| `src/components/saga/graph/graph-nodes.tsx` | Monta `NodeTag`; medidas desde `graph-metrics`; tachado del saltado; atenuado por lente |
| `src/components/saga/graph/saga-graph-view.tsx` | Registra los dos tipos de nodo nuevos, los inyecta detrás, acepta `activeRole` |
| `src/components/saga/graph/saga-graph-lazy.tsx` | Pasa `activeRole` |
| `src/components/saga/graph/graph-legend.tsx` | Dos entradas condicionales |
| `src/components/saga/saga-map-tab.tsx` | Pasa `activeRole` a los dos grafos |
| `messages/es.json` | 2 claves de leyenda + 1 de la cápsula sin declarar |
| `docs/requirements/backlog.md`, `docs/architecture/graph.json`, `docs/requirements/decisiones.md` | Sincronización final |

---

## Tarea 1 · Las medidas del nodo, en un solo sitio

**Ficheros**
- Crear: `src/lib/sagas/graph-metrics.ts`
- Modificar: `src/components/saga/graph/graph-nodes.tsx`

**Interfaces**
- Produce: `NODE_BOX: Record<"cover" | "medallion" | "saga", { w: number; h: number }>`,
  `nodeBoxOf(node: SagaGraphNode): { w: number; h: number }`.
- Consume: nada.

- [ ] **Paso 1: escribir el módulo**

`src/lib/sagas/graph-metrics.ts`:

```ts
import type { SagaGraphNode } from "./map-types";

// Medidas en PÍXELES de cada tipo de nodo del grafo 2D, escritas UNA vez.
// Las consume `graph-nodes.tsx` (que las dibuja) y `map-overlays.ts` (que
// envuelve nodos con una cápsula o un marco, y para eso necesita saber cuánto
// ocupan). Antes vivían como clases Tailwind literales dentro de
// `graph-nodes.tsx` y repetidas en los comentarios de `derive-map.ts`, que es
// como se desincronizan: una cápsula calculada con 78×116 se queda corta el día
// que la portada crezca, y nada avisa.
//
// NO incluyen la etiqueta que cuelga bajo el nodo: esa es ancha (150 px) y se
// solapa con las columnas vecinas a propósito. La cápsula envuelve la obra, no
// su rótulo, igual que en el mockup.
export const NODE_BOX = {
  cover: { w: 78, h: 116 },
  medallion: { w: 58, h: 58 },
  saga: { w: 120, h: 120 },
} as const;

/** Qué caja ocupa un nodo, con la MISMA regla con la que `saga-graph-view.tsx`
 *  elige su tipo de nodo: bloque → tarjeta, `menor` → medallón, resto →
 *  portada. Si esa regla cambia, cambia aquí y en un solo sitio más. */
export function nodeBoxOf(node: SagaGraphNode): { w: number; h: number } {
  if (node.kind === "saga") return NODE_BOX.saga;
  return node.level === "menor" ? NODE_BOX.medallion : NODE_BOX.cover;
}
```

- [ ] **Paso 2: aplicarlas en `graph-nodes.tsx`, sin cambiar ni un píxel**

En `CoverNode`, sustituir el envoltorio y la caja recortada:

```tsx
// antes: <div className="relative w-[78px]">
<div className="relative" style={{ width: NODE_BOX.cover.w }}>
// antes: className={`relative h-[116px] w-[78px] overflow-hidden ...`}
<div
  className={`relative overflow-hidden rounded-md border-2 shadow-lg ${dimmed(node)} ${node.status === null ? "border-dashed" : ""}`}
  style={{
    width: NODE_BOX.cover.w,
    height: NODE_BOX.cover.h,
    borderColor: node.status === "in_progress" ? "var(--accent)" : SAGA_ACCENT[node.accent].cssVar,
  }}
>
```

En `MedallionNode`, lo mismo con `NODE_BOX.medallion` en el envoltorio y en la caja
(`h-[58px] w-[58px]` → `style`). El `sizes="78px"` / `sizes="58px"` de `next/image` se queda como
está: es una pista para el navegador, no una medida de layout.

Añadir el import: `import { NODE_BOX } from "@/lib/sagas/graph-metrics";`

- [ ] **Paso 3: comprobar que no cambió nada**

```bash
npx tsc --noEmit
npx vitest run src/lib/sagas
```
Esperado: sin errores. No hay prueba unitaria posible de «se ve igual» (son clases contra estilos);
lo cubre el e2e de la Tarea 8, que mide la cápsula contra estos mismos números.

- [ ] **Paso 4: commit**

```bash
git add src/lib/sagas/graph-metrics.ts src/components/saga/graph/graph-nodes.tsx
git commit -m "refactor(sagas): las medidas del nodo del grafo, escritas una sola vez"
```

---

## Tarea 2 · Cápsulas del tándem, derivadas

**Ficheros**
- Crear: `src/lib/sagas/map-overlays.ts`, `src/lib/sagas/map-overlays.test.ts`

**Interfaces**
- Consume: `SagaGraph` (`map-types.ts`), `nodeBoxOf` (Tarea 1).
- Produce: `type TandemCapsule`, `deriveMapOverlays(graph): { tandems: TandemCapsule[]; windows: WindowFrame[] }`.
  La Tarea 3 rellena `windows`; en esta tarea la función ya devuelve la forma completa con
  `windows: []` para no rehacer el tipo después.

- [ ] **Paso 1: escribir la prueba que falla**

`src/lib/sagas/map-overlays.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveMapOverlays } from "./map-overlays";
import type { SagaGraph, SagaGraphNode } from "./map-types";

const node = (id: string, x: number, y: number, extra: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id,
  kind: "item",
  x,
  y,
  level: "principal",
  orderNo: 0,
  label: id,
  accent: "beige",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: null,
  groupName: null,
  step: null,
  tandem: null,
  windowReason: null,
  optional: false,
  skipped: false,
  ownerSagaId: "owner",
  ...extra,
});

const graph = (nodes: SagaGraphNode[], edges: SagaGraph["edges"] = []): SagaGraph => ({ nodes, edges });

describe("deriveMapOverlays · cápsulas de tándem", () => {
  it("envuelve las dos obras que comparten hueco, y solo esas", () => {
    const g = graph([
      node("a", 0, 0, { orderNo: 0 }),
      node("b", 180, 0, { orderNo: 1, tandem: { mode: "simultaneo", note: null } }),
      node("c", 180, 220, { orderNo: 1, tandem: { mode: "simultaneo", note: null } }),
      node("d", 360, 0, { orderNo: 2 }),
    ]);
    const { tandems } = deriveMapOverlays(g);
    expect(tandems).toHaveLength(1);
    expect(tandems[0].memberIds).toEqual(["b", "c"]);
    expect(tandems[0].mode).toBe("simultaneo");
  });

  it("la cápsula envuelve las cajas de sus miembros con margen", () => {
    const g = graph([
      node("b", 180, 0, { orderNo: 1 }),
      node("c", 180, 220, { orderNo: 1 }),
    ]);
    const [cap] = deriveMapOverlays(g).tandems;
    // portada 78×116: de (180,0) a (258,336), más 10 px de margen por lado.
    expect(cap.x).toBe(170);
    expect(cap.y).toBe(-10);
    expect(cap.width).toBe(98);
    expect(cap.height).toBe(356);
  });

  it("un hueco compartido SIN metadatos curados también lleva cápsula", () => {
    const g = graph([node("b", 0, 0, { orderNo: 1 }), node("c", 0, 220, { orderNo: 1 })]);
    const [cap] = deriveMapOverlays(g).tandems;
    expect(cap.mode).toBeNull();
    expect(cap.note).toBeNull();
  });

  it("no hay cápsula sin empate: dos nodos sin orden no son un tándem", () => {
    const g = graph([
      node("x", 0, 0, { orderNo: null }),
      node("y", 0, 220, { orderNo: null }),
    ]);
    expect(deriveMapOverlays(g).tandems).toEqual([]);
  });

  it("un nodo de tamaño distinto no descuadra la cápsula", () => {
    const g = graph([
      node("b", 0, 0, { orderNo: 1 }),
      node("c", 0, 220, { orderNo: 1, level: "menor", optional: true }),
    ]);
    const [cap] = deriveMapOverlays(g).tandems;
    // el medallón mide 58: el ancho manda la portada (78), el alto llega a 220+58.
    expect(cap.width).toBe(98);
    expect(cap.height).toBe(298);
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

```bash
npx vitest run src/lib/sagas/map-overlays.test.ts
```
Esperado: FAIL — `Failed to resolve import "./map-overlays"`.

- [ ] **Paso 3: escribir el módulo**

`src/lib/sagas/map-overlays.ts`:

```ts
import { nodeBoxOf } from "./graph-metrics";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { TandemMode, WindowReason } from "./types";

// Adornos del grafo 2D (fase 6, frame D): la cápsula que envuelve un tándem y
// el marco que señala el sujeto de una ventana. Se DERIVAN de las coordenadas
// que el grafo ya trae, en vez de añadir campos a `SagaGraph`: ese tipo lo
// comparten tres consumidores (vista 2D, timeline móvil, mini-preview del CTA)
// y esto es dibujo de UNO solo. Puro y sin React a propósito — la geometría se
// prueba sin montar nada.

/** Margen entre la caja del nodo y el adorno que lo envuelve. */
export const OVERLAY_PAD = 10;

export type TandemCapsule = {
  /** Estable entre renders: el hueco no cambia de id aunque cambien los nodos. */
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: TandemMode | null;
  note: string | null;
  memberIds: string[];
};

export type WindowFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: WindowReason | null;
  /** Título del ancla, ya resuelto a través del nodo. `null` = ese lado está
   *  abierto («a partir de…»), que es un caso real: una de las ventanas de
   *  producción no tiene `antes de`. */
  afterLabel: string | null;
  beforeLabel: string | null;
};

/** Caja que envuelve un conjunto de nodos, con margen. */
function envolver(nodes: SagaGraphNode[]): { x: number; y: number; width: number; height: number } {
  const x0 = Math.min(...nodes.map((n) => n.x));
  const y0 = Math.min(...nodes.map((n) => n.y));
  const x1 = Math.max(...nodes.map((n) => n.x + nodeBoxOf(n).w));
  const y1 = Math.max(...nodes.map((n) => n.y + nodeBoxOf(n).h));
  return {
    x: x0 - OVERLAY_PAD,
    y: y0 - OVERLAY_PAD,
    width: x1 - x0 + OVERLAY_PAD * 2,
    height: y1 - y0 + OVERLAY_PAD * 2,
  };
}

export function deriveMapOverlays(graph: SagaGraph): { tandems: TandemCapsule[]; windows: WindowFrame[] } {
  // Un tándem es el EMPATE DE HUECO, no la fila de metadatos: `node.tandem` es
  // null cuando el curador no declaró nada, y un tándem sin curar sigue siendo
  // un tándem — de hecho es en el que más falta hace explicarlo. `orderNo` es
  // el hueco (deriveSagaMap da uno por hueco, global y creciente), así que el
  // empate de orderNo ES la pertenencia. Misma regla que usa `deriveTimeline`
  // para fundir su fila `tandem`: dos reglas distintas para «qué es un tándem»
  // acabarían discrepando (#91/#185/#203).
  const porHueco = new Map<number, SagaGraphNode[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "item" || n.orderNo === null) continue;
    const lista = porHueco.get(n.orderNo);
    if (lista) lista.push(n);
    else porHueco.set(n.orderNo, [n]);
  }

  const tandems: TandemCapsule[] = [];
  for (const [orderNo, miembros] of [...porHueco.entries()].sort((a, b) => a[0] - b[0])) {
    if (miembros.length < 2) continue;
    tandems.push({
      id: `tandem:${orderNo}`,
      ...envolver(miembros),
      // Denormalizados en los N nodos del hueco por deriveSagaMap: basta el
      // primero, igual que hace la fila del timeline.
      mode: miembros[0].tandem?.mode ?? null,
      note: miembros[0].tandem?.note ?? null,
      memberIds: miembros.map((n) => n.id),
    });
  }

  return { tandems, windows: [] };
}
```

- [ ] **Paso 4: correr y ver que pasa**

```bash
npx vitest run src/lib/sagas/map-overlays.test.ts
```
Esperado: PASS, 5 pruebas.

- [ ] **Paso 5: commit**

```bash
git add src/lib/sagas/map-overlays.ts src/lib/sagas/map-overlays.test.ts
git commit -m "feat(sagas): deriva la capsula del tandem para el grafo 2D"
```

---

## Tarea 3 · Marcos de ventana, derivados

**Ficheros**
- Modificar: `src/lib/sagas/map-overlays.ts`, `src/lib/sagas/map-overlays.test.ts`

**Interfaces**
- Consume: lo de la Tarea 2.
- Produce: `windows: WindowFrame[]` ya poblado.

- [ ] **Paso 1: escribir las pruebas que fallan**

Añadir a `map-overlays.test.ts`:

```ts
describe("deriveMapOverlays · marcos de ventana", () => {
  const conVentana = (extraNodes: SagaGraphNode[] = []) =>
    graph(
      [
        node("ancla-a", 0, 0, { orderNo: 0, label: "Corona de Medianoche" }),
        node("ancla-b", 180, 0, { orderNo: 1, label: "Heredera de Fuego" }),
        node("sujeto", 0, 440, { orderNo: null, label: "La Espada de la Asesina", windowReason: "contexto" }),
        ...extraNodes,
      ],
      [
        { id: "w1", source: "ancla-a", target: "sujeto", type: "requisito", accent: "beige" },
        { id: "w2", source: "sujeto", target: "ancla-b", type: "opcional", accent: "ambar" },
      ],
    );

  it("marca al sujeto, no a la región entre las anclas", () => {
    const { windows } = deriveMapOverlays(conVentana());
    expect(windows).toHaveLength(1);
    const [w] = windows;
    // Envuelve SOLO el sujeto: (0,440)+78×116, con 10 px de margen.
    expect(w).toMatchObject({ x: -10, y: 430, width: 98, height: 136 });
  });

  it("lee los dos títulos de las anclas y el motivo", () => {
    const [w] = deriveMapOverlays(conVentana()).windows;
    expect(w.afterLabel).toBe("Corona de Medianoche");
    expect(w.beforeLabel).toBe("Heredera de Fuego");
    expect(w.reason).toBe("contexto");
  });

  it("un lado abierto llega como null, no como cadena vacía", () => {
    const g = graph(
      [
        node("ancla-a", 0, 0, { orderNo: 0, label: "Juramentada" }),
        node("sujeto", 0, 220, { orderNo: null, label: "Esquirla del Amanecer", level: "menor", optional: true }),
      ],
      [{ id: "w1", source: "ancla-a", target: "sujeto", type: "requisito", accent: "beige" }],
    );
    const [w] = deriveMapOverlays(g).windows;
    expect(w.afterLabel).toBe("Juramentada");
    expect(w.beforeLabel).toBeNull();
    expect(w.reason).toBeNull();
  });

  it("un sujeto que es un BLOQUE resuelto a su primera obra NO lleva marco (#221)", () => {
    // deriveSagaMap resuelve `s:<uuid>` a la primera obra del bloque, que es una
    // fila normal de la cadena (orderNo !== null): pintarle marco diría que esa
    // obra tiene ventana propia, que es falso.
    const g = graph(
      [
        node("ancla-a", 0, 0, { orderNo: 0 }),
        node("primera-del-bloque", 0, 220, { orderNo: 5 }),
      ],
      [{ id: "w1", source: "ancla-a", target: "primera-del-bloque", type: "requisito", accent: "beige" }],
    );
    expect(deriveMapOverlays(g).windows).toEqual([]);
  });

  it("no confunde el ancla `antes de` con un sujeto", () => {
    const { windows } = deriveMapOverlays(conVentana());
    expect(windows.map((w) => w.id)).toEqual(["window:sujeto"]);
  });
});
```

- [ ] **Paso 2: correr y ver que falla**

```bash
npx vitest run src/lib/sagas/map-overlays.test.ts
```
Esperado: FAIL — las 5 nuevas, `expected [] to have a length of 1`.

- [ ] **Paso 3: implementar**

En `map-overlays.ts`, antes del `return`:

```ts
  // Quién es SUJETO de una ventana, sin volver a mirar la tabla ni re-resolver
  // ninguna clave: `deriveSagaMap` ya dibujó las dos aristas, y su dirección lo
  // dice sin ambigüedad — la arista `requisito` va ancla-después → sujeto, y la
  // `opcional` va sujeto → ancla-antes. Son los dos ÚNICOS usos de esos dos
  // tipos de arista en todo el mapa (el resto es `principal` e `itinerario`).
  // Re-resolver las anclas por nuestra cuenta es cómo dos vistas acaban
  // discrepando de la misma fila (#91/#185/#203).
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const anclaDespues = new Map<string, string>(); // sujeto -> id del ancla
  const anclaAntes = new Map<string, string>();
  for (const e of graph.edges) {
    if (e.type === "requisito") anclaDespues.set(e.target, e.source);
    else if (e.type === "opcional") anclaAntes.set(e.source, e.target);
  }

  const windows: WindowFrame[] = [];
  for (const sujetoId of new Set([...anclaDespues.keys(), ...anclaAntes.keys()])) {
    const sujeto = byId.get(sujetoId);
    if (!sujeto || sujeto.kind !== "item") continue;
    // Solo una obra LIBRE lleva marco. Un sujeto-BLOQUE lo resuelve
    // `deriveSagaMap` a la primera obra del bloque, que es una fila normal de la
    // cadena: marcarla diría que esa obra tiene ventana propia. Es el mismo
    // límite con el que `deriveSagaMap` se niega a colgarle el `windowReason`
    // (issue #221), y tiene que seguir siendo el mismo o la vista y el motor
    // discreparían sobre qué es una ventana.
    if (sujeto.orderNo !== null) continue;

    const after = anclaDespues.get(sujetoId);
    const before = anclaAntes.get(sujetoId);
    windows.push({
      id: `window:${sujetoId}`,
      ...envolver([sujeto]),
      reason: sujeto.windowReason,
      afterLabel: (after && byId.get(after)?.label) ?? null,
      beforeLabel: (before && byId.get(before)?.label) ?? null,
    });
  }
  windows.sort((a, b) => a.id.localeCompare(b.id));
```

Y cambiar el `return` a `return { tandems, windows };`.

- [ ] **Paso 4: correr y ver que pasa**

```bash
npx vitest run src/lib/sagas/map-overlays.test.ts
```
Esperado: PASS, 10 pruebas.

- [ ] **Paso 5: commit**

```bash
git add src/lib/sagas/map-overlays.ts src/lib/sagas/map-overlays.test.ts
git commit -m "feat(sagas): deriva el marco del sujeto de una ventana"
```

---

## Tarea 4 · Dibujar cápsula y marco en el lienzo

**Ficheros**
- Crear: `src/components/saga/graph/overlay-nodes.tsx`
- Modificar: `src/components/saga/graph/saga-graph-view.tsx`
- Modificar: `messages/es.json`

**Interfaces**
- Consume: `deriveMapOverlays`, `TandemCapsule`, `WindowFrame`.
- Produce: tipos de nodo `"tandem-capsule"` y `"window-frame"` para React Flow.

- [ ] **Paso 1: la copia nueva**

En `messages/es.json`, sección `"saga"`, junto a las claves `legend*`:

```json
    "legendTandemCapsule": "Se leen en tándem",
    "legendWindowFrame": "Ventana recomendada",
    "timelineTandemUndeclared": "Sin declarar"
```

`timelineTandemUndeclared` es para la cápsula de un hueco compartido cuyo modo nadie declaró: decir
«a la vez» sin que nadie lo haya curado es justo lo que esta feature vino a quitar. (Existe ya
`sagaEditor.tandemModeNone` con el mismo texto, pero es del EDITOR — la cápsula es de la vista
pública, y compartir clave entre las dos ataría dos pantallas que no tienen por qué decir lo mismo
mañana.)

- [ ] **Paso 2: las dos piezas**

`src/components/saga/graph/overlay-nodes.tsx`:

```tsx
"use client";

import type { Node, NodeProps } from "@xyflow/react";
import type { TandemCapsule, WindowFrame } from "@/lib/sagas/map-overlays";

// Adornos del frame D. Van DETRÁS de los nodos y de las aristas (zIndex -1 en
// saga-graph-view.tsx): son fondo, no contenido, y nunca deben tapar una
// portada ni interceptar el tap que navega a la ficha — de ahí
// `pointer-events-none`.
//
// El lienzo es oscuro SIEMPRE (estética del mockup), así que los colores son
// tonos crema/tan fijos y no tokens del theme, igual que en graph-nodes.tsx.

export type OverlayFlowNode =
  | Node<{ capsule: TandemCapsule; label: string }, "tandem-capsule">
  | Node<{ frame: WindowFrame; label: string }, "window-frame">;

export function TandemCapsuleNode({ data }: NodeProps<Extract<OverlayFlowNode, { type: "tandem-capsule" }>>) {
  const { capsule, label } = data;
  return (
    <div
      data-testid="graph-tandem-capsule"
      className="pointer-events-none relative rounded-2xl border-2 border-tan/70 bg-tan/10"
      style={{ width: capsule.width, height: capsule.height }}
    >
      <span className="absolute -top-2.5 left-3 rounded bg-[#201b16] px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#e8d9c0]">
        ∥ {label}
      </span>
      {capsule.note && (
        <span className="absolute -bottom-2.5 left-3 max-w-[160px] truncate rounded bg-[#201b16] px-1.5 font-mono text-[9px] italic text-[#b9a986]">
          {capsule.note}
        </span>
      )}
    </div>
  );
}

export function WindowFrameNode({ data }: NodeProps<Extract<OverlayFlowNode, { type: "window-frame" }>>) {
  const { frame, label } = data;
  return (
    <div
      data-testid="graph-window-frame"
      className="pointer-events-none relative rounded-xl border-[1.5px] border-dashed border-spine"
      style={{
        width: frame.width,
        height: frame.height,
        // La trama diagonal del mockup. Inline y no una clase: es un
        // `repeating-linear-gradient` con opacidad, y Tailwind no lo expresa.
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(91,152,156,.22) 0 5px, transparent 5px 10px)",
      }}
    >
      <span className="absolute -top-2.5 left-2 whitespace-nowrap rounded bg-[#201b16] px-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#cfe3e4]">
        ◇ {label}
      </span>
    </div>
  );
}
```

- [ ] **Paso 3: inyectarlos en la vista**

En `saga-graph-view.tsx`:

```tsx
import { deriveMapOverlays } from "@/lib/sagas/map-overlays";
import { TandemCapsuleNode, WindowFrameNode } from "./overlay-nodes";

const NODE_TYPES = {
  cover: CoverNode,
  medallion: MedallionNode,
  saga: SagaNodeCard,
  "tandem-capsule": TandemCapsuleNode,
  "window-frame": WindowFrameNode,
};
```

Y en el `useMemo` de nodos, **delante** de los nodos reales (React Flow respeta `zIndex`, pero el
orden del array decide los empates):

```tsx
  const t = useTranslations("saga");

  const nodes = useMemo<Array<GraphFlowNode | OverlayFlowNode>>(() => {
    const { tandems, windows } = deriveMapOverlays(graph);

    const capsulas: OverlayFlowNode[] = tandems.map((capsule) => ({
      id: capsule.id,
      type: "tandem-capsule" as const,
      position: { x: capsule.x, y: capsule.y },
      data: {
        capsule,
        label:
          capsule.mode === "simultaneo"
            ? t("timelineTandemSimultaneo")
            : capsule.mode === "indistinto"
              ? t("timelineTandemIndistinto")
              : t("timelineTandemUndeclared"),
      },
      draggable: false,
      selectable: false,
      // Detrás de los nodos Y de las aristas: es fondo.
      zIndex: -1,
    }));

    const marcos: OverlayFlowNode[] = windows.map((frame) => ({
      id: frame.id,
      type: "window-frame" as const,
      position: { x: frame.x, y: frame.y },
      data: {
        frame,
        // Mismas palabras que la fila del timeline sobre la misma obra: la
        // cabecera («Ventana recomendada») más los dos lados que existan.
        label: [
          t("timelineWindowTitle"),
          frame.afterLabel && t("timelineWindowAfter", { title: frame.afterLabel }),
          frame.beforeLabel && t("timelineWindowBefore", { title: frame.beforeLabel }),
        ]
          .filter(Boolean)
          .join(" · "),
      },
      draggable: false,
      selectable: false,
      zIndex: -1,
    }));

    const reales: GraphFlowNode[] = graph.nodes.map((n) => ({
      id: n.id,
      type: n.kind === "saga" ? "saga" : n.level === "principal" ? "cover" : "medallion",
      position: { x: n.x, y: n.y },
      data: { node: n },
    }));

    return [...capsulas, ...marcos, ...reales];
  }, [graph, t]);
```

`ReactFlow` pasa a tipar `nodes` como `Array<GraphFlowNode | OverlayFlowNode>`; ajustar la firma del
`onNodeClick` para que ignore los adornos:

```tsx
  const onNodeClick: NodeMouseHandler<GraphFlowNode | OverlayFlowNode> = (_event, node) => {
    if (node.type === "tandem-capsule" || node.type === "window-frame") return;
    router.push(node.data.node.href);
  };
```

- [ ] **Paso 4: comprobar tipos y ver el resultado**

```bash
npx tsc --noEmit
npm run dev   # http://localhost:3000/saga/<trono-de-cristal>?tab=mapa — PC
```
Esperado: la cápsula abraza *Imperio de Tormentas* + *Torre del Alba* con el rótulo «∥ A la vez», y
*La Espada de la Asesina* lleva marco rayado con «Ventana recomendada · después de Corona de
Medianoche · antes de Heredera de Fuego».

- [ ] **Paso 5: commit**

```bash
git add src/components/saga/graph/overlay-nodes.tsx src/components/saga/graph/saga-graph-view.tsx messages/es.json
git commit -m "feat(sagas): el grafo dibuja la capsula del tandem y el marco de la ventana"
```

---

## Tarea 5 · La etiqueta bajo el nodo: rol, opcional, saltado

**Ficheros**
- Crear: `src/components/saga/graph/node-tag.tsx`
- Modificar: `src/components/saga/graph/graph-nodes.tsx`

**Interfaces**
- Consume: `SagaGraphNode`, `ROLE_GLYPH` (`role-style.ts`, fase 5).
- Produce: `<NodeTag node={...} />`.

- [ ] **Paso 1: la pieza**

`src/components/saga/graph/node-tag.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaGraphNode } from "@/lib/sagas/map-types";

// Estado 04 del frame D, más lo que el grafo nunca dijo de los otros dos: una
// sola tira bajo el nodo que acumula lo que sea cierto — rol, opcional,
// saltado — en ese orden. Un nodo sin nada que decir no pinta nada, que es el
// caso de 361 de las 367 filas de producción.
//
// Ni una cadena nueva: `roleShort.*` (fase 5), `timelineOptionalTag` y
// `timelineSkippedTag` (fase 4) son las MISMAS palabras que el timeline usa
// sobre la misma obra. Dos vocabularios para el mismo estado es cómo empiezan a
// discrepar.
export function NodeTag({ node }: { node: SagaGraphNode }) {
  const t = useTranslations("saga");
  const partes: string[] = [];
  if (node.role !== null) partes.push(`${ROLE_GLYPH[node.role]} ${t(`roleShort.${node.role}`)}`);
  if (node.optional) partes.push(t("timelineOptionalTag"));
  if (node.skipped) partes.push(t("timelineSkippedTag"));
  if (partes.length === 0) return null;

  return (
    <span
      data-testid="graph-node-tag"
      className={`absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#b9a986]/60 bg-[#201b16]/90 px-1.5 py-px font-mono text-[8.5px] tracking-wide text-[#e2d3b4] ${
        node.skipped ? "line-through opacity-70" : ""
      }`}
    >
      {partes.join(" · ")}
    </span>
  );
}
```

- [ ] **Paso 2: montarla**

En `graph-nodes.tsx`, dentro de `CoverNode`, **debajo** del `<p>` del título (la etiqueta cuelga a
`top-full mt-2`, y el rótulo ocupa hasta dos líneas):

```tsx
      <NodeTag node={node} />
```
con `className` de posición añadido allí: envolver el título y la etiqueta en un contenedor
`absolute left-1/2 top-full mt-2 w-[150px] -translate-x-1/2` y dejar que `NodeTag` sea un bloque
centrado dentro (`relative`, sin `absolute`), para no calcular dos veces el mismo desplazamiento:

```tsx
      <div className="absolute left-1/2 top-full mt-2 flex w-[150px] -translate-x-1/2 flex-col items-center gap-1">
        <p
          className={`text-center font-serif text-sm font-medium leading-tight text-[#f0e6d4] [text-shadow:0_2px_8px_rgba(0,0,0,.8)] ${
            node.skipped ? "line-through opacity-70" : ""
          }`}
        >
          {node.label}
        </p>
        <NodeTag node={node} />
      </div>
```
(y en `NodeTag`, quitar `absolute left-1/2 -translate-x-1/2` del `className`, que ya lo hace el
contenedor).

Lo mismo en `MedallionNode`, con `w-max max-w-[130px]` y `mt-1.5`.

- [ ] **Paso 3: comprobar**

```bash
npx tsc --noEmit && npm run lint
```
Esperado: sin errores nuevos (el único error de lint preexistente vive en `signup-form.tsx`).

En el navegador: *La Espada de la Asesina* lleva «◂ Precuela»; *Esquirla del Amanecer*, «✦ Relato ·
Opcional».

- [ ] **Paso 4: commit**

```bash
git add src/components/saga/graph/node-tag.tsx src/components/saga/graph/graph-nodes.tsx
git commit -m "feat(sagas): el rol, lo opcional y lo saltado se leen bajo el nodo del grafo"
```

---

## Tarea 6 · Dos entradas más en la leyenda, condicionales

**Ficheros**
- Modificar: `src/components/saga/graph/graph-legend.tsx`

- [ ] **Paso 1: añadirlas**

Siguiendo el patrón de `hasItineraryJump` —condicional, porque anunciar en la leyenda de casi todos
los mapas una forma que ese mapa no dibuja es ruido—:

```tsx
  const overlays = deriveMapOverlays(graph);
  const hasTandem = overlays.tandems.length > 0;
  const hasWindowFrame = overlays.windows.length > 0;
```

y, tras la entrada del salto del itinerario:

```tsx
      {hasTandem && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i className="h-[13px] w-[26px] shrink-0 rounded-md border-2 border-tan bg-tan/20" />{" "}
          {t("legendTandemCapsule")}
        </span>
      )}
      {hasWindowFrame && (
        <span className="flex items-center gap-2 text-[11.5px] text-foreground">
          <i
            className="h-[13px] w-[26px] shrink-0 rounded border-[1.5px] border-dashed border-spine"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(91,152,156,.35) 0 4px, transparent 4px 8px)",
            }}
          />{" "}
          {t("legendWindowFrame")}
        </span>
      )}
```

- [ ] **Paso 2: comprobar y commit**

```bash
npx tsc --noEmit
git add src/components/saga/graph/graph-legend.tsx
git commit -m "feat(sagas): la leyenda del mapa nombra la capsula y la ventana"
```

---

## Tarea 7 · La lente de rol también llega al grafo (atenúa, no filtra)

**Ficheros**
- Modificar: `saga-graph-view.tsx`, `saga-graph-lazy.tsx`, `graph-nodes.tsx`, `saga-map-tab.tsx`

- [ ] **Paso 1: pasar la lente**

`SagaGraphView` y `SagaGraphLazy` aceptan `activeRole?: SagaItemRole | null` (por defecto `null`).
`saga-map-tab.tsx` se lo pasa a sus **dos** montajes (`graph` y `curatedGraph`). La página del mapa a
pantalla completa (`src/app/saga/[id]/mapa/page.tsx`) **no** lo pasa: no tiene el parámetro `?rol=` y
darle uno inventado sería peor que no tenerlo.

- [ ] **Paso 2: atenuar**

React Flow no propaga props a los nodos: la lente viaja **en el dato del nodo**, que es donde ya
viaja todo lo demás.

En `saga-graph-view.tsx`, al construir `reales`: `data: { node: n, muted: activeRole !== null && n.role !== activeRole }`.
`GraphFlowNode` pasa a `Node<{ node: SagaGraphNode; muted?: boolean }, …>`.

En `graph-nodes.tsx`, `CoverNode`/`MedallionNode` aplican `${data.muted ? "opacity-30" : ""}` al
envoltorio exterior.

**No se ocultan nodos.** Quitarlos dejaría aristas huérfanas y partiría la cadena — el fallo que la
issue #238 documenta en el timeline.

- [ ] **Paso 3: comprobar**

```bash
npx tsc --noEmit
```
En el navegador: `?tab=mapa&rol=precuela` sobre Trono de Cristal deja *La Espada de la Asesina* a
plena opacidad y el resto atenuado, **con las aristas intactas**.

- [ ] **Paso 4: commit**

```bash
git add src/components/saga/graph src/components/saga/saga-map-tab.tsx
git commit -m "feat(sagas): la lente de rol atenua el grafo en vez de dejarlo al margen"
```

---

## Tarea 8 · E2E

**Ficheros**
- Crear: `e2e/sagas-grafo-estados.spec.ts`

Convenciones de la casa (fases 4 y 5): línea base **medida en `beforeAll` desde la BD** y restaurada
en `afterAll`; `workers: 1`; la suite reutiliza el `next dev` que haya.

- [ ] **Paso 1: escribir la spec**

```ts
import { expect, test } from "@playwright/test";
// … helpers de sesión/semilla, los mismos que e2e/sagas-roles.spec.ts

test.describe("grafo 2D · los cuatro estados", () => {
  test("la cápsula envuelve el tándem y lo nombra", async ({ page }) => {
    await page.goto(`/saga/${SAGA_QA}?tab=mapa`);
    const capsula = page.getByTestId("graph-tandem-capsule");
    await expect(capsula).toHaveCount(1);
    await expect(capsula).toContainText("A la vez");
    // Envuelve a sus dos miembros: más alta que un nodo suelto.
    const caja = await capsula.boundingBox();
    expect(caja!.height).toBeGreaterThan(300);
  });

  test("el sujeto de la ventana lleva marco con sus dos anclas", async ({ page }) => {
    await page.goto(`/saga/${SAGA_QA}?tab=mapa`);
    const marco = page.getByTestId("graph-window-frame");
    await expect(marco).toContainText("después de");
    await expect(marco).toContainText("antes de");
  });

  test("el rol curado se lee bajo el nodo", async ({ page }) => {
    // cura un rol por el editor de secuencia, vuelve al mapa
    await expect(page.getByTestId("graph-node-tag").first()).toContainText("Precuela");
  });

  test("la lente de rol atenúa pero no borra: las aristas siguen", async ({ page }) => {
    await page.goto(`/saga/${SAGA_QA}?tab=mapa`);
    const nodosAntes = await page.locator(".react-flow__node").count();
    const aristasAntes = await page.locator(".react-flow__edge").count();
    await page.goto(`/saga/${SAGA_QA}?tab=mapa&rol=precuela`);
    expect(await page.locator(".react-flow__node").count()).toBe(nodosAntes);
    expect(await page.locator(".react-flow__edge").count()).toBe(aristasAntes);
  });

  test("la leyenda nombra las dos formas nuevas", async ({ page }) => {
    await page.goto(`/saga/${SAGA_QA}?tab=mapa`);
    await expect(page.getByText("Se leen en tándem")).toBeVisible();
  });
});
```

- [ ] **Paso 2: correr**

```bash
npx playwright test e2e/sagas-grafo-estados.spec.ts
```
Esperado: 5 pasan.

- [ ] **Paso 3: commit**

```bash
git add e2e/sagas-grafo-estados.spec.ts
git commit -m "test(sagas): e2e de los cuatro estados en el grafo 2D"
```

---

## Tarea 9 · Inyección de fallo

La técnica que en la fase 4 destapó que una de las tres roturas previstas **no tumbaba ningún test**
(#214). Romper el producto por tres sitios, **de uno en uno**, y comprobar que cae exactamente el test
que debe. Si una rotura no tumba su test, el test no vale y hay que arreglarlo antes de seguir.

- [ ] **Rotura 1 — la cápsula agrupa por la tabla en vez de por el hueco.**
  En `map-overlays.ts`, cambiar `if (miembros.length < 2) continue;` por
  `if (miembros.length < 2 || miembros[0].tandem === null) continue;`.
  Debe caer: `map-overlays.test.ts` → «un hueco compartido SIN metadatos curados también lleva
  cápsula». Revertir.

- [ ] **Rotura 2 — el marco también se pinta sobre un sujeto-bloque.**
  Quitar `if (sujeto.orderNo !== null) continue;`.
  Debe caer: `map-overlays.test.ts` → «un sujeto que es un BLOQUE … NO lleva marco (#221)». Revertir.

- [ ] **Rotura 3 — la lente filtra en vez de atenuar.**
  En `saga-graph-view.tsx`, filtrar `graph.nodes` por `activeRole` al construir `reales`.
  Debe caer: e2e → «la lente de rol atenúa pero no borra». Revertir.

- [ ] **Commit del informe** (en el cuerpo de la PR, no en un fichero): las tres roturas y qué cayó.

---

## Tarea 10 · Sincronizar la doc y abrir lo que quede

**Definición de «hecho»** (AGENTS.md): un cambio no está hecho hasta que el doc canónico vuelve a ser
cierto.

- [ ] **Paso 1: `docs/requirements/backlog.md`** — marcar la fase 6 y, con ella, **la feature entera**
  de los cuatro estados. La narrativa de *cómo* va en la spec, no aquí.

- [ ] **Paso 2: `docs/requirements/decisiones.md`** — append-only, al final. Una entrada por cada
  decisión que sobrevive al código: D3 (la ventana no se dibuja como zona, con la tabla medida), D5
  (lo opcional no gana punteado porque el punteado ya es «pendiente»), D8 (la lente atenúa, no
  filtra).

- [ ] **Paso 3: `docs/architecture/graph.json`** — nodos nuevos (`map-overlays.ts`, `graph-metrics.ts`,
  `overlay-nodes.tsx`, `node-tag.tsx`) y sus dependencias; trampa en el nodo del grafo 2D: «la
  cápsula agrupa por empate de `orderNo`, no por la fila de `saga_tandems`». **Edición dirigida por
  cadena, NO round-trip de JSON** — un `JSON.parse`/`stringify` reescribe las 2400 líneas del fichero
  y hace la revisión imposible (ya pasó en la fase 5).

- [ ] **Paso 4: `docs/requirements/data-model.md`** — **no se toca**: esta fase no cambia el esquema.
  Comprobarlo explícitamente, y decirlo en la PR.

- [ ] **Paso 5: issues.** Todo lo pendiente vive como issue, escrita para quien la lea en seis meses:
  - La **#221** (sujeto-bloque sin ventana propia) gana un comentario: ahora también le falta el
    marco en el grafo, con el mismo criterio y por la misma razón.
  - Si al construir aparece cualquier otra cosa —una cápsula que se solapa con la etiqueta del nodo
    vecino, un marco que no cabe—, **issue aparte**, no un arreglo encadenado a esta PR.

- [ ] **Paso 6: verificación final antes de dar la fase por hecha**

```bash
npx vitest run          # todo verde
npx tsc --noEmit        # limpio
npm run lint            # solo el error preexistente de signup-form.tsx
npx playwright test e2e/sagas-*.spec.ts
```

- [ ] **Paso 7: commit y PR en borrador**

```bash
git add docs/
git commit -m "docs(sagas): la fase 6 cierra los cuatro estados"
gh pr create --draft
```

---

## Autorrevisión

**1 · Cobertura de la spec.** La spec dedica a la fase 6 una línea: «Frame D: los estados en el grafo
2D», sin BD. Los cuatro estados del frame quedan cubiertos: tándem → Tareas 2 y 4; ventana → Tareas 3
y 4; opcional → Tarea 5 (con D5 explicando por qué no gana trazo); rol → Tareas 5 y 7. La leyenda del
frame (Tarea 6) y las pruebas que la spec exige —unitarias sobre lo puro, e2e sobre lo visible,
inyección de fallo— están en las Tareas 2, 3, 8 y 9.

**Lo que la fase NO hace, y consta:** la zona rayada entre dos hitos del frame D (D3, medido); el
trazo punteado para lo opcional (D5); los roles personalizados y el «compañero sin progreso» (fuera
del alcance por la spec y por el límite duro del progreso).

**2 · Marcadores de posición.** Ni «TBD» ni «manejar los casos límite». La única tarea con código
abreviado es la 8 (e2e): los helpers de sesión y semilla se copian de `e2e/sagas-roles.spec.ts`, que
existe y funciona, y el cuerpo de cada prueba está escrito.

**3 · Consistencia de tipos.** `deriveMapOverlays` devuelve `{ tandems, windows }` desde la Tarea 2
—con `windows: []` hasta la 3— para no rehacer el tipo a mitad. `nodeBoxOf` (Tarea 1) es lo único que
`map-overlays.ts` importa de la Tarea 1. `OverlayFlowNode` (Tarea 4) y `GraphFlowNode` (existente)
conviven en el array de nodos, y `onNodeClick` los distingue por `type`. La lente (Tarea 7) viaja en
`data.muted`, no como prop del tipo de nodo, porque React Flow no propaga props a los nodos.

**4 · Riesgos vivos.**
1. **`zIndex: -1` en React Flow.** Es la palanca con la que los adornos van detrás de nodos y
   aristas; si en `@xyflow/react` de este proyecto no bastara, la alternativa es un `<Panel>` propio
   o un nodo con `className` de `z-index` negativo. Se comprueba en el Paso 4 de la Tarea 4, que es
   pronto.
2. **La cápsula puede solaparse con la etiqueta del nodo vecino**, que mide 150 px y ya se solapa hoy
   con las columnas de al lado. En Trono de Cristal quedan 102 px de aire, así que el único caso real
   no lo sufre; si aparece, es issue, no arreglo encadenado.
3. **La fase toca el único componente cliente pesado del producto.** El grafo se carga en `lazy`; hay
   que confirmar que el módulo nuevo no se cuela en el bundle del servidor de la ficha.
