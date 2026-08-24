# Ocultar las obras abandonadas de mi biblioteca — diseño

> **[Canónico · verificado contra el repo el 2026-08-24]**
> Anclas de código comprobadas contra `origin/main` (`ae1aec34`) el 2026-08-24. El estado de la
> feature vive en `docs/requirements/backlog.md`; lo accionable, en issues. Esta spec describe el
> diseño acordado, **no** lo implementado: mientras no exista la PR, aquí no hay nada en producción.

## De dónde sale

Del uso del producto. En palabras del responsable:

> «Quiero que en mi biblioteca tenga una opción y que pueda ser por defecto de ocultar los items que
> haya abandonado».

El problema es de ruido, no de datos: una biblioteca larga acumula obras que el usuario dejó a
medias y que ya no piensa retomar, y hoy compiten por el mismo espacio que las vivas en todas las
rejillas. Abandonar es información valiosa —las estadísticas de abandono existen y se acaban de
ampliar— pero **quererla en las estadísticas no es quererla en la estantería**.

## Lo que hay hoy

Verificado leyendo el código, no supuesto:

| | |
|---|---|
| Estado vivo | `passes` con `is_active = true`; `status` ∈ `planned` · `in_progress` · `completed` · `dropped` |
| Biblioteca del dueño | `/coleccion?tab=todo` (`src/app/coleccion/page.tsx`) |
| Query central | `getLibraryItems` (`src/lib/library/get-library-items.ts:296`) |
| Filtros | por URL, server-side, sin JS de cliente (`src/components/library/library-filters.tsx`) |
| Preferencia persistente, precedente | `profiles.show_optional_readings`, `profiles.daily_goal_minutes` |
| Interruptor persistente, precedente de UI | `PostPreferences` (`src/components/social/post-preferences.tsx`), `role="switch"` + server action |

**`getLibraryItems` tiene diez sitios de llamada, y la mayoría NO deben perder filas.** Esta es la
restricción que gobierna el diseño entero:

| Llamada | ¿Le afecta el ocultado? |
|---|---|
| `src/app/coleccion/page.tsx:328` — rejilla «Todo» | **sí** |
| `src/app/coleccion/page.tsx:273` — destacados del dueño | **sí** |
| `src/app/u/[username]/_tabs/collection-tab.tsx:70` — rejilla del perfil | **sí** (preferencia del dueño) |
| `src/app/u/[username]/_tabs/collection-tab.tsx:75` — destacados del perfil | **sí** (preferencia del dueño) |
| `src/app/api/export/route.ts:44` — export CSV | no |
| `src/components/clubs/activity-actions.ts:23` — elegir obra en un club | no |
| `src/lib/library/collection-actions.ts:123` — buscar obra para añadir a colección | no |
| `src/components/stats/today-block.tsx:44` y `:71` | no (ya filtran por `status`) |
| `src/lib/stats/get-today-focus.ts:113` | no (ya filtra por `status`) |

Fuera de `getLibraryItems`, dos queries más pintan obras propias: `getCollection`
(`src/lib/library/collections.ts:187`) y `getUncollectedItems` (`:142`).

## Alcance

### Entra

- Preferencia persistente por usuario: «ocultar obras abandonadas», apagada por defecto.
- Se aplica a las cuatro vistas de «lo mío»: rejilla «Todo», detalle de colección, tira «Sin
  colección» y destacados/favoritos — más la pestaña Colección del perfil público, con la
  preferencia **del dueño**.
- Anulación por vista, sin tocar la preferencia: chip en «Filtros» y línea «N ocultos · Mostrar».
- Recuentos coherentes con lo que se ve.

### No entra — límite duro

- **Las estadísticas no se tocan.** `/estadisticas` mide el histórico de pases, incluidos los
  abandonos, y ese es su trabajo. Ocultar ahí vaciaría los paneles de abandono que existen hoy.
- **El export CSV no se toca.** Es la copia de seguridad de los datos del usuario; perder filas ahí
  es difícil de detectar y fácil de lamentar.
