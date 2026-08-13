# Diseño — los avisos de seguidores nacen del post, no del hecho

- **Fecha:** 2026-08-13
- **Estado:** diseño aprobado en brainstorming, pendiente de plan de implementación
- **Origen:** el dueño observa que al terminar una sesión de lectura la notificación lleva a la
  ficha del ítem aunque esa sesión sí publicó un post; propone mover el disparo del aviso desde
  el hecho (sesión / cierre de pase) a la creación del post
- **Área:** `area:social`
- **Continúa:** `2026-08-09-posts-capa-social-design.md` (§1: «los comentarios, reacciones y
  notificaciones dejan de llevar a la ficha del contenido»). Este diseño termina de aplicar esa
  regla a los avisos de seguimiento entre personas.

---

## 1. El problema

### 1.1 El síntoma

Alguien a quien sigues registra una sesión de lectura marcando «Compartir». Se publica el post.
La notificación que te llega **abre la ficha de la obra**, no el post.

### 1.2 La causa: un bug de orden

En `src/lib/sessions/actions.ts`, el aviso se emite en la línea 185 y el post se crea en la 214.

```
:170  insert progress_sessions
:185  notifyFollowersOfEvent(… "session" …)   ← aquí todavía no hay post
:214  if (share === "on") createPost({ kind: "progressed", … })
```

`resolvePostInteractionTargetId` (`src/lib/social/notify-followers.ts:38-59`) intenta adivinar el
post preguntando por los posts `progressed` de las sesiones de ese pase. En ese instante el post
de ESTA sesión no existe todavía, así que:

- si ninguna sesión anterior del pase se compartió → cae a la ficha;
- si alguna anterior sí se compartió → **enlaza al post viejo**, que es peor que caer a la ficha,
  porque parece que funciona.

### 1.3 La causa de fondo: el aviso adivina su destino

El bug de orden es arreglable moviendo tres líneas, pero el diseño que lo permite seguiría en pie:
**el aviso se dispara desde el hecho y luego sale a buscar si por casualidad hay un post**. Esa
búsqueda es una heurística —«el post `progressed` más reciente de este pase»— y una heurística
puede acertar por casualidad y fallar en silencio.

Hay una segunda consecuencia del mismo diseño, independiente del orden:
`dedupeKey: person:<type>:<passId>` (`notify-followers.ts:119`) colapsa **un aviso por pase**. Si
la primera sesión de un pase no se comparte, ese aviso —el que apunta a la ficha— ocupa la clave
para siempre, y **ninguna sesión compartida posterior de ese pase genera aviso**. Arreglar el orden
no arregla esto.

### 1.4 El camino `finished` sí funciona hoy (y por qué importa)

`updateStatus` (`src/lib/library/manage-actions.ts:35`) publica el post de hito y **luego** la hoja
de cierre llama a `closePass` (`src/lib/passes/actions.ts:143`), que notifica. El post ya existe,
la heurística acierta. Que un camino funcione y otro no, con el mismo código de resolución, es
exactamente el síntoma de que el destino del aviso depende de un orden accidental entre acciones
que no se coordinan entre sí.

---

## 2. La decisión

**El aviso de seguimiento se emite al publicar un post, no al ocurrir el hecho.**

Consecuencia aceptada de forma explícita por el dueño: **se pierden los avisos de lo que no se
publica**. Quien registra una sesión sin marcar «Compartir» no genera aviso alguno. A cambio, todo
aviso que se emita apunta a un post real, y lo hace por construcción, no por acierto.

`posts` sigue sin ser fuente de verdad: `passes`, `progress_sessions` y `episode_watches` siguen
registrando lo que ocurrió. Lo que cambia es que **la capa social solo notifica lo que la capa
social contiene**.

---

## 3. Dos ejes separados: el tipo da el texto, la categoría da la suscripción

La trampa a evitar: si los tres interruptores de suscripción fueran también los tres tipos de
notificación, la campana diría «publicó un hito» en vez de «terminó *Dune*». Son dos ejes
distintos y se modelan aparte.

### 3.1 `notification_type` — uno por `post.kind`, decide el texto

| `post.kind` | `notification_type` | enum |
|---|---|---|
| `finished` | `followed_finished` | ya existe |
| `progressed` | `followed_session` | ya existe |
| `watched` | `followed_episode` | ya existe |
| `started` | `followed_started` | **nuevo** |
| `dropped` | `followed_dropped` | **nuevo** |
| `thought` | `followed_thought` | **nuevo** |

