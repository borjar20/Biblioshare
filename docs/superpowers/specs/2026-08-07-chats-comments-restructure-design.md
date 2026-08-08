# Chats en actividades + reestructuración de comentarios

`[Histórico · congelado 2026-08-07]` — Spec de diseño de la feature. El estado vivo manda en
`docs/requirements/data-model.md` y en el código; este doc explica el *porqué*.

- **Fecha:** 2026-08-07
- **Rama:** `claude/chats-comments-restructure-f5c265`
- **Origen:** petición del dueño — «añadir chats a las actividades y de paso rehacer/reestructurar la
  sección de comentarios de los post». Mockup interactivo de referencia (Claude Design):
  `CommentThread.dc.html`, dos modos `hilo` / `chat`.
- **Área:** `area:social` (+ toca `area:clubes` en la superficie de chat de actividad).

## 1. Resumen

Hoy el «chat de actividad» **ya existe**: `ActivityChat` es un envoltorio fino sobre
`ReviewInteractions`, es decir, el hilo de comentarios del sistema de interacciones sobre un
`interaction_target` de tipo `club_activity` (asíncrono, sin realtime, restringido a participantes).
Y los comentarios de post son hoy **planos y pelados**: `comments` solo tiene
`id, interaction_target_id, author_id, body, created_at`; se renderizan en lista plana, texto plano +
menciones, y son **crear + borrar** (no hay editar, ni spoiler, ni fijar, ni responder, ni ordenar).

El mockup pide enriquecer ese motor común y presentarlo de **dos formas**:

- **Hilo** — comentarios de post enriquecidos: respuestas, spoilers, editar, fijar, ordenar, formato
  básico (negrita/cursiva/lista) y menciones.
- **Chat** — el chat de actividad, re-maquetado como **burbujas** de mensajería (propio a la derecha,
  ajeno a la izquierda, agrupado por autor, cita de respuesta, spoiler, reacciones, menú
  editar/borrar/fijar, compositor pegado abajo).

**No es un subsistema de mensajería nuevo.** Es el mismo motor de comentarios, enriquecido y
renderizado dos veces. Las **reacciones ya coinciden** con el mockup (♡ 📖 😱 🔥 = `like/read/shock/fire`,
CHECK `reactions_kind_valid`); no se tocan. Existe ya un parser markdown-lite
(`src/lib/social/rich-text.ts` + `RichTextView`) cableado hoy a los Pensamientos; se **reutiliza**
para el formato de comentarios.

## 2. Decisiones de alcance (acordadas)

1. **Read receipts («Visto»): FUERA de v1.** Es un subsistema nuevo (marca de última lectura por
   usuario/hilo) y sin realtime siempre sería aproximado. Se abre issue (`tipo:feature`,
   `area:social`, `P3`). La maqueta de chat NO mostrará «Visto».
2. **Entrega: un solo PR** en esta rama (migración + backend + ambas capas de UI).
3. **Respuestas: profundidad real en datos, aplanadas a DOS niveles al mostrar.** `parent_id` guarda
   el padre real (a cualquier profundidad), pero la UI colapsa a exactamente **dos profundidades
   visuales**: (0) **comentario principal** = la raíz del hilo (`parent_id = null`, el ancestro de más
   arriba, no el padre inmediato), y (1) **respuestas** = *todos* los descendientes de esa raíz
   subidos bajo ella, en una sola lista al mismo nivel, con prefijo `@autor` para dar contexto de a
   quién respondía cada una (como Twitter/Instagram). Esto **revierte** la decisión previa de bloquear
   el anidamiento (ver `decisiones.md`).

## 3. Modelo de datos

Tabla `public.comments`. Una migración (dev primero: `supabase-dev`, luego prod).

Columnas nuevas:

| Columna | Tipo | Notas |
|---|---|---|
| `parent_id` | `uuid null references public.comments(id) on delete cascade` | Respuesta. Borrar un comentario cascadea sus descendientes. |
| `is_spoiler` | `boolean not null default false` | Oculta el cuerpo tras un blur revelable. |
| `pinned` | `boolean not null default false` | Uno por hilo (invariante en la acción, no en la BD). |
| `edited_at` | `timestamptz null` | Se fija al editar; la UI muestra «editado». |

### 3.1 Las respuestas cuelgan del MISMO `interaction_target_id` que su raíz

Punto clave del diseño: una respuesta **no** comenta sobre el `interaction_target` del comentario
padre (que es `commentable = false`), sino sobre el **mismo target del post/actividad** que la raíz,
más `parent_id` apuntando al comentario al que responde. Consecuencias:

