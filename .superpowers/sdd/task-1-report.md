# Task 1 — La derivación pura del mapa: informe

## Ficheros

Creados:
- `src/lib/sagas/map-types.ts`
- `src/lib/sagas/derive-map.ts`
- `src/lib/sagas/derive-map.test.ts`

Modificados:
- `src/lib/sagas/types.ts` (`ResolvedWindow` con `afterKey`/`beforeKey`)
- `src/lib/sagas/get-saga-detail.ts` (`resolveWindows` rellena las claves)
- `src/lib/sagas/get-saga-detail.test.ts` (prueba nueva + las 5 aserciones existentes de `resolveWindows`/`someWindow` actualizadas para incluir `afterKey`/`beforeKey`, ya que ahora forman parte del objeto y `toEqual` exige forma exacta)
- `src/lib/sagas/group-members.ts` (`partitionGroups`)
- `src/lib/sagas/group-members.test.ts` (prueba nueva de `partitionGroups`)
- `src/lib/sagas/graph-data.ts` (los tres tipos de grafo pasan a re-export desde `map-types.ts`; import de `MemberStatus`/`SagaItemRole` retirado por quedar sin uso)
- `src/components/saga/saga-info.tsx` (`orderedGroups`/`freeGroups` ahora vienen de `partitionGroups(groups)`)

**Ningún fichero de `src/components/saga/graph/` tocado.**

## Firmas exactas

```ts
// map-types.ts — copia literal de graph-data.ts:31-60, sin tocar un campo
export type SagaGraphNode = { id: string; kind: "item" | "saga"; x: number; y: number;
  level: "principal" | "menor"; orderNo: number | null; label: string; accent: SagaAccentToken;
  status: MemberStatus; role: SagaItemRole | null; coverUrl: string | null; covers: string[];
  href: string; memberCount: number | null; groupSagaId: string | null; groupName: string | null };
export type SagaGraphEdge = { id: string; source: string; target: string;
  type: "principal" | "opcional" | "requisito"; accent: SagaAccentToken };
export type SagaGraph = { nodes: SagaGraphNode[]; edges: SagaGraphEdge[] };

// types.ts
export type ResolvedWindow = {
  afterTitle: string | null; beforeTitle: string | null;
  afterKey: string | null; beforeKey: string | null;
};

// group-members.ts
export function partitionGroups(groups: MemberGroup[]): { ordered: MemberGroup[]; free: MemberGroup[] };

// derive-map.ts
export type MapLookup = {
  groupAccent: Map<string | null, SagaAccentToken>;
  groupName: Map<string | null, string | null>;
};
export function deriveSagaMap(
  groups: MemberGroup[],
  windows: Record<string, ResolvedWindow>,
  lookup: MapLookup,
  routeKeys?: string[], // sin usar en esta Task; se rellena en la Task 3
): SagaGraph;
```

## Criterio real de reparto en `saga-info.tsx`

Abierto antes de escribir `partitionGroups`, tal y como pedía el Step 3. El criterio en producción (líneas 225-226, antes del cambio) era **exactamente** el que trae el plan, sin divergencia:

```ts
const orderedGroups = groups.filter((g) => g.placementInParent !== "libre");
const freeGroups = groups.filter((g) => g.placementInParent === "libre");
```

`partitionGroups` es una copia literal de ese criterio. No hubo que "mandar el real" porque coincide con el propuesto.

## `RawWindowRow` real

También coincidía exactamente con la forma que trae el plan (`get-saga-sequence.ts:173-186`): 9 campos de tipo/id/child_saga_id por sujeto/after/before + `created_at`. La prueba del Step 2 se añadió tal cual.

## Tabla de inyección de fallo (Step 7)

Ejecutado `npx vitest run src/lib/sagas/derive-map.test.ts src/lib/sagas/group-members.test.ts src/lib/sagas/get-saga-detail.test.ts` antes y después de cada fallo inyectado, uno a la vez, revirtiendo entre cada uno.

| Regla desactivada | Cambio exacto | Prueba que cae | ¿Solo esa? |
|---|---|---|---|
| Tándem no comparte `x` (regla 3) | `sameHueco` forzado a `false` (cada obra abre hueco propio aunque comparta `position`) | `deriveSagaMap > un tándem son dos nodos en la misma columna` | Sí — 41/42 verdes, 1 roja |
| Ancla de bloque invierte primera↔última obra (regla 9) | `after` resuelto con `"first"` en vez de `"last"`; `before` con `"last"` en vez de `"first"` | `deriveSagaMap > un ancla que apunta a un BLOQUE se conecta a su última obra, no al bloque` | Sí — 41/42 verdes, 1 roja |
| Deja de comprobar que los dos extremos existen (regla 9, guarda `si no resuelve, no hay arista`) | Se quitan los `if (x !== null)` y se fuerza con `!` no-null assertion sobre `resolveEntry(...)` | `deriveSagaMap > una ventana cuyo extremo no está en el mapa no pinta arista` | Sí — 41/42 verdes, 1 roja |

En los tres casos cayó **una y solo una** prueba, y fue la prueba diseñada para esa regla — no se repitió el patrón de "desactivar media regla deja la suite entera en verde" que motivó el contrato de verificación.

## Verificación final

`npx vitest run` (suite completa, Node 22.23.1 vía fnm):

```
 Test Files  67 passed (67)
      Tests  534 passed (534)
   Start at  11:40:40
   Duration  3.96s
```

`npx tsc --noEmit`: salida vacía, exit 0.

## Dudas / notas para quien siga (Task 2/3)