- **Ocultar otros estados** («ocultar pendientes», «ocultar completados»). Si algún día se pide, la
  columna booleana se generaliza entonces a una lista de estados ocultos — hacerlo hoy es construir
  un motor de filtros para un caso que nadie ha pedido.
- **Borrar ni archivar.** La obra sigue en la biblioteca, con su pase y su histórico; solo deja de
  pintarse.
- Un segundo idioma: `messages/` tiene un único `es.json`.

## Decisiones

**D1 · La preferencia vive en `profiles`, no en `localStorage`.** Precedente directo:
`show_optional_readings`. Viaja entre dispositivos, se lee en el servidor —así la rejilla llega ya
filtrada, sin parpadeo ni filtrado en cliente— y la pestaña Colección del perfil público **necesita**
leer la del dueño, cosa que `localStorage` no permite. `CelebrationPreferenceToggle` sí usa
`localStorage`, y su propio comentario dice que eso vale «para una preferencia de UI»; esta no lo es.

**D2 · El ocultado es opt-in por sitio de llamada, no un defecto de `getLibraryItems`.** Ver la
tabla de arriba: seis de los diez sitios de llamada romperían. Que el export pierda filas en
silencio es exactamente la clase de fallo que no se detecta hasta que hace falta el respaldo.

**D3 · Se filtra al FINAL del pipeline, no en el SQL.** Filtrar en la query de `passes` sería más
barato, pero el recuento «N abandonados ocultos» mentiría en cuanto hubiera búsqueda o género
activos: diría «3 ocultos» cuando de esos 3 solo 1 pasaba el filtro de género. El orden correcto es
tipo/estado (SQL) → hidratar → búsqueda → género → orden → **ocultar y contar** → `limit`. El coste
es hidratar unas filas que se descartan; a cambio el número que se enseña es verdad.

**D4 · `limit` se aplica DESPUÉS de ocultar.** Si no, toda vista con tope enseñaría huecos: pides 12,
se ocultan 2, se ven 10. Hoy la única que lo usa es la tira «Sin colección» (`SHELF_LIMIT = 12`),
pero el orden correcto se fija ahora y no cuando alguien añada la segunda.

**D5 · Un filtro de estado explícito gana siempre.** Con `?status=dropped` en la URL no se oculta
nada. Filtrar por «Abandonado» y ver cero resultados es un bug con cara de feature. El chip
«Abandonado» de «Filtros» sigue existiendo intacto.

**D6 · El Resumen de la biblioteca (`CollectionSummary`) NO se toca.** Es un desglose por estado con
barra apilada: el segmento `dropped` **es** la información, y borrarlo dejaría al usuario sin ningún
sitio donde ver que tiene abandonados. Además solo se pinta cuando no hay ningún filtro activo, y la
rejilla de «Todo» no muestra recuento propio, así que no hay dos números contradictorios en pantalla.
Contra esto juega que el `total` del Resumen sea mayor que lo que la rejilla enseña — lo cubre la
línea «N abandonados ocultos» que va justo debajo de la rejilla.

**D7 · La anulación viaja en la URL (`?abandonados=1`), no en la sesión.** Igual que el resto de
filtros de la biblioteca: se comparte, funciona con el botón «atrás», no necesita JS de cliente. Y
al ser explícita no puede quedarse pegada sin que el usuario lo sepa.

**D8 · `?abandonados=1` no cuenta como filtro activo y sobrevive a «Limpiar».** No es un filtro: es
una anulación de una preferencia, y enseña MÁS, no menos. Sumarlo a `activeCount` pondría el globo
«1» sobre una vista sin filtrar. Y «Limpiar» quita tipo/estado/orden/género conservando la búsqueda;
la anulación se conserva por el mismo motivo que la búsqueda: el usuario acaba de pedirla a mano.

