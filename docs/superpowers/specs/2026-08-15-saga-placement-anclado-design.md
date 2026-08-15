# Diseño: `placement='anclado'` — colocación relativa obligatoria en sagas

- **Fecha**: 2026-08-15
- **Estado**: propuesta, aprobada para plan de implementación
- **Área**: `area:sagas`
- **Origen**: mejorar la curación de sagas-universo. Hoy una saga-universo (p. ej. UCM)
  trata sus subsagas como bloques contiguos; para intercalar una obra en mitad de una
  subsaga (p. ej. *The Incredible Hulk* entre *Iron Man 1* e *Iron Man 2*) hay que marcar
  esa obra `libre`, que semánticamente significa "en cualquier momento" y le quita su
  hueco. Falta expresar "va aquí, obligatorio, pero por posición relativa".

## 1. Problema

El eje `saga_items.placement` (§7.4 de `docs/requirements/data-model.md`) tiene hoy dos
valores:

- `fijo` — hueco numerado (`position` no nulo). CHECK duro: `fijo ⇔ position IS NOT NULL`.
- `libre` — "en cualquier momento"; `position` nulo; puede llevar una
  `saga_placement_windows` (ventana "después de X / antes de Y").

`place-by-window.ts` **solo recoloca sujetos `libre`** (gate `esLibre` en
`curated-order.ts:153`). Por tanto, para anclar una obra a una posición relativa hay que
marcarla `libre` — pero `libre` lee como "opcional / cuando quieras" y le quita el número.
No existe **"posición fija pero relativa"**: una obra que va en un sitio concreto y
obligatorio, expresado como ancla a otra obra en vez de como número absoluto.

Ese hueco del modelo es la fricción a resolver.

Lo que **ya funciona hoy** y NO se toca:

- El ancla de una ventana puede apuntar a cualquier obra del subárbol, incluida una que
  vive dentro de una subsaga anidada (`get-anchor-options.ts` recorre el subárbol entero).
- Un sujeto-**obra** `libre` con dos anclas (`after` + `before`) **ya parte un bloque**
  contiguo e intercala en medio (`place-by-window.ts`, rama `base`).
- Las ventanas se aplican sobre la secuencia plana del subárbol entero del universo, no
  confinadas por saga.

## 2. Solución: tercer valor `anclado`

Añadir `anclado` al enum `saga_placement`. Es el valor que le falta al eje "dónde se lee":

| valor | significado | `position` |
|---|---|---|
| `fijo` | hueco numerado absoluto | NO nulo |
| **`anclado`** | **posición relativa por ventana, obligatorio** | **nulo** |
| `libre` | en cualquier momento | nulo |

`anclado` participa en `place-by-window` igual que `libre`, pero semánticamente es
obligatorio y "va aquí", no "cuando quieras". La distinción `optional` (¿cuenta en
progreso?) sigue ortogonal: un `anclado` cuenta salvo que además sea `optional`.

Aplica a los dos sitios que usan el enum: `saga_items.placement` (obra) y
`sagas.placement_in_parent` (bloque-subsaga colocado en su padre).

## 3. Esquema

- `ALTER TYPE public.saga_placement ADD VALUE 'anclado';` — aditivo y seguro. Dev primero
  (`supabase-dev`), luego prod, con el código ya desplegado o desplegándose junto.
- **CHECKs sin cambios.** `saga_items_placement_position` y `sagas_placement_position` son
  `CASE WHEN placement='fijo' THEN position IS NOT NULL ELSE position IS NULL END`.
  `anclado` cae al `ELSE` ⇒ exige `position IS NULL`. Ya correcto, no hay que tocarlos.
- **No se añade ninguna columna** ⇒ no aplica la superficie 6 de `docs/DRIFT-CHECK.md`
  (grants por columna).
- **Invariante nueva, no forzable por CHECK** (cruza `saga_items` ↔
  `saga_placement_windows`, como ya avisa el comentario de `place-by-window.ts:83-91`): un
  sujeto `anclado` **debería** tener una fila de ventana. Si falta, degrada suave: sin
  ventana, `place-by-window` no lo mueve y flota como un `libre` sin ventana. La UI de
  autoría crea la ventana en la misma acción que marca `anclado`, así que el estado
  "anclado sin ventana" solo ocurre por edición externa y se trata como deuda de curación
  (igual que un `null` sin clasificar).
- RLS sin cambios: escribir `placement` ya pasa por el camino gated `collaborator` (§7.1),
  y las ventanas por su policy `collaborator` (`20260727_saga_placement_windows.sql`).

## 4. Derivación del orden

- `src/lib/sagas/curated-order.ts`: el predicado `esLibre` pasa a `esColocable` =
  `placement ∈ {libre, anclado}`. Para obras, el `Set` `obrasLibres` (`:149-152`) incluye
  membresías con `placement` `libre` **o** `anclado`. Para bloques, `esLibre` (`:153-156`)
  acepta `placementInParent` `libre` **o** `anclado`.
