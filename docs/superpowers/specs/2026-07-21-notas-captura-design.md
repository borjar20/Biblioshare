# Notas y citas · captura y cuaderno — diseño

> **[Histórico · congelado 2026-07-21]** Redactada el 2026-07-21 y **ya construida**:
> Plan A en la PR #110, Plan B (el cuaderno `/notas`) a continuación. Explica el
> *porqué*, no el *hoy*: para el estado actual manda `backlog.md`, y para el
> esquema `data-model.md`. **§4 se construyó con dos órdenes, no tres** — ver la
> nota dentro de esa sección y la entrada de `decisiones.md` del 2026-07-21.
>
> Cubre la captura de notas/citas y su relectura. Avanza las entradas de backlog
> **§7.27** (citas y frases destacadas) y **§7.24** (notas ancladas al progreso).
>
> **Sustituye a `docs/superpowers/specs/2026-07-20-Notas`**, que describe una tabla
> `notes` que no es la que existe (ver §0). Aquella sigue siendo útil como mapa de
> las fases F2-F3 (muro público, spoiler-safe, tarjeta compartible, OCR), que esta
> spec no toca.
>
> Para el esquema canónico manda [`data-model.md`](../../requirements/data-model.md).
> La migración que propone §2 se aplicó en dev y prod con Plan A; **Plan B no
> añadió ninguna**.

## 0. Punto de partida, verificado contra prod

Comprobado el 2026-07-21 contra los objetos reales (`information_schema.columns`,
`pg_constraint`, `pg_policy`), no contra el ledger de migraciones ni el backlog.
Cuatro cosas que la spec anterior daba por ciertas y no lo son:

| Lo que decía la spec previa | Lo que hay en prod |
|---|---|
| «`notes` guarda nota y cita mezcladas, **sin distinción de tipo**, **sin anclaje a posición**» | Ambas columnas existen: `kind text` con `CHECK (kind IN ('note','quote'))` y `position jsonb`. `addNote` las escribe; `getNotes`/`countNotes` las leen |
| D1: «unificar con un discriminador `kind` (`cita \| nota`)» | Ya está unificado, y los valores son **`note` / `quote`**, en inglés. Escribir `'cita'` viola el CHECK |
| §2 y D5: «las notas **cuelgan del pase**», de ahí «agregar entre todos los pases» | Cuelgan del **ítem**: `item_type`/`item_id` son `NOT NULL`; `pass_id` y `session_id` son FKs *opcionales* (`ON DELETE SET NULL`). «Citas de esta obra» es un `where item_id = ?` |
| §0: «captura rota» | La captura **funciona** (`AddNoteForm` → `addNote`, con tipo, página y favorita). Está *enterrada* en `log-panel`, que es otro problema |

Además, la spec previa no menciona `is_favorite`, que existe y es lo que alimenta
hoy la tarjeta Memorizar.

**Estado real de la tabla** (`public.notes`):

```
id uuid pk · user_id uuid NOT NULL → auth.users
item_type item_type NOT NULL · item_id uuid NOT NULL     -- la nota es de la OBRA
pass_id uuid NULL → passes(id) ON DELETE SET NULL         -- opcional, hoy siempre null
session_id uuid NULL → progress_sessions(id) ON DELETE SET NULL  -- idem
kind text NOT NULL CHECK (kind IN ('note','quote'))
body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000)
position jsonb NULL · is_favorite bool NOT NULL DEFAULT false · created_at timestamptz
```

**RLS**: cuatro políticas, todas `auth.uid() = user_id`. La tabla es privada del
dueño en select, insert, update y delete. **Nadie ajeno lee una nota hoy.**

**Consumo actual**: el único punto de lectura es la tarjeta Memorizar del Rincón
(sorteo aleatorio) más los contadores. **La ficha no lista tus notas en ningún
sitio.** El `notes` que aparece en `libro/[id]/page.tsx` es la reseña del pase,
otra cosa.

