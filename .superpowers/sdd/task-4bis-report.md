# Task 4-bis: El mapa se enseña cuando aporta — Informe

## 1. La migración

`supabase/migrations/20260728_sagas_show_map.sql` — literal al brief:

```sql
alter table public.sagas add column show_map boolean not null default false;

update public.sagas s set show_map = true
 where exists (select 1 from public.saga_nodes n where n.saga_id = s.id);
```

Aplicada a dev con `mcp__supabase-dev__apply_migration`. Verificación contra objetos reales (nunca `list_migrations`):

- `information_schema.columns` para `public.sagas.show_map`: `{"column_name":"show_map","data_type":"boolean","is_nullable":"NO","column_default":"false"}`. Tipo y default correctos.
- `select count(*) from public.sagas where show_map` → **1**, no 4.

### Discrepancia con el número del brief (IMPORTANTE)

El brief y el encargo dicen "las 4 sagas que hoy tienen mapa" / "salgan exactamente las 4". En el dev real de este momento:

```sql
select count(distinct saga_id) from public.saga_nodes;  -- → 1
select saga_id, count(*) from public.saga_nodes group by saga_id;
-- → 69c07496-9b1a-4203-b3da-15d22a09c039 | 10
```

Solo **una** saga tiene filas en `saga_nodes` en este dev (`[QA Sagas v2] Universo`, con 10 nodos); `public.sagas` tiene 14 filas en total (esto sí coincide con el brief). No he forzado el número a 4: apliqué la migración tal cual la especifica el brief y verifiqué contra el estado real, que da 1. La cifra "4" del brief está desactualizada respecto al seed de dev actual — probablemente el seed cambió entre que se escribió el brief y ahora. Dejo esto como duda/aviso explícito más abajo; no he tocado el seed para maquillar el número.

Gate de BD para el interruptor: no hace falta migración nueva. `sagas` ya tenía una policy `UPDATE` genérica —`"sagas updatable by collaborators"`, `qual`/`with_check` ambos `has_min_role('collaborator')`— que cubre cualquier columna, incluida `show_map`. Comprobado con `pg_policies`.

## 2. Dónde cambié el origen de `hasGraph`

Sin caminos nuevos — los cuatro sitios que ya consumían `hasGraph` siguen intactos; solo cambia de dónde sale el booleano:

- **`src/lib/sagas/get-saga-detail.ts`**: `getSagaBase` (`get-saga.ts`) ahora trae `saga.showMap` (columna `show_map`). `hasGraph` pasa de `graph !== null` a `saga.showMap && graph !== null`. El mismo `hasGraph` (no `graph !== null` suelto) alimenta ahora `buildRouteList(...)` — antes eran cálculos independientes que coincidían por casualidad de que `showMap` no existía; ahora es literalmente la misma variable en los dos usos.
- **`src/lib/sagas/get-saga-routes.ts` (`buildRouteList`)**: sin cambios de firma ni de lógica — ya recibía `hasGraph: boolean` como parámetro puro. Solo cambió lo que le pasa el llamador.
- **`src/lib/sagas/build-library-saga-cards.ts`**: `hasGraph: tree.length > 0` → `hasGraph: root.showMap && tree.length > 0`. `LibSaga` gana el campo `showMap`; `get-followed-sagas.ts` lo selecciona (`show_map`) en las dos queries del árbol (raíces + niveles) y lo mapea.
- **`src/app/saga/[id]/mapa/page.tsx`**: **sin tocar, a propósito**. Sigue comprobando `!detail.graph` (no `hasGraph`) para decidir "sin mapa, redirige". Ver duda 1 más abajo — es la única de las "4 sedes" donde tuve que decidir NO seguir `hasGraph` literalmente porque el archivo nunca lo consultó a él, sino a `graph` directamente, y `graph` no cambia de significado en esta tarea.

Efecto en cascada, sin tocarlos directamente:
- `src/app/saga/[id]/page.tsx`: `known = new Set(detail.routes.map(r => r.slug))` ya excluye `"lectura"` cuando `hasGraph` es `false`, porque `buildRouteList` no la añade. Nada que cambiar ahí salvo dejar de pasar `hasGraph` a `SagaInfo` (ver §3).
- `src/components/library/saga-library-card.tsx`: sigue leyendo `card.hasGraph` tal cual — el badge `◆ Grafo` hereda el nuevo origen sin tocar el componente.

## 3. El aviso retirado

