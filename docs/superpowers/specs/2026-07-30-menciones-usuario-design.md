# Menciones @usuario (EPIC-05, E5.K3) — diseño

> Spec de la feature de **menciones** para la capa social. Absorbe E5.K3 del
> [social-epic](../../requirements/social-epic.md). Estado del epic al escribir esto:
> Bloques A–H completos (dev+prod); menciones son el primer trozo del Bloque K.
>
> Fecha: 2026-07-30.

## 1. Objetivo y alcance

Permitir mencionar a otra persona con `@username` en los tres sitios de **texto libre**
que ya existen, generando una notificación al mencionado y un enlace a su perfil al
renderizar:

- **Reseñas** — `passes.review`
- **Comentarios** — `comments.body`
- **Posts de club** — `club_posts.body`

**Objetivo de producto**: enganche/retención. La mención genera una notificación
(bucle de retorno) y sube la conversación en comentarios y posts de club.

**Fuera de alcance**:
- Menciones en cualquier otro campo (bios, nombres de club, títulos de actividad…).
- Re-notificación al **editar** una reseña (solo se notifica en el alta — ver §8).
- Integración con bloqueos (`user_blocks`, Bloque J) — no existe aún la tabla; queda
  como hook anotado en el código (§4).
- Una bandeja/feed dedicado de "menciones de mí" — las notificaciones **son** esa
  bandeja; no se crea tabla sidecar (ver §2).

## 2. Modelo de datos — sin tabla nueva

El texto crudo con `@username` **es** la fuente de verdad. Coherente con SD-3 del epic
("el diario es la reseña", no se promueven las reseñas a tabla propia). Las menciones se
extraen por regex al escribir (para notificar) y al renderizar (para enlazar).

Único cambio de esquema:

```sql
ALTER TYPE notification_type ADD VALUE 'mentioned';
```

`target_type` reutiliza los valores existentes de `target_kind`
(`diary_entry` / `comment` / `club_post`) — **no** se añade ningún valor de target. La
resolución del enlace de la notificación ya está cubierta por `resolveTargetHrefs()` en
`src/lib/social/notifications.ts` para esos tres targets.

**Trade-off asumido**: si una persona cambia su username, un `@viejo` ya guardado en un
texto deja de resolver y se renderiza como texto plano (sin enlace). Es raro (los
usernames casi no cambian) y no rompe nada. Un fixup en el momento del rename se abre como
issue, no se hace aquí.

**Por qué no una tabla `mentions(source_type, source_id, mentioned_user_id)`**: la única
ventaja sería una consulta directa "menciones de mí" y robustez ante rename. La bandeja de
menciones ya la dan las notificaciones, y el rename es un caso marginal. YAGNI: no se crea.

## 3. Parser compartido — `src/lib/social/mentions.ts`

Módulo **puro** (sin imports server-only), importable desde cliente y servidor.

```ts
// El prefijo capturado evita @ dentro de emails (a@borja) y rutas (foo/@bar).
export const MENTION_RE = /(^|[^a-z0-9_@/])@([a-z0-9_]{3,30})/gi;

export function extractMentions(text: string): string[];
// → usernames únicos, en minúsculas, respetando USERNAME_PATTERN
//   (/^[a-z0-9_]{3,30}$/ de src/lib/profile/username.ts).
//   Cap MAX_MENTIONS = 10 para acotar el fan-out de notificaciones.
```

`extractMentions` es el único punto que conoce la sintaxis; escritura y render lo
comparten.

## 4. Escritura — `notifyMentions(...)`

Nuevo helper en `src/lib/social/notify-mentions.ts` (server-only), llamado desde las
server actions que dan de alta contenido con texto.

Firma conceptual:

```ts
notifyMentions(supabase, {
  authorId,
  text,
  targetType,   // "diary_entry" | "comment" | "club_post"
  targetId,
  clubId?,      // presente si el target es de club (post o comentario de post)
}): Promise<string[]>  // devuelve los user_id efectivamente notificados
```

Pasos:

1. `extractMentions(text)` → usernames → resolver a `user_id` vía `profile_identities`
   (una query `in (usernames)`).