**Dos defectos preexistentes** que esta spec arregla por el camino:

1. `getNotes` devuelve `page: number | null`: una nota anclada a T2·E5 se guarda
   bien y se lee como «sin posición». El tipo tira las posiciones de serie.
2. `sessions/actions.ts` tiene un bloque `if (note)` **sin ningún escritor**: el
   rediseño de la hoja de sesión (2026-07-20) retiró el campo a propósito, así que
   hoy no se puede anotar mientras registras.

## 1. Decisiones

| # | Decisión | Por qué |
|---|---|---|
| D1 | **El ciclo se parte en dos planes**: A · capturar y releer; B · el cuaderno. Cada uno deja software usable por sí solo. | «Migración + compositor + lista + cuaderno» de una tacada es el apilado que ya se torció en el rediseño Paper. |
| D2 | **La migración va completa** (`meta`, `is_spoiler`, `is_public`, `parent_note_id`) aunque no todo tenga UI. | Cierra el modelo de una vez y evita tres migraciones futuras sobre una tabla con datos. |
| D3 | **`is_public` se escribe pero NO se lee desde fuera**: no se añade política de lectura pública en este ciclo. | Abrir la lectura antes de que exista el filtro spoiler-safe es exactamente la fuga que la columna venía a evitar. El toggle registra intención; F2 la honra. |
| D4 | **`NoteComposer` pinta campos, no un `<form>`.** Cada montaje decide quién envía. | Dentro de la hoja de sesión un `<form>` anidado es HTML ilegal. Es el patrón que ya siguen `BookProgressField` y `SeriesEpisodeGrid`. |
| D5 | **El anclaje sale del campo vivo, no de la posición guardada del pase.** | Si lee la posición del pase, anotas en la 240 y se guarda 180. |
| D6 | **La sesión manda ante un error de la nota**: si la nota falla, la sesión NO se revierte. | Has leído 60 páginas y eso es un hecho. Perder el progreso por un fallo al escribir texto es la peor de las dos pérdidas. |
| D7 | **El cuaderno es ruta propia (`/notas`), no la reconversión de la pestaña Rincón.** | Rincón aloja retos, sorteo y contadores; convertirla en cuaderno desahucia a tres inquilinos. Memorizar se queda como puerta, conservando el sorteo. |
| D8 | **Tus propias notas nunca se te velan.** El spoiler se marca y se muestra con un distintivo, sin construir el velo. | El velo es información sobre terceros: necesita el progreso del visitante, que es F2. |
| D9 | **«Favorita» es la columna `is_favorite`, no una etiqueta.** | El mockup dibuja `#favorita` como chip; tener las dos cosas produce dos verdades sobre lo mismo. |

## 2. Migración

Una sola migración, **dev primero (`supabase-dev`), prod después**, según la regla
de `AGENTS.md`.

```sql
alter table public.notes
  add column meta jsonb not null default '{}'::jsonb,
  add column is_spoiler boolean not null default false,
  add column is_public boolean not null default false,
  add column parent_note_id uuid null references public.notes(id) on delete set null;

create index idx_notes_parent on public.notes (parent_note_id)
  where parent_note_id is not null;
create index idx_notes_item on public.notes (user_id, item_type, item_id);
```

Los nombres siguen la convención de la tabla (`idx_notes_user`, el único índice no
primario que hay hoy, sobre `(user_id, created_at desc)` — sirve al cuaderno
ordenado por recientes, pero no a la lista de la ficha, que filtra por obra).

- `meta` es **opaco a la BD** (patrón `passes.position` / `club_activities.config`).
  Forma de este ciclo: `{"tags": ["personaje", "estilo"]}`. Sin `#` guardado: el
  `#` es presentación.
- `parent_note_id` con `ON DELETE SET NULL`, coherente con `pass_id`/`session_id`:
  borrar la cita padre no debe llevarse por delante la nota hija.