Grep antes de borrar: `graphAvailableTitle`/`graphAvailableBody` solo tenían dos apariciones cada una en todo el repo — la fila de `messages/es.json` y `src/components/saga/saga-info.tsx` (una el `t(...)` real en el JSX, otra en un comentario). Ningún otro consumidor (ni tests, ni e2e). Confirmado con grep repo-wide después del borrado: cero coincidencias.

- Quitado el bloque `<aside>` de `graphAvailableTitle`/`graphAvailableBody` en `saga-info.tsx`.
- `hasGraph` era un prop de `SagaInfo` usado solo por ese bloque: al quitarlo se queda sin consumidor, así que también quité el prop de la firma y de `SagaDetailPage` (`src/app/saga/[id]/page.tsx`) para no dejar un parámetro muerto. `detail.hasGraph` se sigue pasando donde sí hace falta (visibilidad de la pestaña Mapa).
- Actualicé el comentario largo de `MemberCell` (Fix Task 7) que citaba `t("graphAvailableTitle")` y "el aviso de arriba" en presente — ahora dice que existió y por qué se retiró, sin dejar una referencia a una clave que ya no existe.
- Claves borradas de `messages/es.json`.

## 4. El interruptor

En `saga-meta-editor.tsx`, dentro del `<form action={formAction}>` de metadatos (nombre/sinopsis/acento) — el mismo `useActionState(updateSagaMeta.bind(null, sagaId), ...)` que ya guardaba esos tres campos, sin mecanismo aparte (no es como universo padre/portada/borrado, que son acciones inmediatas fuera del form: el switch entra en el submit normal). `updateSagaMeta` (`curation-actions.ts`) ahora también escribe `show_map: formData.get("show_map") === "on"` — un checkbox sin marcar no manda su campo en `FormData`, así que su ausencia ya es `false`, sin tercer estado que gestionar.

Copia: añadida en el namespace `sagaEditor` (tal y como pedía el brief), no en `saga` — aunque el resto del formulario de metadatos usa `t = useTranslations("saga")`, añadí un segundo `useTranslations("sagaEditor")` solo para `showMapLabel`/`showMapHint`, siguiendo la instrucción literal del brief en vez de "corregirla" a mi criterio.

Gate `collaborator+`:
- Acción: `updateSagaMeta` ya llamaba a `requireCollaborator()` al principio (sin cambios — el switch viaja en el mismo `formData` que ya estaba gateado).
- BD: la policy `UPDATE` genérica de `sagas` (ver §1) ya cubre `show_map`.

`src/app/saga/[id]/editar/page.tsx` selecciona `show_map` y lo pasa como `initial.showMap`.

## 5. `?ruta=lectura` con el interruptor apagado

Sin tocar `src/app/saga/[id]/page.tsx` en su lógica de resolución — ya hacía exactamente lo que pedía el brief: `known = new Set(detail.routes.map(r => r.slug))`; con el interruptor apagado, `buildRouteList` nunca añade `"lectura"` a `detail.routes`, así que `known.has("lectura")` es `false` y la cadena de precedencia (`?ruta=` → `?orden=publicacion` legado → ruta adoptada → primera ruta → `"publicacion"`) cae al siguiente eslabón exactamente igual que con cualquier slug inventado o una ruta curada borrada. No hay caso especial que programar: la ruta activa nunca se queda en blanco porque el mecanismo de fallback ya trataba "lectura" como una ruta cualquiera que puede no estar en la lista.

Verificado en navegador (ver §6): con el interruptor apagado, `GET /saga/33d7bb93.../?tab=map&ruta=lectura` no da 404 ni deja el visor vacío — cae a la primera ruta disponible (la curada "La Guardia") y la pinta con normalidad.

## 6. Verificación en navegador (dev)

Servidor único `next dev` en el 3000 (Node 22 vía fnm), sesión ya autenticada como `bibliosharecollab` (rol suficiente para editar). Usé `[QA Itinerarios] Universo` (`33d7bb93-da3d-4453-a6da-1722beff134d`, 3 miembros, 1 itinerario curado "La Guardia", `show_map` inicial `false`):