Se **reutilizan** los tres valores que ya existen: mismos textos, misma agrupación, mismo mapeo de
push. `followed_added` queda huérfano — no se emite nunca más, pero **no se borra**: hay filas
vivas en `notifications` con ese tipo y borrar un valor de un enum de Postgres con filas que lo
usan no es una operación que merezca la pena aquí. Sus claves i18n también se quedan.

### 3.2 `NotifyCategory` — agrupa para el interruptor

```
NOTIFY_CATEGORIES = ["milestone", "progress", "thought"]
```

| categoría | `post.kind` que la disparan |
|---|---|
| `milestone` | `started`, `finished`, `dropped` |
| `progress` | `progressed`, `watched` |
| `thought` | `thought` |

`follows.notify_events` sigue guardando categorías (no tipos): un `text[]` con estos tres valores
posibles.

---

## 4. Un solo punto de disparo

`createPost` (`src/lib/social/post-actions.ts:46`) es el **único** sitio del código que inserta en
`posts`: por ahí pasan el autopost de hito (`autopost.ts:61`), el «Compartir» de la hoja de sesión
(`sessions/actions.ts:216`) y el compositor manual (`thought-composer.tsx`). El fan-out se ancla
ahí y el bug de orden se vuelve imposible de reintroducir.

`createPost` ya resuelve el `interaction_targets` del post para las menciones (`:93-98`). Se
reutiliza esa misma lectura:

```ts
// tras el insert y la resolución del target canónico
if (target) {
  await notifyFollowersOfPost(supabase, user.id, {
    postId: inserted.id,
    kind: input.kind,
    interactionTargetId: target.id,
  });
}
```

Notas de contrato:

- **Best-effort, en su propio `try/catch`**, igual que `notifyMentions`: un fan-out roto no puede
  deshacer un post ya publicado ni convertir un `createPost` correcto en `{ok:false}`.
- Va **después** de las menciones y **antes** de `revalidateFeed()`.
- Si el `interaction_targets` no existe, no se avisa y se registra el error. No debería ocurrir —
  lo materializa un trigger `AFTER INSERT` (`supabase/migrations/20260844_posts.sql:99-115`)— y es
  la misma postura que ya tienen las menciones para el mismo caso.

### 4.1 `notifyFollowersOfPost`

Sustituye a `notifyFollowersOfEvent` en `src/lib/social/notify-followers.ts`. Mantiene la lectura
de `follows` por **service-role** (`notify-followers.ts:89-95`): es un camino de servidor de
confianza y así `notify_events` —preferencia privada de quien sigue— no se expone por RLS al
autor. Filtra igual por `status = 'accepted'` y `notify_events @> [categoría]`.

Cambia lo que escribe:

- **Target:** siempre `interactionTargetId` del post. Nunca `targetType`/`targetId`. El `href` sale
  de `interaction_targets.href`, que la DB fija como `'/post/' || id`. No hay rama de fallback a
  ficha porque no hay nada que adivinar.
- **`dedupeKey`:** `person:<type>:<postId>`. La clave se conserva **solo para idempotencia**
  (doble envío, reintento), no para colapsar: un post es un enlace distinto de otro, y colapsarlos
  significaría tirar avisos que llevan a sitios distintos. Quien publica cuatro sesiones de un
  libro genera cuatro avisos; el volumen lo controla quien publica, que para eso pulsó «Compartir»
  cuatro veces.

### 4.2 Lo que desaparece

- Las llamadas a `notifyFollowersOfEvent` en `sessions/actions.ts:185`, `passes/actions.ts:143` y
  `series/episode-actions.ts:100`.
- `notifyAdded` (`notify-followers.ts:130`) entera, y sus cuatro llamadas:
  `library/quick-add-actions.ts:31`, `library/add-existing-item.ts:30`, `app/buscar/actions.ts:82`,
  `app/buscar/manual/actions.ts:93`.
- **`resolvePostInteractionTargetId` (`notify-followers.ts:17-75`) entera.** Es la heurística; con
  el disparo en `createPost` el post es el sujeto del aviso, no una conjetura sobre él.

`notifyMany`, `notifications.ts` y `resolveTargetHrefs` **no se tocan**: los siguen usando likes,
comentarios, menciones, clubes y los avisos históricos.

---

## 5. Migración de datos

Una migración SQL sobre `follows.notify_events`, que hoy contiene valores de
`["finished","session","episode","added"]`:

| tenía | pasa a tener |
|---|---|
| `finished` | `milestone` |
| `session` **o** `episode` | `progress` |
| cualquier cosa (array no vacío) | `thought` |
| `added` | — se pierde |

Un array vacío se queda vacío: quien no quería avisos de alguien sigue sin recibirlos.