- **No se toca RLS.** Las cuatro políticas de dueño siguen tal cual (D3).
- La integridad de `parent_note_id` (hijo = `note`, padre = `quote`) queda en la
  capa de app: sin UI que lo escriba este ciclo, un trigger sería código muerto.

## 3. Plan A · Capturar y releer

### 3.1 `NoteComposer` — un componente, dos montajes

`src/components/notes/note-composer.tsx`, cliente. **Pinta campos sueltos, sin
`<form>` propio** (D4). Campos y nombres del `FormData`:

| Campo | `name` | Notas |
|---|---|---|
| Tipo | `noteKind` | Segmento cita/nota. Valores `quote` \| `note`, los del CHECK |
| Texto | `noteBody` | `<textarea>`; en modo cita, serif itálica (mockup) |
| Anclaje | `notePage` / `noteSeason` + `noteEpisode` | Autorrellenado y editable |
| Favorita | `noteFavorite` | Checkbox → `is_favorite` |
| Etiquetas | `noteTags` | Texto separado por comas; se normaliza en servidor |
| Spoiler | `noteSpoiler` | Checkbox → `is_spoiler` |
| Compartible | `notePublic` | Checkbox → `is_public`. **El copy no promete visibilidad**: dice que se guarda marcada para cuando exista el muro |

Los `name` van prefijados con `note` porque en el montaje A conviven en el mismo
`FormData` que los campos de la sesión, donde ya existen `page` y `status`.

> **Ojo con las letras.** «Plan A / Plan B» son los dos planes de D1. Los montajes
> se numeran (1 y 2) y los frames del mockup se citan siempre como «frame X del
> mockup». Son tres ejes distintos y no se corresponden entre sí.

**Montaje 1 · dentro de la hoja de sesión.** Sección plegada «Anota este momento»
en `session-sheet.tsx`, bajo el bloque de progreso. El botón del footer pasa a
«Guardar sesión y cita» cuando hay texto. Al ir dentro del `<form>` de la hoja,
sus campos viajan en el mismo envío y los escribe `addSession`.

**Montaje 2 · la ficha.** El mismo componente, envuelto en su propio
`<form action={addNote}>`, **sustituyendo a `AddNoteForm`**, que se borra.

### 3.2 El anclaje vivo (D5)

En la hoja, «Anclada a: pág. 240» sigue al stepper que el usuario acaba de mover:

- `BookProgressField` gana `onPageChange?: (page: number | null) => void`, con el
  precedente exacto del `onNewlyMarkedChange` que ya tiene `SeriesEpisodeGrid`.
- `SeriesEpisodeGrid` pasa a reportar **el último episodio marcado**, no solo
  cuántos: `onNewlyMarkedChange(count, last: {season, episode} | null)`.
- `SessionSheet` sube ese valor y se lo pasa al compositor como anclaje por
  defecto. **Siempre editable**: la frase puede ser de tres páginas atrás.
- En la ficha no hay anclaje automático: el campo arranca con la posición actual
  del pase abierto si lo hay, y vacío si no.

### 3.3 Servidor: dos escritores, una tabla

- **`addSession`** revive su bloque `if (note)` muerto y escribe la nota con
  `pass_id` **y** `session_id` rellenos — es lo que hace que la cita sepa de qué
  sesión salió. Ambas columnas existen y hoy nadie las usa.
- **`addNote`** sigue cubriendo la captura sin sesión (incluidas películas), con
  esos dos campos en `null`, y se amplía con etiquetas, spoiler y público.
- La normalización de etiquetas vive en **una función pura compartida** por los dos
  escritores, `src/lib/notes/tags.ts`: minúsculas, sin `#`, sin espacios en los
  extremos, sin vacías, sin duplicadas, máximo 8.

### 3.4 «Mis notas y citas» en la ficha