**D10 · El detalle de colección SÍ tiene desplegable de filtros, y filtra en cliente.**
`CollectionItems` (`src/components/library/collection-items.tsx`) recibe todos los ítems y los
filtra en memoria por tipo/estado/orden. Consecuencias: (a) el ocultado se hace igualmente en
servidor, en `getCollection`, para que «N títulos» y `avgRating` cuadren con lo que se ve; (b) con
abandonados ocultos, el chip «Abandonado» de ese desplegable **no puede ser un botón de filtro
cliente** —filtraría un array del que ya se quitaron— así que pasa a ser un enlace a
`?abandonados=1`. Sin ese detalle, pedir «Abandonado» en una colección devolvería «Sin resultados»,
que es justo lo que D5 prohíbe.

**D9 · El `avgRating` del detalle de colección se calcula sobre lo visible.** Coherente con «los
recuentos cuentan lo que se ve». Una colección cuya media cambia al ocultar es la misma clase de
sorpresa que un «N títulos» que no cuadra, y se resuelve igual: la línea «N ocultos» explica la
diferencia y deja verla.

**D11 · La lógica de ocultar vive en un helper PURO, no dentro de las queries.** `getLibraryItems`
necesita un cliente Supabase entero para probarse; el fichero de tests de hoy
(`get-library-items.test.ts`) por eso solo prueba helpers puros (`filterByGenre`) y un cliente falso
mínimo. Un `splitDropped(rows, hideDropped)` genérico sobre `{ status }` se prueba en tres líneas,
sirve a la vez a `getLibraryItems` (sobre `LibraryItem[]`) y a `getUncollectedItems` (sobre filas de
`passes` con `status`, antes de hidratar), y deja a las queries siendo pegamento.

## Modelo de datos

```sql
alter table public.profiles
  add column hide_dropped boolean not null default false;
```

`not null default false` — mismo patrón que `show_optional_readings`. El defecto **false** conserva
el comportamiento actual: nadie se encuentra media biblioteca escondida tras desplegar.