Que `thought` se encienda para todo el que tuviera algo activo es una decisión deliberada del
dueño: «quiero saber de esta persona» se interpreta como que incluye lo que escriba. Es la única
transformación que **añade** avisos que nadie pidió literalmente, y por eso se deja escrita aquí.

Enum: tres `ALTER TYPE public.notification_type ADD VALUE` (`followed_started`, `followed_dropped`,
`followed_thought`). No se borra ningún valor.

**No hay columna nueva**, así que la superficie 6 de `docs/DRIFT-CHECK.md` (grants por columna) no
aplica. `notify_events` ya tiene su grant desde `20260804000000_follow_notify_events.sql`.

---

## 6. Superficie de UI

- **`src/components/social/notify-bell.tsx`**: tres casillas en vez de cuatro. Se elimina
  `HINTED = "added"` (`:9`) y su `notifyAddedHint` (`:98`). El resto del componente es genérico
  sobre `NOTIFY_CATEGORIES` y no necesita cambios.
- **`messages/es.json`**: tres etiquetas de categoría nuevas (`notifyMilestone`, `notifyProgress`,
  `notifyThought`) y tres textos de aviso nuevos (`followedStarted`, `followedDropped`,
  `followedThought`). `notifyFinished`/`notifySession`/`notifyEpisode`/`notifyAdded` como etiquetas
  de categoría se retiran; `followedFinished`/`followedSession`/`followedEpisode`/`followedAdded`
  como textos de aviso **se quedan** (§3.1).
- **`src/lib/push/types.ts:81-120`**: los tres tipos nuevos necesitan categoría push —
  `followed_started` y `followed_dropped` → `"progress"`; `followed_thought` → `"social"`.
- **`src/lib/social/notification-types.ts`**: tres entradas en `NOTIFICATION_TYPE_KEY`.
- **`src/components/social/notification-bell.tsx`**: sin cambios. Ya pinta `n.href` tal cual.

---

## 7. Verificación

- **`src/lib/social/notify-followers.test.ts`** — reescrito sobre el contrato nuevo: entra un post,
  sale un aviso con el tipo que corresponde a su `kind`, con `interaction_target_id` del post y
  `dedupeKey person:<type>:<postId>`. Un caso por cada uno de los seis `kind`.
- **`src/lib/social/post-actions.test.ts`** — `createPost` dispara el fan-out con el target ya
  resuelto; un fan-out que lanza **no** convierte el resultado en `{ok:false}`.
- **Migración de `notify_events`** — test de la transformación de §5, incluido el array vacío.
- **e2e `posts.spec.ts`** — sesión **con** «Compartir»: quien sigue recibe el aviso y la campana
  abre `/post/[id]`. Sesión **sin** «Compartir»: cero avisos. El segundo caso es el que hoy no
  cubre nadie (`e2e/avisos-por-persona.spec.ts:52` solo comprueba que el toggle persiste, nunca que
  llegue el aviso).

---

## 8. Lo que se pierde, escrito a propósito

1. **Terminar un pase sin publicarlo no avisa a nadie.** Pasa si `autopost_finished` está apagado,
   y también en el auto-cierre desde la hoja de sesión (`sessions/actions.ts:291`), que llama a
   `applyTransition` directamente sin pasar por `manage-actions.ts` y por tanto sin autopost. Es el
   trato aceptado en §2, pero conviene saber que el segundo caso no es una preferencia del usuario
   sino un camino de código que hoy no publica.
2. **Marcar un episodio deja de avisar del todo.** `watched` es un `PostKind` declarado
   (`post-actions.ts:15`) que **nadie crea**: `setEpisodeWatched` avisa pero no publica. Hasta que
   exista «compartir episodio», la categoría `progress` solo la dispara `progressed`. → issue
   aparte, `area:social` · `tipo:deuda` · `P2`.
3. **«Añadió a su biblioteca» desaparece.** No hay post que abrir y no lo habrá: añadir no es un
   hito publicable (`autopost.ts:17-25`, y la regla «acción administrativa nunca publica» de
   `manage-actions.ts:32-34`).

---

## 9. Definición de hecho

- `docs/requirements/data-model.md` — enum `notification_type` con tres valores nuevos, y el nuevo
  dominio de `follows.notify_events`. Actualizar fecha de verificación.
- `docs/requirements/decisiones.md` — entrada **al final**: los avisos de seguimiento se emiten al
  publicar, no al ocurrir el hecho; se acepta perder los avisos de lo no compartido a cambio de que
  el destino del aviso sea correcto por construcción.
- `docs/requirements/backlog.md` — marcar la casilla si el ítem correspondiente existe.
- Issue de `watched` sin productor (§8.2).