1. **Orden de `groups` no se reordena dentro de `deriveSagaMap`.** La función asume que el array `groups` llega ya en el orden final de pintado (como lo entrega `groupMembers`, que ya ordena `childGroups` por `positionInParent`/heurística). `partitionGroups` solo filtra, no reordena — igual que en producción. Quien llame a `deriveSagaMap` en la Task 2 debe pasarle `getSagaDetail`'s `groups` tal cual, sin barajar.
2. **Los miembros de cada `MemberGroup` se asumen pre-ordenados** por `position` y luego título (como hace `groupMembers`). `deriveSagaMap` no vuelve a ordenarlos — confía en el contrato de esa función. Si algún día alguien construye `groups` a mano sin pasar por `groupMembers`, el mapa podría salir con huecos en desorden.
3. **Ambigüedad de "primera/última obra de un bloque" con tándem en el extremo**: si el primer o último hueco de un bloque es un tándem (dos obras a la vez), tomé la PRIMERA obra insertada en ese hueco (según el orden ya aplicado por `groupMembers`: `position`, luego título) como "la" primera/última obra del bloque, en vez de crear un ancla múltiple. El brief no cubre este caso con ningún test, así que lo dejo señalado por si el mockup real esperaba otra cosa (p. ej. conectar la ventana a las DOS obras del tándem límite).
4. **`routeKeys` sin usar**: el parámetro existe en la firma tal como pide el plan (para la Task 3) pero esta Task no lo toca ni lo valida — queda tal cual en la firma, sin lógica.

## Arreglos tras la revisión

**1 (CRITICAL) — una obra sin hueco ya no entra en la cadena.** La partición
en huecos miraba solo `m.position`, así que una obra `libre` o sin clasificar
(`position === null`) abría su propio hueco de un solo miembro y quedaba
encadenada con aristas `principal` a sus vecinas — el caso mayoritario en
sagas reales (Cosmere: Elantris, El Aliento de los Dioses, Esquirla del
Amanecer, las cuatro Novelas secretas). `deriveSagaMap` ahora parte
`group.members` en `chained` (`position !== null`, forman huecos y cadena) y
`loose` (`position === null`, sin hueco): los `loose` se pintan como nodos
después del último hueco real de su bloque, conservan la fila `y`, reciben
`orderNo: null` (así activan el mecanismo de ramas/puentes de
`deriveTimeline` en vez de su columna principal) y ninguna arista `principal`
los toca; sí pueden llevar aristas de ventana, igual que antes. Cuatro pruebas
nuevas en `derive-map.test.ts` cubren el bloque `[fijo(A,1), fijo(B,2),
libre(Z)]` (solo `A→B`, `Z.orderNo === null`), la variante sin clasificar
(`placement: null`), la fila/columna determinista de `Z`, y una obra sin hueco
CON ventana sí conectada. Se añadió `looseWork()` en el test (el `work()`
existente fija `placement: "fijo"` a machamartillo).

**2 (IMPORTANT) — la ambigüedad del tándem en el límite de un bloque, ahora en
el código.** Comentario nuevo junto a `firstOfBlock`/`lastOfBlock` explicando
que, si el hueco extremo es un tándem, se usa la PRIMERA obra insertada como
ancla del bloque (orden de `groupMembers`: `position`, luego título) porque
`ResolvedWindow` solo admite una clave por ancla — decisión de diseño, no un
descuido. Antes vivía solo en el informe (punto 3 de las dudas, arriba).

**3 (IMPORTANT) — el contrato de orden, en el doc-comment.** `deriveSagaMap`
tiene ahora un doc-comment JSDoc que deja explícita la precondición de
determinismo: `groups` y los `members` de cada grupo deben llegar YA
ORDENADOS (el mismo orden que entrega `groupMembers`). Antes solo estaba en
un comentario dentro del cuerpo de la función.

**4 (MINOR) — el test de `resolveWindows` reutiliza `w()`.** La prueba «un
ancla que resuelve trae clave y título; una rota, las dos a null» en
`get-saga-detail.test.ts` construía la fila a mano con los 9 campos; ahora usa
el helper `w()` que ya usan las demás pruebas de `resolveWindows`.

### Inyección de fallo (hallazgo 1)

Se revirtió la partición nueva a la vieja (`chained = group.members` sin
filtrar, `loose = []`, `sameHueco` vuelve a exigir `m.position !== null`) y se
corrió `npx vitest run` completo antes de revertir el fallo:

| Regla desactivada | Cambio exacto | Pruebas que caen | ¿Solo esas? |
|---|---|---|---|
| Partición por hueco vuelve a mirar solo `position` (hallazgo 1) | `chained = group.members` (sin filtrar `loose`); `sameHueco` exige de nuevo `m.position !== null` | `deriveSagaMap > un bloque [fijo(A,1), fijo(B,2), libre(Z)] da A→B y nada toca a Z, con Z.orderNo null` y `deriveSagaMap > una obra sin clasificar (placement null) tampoco entra en la cadena` | Sí — 536/538 verdes, 2 rojas |

Las otras dos pruebas nuevas (fila/columna determinista de `Z`, ventana sobre
una obra sin hueco) siguen en verde con el fallo inyectado: no dependen de si
`Z` encadena o no — comprueban posición e resolución de ventana, ortogonales a
la regla de la cadena — así que no se esperaba que cayeran, y no cayeron.

### Verificación final (tras el arreglo)

`npx vitest run` (suite completa, Node 22.23.1 vía fnm):

```
 Test Files  67 passed (67)
      Tests  538 passed (538)
   Start at  11:57:14
   Duration  3.51s
```

`npx tsc --noEmit`: salida vacía, exit 0.