- `src/lib/sagas/place-by-window.ts`: el parámetro-gate (hoy `isFreeSubject`) se
  generaliza a `isPlaceable`; misma ampliación. **La lógica de corte de `moverSujeto` no
  cambia**: un sujeto-obra prefiere cortar un bloque antes que incumplir su ventana; un
  sujeto-bloque solo aterriza en límites entre bloques. Así, un `anclado`-obra parte
  *Iron Man*; un `anclado`-bloque va a límites.
- **Para PARTIR un bloque hacen falta las DOS anclas** (`after` = IM1 **y** `before` =
  IM2). Con solo `after`, la rama solo-`after` de `moverSujeto` avanza a fin de bloque y
  **no corta** — comportamiento actual que no cambia. La UI de autoría debe dejar claro
  que intercalar en medio requiere las dos anclas.

## 5. Progreso

Sin cambios. `src/lib/sagas/progress.ts` (`countedKeys`) cuenta por pertenencia y `optional`,
ignorando `placement`/`position`. Un `anclado` cuenta como lectura normal.

## 6. Grupos y layout

`src/lib/sagas/group-members.ts`: las ramas que hoy reparten por `placementInParent ===
'libre'` (`partitionGroups`, `orderBlocksForLayout`) deben incluir `anclado` en el bucket
"colocado por ancla", intercalándolo junto a su ancla igual que un `libre`-con-ventana.
Auditar todos los `=== 'libre'` del módulo de sagas y decidir caso por caso si `anclado`
entra (regla general: donde "tiene ventana / se recoloca", sí; donde "no cuenta / es
opcional", no — eso es `optional`, no `placement`).

## 7. Autoría (editor de secuencia)

- Acción **"Anclar…"** disponible en **cualquier fila** (obra o bloque) del editor de
  secuencia, no solo en la zona "Cuando quieras". Al activarla: setea
  `placement='anclado'` (+ `position=null`) y abre el `AnchorPicker` para elegir `after` /
  `before`. Reutiliza los componentes existentes `WindowEditor`, `AnchorPicker`,
  `get-anchor-options`.
- La fila anclada muestra su ventana resuelta inline (chip "después de X, antes de Y").
- El editor distingue visualmente los tres estados: **fijo** (número) · **anclado**
  (relativo) · **libre** (cuando quieras), y explica que intercalar en medio de una
  subsaga necesita las dos anclas.
- Camino de escritura: una acción/RPC que escriba `saga_items.placement='anclado'`,
  `position=null` y la fila de `saga_placement_windows`, gated `collaborator` (reusa el
  camino existente; no hace falta RPC nueva salvo que el actual no permita fijar
  `placement` arbitrario — a verificar en el plan).

## 8. Render del bloque partido

Decisión de producto: cuando una obra parte una subsaga, el bloque se **divide en dos
segmentos** con el mismo color/etiqueta, el segundo rotulado "(cont.)", y la obra
intercalada entre ambos. Como una obra `libre` con dos anclas **ya parte bloques hoy**,
verificar en la implementación si `reading-timeline` / `derive-map` ya rotulan la
continuación; si no, añadir la etiqueta "(cont.)". Item pequeño, a confirmar.

## 9. Tipos

`src/lib/sagas/types.ts`: `SagaPlacement` += `'anclado'`. Regenerar los tipos TS de
Supabase tras el `ALTER TYPE`.

## 10. Fuera de alcance (abrir como issues)

- **Intercalado cross-bloque dentro de un itinerario** (`resolve-route.ts` expande cada
  bloque `child_saga_id` de forma aislada vía `mainOrderOf`, sin inyectar sujetos de fuera
  del bloque). Es un límite real y distinto del orden automático. `area:sagas` ·
  `tipo:deuda` · `P2`.
- Verificación / rótulo "(cont.)" del bloque partido si resultara faltar (§8). Si falta,
  `area:sagas` · `tipo:bug` · `P2`.

## 11. Tests

- **Unit `place-by-window`**: sujeto `anclado`-obra con `after`+`before` parte el bloque e
  intercala; con solo `after` no corta (va a fin de bloque); `anclado`-bloque solo aterriza
  en límites.
- **Unit `curated-order`**: `esColocable` recoloca `anclado`; un `anclado` sin ventana
  degrada a flotar (no rompe).
- **Unit `group-members`**: `anclado` entra en el bucket de layout correcto.
- **e2e**: en el editor de secuencia, marcar una obra `anclado` con dos anclas y ver el
  intercalado (bloque partido) en el mapa de lectura.

## 12. Definición de "hecho"

- `docs/requirements/data-model.md` §7.4: documentar el tercer valor `anclado` y su fecha
  de verificación.
- `docs/requirements/decisiones.md`: entrada append-only con la decisión "tercer valor de
  `placement` en vez de reusar `libre`".
- `docs/requirements/backlog.md`: marcar la mejora de curación de sagas-universo si tiene
  casilla.
- Issues de §10 abiertas con sus tres etiquetas.