**Sobre la trampa de grants por columna (#375): comprobado, aquí NO aplica.** **[MEDIDO]** El
2026-08-24, en dev y en prod, `profiles` tiene grant a nivel de **tabla**
(`information_schema.role_table_grants` devuelve `DELETE,INSERT,SELECT,UPDATE` para `anon` y
`authenticated`), no `revoke all` + `grant` fino. Una columna nueva hereda el privilegio sola. Aun
así, la superficie 6 de `docs/DRIFT-CHECK.md` se corre tras la migración: es barata y es la que
detectaría que esta suposición dejó de ser cierta.

> Ojo al leer la comprobación: `information_schema.column_privileges` lista una fila por columna
> **también** cuando el grant es de tabla. La consulta que distingue los dos casos es
> `role_table_grants`, que solo lista grants de tabla.

Orden de despliegue: `supabase-dev` primero, prod después. Verificar la columna contra los objetos
reales (`information_schema.columns`), no contra `list_migrations`.

## Capa de datos

### `getLibraryItems` — filtro nuevo, defecto sin cambios

```ts
filters: {
  // ...los de hoy
  /** Oculta las obras cuyo pase activo está en `dropped`. Sin efecto si
   *  `filters.status` viene puesto (D5). Opt-in: el defecto es `false` porque
   *  export/clubes/buscadores comparten esta función y no deben perder filas. */
  hideDropped?: boolean;
}
```

Se aplica tras `sort` y antes de `limit` (D3, D4).

### `getLibraryView` — envoltorio nuevo, el que usan las vistas propias

```ts
export async function getLibraryView(
  supabase, userId, filters
): Promise<{ items: LibraryItem[]; hiddenDropped: number }>
```

Devuelve además cuántas obras se ocultaron **con los filtros ya aplicados** — el número que pinta la
línea de aviso. `getLibraryItems` sigue existiendo con su firma de hoy y delega en la misma lógica:
los seis sitios de llamada que no deben cambiar no se tocan.

### `getCollection`

- Argumento nuevo `hideDropped`.
- `items` filtrado; `avgRating` recalculado sobre lo visible (D9).
- `CollectionDetail` gana `hiddenDropped: number`.

### `getUncollectedItems`

Hoy el `total` se cuenta sobre las claves **antes** de hidratar, así que no conoce el `status`. Se
resuelve añadiendo `status` al `select` de `passes` (la query ya se hace; es una columna más, cero
consultas extra) y filtrando las claves antes del `slice(0, limit)`. Devuelve `hiddenDropped`.

### Lectura de la preferencia

- Vistas propias: la página ya consulta `profiles` en `/coleccion` para `interests`; se añade
  `hide_dropped` al mismo `select` en la rama que ya existe, y una lectura propia en la rama que hoy
  se la ahorra.
- Perfil público: `PROFILE_COLUMNS` (`src/lib/profile/get-profile-by-username.ts:27`) gana
  `hide_dropped`, y `getProfileByUsername` lo expone como `hideDropped`. `src/app/u/[username]/page.tsx`
  ya carga el perfil y lo pasa a `CollectionTab`.
- **Nada de esto entra en una función con `use cache`** (regla #437): el resultado depende de quién
  mira. Las rutas afectadas ya declaran `export const instant = false`.

## UI

### Ajustes — dónde se fija el defecto

Sección nueva «Biblioteca» en `src/app/ajustes/page.tsx`, entre «Datos» y «Avisos»: un interruptor
`role="switch"` con la etiqueta «Ocultar obras abandonadas» y el pie «Seguirán en tu biblioteca y en
tus estadísticas; solo dejan de aparecer en las rejillas».

Componente cliente nuevo `HideDroppedToggle` (patrón de `VisibilityToggle`: `"use client"` mínimo,
`useTransition`, server action), con el aspecto de interruptor de `PostPreferences`. **No** necesita
la carga asíncrona de `PostPreferences`: `/ajustes` ya es un server component que tiene el perfil, así
que el valor inicial llega por props y se pinta correcto en el primer render.

Server action `updateHideDropped(value: boolean)` en `src/lib/profile/actions.ts` (donde ya vive
`daily_goal_minutes`), con `revalidatePath` de `/coleccion`.

### Filtros — la anulación

En `library-filters.tsx`, y **solo cuando la preferencia está activa**, un chip «Mostrar
abandonados» junto a los de estado. Emite `?abandonados=1`. Hay que propagarlo en tres sitios o se
pierde al tocar cualquier otro control:

1. `buildHref` — conservarlo como se conserva `search`.
2. Los `<input type="hidden">` del formulario de búsqueda.
3. `clearHref` — se conserva (D8).

Y **no** sumarlo a `activeCount` (D8).

### La línea de aviso

Bajo la rejilla, discreta, un enlace: `3 abandonados ocultos · Mostrar` → `?abandonados=1`.

- `/coleccion?tab=todo`: bajo `LibraryGrid`.
- `/coleccion/c/[id]`: bajo la rejilla del detalle, dentro de `CollectionItems`.
- Tira «Sin colección»: el rótulo ya dice «N títulos sin organizar»; cuenta lo visible y añade el
  sufijo de ocultos si los hay.
- Perfil público: **no se pinta**. Al visitante no le importa la preferencia del dueño, y decirle
  «hay 3 que no te enseño» es peor que no decir nada.
- Con `hiddenDropped === 0` no se pinta nada.

### Estados vacíos

Si al ocultar la rejilla se queda a cero, se pinta el `EmptyState` de siempre **y debajo la línea de
aviso**. Una biblioteca entera de abandonados que parece vacía sin explicación es el peor resultado
posible de esta feature.

### i18n — claves nuevas en `messages/es.json`

| Clave | Valor |
|---|---|
| `library.filters.showDropped` | `Mostrar abandonados` |
| `library.hiddenDropped` | `{count, plural, one {# abandonado oculto} other {# abandonados ocultos}}` |
| `library.hiddenDroppedAction` | `Mostrar` |
| `settings.librarySection` | `Biblioteca` |
| `settings.hideDroppedLabel` | `Ocultar obras abandonadas` |
| `settings.hideDroppedHint` | `Seguirán en tu biblioteca y en tus estadísticas; solo dejan de aparecer en las rejillas.` |

## Tests

**Unitarios (Vitest)** — junto a `get-library-items.test.ts`:

1. `hideDropped: true` quita las obras con pase activo `dropped` y solo esas.
2. `hideDropped: true` + `status: "dropped"` → no oculta nada (D5).
3. `hideDropped` por defecto ausente → el resultado es idéntico al de hoy (blindaje de export/clubes).
4. `hiddenDropped` cuenta **después** de búsqueda y género, no antes (D3): biblioteca con abandonados
   de dos géneros, filtrada a uno → el número refleja solo ese género.
5. `limit` se aplica después de ocultar (D4): pedir 5 con 2 abandonados en medio devuelve 5.
6. `getCollection` con `hideDropped` → `items`, `hiddenDropped` y `avgRating` sobre lo visible (D9).
7. `getUncollectedItems` → `total` y `hiddenDropped` coherentes con `items`.

**E2E (Playwright)** — spec nueva `e2e/biblioteca-ocultar-abandonados.spec.ts`, con el patrón de
`e2e/sagas-opcionales-saltables.spec.ts`: leer el valor de partida de `profiles.hide_dropped` por
API y restaurarlo al terminar.

1. Ajustes → activar → `/coleccion?tab=todo` no muestra la obra abandonada y sí la línea «1
   abandonado oculto».
2. Pulsar «Mostrar» → aparece; la preferencia sigue activa (volver a `/coleccion` la vuelve a ocultar).
3. Filtrar por estado «Abandonado» con la preferencia activa → sí aparece.
4. Detalle de una colección que contiene la abandonada → «N títulos» cuenta lo visible y hay línea de
   aviso.

Correr los e2e contra build de producción, no solo `next dev` (regla #437: los fallos de
`next-request-in-use-cache` pasan `next build` y salen en `next start`).

## Riesgos y trampas

| Riesgo | Mitigación |
|---|---|
| Columna nueva sin `grant` rompe toda escritura en `profiles` (#375) | No aplica: grant de TABLA, medido en dev y prod el 2026-08-24. Se corre igual la superficie 6 por si eso cambia |
| Filtrar en `getLibraryItems` por defecto y vaciar el export | D2: opt-in; test 3 lo blinda |
| Contar los ocultos antes de los filtros y enseñar un número falso | D3; test 4 |
| Rejilla vacía sin explicación | Línea de aviso también en el estado vacío |
| `?abandonados=1` que se pierde al tocar un filtro | Los tres puntos de propagación; e2e 2 |
| Alguien decide «ya que estamos» ocultar también en estadísticas | Está en «No entra», con el motivo |

## Definición de hecho

1. Migración aplicada en dev y en prod, verificada contra los objetos reales.
2. `docs/requirements/data-model.md`: `profiles.hide_dropped` documentada + fecha de verificación.
3. Superficie 6 de `docs/DRIFT-CHECK.md` corrida (columna nueva ⇒ grants).
4. `docs/requirements/backlog.md`: comprobado. Esta feature **no** está en el backlog (nació de una
   petición directa, no de la lista de «features que no existen»), así que no hay casilla que marcar
   salvo que alguien la haya anotado entre medias.
5. `docs/requirements/decisiones.md`: entrada **al final** con D2 (opt-in por sitio de llamada) y D6
   (el Resumen no se toca) — son las dos que alguien deshará sin querer en un refactor.
6. Unitarios y e2e en verde.

## Issues a abrir

- **Generalizar a otros estados** (`tipo:acta`, `P3`): por qué `hide_dropped` es un booleano y no una
  lista de estados ocultos, para que nadie lo reimplemente como motor de filtros leyendo esta spec.
- **Coherencia del Resumen** (`tipo:deuda`, `P2`): con la preferencia activa, el `total` del Resumen
  cuenta abandonados y la rejilla no. Es deliberado (D6) y lo explica la línea de aviso; si molesta
  en uso real, la salida es un matiz en el Resumen, no ocultar el segmento.
