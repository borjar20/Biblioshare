# Notas y citas · Plan B (el cuaderno `/notas`) — Implementation Plan

**Goal:** Una ruta propia donde releer todo lo que has anotado, con filtros (obra,
tipo, etiqueta, favoritas), búsqueda sobre el texto y paginación **en el
servidor** — que es lo que hoy no existe: `RinconTab` se lleva el array entero de
notas al cliente para el sorteo.

**Origen:** §4 de `docs/superpowers/specs/2026-07-21-notas-captura-design.md`
(D7: ruta propia, no reconvertir la pestaña Rincón). Plan A está mergeado (#110).

## Global Constraints

Las de Plan A siguen vigentes. Añadidas por este plan:

- **Plan B no toca el esquema.** Ninguna migración, ninguna política RLS. Todo lo
  que necesita ya existe tras la migración de Plan A (`meta`, `is_spoiler`,
  `is_public`, `idx_notes_item`).
- La pantalla es **solo del dueño**: RLS ya devuelve cero filas a un visitante,
  pero la ruta comprueba sesión y redirige a `/login`.
- Nada de literales en JSX: todo por `messages/es.json`.
- Verifica solo tus ficheros con `npx eslint <rutas>`; `npm run lint` sale ≠ 0 en
  este repo por errores preexistentes.

---

## Corrección a la spec: «por posición» no puede ser un orden global

La spec §4 pide tres órdenes: «recientes · por obra · por posición». **Por
posición, global, no significa nada:** comparar «Pág. 12» de un libro con
«T1·E3» de una serie es comparar dos escalas distintas. `compareNotes` (Plan A)
recibe un `itemType` justamente porque el orden solo existe *dentro* de una obra.

Además el orden «por obra» **no se puede hacer en SQL**: el título vive en
`books`/`movies`/`series` según `item_type`, y PostgREST no puede ordenar por una
columna de tres tablas distintas a la vez.

Este plan los funde en **un solo orden, `obra`**, que sí es correcto y paginable:

- SQL ordena por `(item_type, item_id, created_at)` — arbitrario pero **estable**,
  que es lo que la paginación necesita para no duplicar ni saltarse filas.
- La página se pinta **agrupada por obra**, y dentro de cada grupo se ordena con
  `compareNotes` — orden de lectura, la regla de Plan A, sin una segunda copia.

Los órdenes que ofrece la pantalla quedan en dos: **recientes** (exacto en SQL) y
**por obra** (agrupado, posición dentro). Se registra como decisión D10.

---

## Estructura de ficheros

**Nuevos**

| Fichero | Responsabilidad |
|---|---|
| `src/lib/notes/query.ts` + `.test.ts` | `NotesQuery`: leer y escribir el estado de la URL. Pura |
| `src/app/notas/page.tsx` | La ruta del cuaderno |
| `src/app/notas/notes-filters.tsx` | Barra de filtros: pills (enlaces) + buscador (form GET) |
| `src/app/notas/notes-pager.tsx` | Anterior / siguiente |
| `e2e/notas-cuaderno.spec.ts` | E2E del cuaderno |

**Modificados**

| Fichero | Cambio |
|---|---|
| `src/lib/notes/get-notes.ts` | `getNotesPage` (filtros + orden + paginación), `getNoteCounts` (head counts), `getNotesForSorteo` (acotada); fuera `getNotes` y `countNotes` |
| `src/app/u/[username]/_tabs/rincon-tab.tsx` | Consume las tres funciones nuevas |
| `src/components/notes/note-card.tsx` | `showItem` (título enlazado) y etiquetas pinchables |
| `src/components/notes/memorize-card.tsx` | «Ver todas» deja de ser texto muerto y apunta a `/notas` |
| `messages/es.json` | Claves de `notes.notebook*` |

**Borrados**: `src/lib/notes/count-notes.test.ts` (prueba `countNotes`, que deja
de existir: los contadores pasan a ser tres `count` en SQL, no un recorrido del
array completo — D11).

---

### Task 1: `NotesQuery` — el estado de la URL, puro y probado

Tests primero. Reglas que fijan los tests:

- Nombres de parámetro en castellano, como el resto del repo (`?periodo=`,
  `?archivados=1`): `q`, `tipo`, `etiqueta`, `obra`, `favoritas`, `orden`, `pagina`.
- Valor desconocido → el defecto, nunca un error.
- `obra` es `<itemType>:<uuid>`; si el tipo no es uno de los tres, se ignora entera.
- La etiqueta se normaliza con `normalizeTags` (Plan A) — una sola verdad sobre
  la forma de una etiqueta, en la escritura y en el filtro.
- **Cambiar un filtro devuelve a la página 1.** `notesHref` solo conserva
  `pagina` si el override la trae explícita: si no, quedarías en la página 7 de
  un resultado de 2.
- Los valores por defecto **no** se escriben en la URL.

### Task 2: La lectura — filtros, paginación y contadores en SQL

En `src/lib/notes/get-notes.ts`:

- `getNotesPage(supabase, userId, query)` → `{ notes, total }`, con `range()` y
  `count: "exact"`. Búsqueda con `ilike` sobre `body` (escapando `%` y `_`, que
  si no son comodines del usuario). Etiqueta con `contains("meta", {tags:[tag]})`
  — containment jsonb, que es lo que `@>` sabe hacer sin desanidar.
- `getNoteCounts(supabase, userId)` → los tres `count` del rail, en SQL.
- `getNotesForSorteo(supabase, userId)` → acotada (`limit`), para Memorizar.
- `getNotes` y `countNotes` se van: eran la vía que traía todo al cliente.

### Task 3: La pantalla

`/notas`: sesión obligatoria, cabecera con vuelta al perfil, barra de filtros,
lista (agrupada por obra si `orden=obra`), paginador, y un vacío que distingue
«no tienes nada» de «no hay nada con estos filtros».

### Task 4: Enganches y cierre documental

Memorizar gana el enlace real; `decisiones.md` recibe D10 y D11 al final;
`backlog.md` §7.24/§7.27 ya están marcadas por Plan A. `data-model.md` **no se
toca**: Plan B no cambia el esquema.