1. **Estado inicial (switch off)**: en Info no aparece ningún aviso "Orden de lectura disponible" (retirado). La pestaña "Mapa de lectura" existe (por el itinerario). El selector de rutas ofrece "La Guardia" y "Publicación" — **no** "Orden de lectura".
2. **`?tab=map&ruta=lectura` con switch off**: no se queda en blanco ni da error; cae a "La Guardia" (la primera ruta disponible), con su contenido normal.
3. **Enciendo el interruptor** en `/saga/.../editar` ("Enseñar el mapa de lectura", con su hint visible tal cual el JSON) y guardo → confirmado en BD (`show_map=true`).
4. **Con switch on**: en la ficha, el selector ahora ofrece "Orden de lectura" primero, luego "La Guardia", luego "Publicación". Clic en "Orden de lectura" → renderiza el grafo derivado (leyenda + nodos "[QA Itinerarios] La Guardia" visibles), sin errores en consola.
5. **Apago el interruptor** y guardo → confirmado en BD (`show_map=false`, valor original).
6. **De vuelta en la ficha**: "Orden de lectura" desaparece del selector otra vez; la pestaña "Mapa de lectura" **sigue viva** (el itinerario "La Guardia" la sostiene) con "La Guardia"/"Publicación" en el selector — estado idéntico al del paso 1.
7. **Saga preexistente con mapa** (`69c07496-9b1a-4203-b3da-15d22a09c039`, `[QA Sagas v2] Universo`, la única con `saga_nodes` en este dev, migrada a `show_map=true`), **sin tocarla**: su ficha sigue ofreciendo "Orden de lectura" y pintando el grafo con normalidad — la migración no le quitó nada.

No verifiqué en navegador el badge `◆ Grafo` de la card de Mi Biblioteca (ninguno de los dos usuarios de dev sigue ninguna saga; habría tenido que insertar una fila en `saga_follows` solo para la prueba visual). Cubierto en su lugar por un test unitario nuevo en `build-library-saga-cards.test.ts` que fija `showMap=false` con miembros presentes y comprueba `hasGraph === false`.

**Semilla de dev**: restaurada. La única fila que toqué (`33d7bb93...show_map`) quedó en `false`, igual que antes de mis pruebas. No toqué `saga_follows`, `saga_routes` ni ninguna otra tabla.

## 7. Pruebas automatizadas

- `src/lib/sagas/get-saga-routes.test.ts`: nuevo test "Task 4-bis: hasGraph=false ... — «lectura» desaparece pero las curadas y «Publicación» siguen", con una ruta curada de por medio (el test preexistente "sin grafo, «lectura» no se ofrece" ya cubría el caso sin curadas).
- `src/lib/sagas/build-library-saga-cards.test.ts`: helper `saga(...)` ganó un parámetro `showMap` (default `true`, para no tocar los ~15 tests existentes que asumían "hasGraph = ¿hay miembros?"); nuevo test que fija `showMap=false` con miembros y comprueba `hasGraph === false` en la card.

`npx vitest run` (Node 22 vía `fnm use 22`): **66 test files, 536 tests, todos en verde**.

`npx tsc --noEmit`: limpio, pero solo después de regenerar `src/lib/supabase/database.types.ts` (ver duda 2).

## 8. Dudas / avisos para quien revise

1. **`/saga/[id]/mapa/page.tsx` no lee `hasGraph`, lee `graph`.** El brief afirma que `hasGraph` "ya está cableado" en esta página junto a las otras 3, pero el código real comprueba `if (!graph) redirect(...)`, no `if (!hasGraph)`. Antes de esta tarea ambas cosas coincidían (`hasGraph` era literalmente `graph !== null`), así que la distinción no importaba. Ahora sí: con el interruptor apagado pero con nodos curados (`graph !== null`), esta página **sigue enseñando el mapa a quien entre por URL directa**, aunque el curador haya decidido que esa saga no lo anuncia ni lo ofrece en el selector ni en el badge. Seguí la instrucción literal del brief ("ya trata el caso «sin mapa»: compruébalo y respétalo") y no toqué el archivo — pero si la intención real es que el interruptor apagado oculte el mapa en TODOS los accesos (no solo en el selector/badge/aviso), esta página necesita el mismo `hasGraph` que las otras tres. Lo dejo señalado en vez de decidirlo por mi cuenta.
2. **`src/lib/supabase/database.types.ts` estaba desactualizado** respecto al dev real incluso antes de esta tarea (no traía `show_map`, evidentemente, pero confirma que nadie regenera este archivo automáticamente). Lo actualicé a mano (añadí `show_map` a `Row`/`Insert`/`Update` de `sagas`) porque `generate_typescript_types` devolvió un payload de ~80k caracteres que el tool truncaba y no pude volcar entero de una vez; edité solo la sección de `sagas` en vez de sustituir el archivo completo. Vale la pena una regeneración completa en algún momento por alguien con mejor tooling para archivos grandes, para pillar cualquier otra deriva que no toque esta tarea.
3. **La cifra "4" del contrato de verificación no coincide con el dev real** (ver §1) — dev tiene 1 saga con `saga_nodes`, no 4. Apliqué la migración tal cual el brief y reporto el número real en vez de ajustarlo a lo esperado.
4. **No probé el badge `◆ Grafo` de Mi Biblioteca en navegador** por falta de un `saga_follows` de partida en dev (ver §6) — cubierto solo por test unitario, no por verificación visual.