Componente propio, `src/components/notes/notes-section.tsx`, montado en la pestaña
Registro **como hermano de `log-panel`, nunca dentro**: ese archivo ya orquesta
estado, progreso, sesiones y diario a la vez y está señalado para rehacerse.

- **Orden por posición** (§3.5), no por fecha: se recorre la obra de principio a
  fin, que es de lo que trata releer.
- **Dos tratamientos por `kind`**: citas como pull-quotes serif protagonistas,
  notas como tarjetas. Nada anidado (sin UI de `parent_note_id`).
- Las notas de **varias relecturas se mezclan** —cuelgan del ítem— y cada tarjeta
  lleva su fecha, que es lo que desambigua. No se agrupa por pase.
- Acciones: borrar y marcar favorita (`deleteNote`, `toggleNoteFavorite`, ya
  existen). **Editar el texto no**: no hay acción de update, es otro ciclo.
- Las marcadas como spoiler se ven enteras, con un distintivo discreto (D8).
- Vacío: un texto que invita a anotar desde la sesión, sin tarjeta fantasma.

### 3.5 El orden por posición

Función pura `positionSortKey(itemType, position): number | null` en
`src/lib/notes/position-sort.ts`, con tests antes que código:

- libro → `page`
- serie → `season * 1000 + episode` (ordena T2·E5 después de T1·E12 sin comparar
  tuplas sueltas por ahí)
- película, o `position` nula/ilegible → `null`

Regla de la lista: **primero lo anclado, ascendente; después lo suelto, por fecha
descendente.** Las películas caen enteras en el segundo grupo, y está bien: no hay
«por dónde» en una película.

Requiere ensanchar `Note.page: number | null` a `Note.position: Position` en
`src/lib/notes/types.ts` y en `getNotes`/`getNoteById` (defecto preexistente 1 de
§0). `positionSortKey` y `parsePosition` son las únicas que interpretan el jsonb.

## 4. Plan B · El cuaderno (`/notas`)

Ruta propia (D7). La tarjeta Memorizar del Rincón conserva el sorteo y gana un
«ver todas» que apunta aquí.

- **Filtros**: obra, tipo (`kind`), etiqueta. **Búsqueda** de texto sobre `body`.
  **Orden**: recientes · por obra · por posición.

  > **Corregido al construir:** los órdenes acabaron siendo **dos**, no tres.
  > «Por posición» global no significa nada (comparar «Pág. 12» con «T1·E3» es
  > comparar dos escalas), y «por obra» no se puede ordenar en SQL porque el
  > título vive en tres tablas según `item_type`. El orden `obra` ordena por
  > `(item_type, item_id, created_at)` —estable, que es lo que la paginación
  > necesita— y agrupa por obra al pintar, con `compareNotes` dentro de cada
  > grupo. Añadido un cuarto filtro, **favoritas**.
- **Todo en el servidor, con paginación.** Hoy `RinconTab` hace
  `getNotes(supabase, userId)` sin límite y se lleva el array entero al cliente
  para el sorteo. Con 30 notas da igual; un cuaderno con búsqueda no puede
  hacer eso. `getNotes` gana parámetros de filtro/orden/página y el sorteo se
  queda con su propia consulta acotada.
- La pantalla es **solo del dueño**: RLS ya lo garantiza (un visitante recibe cero
  filas), pero la ruta comprueba sesión y no se ofrece en perfiles ajenos.

## 5. Errores

- **Nota fallida, sesión guardada** (D6): se guarda el progreso, la hoja **no se
  cierra** y se muestra el error junto al compositor, para que puedas copiar el
  texto en vez de perderlo. La sesión no se revierte.
- **Cuerpo vacío**: no es una nota aunque lleve etiquetas o spoiler marcados. No se
  escribe fila y no es un error — simplemente registraste una sesión.
- **Cuerpo > 5000**: el CHECK ya lo rechaza en BD; la app lo valida antes y lo dice
  en el campo, sin perder lo escrito.
