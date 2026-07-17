# El pase como hub — diseño

Fecha: 2026-07-15
Esquemas de referencia (mockups):
- `Paper - Flujo de pases.html` (las 7 reglas del ciclo de vida)
- `Paper - Modelo de datos.html` (ER de la propuesta, secciones 1–7)

## Problema

El modelo de PR #32 dejó el registro personal repartido en dos ejes: el
**estado** (Pendiente/Leyendo/Leído/Dejado), el cursor y la cola viven en
`library_entries`, mientras que el **pase** (`diary_entries`) posee nota,
reseña y edición, y se abre y cierra como *efecto secundario* del cambio de
estado (`passEffect`). Al contrastar la app con el esquema del flujo de pases
salieron cuatro divergencias y un fallo real:

1. En el esquema el pase **nace en Pendiente**; en la app el pase no existe
   hasta que empiezas.
2. Retomar un abandonado reabre el mismo pase en el esquema; en la app abre
   uno nuevo y el intento anterior pierde continuidad.
3. El esquema cierra el pase **automáticamente** al llegar al final (última
   página, último episodio); en la app el cierre es siempre manual.
4. En series los episodios vistos son una capa acumulativa global: un
   revisionado no tiene cursor propio y el "último episodio" ya está marcado
   desde el principio.
5. **Fallo:** el formulario de sesión escribe el estado directamente en
   `library_entries` sin pasar por `passEffect`
   (`src/lib/sessions/actions.ts`): marcar "Leído" en la sesión final deja el
   pase abierto y sin hoja de cierre.

Decisión de fondo (elegida con los costes delante): **migración literal** — el
pase pasa a ser el hub que dibuja el esquema del modelo de datos, y
`library_entries` desaparece.

## Modelo

### La tabla del pase

`diary_entries` se **renombra a `passes`**. El motivo por el que no se renombró
en PR #32 (nada la referenciaba por FK y no se tocaba RLS) deja de ser cierto:
gana FKs entrantes y las políticas se reescriben igualmente.

| Grupo | Columnas | Origen |
|---|---|---|
| Identidad | `id`, `user_id`, `item_type`, `item_id`, `edition_id` (null) | como hoy (obra polimórfica; sin tabla Obra única) |
| Ciclo de vida | `status` (planned·in_progress·completed·dropped), `is_active` bool, `started_on`, `finished_on` | `status` y fechas absorbidos de `library_entries` |
| Cursor | `position` jsonb (página / T·E) | movido de `library_entries` |
| Contexto de biblioteca | `queue_id`, `queue_order`, `pinned_order` | movidos de `library_entries` |
| Valoración | `rating`, `review`, `is_public` | sin cambios |

Semántica:

- **Abierto** = planned o in_progress. **Cerrado** = completed o dropped
  (`finished_on` sellado).
- **Activo** = el pase que tu biblioteca muestra. Puede estar cerrado: leíste
  el libro y sigue saliendo como Leído hasta que abras otro pase.
- Invariante en BD: **un solo pase activo por (usuario, obra)** — índice único
  parcial sobre (`user_id`, `item_type`, `item_id`) `where is_active`.
- `queue_*` y `pinned_order` solo significan algo en el pase activo. Al abrir
  pase nuevo se hereda el fijado; la cola se limpia al salir de planned
  (regla actual, §7.22).

### Derivaciones

- **"Está en mi biblioteca"** = existe pase activo.
- **Añadir a biblioteca** = crear pase activo en planned (el pase nace en
  Pendiente, como en el esquema).
- **Quitar de biblioteca** = borrar todos los pases de esa obra (con
  confirmación), como hoy.
- **Media de comunidad**: último pase cerrado no abandonado de cada usuario —
  misma regla, el número no se mueve.
- `pase.numero` (1ª, 2ª lectura) se deriva del orden; no hay columna.
- No se materializa `valoracion_media` en la obra.

### Tablas satélite

- `progress_sessions`: `pass_id` pasa a **not null**; `library_entry_id` se
  elimina tras el backfill.
- `episode_watches`: gana `pass_id` (backfill: al pase activo de cada serie).
  Materializa el **cursor por pase** en series. "Visto alguna vez" = unión
  sobre todos los pases del usuario.

### Lo que queda como vista conceptual del esquema

Sin cambio físico: `books` / `movies` / `series` no se funden en una tabla
Obra, `book_editions` / `movie_versions` no se funden en una Edición, y no
hay tabla Temporada (sigue siendo columna `season`). El discriminador real es
`item_type`.

## Transiciones

La máquina de estados deja de ser "estado de la entrada + efectos"
(`passEffect`) y pasa a ser **la máquina del propio pase**: un único módulo
(`src/lib/passes/transitions.ts`, reescrito) por el que pasan TODAS las
escrituras de estado — ficha, formulario de sesión, cualquier acción futura.
Eso elimina de raíz el fallo 5.

- **Pendiente → Leyendo**: mismo pase, sella `started_on`.
- **→ Completado**: sella `finished_on` y encadena la **hoja de cierre**
  (fecha, estrellas, reseña, visibilidad — saltable; se completa después
  desde el diario). El pase queda cerrado pero sigue activo.
- **→ Abandonado**: sella `finished_on`; el cursor queda congelado
  ("dejado en pág. 210").