- El trigger existente `private.enforce_comment_target_commentable()` («no se puede comentar un
  comentario») **no se toca**: una respuesta pasa el trigger porque su target es el post
  (`commentable = true`).
- Nuevo trigger `enforce_comment_parent_same_target`: `NEW.parent_id` debe existir y cumplir
  `parent.interaction_target_id = NEW.interaction_target_id` (sin padres de otro hilo). Sin límite de
  profundidad (se aplana al mostrar, así que la profundidad de datos es libre).

### 3.2 RLS

- `comments insert own canonical` (existente): se extiende el WITH CHECK para que, si `parent_id` no
  es null, el padre sea visible y comparta target (lo garantiza además el trigger 3.1).
- **`comments update own canonical` (NUEVA):** hoy NO existe política de UPDATE. Se añade:
  `USING (auth.uid() = author_id AND can_view_interaction_target(interaction_target_id))`. Permite
  editar el propio cuerpo, `is_spoiler` y `edited_at`. **No** permite tocar `pinned` (ver 3.3).
- **Fijar** (`pinned`) va por función `SECURITY DEFINER` `pin_comment(comment_id, pinned)`, restringida
  a **dueño del target o moderador del club** (reutiliza `private.can_moderate_comment` /
  propiedad del target vía `interaction_targets.owner_id`). Así un usuario no puede fijar su propio
  comentario en el hilo de otro.

### 3.3 Grants por columna (DRIFT-CHECK superficie 6 — OBLIGATORIO)

**Estado real (verificado en dev 2026-08-07):** `comments` NO tiene grants por columna; tiene el
`grant all` de tabla por defecto de Supabase a `anon` + `authenticated` (incluido UPDATE de tabla),
pero hoy no hay policy de UPDATE, así que RLS deniega toda actualización. INSERT sigue a nivel de
tabla → las columnas nuevas quedan cubiertas para INSERT sin grant extra.