2. **Filtro de entregabilidad** (capa de app, sin función SQL nueva):
   - **Contenido de perfil** (`diary_entry` / `comment` sobre reseña): si el autor del
     contenido tiene perfil **público** → todos los mencionados; si **privado** → solo
     mencionados que sean **seguidores aceptados** del autor (una query a `follows`:
     `followee_id = author, follower_id in (mentionedIds), status = 'accepted'`).
   - **Post de club** (`club_post`, y `comment` cuyo padre sea un `club_post`) → solo
     mencionados que sean **miembros `active`** del club (`club_members`).
   - Siempre: se excluye la auto-mención y al propio autor de la acción.
   - **Hook Bloque J**: cuando exista `user_blocks`, restar aquí los bloqueos
     bidireccionales. Dejar comentario `// TODO(E5.J1): filtrar user_blocks`.
3. `notifyMany(supabase, { userIds: deliverables, actorId: authorId, type: "mentioned",
   targetType, targetId })` — reutiliza el fan-out en lote ya existente
   (`src/lib/social/notifications.ts`).

**Supersede del ruido**: si el dueño del contenido comentado/likeado está entre los
mencionados, recibe `mentioned` y se le **omite** la notificación genérica
(`review_commented` / `club_post_commented`) por esa misma acción. Se implementa pasando
el conjunto de mencionados a `addComment` / crear-post y excluyendo a esos user_id del
`notify()` de dueño.

**Best-effort**: igual que `notify()`, un fallo aquí nunca deshace la escritura real.

### Puntos de enganche (call sites)
- `addComment` (`src/lib/social/interaction-actions.ts`): tras insertar el comentario,
  `notifyMentions` con `targetType="comment"` (y `clubId` si el comentario cuelga de un
  `club_post`). Coordinar el supersede con el `notify()` de dueño ya presente.
- Crear post de club (`src/lib/clubs/posts.ts`): tras insertar, `notifyMentions` con
  `targetType="club_post"`, `clubId`.
- Guardar reseña (donde se escriba `passes.review`): tras persistir, `notifyMentions` con
  `targetType="diary_entry"`. **Solo en el alta** de la reseña, no en ediciones (§8).

## 5. Autocompletar — `<MentionTextarea>` + `searchMentionCandidates`

### 5.1 Búsqueda de candidatos
Server action `searchMentionCandidates(query, ctx)` en `src/lib/social/mention-search.ts`:

- `ctx = { scope: "club", clubId }`: `club_members` (status `active`) ⋈ `profile_identities`,
  filtrando por prefijo de `username`/`display_name`, límite 6.
- `ctx = { scope: "profile" }`: **grafo primero** — gente que el usuario sigue o le sigue
  y casa la query (reutiliza el patrón de `get-who-to-follow.ts`/`follows.ts`); si no se
  llenan 6, **relleno global** con `search-profiles.ts`, dedup por user_id.

Devuelve `[{ username, displayName, avatarUrl, isInGraph }]` para pintar el dropdown
(el flag permite marcar "sigues").

### 5.2 Componente de composer
`src/components/social/mention-textarea.tsx` — envuelve el `<textarea>` existente:
- Detecta el token `@…` bajo el cursor (desde el último `@` hasta espacio/salto).
- Al haber ≥1 char tras `@`, llama `searchMentionCandidates` (debounced) y muestra
  dropdown anclado al cursor.
- Navegación por teclado: ↑/↓ mueven, Enter/Tab seleccionan, Esc cierra.
- Al seleccionar inserta `@username ` reemplazando el token.
- Un solo componente reutilizado por los 3 composers (reseña, comentario, post de club).
  Es el grueso del trabajo — hacerlo una vez, bien aislado.

## 6. Render — `<MentionText>`

`src/components/social/mention-text.tsx` (cliente-safe, sin fetch propio):

```tsx
<MentionText text={body} knownUsernames={set} />
```

- Parte `text` por `MENTION_RE`.
- Un `@username` se enlaza (`<Link href={"/u/" + username}>@username</Link>`) **solo si**
  `knownUsernames` lo contiene; si no, se renderiza como texto plano (un typo nunca crea
  un enlace muerto).
