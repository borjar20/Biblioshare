# Notas en el margen — notas que se abren al llegar a ese punto de la obra

> **[Histórico · congelado 2026-10-04 · diseño aprobado, pendiente de implementar]**
> El propietario aprobó el diseño por secciones en conversación. El estado aplicado
> por entorno vivirá en `docs/requirements/data-model.md`; este documento fija el alcance.

## 1. Objetivo y alcance

Mientras lees o ves algo dejas una nota anclada a un punto de la obra («aquí lloré»,
«fíjate en el reloj»). Cuando alguien que te sigue llega a ese punto, la nota se le abre.
Es una lectura conjunta asíncrona, de persona a persona y sin organizar: tu lectura se
convierte en un regalo diferido para quien venga detrás.

Decisiones de producto tomadas:

1. **Audiencia doble, siempre dentro de tus seguidores.**
   - *General*: la reciben quienes te siguen (follow `accepted`).
   - *Dedicada*: para una sola persona, que debe seguirte al escribirla.
   - Quien no te sigue no ve nada. Si deja de seguirte, pierde el acceso, también a las
     que ya había encontrado. Si vuelve a seguirte, las recupera.
2. **Alcance por tipo de obra:**
   - *Libros*: anclada a una página y abierta por proporción.
   - *Series*: anclada a un episodio.
   - *Películas*: solo «al terminar», porque no se registra posición durante el visionado.
3. **Apertura automática por proporción, con margen hacia atrás.** Ver §3. Preferimos que
   la nota «llegue tarde» a que destripe nada. Quien no registra progreso la recibe al
   terminar la obra.
4. **Capítulo obligatorio en libros.** Quien escribe indica a qué capítulo se refiere.
   Es contexto para el lector, no decide la apertura.
5. **El encuentro:**
   - Las generales se revelan al registrar progreso, en la propia hoja.
   - Las dedicadas, además, avisan con notificación y push.
6. **Se pueden revisar después,** en la ficha de la obra y en el Cuaderno (`/notas`).
7. **Conversación privada por lector.** Quien encuentra la nota puede responder y
   reaccionar. Ese hilo solo lo ven el autor y ese lector.
8. **Notas retroactivas.** Una nota publicada cuando el seguidor ya había pasado ese punto
   (o había terminado la obra) también le llega, sin ceremonia. Las dedicadas avisan igual.

Fuera de alcance, cada uno como issue propia:

- Minuto en películas.
- Aviso agrupado para notas retroactivas.
- Notas de margen en clubes.
- Integración en el panel de moderación (#1183) si no sale gratis.

## 2. Modelo de datos

Enfoque elegido: **tabla propia + registro de encuentros**.

Se descartó ampliar `notes`: su política de lectura pública (`is_public` +
`can_view_profile`) podría exponer una nota de margen antes de llegar a ese punto.
También se descartó calcular la apertura al vuelo: no deja dónde colgar la conversación
ni dónde guardar el momento del encuentro.

**Invariante de privacidad:** una nota de margen solo la ve su autor, o un lector con un
encuentro con ella que siga al autor con follow `accepted` y sin bloqueo entre ambos.

### `margin_notes` — lo que escribe el autor

| Columna | Contrato |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `author_id` | `uuid not null references auth.users(id) on delete cascade` |
| `item_type`, `item_id` | obra (`book`, `series`, `movie`), polimórfica, sin FK. Se añade la tabla a `private.protect_catalog_references` |
| `anchor` | `jsonb not null`, ver formas abajo |
| `chapter_label` | `text`. Obligatorio (no vacío tras `btrim`) si `item_type = 'book'` y `null` en otro caso (`CHECK`) |
| `body` | `text not null`, de 1 a 2000 caracteres |
| `is_spoiler` | `boolean not null default false`. Marca notas que destripan **más allá** de su punto |
| `audience` | `margin_audience` enum: `followers`, `person` |
| `recipient_id` | `uuid references auth.users(id) on delete cascade`. `CHECK ((audience = 'person') = (recipient_id is not null))` y `recipient_id <> author_id` |
| `created_at`, `edited_at` | `timestamptz` |

Formas de `anchor`, validadas por `CHECK` contra `item_type`:

- **Libro:** `{"kind":"ratio","ratio":0.535,"page":214,"pages":400}`.
  - `ratio` está en (0, 1] y se calcula al escribir: página dividida por las páginas de
    la edición del pase del autor (misma regla que `pagesForPass`).
  - `page` y `pages` se guardan como pista de presentación («p. 214 en su edición»).
  - Si el autor no tiene páginas conocidas, se guarda `{"kind":"finish"}`.
- **Serie:** `{"kind":"episode","season":2,"episode":5}`. El episodio debe existir y
  estar emitido en `series_episodes`.
- **Cualquier tipo:** `{"kind":"finish"}`. Es la única forma posible en películas.

Escritura:

- El cliente inserta, actualiza y borra **solo sus filas** (RLS por `author_id = auth.uid()`).
- Grants por columna:
  - `insert` en todas salvo `id`, `created_at` y `edited_at`.
  - `update` solo en `body`, `chapter_label`, `is_spoiler` y `edited_at`.
- **El ancla, la obra y la audiencia son inmutables.** Para mover una nota se borra y se
  escribe otra, y así nunca hay que «cerrar» algo que alguien ya leyó.
- Al insertar una nota dedicada, un trigger exige que `recipient_id` siga al autor con
  follow `accepted` (si no, `42501`).

Lectura (RLS):

- Si `author_id = auth.uid()`, el autor ve su nota.
- Un lector la ve si existe un `margin_note_encounters (note_id, reader_id = auth.uid())`,
  sigue al autor con follow `accepted` y no hay `user_blocks` en ninguna dirección.

### `margin_note_encounters` — una nota abierta a un lector

| Columna | Contrato |
|---|---|
| `id` | `uuid primary key`, `source_id` de la conversación |
| `note_id` | `references margin_notes(id) on delete cascade` |
| `reader_id` | `references auth.users(id) on delete cascade` |
| `found_at` | `timestamptz not null default now()` |
| `found_via` | enum `margin_found_via`: `progress`, `finish`, `retro` |
| `seen_at` | `timestamptz`. Mientras sea `null`, la nota cuenta como nueva |

- `unique (note_id, reader_id)` y `CHECK` de que el lector no es el autor (vía trigger,
  porque el autor está en la otra tabla).
- **Sin escritura de cliente** salvo `update (seen_at)` por el propio lector. Los
  encuentros solo los crean funciones `SECURITY DEFINER` (mismo patrón que
  `club_activity_checkpoint_reads`).
- Lectura con la misma condición que la nota. El autor de la nota ve los encuentros de
  sus notas para mostrar «encontrada por…».

### Conversación

- Nuevo `target_kind = 'margin_encounter'` y nueva audiencia
  `interaction_audience_kind = 'encounter_pair'`.
- En `interaction_targets`:
  - `owner_id` es el autor de la nota y `audience_id` es el id del encuentro.
  - `href = '/margen/<encounterId>'`.
  - Tiene `commentable` y `reactable`, con sus tipos de aviso.
- `can_view_interaction_target` resuelve `encounter_pair` como «`auth.uid()` es el autor
  de la nota o el lector del encuentro, y la nota es visible por la RLS de arriba».
- Un trigger sobre `margin_note_encounters` lo materializa, igual que los otros tipos.
- Comentarios (con hilos y notas de voz), reacciones, bloqueos y denuncias se heredan
  sin código propio.

## 3. Apertura

Una sola función, `private.open_margin_notes(p_reader uuid, p_item_type, p_item_id uuid,
p_via margin_found_via)`, `SECURITY DEFINER` con `search_path` fijado. Es idempotente y
usa `on conflict do nothing`. Recorre las notas de esa obra cuyo autor siga el lector
(follow `accepted`, sin bloqueo) con audiencia `followers` o con `recipient_id = p_reader`,
y crea los encuentros cuyo punto se haya alcanzado.

**Cuándo se ha llegado:**

- **`ratio` (libros):**
  - Se toma la página más alta del lector entre **todos** sus pases de la obra (relecturas
    incluidas). Si algún pase está `completed`, cuenta como 1.
  - Esa página se divide por las páginas de la edición de ese pase (regla de
    `pagesForPass`: `passes.edition_id` → `book_editions.total_pages`, y si no hay,
    `books.total_pages`).
  - La nota se abre si `ratio_lector ≥ ratio_nota + max(0.03, 5 / páginas_lector)`.
  - Si las páginas del lector son desconocidas, solo se abre al terminar.
- **`episode` (series):** existe un `episode_watches` del lector con esa temporada y ese
  episodio, o un pase `completed` de la serie. No basta con haber visto uno posterior:
  la gente salta episodios y la nota habla de ese.
- **`finish`:** algún pase del lector sobre esa obra está `completed`.
- **Terminar abre todo** lo de esa obra.

**Disparadores:**

| Evento | Llamada | `found_via` |
|---|---|---|
| `AFTER INSERT OR UPDATE OF position` en `progress_sessions` | lector y obra del pase | `progress` |
| `AFTER INSERT` en `episode_watches` | lector y serie | `progress` |
| `AFTER UPDATE OF status` en `passes`, a `completed` | lector y obra | `finish` |
| `AFTER INSERT` en `margin_notes` | para cada seguidor (o el destinatario) con pase de esa obra | `retro` |
| `AFTER UPDATE OF status` en `follows`, a `accepted` (o insert ya `accepted`) | nuevo seguidor y cada obra con notas del autor | `retro` |

Reglas:

- **Retroceder no quita nada.** Borrar una sesión o bajar de página no borra encuentros.
- Las funciones de reparto (`retro`) iteran sobre los seguidores que tienen pase de esa
  obra, nunca sobre todos los seguidores.
- La regla del umbral vive también como función pura en TypeScript
  (`src/lib/margin/threshold.ts`), para mostrar en el formulario «se abrirá hacia la
  p. N de una edición como la tuya» y para probar los mismos casos que la versión SQL.

## 4. Pantallas

**Escribir.** Hay un componente único, `MarginNoteComposer`, con estos campos:

- Capítulo (obligatorio en libros).
- Texto.
- Audiencia: *Mis seguidores* o *Para…*, con un buscador entre tus seguidores aceptados.
- Marca de spoiler.

Se llega a él desde tres sitios:

1. **Hoja de sesión** (`/sesion`, junto a `SessionNotebook`): acción «Dejar en el
   margen» con la página de la sesión ya rellena.
2. **Hoja de serie:** sobre cada episodio marcado, «Dejar nota en este episodio».
3. **Ficha de la obra:** «Dejar una nota en el margen». La página se escribe a mano en
   libros. En series se elige un episodio o «al terminar», y en películas solo «al
   terminar». Sirve para escribir de memoria.

Si el libro no tiene páginas conocidas, el formulario avisa de que la nota se abrirá al
terminar.

**Encontrar:**

- Tras guardar una sesión, marcar un episodio o terminar la obra, el resultado de la
  acción devuelve los encuentros nuevos con `found_via` `progress` o `finish`.
- Si hay alguno, la confirmación muestra **«Has encontrado N notas en el margen»** con
  tarjetas de papel. Cada tarjeta lleva avatar, nombre, capítulo, «p. 214 en su edición»,
  texto (con `SpoilerGate` si `is_spoiler`) y botones para responder y reaccionar.
- Al mostrarlas se marca `seen_at`.
- Los encuentros `retro` no interrumpen ninguna hoja. Aparecen como nuevos (con un punto)
  en la ficha y en el Cuaderno.

**Revisar:**

- **Ficha de la obra:** bloque «Notas en el margen» ordenado por posición en la obra.
  - Muestra las encontradas y, si eres autor, las propias con «encontrada por …».
  - De lo no alcanzado no se muestra nada, ni el recuento.
- **Cuaderno (`/notas`):** filtros nuevos **Encontradas** y **En el margen** (las tuyas).
- **Hilo:** `/margen/[encounterId]` muestra la nota y la conversación privada con los
  componentes de comentarios existentes. Desde una nota propia, el autor ve la lista de
  hilos, uno por cada lector que la encontró.

Las notas de margen **no aparecen nunca** en el feed ni en el perfil público.

## 5. Avisos

Tipos nuevos en `notification_type` y categoría nueva, «Notas en el margen», en las
preferencias de push (canal × categoría):

| Cuándo | Para quién | Push |
|---|---|---|
| encuentro de nota **dedicada** (cualquier `found_via`) | destinatario: «Lucía te dejó una nota en *Obra*, cap. 12» | sí |
| comentario o reacción en el hilo | la otra persona del hilo | sí |
| encuentro de nota **general** | nadie. Se revela en la hoja o en la ficha | no |

Todos los textos nombran la obra.

## 6. Casos límite

- **Cambio de edición a mitad de lectura:** se usa la edición del pase actual. Lo ya
  encontrado no se retira, así que no hay incoherencias.
- **Borrar una nota:** se pide confirmación indicando cuántos hilos se perderán. El
  borrado arrastra encuentros, targets y conversaciones.
- **Bloqueo:** oculta notas e hilos en ambas direcciones.
- **Denuncia:** `content_reports` sobre la nota y sobre cada comentario del hilo.
- **Caché (regla #437):** todo depende de quién mira, así que no lleva `use cache`. Las
  lecturas van detrás de `<Suspense>`.
- **Grants por columna:** pasar la superficie 6 de `docs/DRIFT-CHECK.md` sobre las dos
  tablas nuevas.
- **Migraciones:** primero dev, luego prod. Actualizar `data-model.md` y regenerar los
  tipos.

## 7. Pruebas

- **Unitarias (Vitest):** `threshold.ts`.
  - Proporción y margen del 3 % frente al mínimo de 5 páginas en libros cortos.
  - Ediciones de distinto tamaño.
  - Páginas desconocidas.
  - Límite cerca del final (umbral > 1 solo se alcanza al terminar).
- **Matriz SQL (dev):**
  - Visibilidad para un desconocido, un seguidor sin encuentro, un seguidor con encuentro,
    un exseguidor (no ve) y uno que vuelve a seguir (ve).
  - Bloqueo en ambas direcciones.
  - Nota dedicada vista por el destinatario frente a otro seguidor.
  - Insert y update de encuentros desde el cliente: `42501` (salvo `seen_at`).
  - Dedicada a alguien que no te sigue: `42501`.
  - `update` del ancla: denegado.
- **E2E (Playwright, contra build de producción):**
  1. La autora escribe en la p. 214 de 400. El lector registra la 200 y no hay revelación.
     Registra la 230 y ve «Has encontrado 1 nota». Responde, y la autora recibe el aviso
     y ve el hilo.
  2. Retroactiva: la autora escribe sobre una obra que el lector ya terminó. Aparece en
     la ficha y en el Cuaderno como nueva, sin hoja.
  3. Serie: la nota en el T1E3 se abre al marcar ese episodio, no al marcar el T1E4.
