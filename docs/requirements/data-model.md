# Modelo de datos

> Parte de [Requisitos y alcance](../REQUIREMENTS.md). Sección §3.

Arquitectura elegida: **"columna vertebral compartida"**. El metadata (que varía mucho por
tipo) vive en tablas separadas y tipadas; el progreso del usuario (casi idéntico entre tipos)
vive en una única tabla `library_entries`. Así, **añadir un hobby nuevo = 1 tabla de metadata +
su integración de API**, reutilizando el mismo RLS, la misma query de "mi biblioteca" y la misma
UI de progreso. Ver [decisiones registradas](./architecture-decisions.md#9-decisiones-registradas) para el razonamiento.

## 3.1 Catálogo (compartido entre usuarios) — *creado*
Tablas `books`, `movies`, `series`.
- Metadatos propios de cada tipo (autor/director/creador, portada, sinopsis, año, género...).
- Se rellenan automáticamente vía búsqueda en APIs externas (ver [MVP §4.2](./mvp.md#42-añadir-ítems-a-tu-colección)) y se comparten entre todos los usuarios (evita duplicar/re-consultar la misma película dos veces).
- `SELECT` abierto a cualquiera (incl. visitantes sin cuenta) — necesario para renderizar perfiles públicos; son metadatos públicos no sensibles.
- `INSERT` restringido a usuarios autenticados (al trackear algo se añade el ítem al catálogo si no existe).

## 3.2 Progreso unificado — *creado*
Tabla única `library_entries` (una fila por `usuario` × `ítem de catálogo`):
- `item_type` (`book` | `movie` | `series`, **extensible**) + `item_id` → referencia polimórfica al catálogo.
- `status`: `planned` | `in_progress` | `completed` | `dropped`.
- `rating` 1–10, `started_at`, `finished_at`, `notes` — comunes y tipados.
- `position` (JSONB): el único detalle que varía por tipo. Ej: `{"page": 42}` (libros), `{"season": 2, "episode": 5}` (series). La app valida su forma con los tipos de TypeScript.
- **Semántica del rating** (aclaración): `library_entries.rating` es la **nota actual** del ítem (la que se muestra en el perfil y en los agregados de comunidad); `diary_entries.rating` (§3.3) es la nota **de cada pase concreto**, que puede variar entre relecturas. Al registrar un pase se puede poner una nota distinta sin alterar la nota actual; son campos independientes a propósito.
- RLS: el dueño ve/edita sus filas; cualquiera (incl. anónimo) puede **leer** las filas de un perfil público. Escritura solo el dueño.
- Trade-off aceptado: los detalles finos de `position` no se validan a nivel de BD (viven en JSONB), a cambio de eliminar la deuda de replicar toda la vertical por cada tipo nuevo.

## 3.3 Diario de pases (relecturas / re-visionados) — *creado*
Tabla `diary_entries` (muchas filas por `library_entry`):
- `library_entry_id` → FK al ítem de la estantería (borrado en cascada).
- `started_on`, `finished_on` (fecha del pase), `rating` (de ese pase), `review` (reseña de ese pase).
- Permite registrar leer/ver el mismo ítem varias veces con sus propias fechas y valoraciones (estilo diario de Letterboxd).
- Separación clave: `library_entries` = **estado actual** del ítem; `diary_entries` = **historial de pases**. Añadir el diario después con datos reales habría sido una migración dolorosa, por eso se modela desde el MVP.
- RLS: mismo modelo que `library_entries` (dueño escribe; lectura pública si el perfil lo es).

## 3.4 Perfiles — *creado*
Tabla `profiles`:
- `user_id` (FK a `auth.users`, PK)
- `username` (único, `^[a-z0-9_]{3,30}$`, usado en la URL pública; **modificable** después, con unicidad garantizada)
- `display_name`, `avatar_url`, `bio`
- `is_public` (boolean, default `true`)
- `created_at`, `updated_at`
- RLS: perfiles públicos legibles por cualquiera (incl. anónimo); el dueño siempre ve el suyo. Solo el dueño inserta/edita.

## 3.5 Episodios de serie (catálogo + visionado por episodio) — *creado*
Capa por episodio para series (§7.36), **aditiva**: convive con la nota global de serie
(`library_entries.rating`) sin alterar comunidad/stats/retos, que la siguen usando.

- **`series_episodes`** (catálogo compartido): `series_id` (FK a `series`, cascada),
  `season_number`, `episode_number`, `title`, `synopsis`, `still_url`, `air_date`,
  `runtime_minutes`. UNIQUE `(series_id, season_number, episode_number)`. Se rellena
  **cache-as-you-go** desde TMDB (`/tv/{id}/season/{n}`) la primera vez que se abre la ficha,
  igual que `credits`/sagas (§7.34); mismo RLS que el resto del catálogo (SELECT abierto,
  INSERT/UPDATE autenticado).
- **`episode_watches`** (contenido de perfil, público como `diary_entries`): `user_id`,
  `series_id`, `season_number`, `episode_number`, `rating` (1–10, **nullable** = visto sin
  nota), `review` (nullable), `watched_on`. UNIQUE `(user_id, series_id, season, episode)`.
  **La existencia de la fila = episodio visto.** RLS idéntico a `diary_entries`: el dueño
  siempre; cualquiera si el perfil es público; escritura solo el dueño.
- **Semántica**: marcar un episodio visto adelanta `library_entries.position` de la serie al
  episodio visto más avanzado (mismo "roll forward" que `addSession`, §7.14) y saca la serie
  de `planned`. La rejilla comunidad (temporada × episodio) y las reseñas por episodio se
  **agregan al vuelo** desde `episode_watches` (RLS filtra a públicos + propios), no hay tabla
  de agregados.