- `knownUsernames` lo resuelve **el server component que ya trae los datos**, en **batch**:
  extrae menciones de todos los cuerpos de la vista, una query `profile_identities in
  (usernames)`, y pasa el set. Helper `resolveKnownMentions(supabase, texts[])`.

Superficies de render: `review-row.tsx`, `review-card.tsx`, `club-post-card.tsx`, y la
lista de comentarios (`review-interactions.tsx`).

## 7. i18n y tipos

- `notification-types.ts`: añadir `"mentioned"` a la unión `NotificationType` y a
  `NOTIFICATION_TYPE_KEY` (`mentioned: "mentioned"`).
- `messages/*.json`: `notifications.mentioned = "{name} te mencionó"` (y traducciones en
  cada locale presente).

## 8. Límites conocidos (documentar / abrir issue)

- **Cap 10 menciones** por texto (acota el fan-out). Menciones más allá del 10 se ignoran
  a efectos de notificación (siguen renderizándose como enlace si el usuario existe).
- **Editar una reseña no re-notifica** menciones (solo el alta). Evita spam por re-guardado;
  si se quiere "notificar menciones nuevas al editar", va como issue con diff de menciones.
- **Comentarios no tienen edición** (limitación existente del MVP, no la introduce esto).
- **Rename de username** deja menciones antiguas como texto plano (§2) — issue aparte.
- **Bloqueos** (Bloque J) todavía no restan del conjunto entregable — hook anotado (§4).

## 9. Verificación

- **Unit** (Vitest): `extractMentions` — emails, URLs, puntuación adyacente, duplicados,
  mayúsculas/minúsculas, límites de longitud (2/3/30/31 chars), cap 10; filtro de
  entregabilidad (público vs privado, miembro vs no-miembro, self, autor).
- **RLS / impersonación**: mención en reseña de perfil **privado** solo notifica a un
  seguidor aceptado; mención en post de club solo notifica a miembros `active`; no se puede
  spoofear el actor. (Batería estilo Bloques A–H.)
- **E2E** (per `docs/TESTING.md`, default automático): teclear `@`, elegir del dropdown,
  guardar; el mencionado recibe la notificación con enlace correcto; el cuerpo renderiza el
  `@username` enlazado; un no-miembro / no-seguidor mencionado **no** recibe ping.

## 10. Cierre de doc (definición de «hecho»)

1. `docs/requirements/data-model.md`: registrar el nuevo valor `mentioned` del enum
   `notification_type` + fecha de verificación.
2. `docs/requirements/social-epic.md`: marcar **E5.K3** como hecho, con puntero a esta spec.
3. `docs/requirements/decisiones.md`: append — menciones como texto crudo (sin tabla
   sidecar), gate de entregabilidad en capa de app (sin función SQL nueva), y supersede del
   ruido de notificación.
4. Migración aplicada **dev primero, luego prod**; verificar el valor del enum contra
   `pg_enum` (no solo el ledger de migraciones).

## 11. Ficheros

**Nuevos**:
- `src/lib/social/mentions.ts` (parser puro)
- `src/lib/social/notify-mentions.ts` (`notifyMentions`, filtro de entregabilidad)
- `src/lib/social/mention-search.ts` (`searchMentionCandidates`)
- `src/components/social/mention-textarea.tsx` (composer con autocompletar)
- `src/components/social/mention-text.tsx` (render + `resolveKnownMentions`)
- Migración `ALTER TYPE notification_type ADD VALUE 'mentioned'`

**Tocados**:
- `src/lib/social/interaction-actions.ts` (`addComment` → `notifyMentions` + supersede)
- `src/lib/clubs/posts.ts` (crear post → `notifyMentions`)
- flujo de guardado de reseña (`passes.review` → `notifyMentions`, solo alta)
- `src/lib/social/notification-types.ts` (unión + `NOTIFICATION_TYPE_KEY`)
- Composers: reseña, comentario (`review-interactions.tsx`), post de club
- Renderers: `review-row.tsx`, `review-card.tsx`, `club-post-card.tsx`
- `messages/*.json`