Para EDITAR hay que abrir UPDATE, y aquí está la trampa: los grants por columna son **aditivos**, no
pueden estrechar el UPDATE de tabla ya concedido. Por eso la migración hace
`revoke update on public.comments from anon, authenticated;` y luego
`grant update (body, is_spoiler, edited_at) on public.comments to authenticated;`. Así el autor solo
puede cambiar cuerpo/spoiler/edited_at; **`pinned` NO se concede** (se escribe solo por `pin_comment`,
SECURITY DEFINER, que corre como owner y no le afecta el revoke) y `parent_id`/`author_id` tampoco.
Regla viva: cualquier columna futura que deba ser editable por el autor hay que añadirla a ese grant
(#375 — una columna sin grant rompe la escritura). DRIFT-CHECK superficie 6 lo verifica.

## 4. Acciones de servidor

`src/lib/social/interaction-actions.ts`. Las acciones NUEVAS siguen el patrón de **resultado
discriminado** `{ ok: true } | { ok: false; error: string }` (regla `thought-actions.ts`: Next borra
`.message` de los `Error` lanzados en build de producción). Las existentes (`addComment`,
`toggleReaction`, `deleteComment`) predatan la regla; se **migran a resultado discriminado** al tocarlas
(evita el fallo silencioso en prod y unifica el manejo en cliente).

- `addComment(targetId, body, { parentId?, isSpoiler? })` — extendida. Valida target `commentable`,
  y si `parentId`, mismo target. Sigue disparando `notifyMentions` + aviso al dueño; si es respuesta,
  además avisa al autor del comentario padre (dedupe key propia).
- `editComment(commentId, body)` — NUEVA. RLS solo-autor; fija `edited_at = now()`.
- `pinComment(commentId, pinned)` — NUEVA. Llama a la RPC `pin_comment`; desfija los demás del hilo
  (invariante «uno por hilo») dentro de la función.
- `deleteComment` — igual; el borrado ahora cascadea respuestas (FK `on delete cascade`).
- `toggleReaction` — sin cambios funcionales.

Toda mutación termina en `revalidateInteraction()` (y `revalidateClubPages()` donde aplique).

## 5. Capa de datos

`src/lib/social/interactions.ts` → `getInteractionSummary`. Cada `InteractionComment` se enriquece con
`parentId, isSpoiler, pinned, edited (=!!edited_at), canEdit, canPin`. `canEdit = esAutor`;
`canPin` = dueño del target o moderador (se resuelve con el RPC `moderatable_target_ids` ya usado para
`canDelete`).

- **Agrupar/aplanar y ordenar es en cliente.** El servidor devuelve la lista plana enriquecida; la
  presentación resuelve la **raíz** de cada comentario subiendo por `parent_id` hasta el ancestro con
  `parent_id = null` dentro del conjunto cargado, y agrupa todos los descendientes bajo esa raíz
  (dos niveles: principal + respuestas). Orden `recientes` / `mejor valorados` (por suma de
  reacciones) en cliente. Si el padre quedó fuera del corte de prefetch, el comentario se trata como
  raíz (ver límite abajo).
- Límite de prefetch se mantiene en `COMMENT_PREFETCH_LIMIT = 20`. Un hilo profundo/partido puede
  dejar respuestas fuera del corte (padre no cargado → se trata como raíz). Aceptable en v1 →
  **issue de paginación** (`tipo:deuda`).

## 6. UI — dos presentaciones sobre el mismo `InteractionSummary`

Compartido: parser `rich-text.ts` + `RichTextView`, `ReactionBar` (ya 4 emojis), autocompletado de
menciones (`use-mention-autocomplete`), `SpoilerGate`.

### 6.1 «Hilo» — enriquecer `ReviewInteractions`

Afecta a TODA superficie donde se monta `ReviewInteractions` (detalle de obra «Comunidad», y tarjetas
de feed: reseña, pensamiento, progreso, colección, episodios, chat de actividad, posts de club). Es el
efecto deseado (consistencia), pero se **verifica cada montaje**.

Añade: render con `RichTextView` (negrita/cursiva/lista/mención); `SpoilerGate` por comentario
(blur + «Ver spoiler»); badge «Fijado» + menú `⋯` (editar/borrar/fijar/reportar según permisos);
edición inline; compositor de respuesta con `@autor` prefijado; barra de formato B/I/lista;
toggle de orden recientes/mejor valorados; respuestas aplanadas con «Ver N respuestas».

### 6.2 «Chat» — nueva presentación de burbujas para `ActivityChat`

Nuevo componente (p. ej. `src/components/clubs/activity-chat-bubbles.tsx`) que consume el mismo
`InteractionSummary`: burbujas propio-derecha (naranja) / ajeno-izquierda (oscuro), agrupadas por autor
consecutivo, cita `↳ @autor: …` del mensaje respondido, burbuja spoiler revelable, reacciones bajo la
burbuja, menú editar/borrar/fijar, compositor **pegado abajo** (sticky) con B/I + spoiler + enviar.
**Sin «Visto».** `ActivityChat` pasa a renderizar esta presentación en vez de `ReviewInteractions`.

## 7. Notificaciones

Se reutiliza `notify` / `notifyMany` (`src/lib/social/notifications.ts`) y `notifyMentions`. Nueva
señal: al responder, avisar al **autor del comentario padre** (además del dueño del target y de los
`@mencionados`), con `dedupeKey` propia y saltando self/ya-avisados. Sin cambios de esquema en
`notifications`; el `notification_type` de respuesta reutiliza el flujo de comentario existente.

## 8. Fuera de alcance (→ issues)

- **Read receipts «Visto»** — `tipo:feature`, `area:social`, `P3`.
- **Paginación de comentarios / hilos profundos** — `tipo:deuda`, `area:social`, `P2`.

## 9. Rollout y «definición de hecho»

1. Migración en `supabase-dev` primero; verificar objetos reales (no el ledger). Luego prod.
2. **e2e contra build de producción** (`next build` + `next start`), no solo `next dev`: la ruta de
   actividad es `instant=false` y bajo PPR un `notFound()`/gate puede comportarse distinto (regla
   PPR #514). El chat de actividad depende de RLS de participante.
3. **Sin `use cache` sobre datos filtrados por RLS** (regla #437): el resumen de interacciones depende
   de quién mira; se queda tras `<Suspense>`, cliente de sesión, nunca cacheado compartido.
4. Al cerrar: actualizar `docs/requirements/data-model.md` (columnas + RLS de `comments`) y su fecha;
   correr **DRIFT-CHECK superficie 6** (grants por columna); **append** en `decisiones.md` (reversión
   del anidamiento + estrategia guardar-profundo/mostrar-plano + fijar por dueño/moderador); marcar
   casilla en `backlog.md`; abrir las issues de §8.

## 10. Riesgos

- **Grant por columna olvidado** → rompe toda escritura de `comments` en prod (§3.3). Mitiga: grants
  en la misma migración + DRIFT-CHECK.
- **Constraints reales vs fakes de test**: los fakes no aplican CHECK/trigger; 1300 tests verdes no
  prueban el trigger de padre-mismo-target ni la RLS de UPDATE. El **e2e contra build** es el guard
  real (memoria «constraints vs fakes»).
- **Blast radius de `ReviewInteractions`**: cambia en muchas superficies; verificar cada montaje.
- **Anidamiento reintroducido**: revierte una invariante previa; documentar en `decisiones.md` para que
  nadie lo «arregle» de vuelta leyendo el trigger viejo.