## Arreglo tras la revisión: el interruptor manda en el origen

La duda 1 de §8 se confirmó: dos vías rotas, las dos verificadas en vivo con
el interruptor apagado.

- **`src/app/saga/[id]/mapa/page.tsx`**: `if (!graph) redirect(...)` — un link
  directo a `/saga/[id]/mapa` pintaba el grafo a pantalla completa aunque
  `hasGraph` fuera `false`.
- **`src/components/saga/saga-map-tab.tsx`**: el panel de grafo resaltado de
  una ruta curada se pintaba comprobando solo `detail.graph !== null`
  (`activeRoute !== "publicacion" && activeRoute !== "lectura" && graph`), sin
  mirar `hasGraph`/`showMap`. Como la pestaña sigue viva con el interruptor
  apagado (los itinerarios curados la sostienen), bastaba con abrir un
  itinerario en escritorio (`lg:flex`) para ver el mapa.

### El arreglo: `resolveSagaGraph`, en `src/lib/sagas/get-saga-detail.ts`

En vez de parchear los dos sitios por separado, el interruptor pasa a mandar
en el origen. Nueva función pura y exportada:

```ts
export function resolveSagaGraph(showMap: boolean, derivedGraph: SagaGraph): SagaGraph | null {
  if (!showMap) return null;
  return derivedGraph.nodes.length > 0 ? derivedGraph : null;
}
```

`getSagaDetail` la usa para construir `graph` (antes:
`derivedGraph.nodes.length > 0 ? derivedGraph : null`, sin mirar `showMap`
para nada — solo `hasGraph` lo hacía). `hasGraph` vuelve a ser la tautología
`graph !== null`, exactamente como antes de que `showMap` existiera; se
mantiene como campo aparte (no inline) porque sigue siendo el nombre que
cuenta la intención en el badge de la card y la ruta sintética `lectura`.

Con `graph` ya `null` cuando el interruptor está apagado, los dos sitios de
arriba quedan arreglados SIN tocar su lógica: los dos ya comprobaban
`graph`/`!graph`, así que heredan la corrección por construcción. Cualquier
consumidor futuro que compruebe `graph !== null` la hereda también, sin tener
que acordarse de `showMap`.

### Consumidores de `detail.graph` y `hasGraph`: censo antes de tocar nada

Grep de `\.graph\b|hasGraph` en `src/` (ver detalle en la sección original más
arriba, §2). Repasados uno a uno contra `graph: null`:

| Consumidor | Qué mira | ¿Se rompe con `graph: null` en el interruptor apagado? |
|---|---|---|
| `src/app/saga/[id]/mapa/page.tsx` | `detail.graph` (`!graph` → redirige) | No — es exactamente el bug que arregla. |
| `src/components/saga/saga-map-tab.tsx` (panel resaltado de ruta curada) | `detail.graph` (`&& graph`) | No — mismo bug, arreglado. La pestaña en sí sigue viva: su condición de montaje en `page.tsx` es `detail.hasGraph \|\| detail.routes.some(r => !r.synthetic)`, y con un itinerario curado presente la segunda mitad es `true` sin importar `graph`. |
| `src/components/saga/saga-map-tab.tsx` (rama `lectura`, timeline + `MapCta` mini-preview) | `detail.graph` (`activeRoute === "lectura" && graph`) | No — inalcanzable con el interruptor apagado: `buildRouteList` nunca añade el slug `"lectura"` a `detail.routes` cuando `hasGraph` es `false`, así que `activeRoute` no puede valer `"lectura"` (la cadena de fallback de `page.tsx` cae al primer slug conocido). El mini-preview del CTA (`map-cta.tsx`) vive dentro de esa misma rama muerta: nunca se le llama con el interruptor apagado. |
| `src/app/saga/[id]/page.tsx` (visibilidad de la pestaña Mapa) | `detail.hasGraph` | No — no usa `graph` directamente, y `hasGraph` no cambia de fórmula efectiva (sigue siendo `false` exactamente en los mismos casos: sin nodos curados O interruptor apagado). |
| `src/lib/sagas/get-saga-routes.ts` (`buildRouteList`) | recibe `hasGraph: boolean` como parámetro puro | No — sin cambios de firma; el llamador le sigue pasando el mismo booleano, ahora derivado de `graph !== null` en vez de calculado aparte. |
| `src/components/library/saga-library-card.tsx` / `build-library-saga-cards.ts` | su propio `hasGraph: root.showMap && tree.length > 0`, calculado independientemente (no usa `SagaDetail.graph`) | No — función distinta, fuera del alcance de este arreglo; ya incorporaba `showMap` desde el Task 4-bis original. |