- **Anclaje ilegible o negativo**: se guarda la nota con `position` nula en vez de
  fallar. Una nota sin página sigue siendo una nota.

## 6. Pruebas

**Unitarias (test primero)**: `positionSortKey` (libro, serie, película, jsonb
basura) y la normalización de etiquetas (`#`, mayúsculas, duplicadas, vacías,
tope de 8).

**E2E** sobre lo que promete el ciclo:

1. Capturar una cita desde la hoja de sesión y verla en la ficha **anclada a la
   página que marqué, no a la guardada** — el bug más probable de todo esto (D5).
2. Capturar desde la ficha, sin sesión.
3. Borrar una nota desde la lista.
4. El orden con una serie de por medio (T1·E12 antes que T2·E5).
5. Guardar sesión con el compositor vacío: se guarda la sesión y no nace fila.

**Verificación en navegador obligatoria** de la hoja con el compositor desplegado a
390×700: el rediseño de sesión dejó tres bugs que pasaron lint, typecheck, build y
revisión de código y solo cayeron midiendo en navegador. El compositor crece justo
en el hijo flex que absorbe el hueco — no tocar el `min-h-0` del `<form>` ni los
`shrink-0` de cabecera, hero y footer.

## 7. Alcance

**Dentro**: la migración de §2; `NoteComposer` y sus dos montajes; el anclaje vivo;
los dos escritores de servidor; «Mis notas y citas» en la ficha con su orden; el
cuaderno `/notas` con filtros, búsqueda, orden y paginación.

**Fuera, explícitamente**: la hoja suelta sobre el cronómetro (frame B del mockup);
el «+» global (frame C); `parent_note_id` en UI (la nota sobre una cita); el muro
público del perfil; el filtro spoiler-safe; la tarjeta compartible portada-céntrica
sobre `/api/og/nota/[id]`; el OCR; y editar el texto de una nota ya guardada.

## 8. Riesgos

- **El anclaje que se queda atrás** (D5): es el defecto que más fácil se cuela y el
  que menos se nota al revisar código. Tiene e2e propio.
- **La hoja de sesión creciendo**: ya mide 848px de scroll a 390×700. El compositor
  va plegado por defecto y se mide en navegador.
- **`meta` sin esquema**: al ser jsonb opaco, un `tags` mal formado no lo rechaza la
  BD. Por eso la normalización es una función pura compartida y probada, y no dos
  copias en dos escritores.
- **`is_public` malinterpretado**: si el copy sugiere que alguien ya lo ve, el
  usuario marca cosas creyendo que las publica. El texto debe decir «se guardará
  marcada para cuando exista el muro».

## 9. Cierre documental

Un cambio no está hecho hasta que el doc canónico vuelve a ser cierto:

1. `docs/requirements/data-model.md`: las cuatro columnas, los dos índices y la
   nota de que RLS **no** cambia. Actualizar la fecha de verificación.
2. `docs/requirements/backlog.md`: casillas de §7.24 y §7.27 (texto; el OCR sigue
   pendiente).
3. `docs/requirements/decisiones.md`: entrada **al final** con D3 (`is_public`
   escrito sin política de lectura) y D7 (`/notas` en vez de reconvertir Rincón).
4. `schema-baseline.sql`: anexar la migración en el orden en que entre a prod.

## 10. Enlaces

- Esquema canónico: [`data-model.md`](../../requirements/data-model.md)
- Decisiones: [`decisiones.md`](../../requirements/decisiones.md)
- Backlog: [`backlog.md`](../../requirements/backlog.md) §7.24, §7.27
- Fases posteriores (F2-F3): `docs/superpowers/specs/2026-07-20-Notas`
- Mockup: `Biblioshare_mockups/Paper - Notas y citas.html` (frames A, C y los de
  cuaderno; el frame B queda fuera de alcance)
- Ciclo anterior: [`2026-07-20-registrar-sesion-v2-design.md`](2026-07-20-registrar-sesion-v2-design.md)