- **Retomar un abandonado**: hoja con dos salidas — **continuar** (reabre el
  MISMO pase: `finished_on` a nulo, vuelve a Leyendo con cursor y sesiones) o
  **empezar de cero** (archiva y abre pase nuevo en Leyendo).
- **Nuevo pase / relectura**: sobre un activo cerrado, volver a Leyendo
  archiva el anterior (`is_active = false`) y abre uno nuevo — hereda fijado,
  cursor a cero.
- **Película**: Pendiente → Vista en un gesto (el pase pendiente se cierra
  directamente); la hoja de cierre es toda la interacción. Sin estado
  intermedio ni sesiones.

**Auto-cierre** (regla 5 del esquema de flujo): en libros, la sesión cuya
página alcanza el total de **tu edición** dispara la transición a Completado
con su hoja encadenada. En series, marcar el último episodio del catálogo
entre los vistos **del pase** hace lo mismo — funciona igual en revisionados
porque el cursor es por pase. El auto-cierre pasa por la misma máquina, no es
un caso aparte.

**Serie, detalle**: el cursor del pase se deriva del episodio más avanzado
marcado en ESE pase (`rollSeriesProgress` acotado a `pass_id`).

## Interfaz

Casi toda la UI cambia de fuente de datos, no de forma:

- **Biblioteca y filtros**: leen pases activos; contadores por estado del
  pase activo.
- **Ficha · Registro**: la de PR #32 tal cual, pero el segmented escribe a
  través de la máquina. Dos hojas nuevas: **retomar** (continuar / de cero) y
  el encadenado del auto-cierre a la hoja de cierre existente.
- **Diario**: ya es la lista de pases; gana el acceso explícito "releer"
  (nuevo pase).
- **Página de sesión**: mismo formulario; el selector de estado pasa por la
  máquina; la sesión que llega al final vuelve con la hoja de cierre abierta.
- **Pestaña Episodios**: dos capas — episodios del pase actual (cursor) y
  vistos alguna vez (unión, atenuados).
- **Cola, fijados, perfil, feed, notificaciones**: mismas pantallas,
  consultas re-apuntadas.

La palabra "pase" sigue sin aparecer en la interfaz.

## Migración (con red)

1. Columnas nuevas en `diary_entries` + backfill: cada `library_entry`
   engendra o adopta su pase activo (las pendientes sin pase crean uno en
   planned; las que tienen pase abierto lo adoptan como activo in_progress;
   las completadas/abandonadas marcan activo su último pase cerrado).
2. `progress_sessions.pass_id` a not null; `episode_watches.pass_id`
   backfilled.
3. Rename `diary_entries` → `passes`; RLS, feed, notificaciones e
   interacciones re-apuntados en la misma tanda ordenada.
4. `library_entries` queda **huérfana en solo-lectura** como red de revert;
   se elimina en una limpieza posterior.
5. Consultas de control antes/después: nº de entradas = nº de pases activos;
   media y nº de notas por obra idénticas; cero sesiones ni vistos huérfanos.
6. Se aplica y verifica en dev; prod se comprueba contra el repo antes de dar
   por desplegado (lección del 2026-07-14: mergear no aplica migraciones).

## Fase siguiente (spec propia): ejemplar y acceso

Decidido en este mismo brainstorm, se diseñará como Spec 2 sobre el modelo ya
migrado:

- Tabla `ejemplar` (posesión durable): `user_id`, `item_type`+`item_id`
  (ancla a la obra), `edition_id` (null), formato, procedencia, precio,
  moneda, fecha de adquisición, estado físico, prestado_a, ubicación, notas.
  `pase.ejemplar_id` opcional ("leído en").
- `pase.acceso` (jsonb): cine / streaming / alquiler / préstamo / biblioteca,
  con plataforma-sala, precio y formato. Captura el gasto sin forzar posesión.
- Alimenta estadísticas de colección y gasto.

## Fuera de alcance

- `edicion_manual` (snapshot XOR FK de edición no catalogada) — aplazada: el
  alta automática por ISBN ya cubre casi todo y el snapshot obliga a que
  cursor, validación y cierre miren dos fuentes.
- Fusión física en tablas Obra/Edición únicas; tabla Temporada.
- Suscripciones como entidad transversal (gasto mensual).
- Borrado definitivo de `library_entries` (limpieza posterior).

## Riesgos

- **La migración toca RLS, feed, notificaciones e interacciones** — todo lo
  que hoy nombra `diary_entries` o `library_entries`. Mitigación: tanda única
  ordenada, red de revert, consultas de control.
- **Invariante nuevo** (un activo por usuario+obra) garantizado en BD, no
  solo en código: los cambios de estado pueden llegar en paralelo.
- **Rendimiento de biblioteca**: índice sobre (`user_id`, `is_active`) para
  la vista principal.
- **Divergencia dev/prod**: comprobar prod contra el repo antes y después.

## Verificación

E2E Playwright (estándar del proyecto, `docs/TESTING.md`):

- añadir libro → leer → sesión final con auto-cierre y hoja encadenada;
- abandonar → retomar por ambas ramas (continuar / de cero);
- relectura con dos ediciones distintas;
- película marcada Vista de golpe;
- serie con revisionado: cursor por pase y capa "visto alguna vez";
- cola y fijados supervivientes a la migración.

Unit tests (Vitest) para la máquina de transiciones nueva. Más las consultas
de control de la migración (punto 5).