Ningún consumidor necesitaba el mapa con el interruptor apagado — no hizo
falta parar ni pedir excepción.

### Cobertura nueva: `resolveSagaGraph`, con inyección de fallo

`src/lib/sagas/get-saga-detail.test.ts`, cuatro casos nuevos (`describe("resolveSagaGraph")`):
interruptor apagado con nodos curados (el caso exacto de los dos bypasses) →
`null`; interruptor encendido con nodos → el grafo tal cual; interruptor
encendido sin nada curado → `null`; interruptor apagado y vacío → `null`.

Inyección de fallo: comentada temporalmente la línea `if (!showMap) return null;`
dentro de `resolveSagaGraph` y ejecutado `npx vitest run src/lib/sagas/get-saga-detail.test.ts`:

```
❯ src/lib/sagas/get-saga-detail.test.ts (19 tests | 1 failed)
  × interruptor apagado, aunque haya nodos curados: null — el interruptor manda en el origen
  AssertionError: expected { Object (nodes, edges) } to be null
  - Expected: null
  + Received: { edges: [], nodes: [{ id: "n1", ... }] }

Test Files  1 failed (1)
     Tests  1 failed | 18 passed (19)
```

Justo el test que prueba la regla cae; los otros 18 (incluidos los tres casos
sanos de `resolveSagaGraph`) siguen en verde porque no ejercitan el camino
`showMap=false` con nodos. Revertido el comentario inmediatamente después.

### Verificación completa tras el arreglo

`fnm use 22` (v22.23.1) antes de todo. `npx vitest run`:

```
Test Files  66 passed (66)
     Tests  540 passed (540)
```

(536 del informe original + 4 nuevos de `resolveSagaGraph`.)

`npx tsc --noEmit`: sin salida, limpio.

### Verificación en navegador (dev, `next dev` único en el 3000, Node 22)

Saga `[QA Itinerarios] Universo` (`33d7bb93-da3d-4453-a6da-1722beff134d`),
`show_map=false` de partida, con la curada "La Guardia":

1. **Interruptor apagado — vía 1 (URL directa)**: `GET /saga/33d7bb93.../mapa`
   → NO pinta el grafo a pantalla completa; redirige a `/saga/33d7bb93...`
   (confirmado con `location.href` tras la navegación: aterriza en la ficha,
   título de página sin el sufijo "· Mapa").
2. **Interruptor apagado — vía 2 (pestaña con itinerario curado)**:
   `GET /saga/33d7bb93...?tab=mapa&ruta=la-guardia` en viewport de escritorio
   (1280×900, para forzar la clase `lg:flex`) → el selector de rutas ofrece
   "La Guardia" y "Publicación" (no "Orden de lectura"); el itinerario se
   pinta con normalidad (`Llevas 0 de 2 de esta ruta`, `01 · [QA Itinerarios]
   La Guardia · 2 obras`); consulta al DOM (`document.querySelectorAll('.react-flow')`
   y `.rounded-2xl.border.border-border`) devuelve **0** en los dos casos — el
   panel de grafo NO se monta.
3. **Interruptor encendido (regresión)**: activado con SQL directo
   (`update sagas set show_map = true where id = '33d7bb93...'`) para el
   mismo registro que toca el brief:
   - `GET /saga/33d7bb93.../mapa` → se queda en la URL del mapa (título con
     sufijo "· Mapa"), ya no redirige.
   - `?tab=mapa&ruta=la-guardia` → el selector ahora SÍ ofrece "Orden de
     lectura" primero; `.react-flow` aparece **1** vez y el panel
     `.rounded-2xl.border.border-border` también — el grafo resaltado se
     pinta junto al itinerario, comportamiento idéntico al de antes de este
     arreglo.
   - Revertido a `show_map=false` con SQL directo inmediatamente después;
     confirmado con `select show_map` → `false`. Semilla de dev restaurada al
     estado de partida, ninguna otra fila tocada.
4. **Saga preexistente con mapa** (`69c07496-9b1a-4203-b3da-15d22a09c039`,
   `[QA Sagas v2] Universo`, `show_map=true`, sin tocar en esta verificación):
   `GET /saga/69c07496.../mapa` sigue pintando el mapa a pantalla completa con
   normalidad — el arreglo no le quita nada a una saga que sí anuncia su mapa.

Un solo `next dev` en el 3000 durante toda la verificación; detenido al
terminar.
