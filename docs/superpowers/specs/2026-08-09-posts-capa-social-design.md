# Diseño — `posts` como capa social de primera clase

- **Fecha:** 2026-08-09
- **Estado:** diseño aprobado en brainstorming, pendiente de plan de implementación
- **Origen:** petición del dueño (replantear el sistema social para que los `posts` sean la
  entidad canónica de feed, perfil, comentarios, reacciones, notificaciones y deep links)
- **Área:** `area:social`
- **Supersede parcialmente:** `2026-08-06-pensamientos-post-design.md` (la tabla `thoughts` se
  absorbe en `posts`; ver §6)

---

## 1. Objetivo

Que **cada publicación social sea una entidad `posts` de primera clase** con `post_id`
estable y **ruta propia `/post/[id]`**. Los comentarios, reacciones y notificaciones dejan de
llevar a la ficha del contenido y pasan a poder recuperar **la conversación del post**.

Se mantiene separada la **acción real** de su **representación social**:

- `passes`, `progress_sessions`, `episode_watches` siguen siendo la **fuente de verdad** de lo
  que ocurrió.
- `posts` **referencia** esas entidades (opcionalmente) y representa **lo que se muestra
  socialmente**.

El usuario debe seguir percibiendo Biblioshare como un **tracker cultural**; los posts
**emergen** de su actividad, no de un compositor separado. La decisión de compartir vive
**dentro del propio formulario de registro**.

### 1.1 Objetivos de interacción (directriz explícita del dueño)

Sobre el estado actual, se prioriza la conversación:

- **Comentar más visible y con menos fricción** — el llamado a comentar está presente sin un
  clic extra; la caja de comentario es accesible desde la tarjeta y central en `/post/[id]`.
- **Texto más grande** para leer los hilos generados. El hilo es ciudadano de primera en
  `/post/[id]`, no un apéndice.

Estos objetivos son requisitos de las superficies de lectura (§7), no un detalle de estilo. Su
concreción visual pasa por el **gate de prototipos** (§7.4).

---

## 2. Estado actual (lo que ya existe y condiciona el diseño)

1. **`interaction_targets` ya es un registro canónico** con UUID estable, `owner_id`,
   audiencia, `href` y flags `commentable`/`reactable`. **`comments`, `reactions` y
   `notifications` ya apuntan a `interaction_target_id`**, no a las tablas fuente (Social fase
   1, en prod desde 2026-08-02). Se materializa por **triggers** desde `passes` (emite
   `diary_entry` y `pass`), `progress_sessions`, `episode_watches`, `club_posts`, `thoughts`,
   `club_activities`, checkpoints y `comments`.
2. **`interaction_targets` es MÁS ANCHO que «posts»**: materializa una fila para *todo lo
   comentable/reaccionable*, incluidos **los propios comentarios** (para responder/reaccionar),
   los **checkpoints** de lectura conjunta y los **posts internos de club**. Un comentario no
   es un post; un checkpoint no es un post.
3. **`thoughts`** (2026-08-07 en prod) es el primer contenido **autoral**: texto anclado a una
   entidad, con comentarios/reacciones por la vía estándar. Es, de hecho, «un post».
4. **`getFeed` NO lee de ninguna tabla `posts`**: hace *fan-out on-read* sobre 6 fuentes
   (`passes/added`, `progress_sessions`, `passes/finished`, `episode_watches`, `thoughts`,
   actividad de club) y resuelve el target de cada tarjeta en batch. **No hay gate de
   compartir**: hoy toda actividad de tus seguidos es visible; la visibilidad es por `follows`
   + `is_public` (solo para el texto de reseña).
5. Hoy el `href` de un target (y por tanto de la notificación) apunta a la **ficha del
   contenido** (`/libro/…`), no a una página de post.

Conclusión: buena parte de lo pedido (id estable, owner, comentarios/reacciones ya
convergidos) **ya existe** en `interaction_targets`. Falta: ruta `/post/[id]`, cuerpo de texto,
**gate de publicación** (hoy se materializa target para todo, no solo lo compartido) y
preferencias por tipo.

---

## 3. Decisiones de arquitectura (brainstorming)

1. **`posts` = tabla nueva y FINA, 1:1 con su `interaction_target`.** Ni renombrar
   `interaction_targets` (metería comentarios/checkpoints/club dentro de «posts», altura
   equivocada), ni tabla paralela pesada que obligue a migrar `comments`/`reactions`/
   `notifications` (caro y rompería comentarios-a-comentarios y chat de checkpoints, que se
   anclan a `interaction_target_id` y **no** son posts).
2. **Los comentarios y reacciones NO se migran.** Siguen colgando de `interaction_target_id`.
   Como post↔target es 1:1, el hilo se recupera desde `post_id` (post → su target → sus
   comentarios). Esa **ES** la «convergencia progresiva a `post_id`» que se pidió, sin
   reescribir tres tablas.
3. **Modelo de publicación híbrido** (§5): hitos autopublican (según preferencia); progreso
   ordinario solo publica al **Compartir**; pensamiento/reseña son explícitos; acción
   administrativa **nunca** publica.
4. **El texto social vive en `posts.body`** para pensamiento y comentario-al-compartir; la
   **reseña sigue en el pase** (su hogar canónico) y el post `finished` la **muestra**. La
   tabla `thoughts` se **absorbe** en `posts` (§6).
5. **Visibilidad = la del perfil** (visible a quien pueda ver tu perfil, igual que los
   pensamientos hoy). **No** hay público/seguidores/privado por post. La «preferencia por tipo»
   es solo **autopublicar SÍ/NO** por actividad.
6. **Club fuera de `posts`** (por ahora): las actividades de club son otra superficie con su
   propio modelo; el feed las sigue mezclando como fuente aparte.
7. **El feed ordena por fecha de PUBLICACIÓN** (`posts.created_at`), no por la fecha semántica
   backdateada. Un terminado marcado «la semana pasada» aparece **al publicarlo**, como en
   cualquier red social.

---

## 4. Modelo de datos

### 4.1 Tabla `posts`

```
posts
  id           uuid pk default gen_random_uuid()   -- el post_id → ruta /post/[id]
  author_id    uuid not null → auth.users(id) on delete cascade
  kind         post_kind not null      -- started|finished|dropped|progressed|watched|thought
  anchor_type  post_anchor_type not null   -- book|movie|series|saga|person (SIEMPRE: "no posts libres")
  anchor_id    uuid not null           -- polimórfico, SIN FK (misma renuncia que thoughts/saga_items)
  source_kind  post_source_kind null   -- pass|progress_session|episode_watch (NULL para thought)
  source_id    uuid null
  body         text null               -- texto social, char_length <= 2000
  is_spoiler   boolean not null default false
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()   -- trigger set_updated_at()
```

Índices y restricciones:

- `unique(source_kind, source_id, kind) where source_id is not null` — **idempotencia**: un
  reintento o «editar el compartido» no duplica; un mismo pase puede tener un post `started` y
  otro `finished` (distinto `kind`), pero no dos `finished`.
- `posts_author_created_idx (author_id, created_at desc, id desc)` — clave de orden del feed
  (una sola tabla → cursor keyset trivial `(created_at, id)`).
- `posts_anchor_idx (anchor_type, anchor_id)` — «posts sobre esta entidad» (superficie de
  lectura fuera de v1; hereda el índice de `thoughts_anchor_idx`).

Notas de modelo:

- **`anchor_*` = de qué trata** (siempre presente). **`source_*` = la acción real** que lo
  originó (null para un pensamiento puro). Para un post derivado de pase/sesión/watch, el ancla
  es redundante con la fuente pero **denormalizada** para que el feed lea sin join a la fuente.
- **`rated`/`reviewed` no son `kind`.** La nota y la reseña son atributos del pase; el post
  `finished` los muestra leyendo `pass.rating`/`pass.review`. Editar la reseña luego edita el
  pase; el post refleja el cambio (lee en vivo).
- `body` se usa en `thought` (el pensamiento) y en `progressed` (comentario opcional al
  compartir). En `finished`/`started`/`dropped`/`watched`, `body` suele ser null y el texto (si
  hay) sale del pase.

### 4.2 Enums nuevos

- `post_kind`: `started | finished | dropped | progressed | watched | thought`.
- `post_anchor_type`: `book | movie | series | saga | person` (superset de `item_type` +
  saga/person; hereda de `thought_anchor_type`).
- `post_source_kind`: `pass | progress_session | episode_watch`.
- `target_kind` += **`post`** (verificar el enum REAL en dev y prod y ampliarlo en la misma
  migración — trampa de constraints reales, regla del repo).
- `notification_type` += **`post_commented`**, **`post_liked`** (mismo par
  `<entidad>_commented`/`<entidad>_liked` del resto). Ampliar también las uniones literales
  manuales `NotificationType`/`TargetType` en `src/lib/social/` y sus mapas
  (`NOTIFICATION_TYPE_KEY`, `NOTIFICATION_CATEGORY` en `src/lib/push/types.ts`, categoría
  `social`), o `tsc` rompe (lección de la fase de `thoughts`).

### 4.3 Enlace con `interaction_targets`

Trigger `sync_post_interaction_target()` (`after insert on posts`, patrón idéntico a
`sync_thought_interaction_target`):

- crea **un** `interaction_target` con `kind='post'`, `source_id=post.id`, `owner_id=author_id`,
  audiencia `profile`/`author_id`, `href='/post/'||post.id`, `commentable=reactable=true`,
  `comment_notification_type='post_commented'`, `reaction_notification_type='post_liked'`.
- `cleanup` en `after delete` vía el genérico `private.cleanup_social_target('post')` (cascada
  de target, comentarios, reacciones y avisos; `content_reports` conserva snapshot con
  `target_deleted_at`).
- Añadir la rama `'post'` a `private.social_target_owner_id` (para moderación/borrado, como se
  hizo con `'thought'`).

Se **retiran** los triggers que hoy materializan targets `pass`/`diary_entry`/
`progress_session`/`episode_watch`/`thought`. Se **conservan** `comment`/`club_post`/
`club_activity`/`activity_checkpoint`.

### 4.4 Tabla `post_preferences`

```
post_preferences               -- una fila por usuario, OPT-OUT (sin fila = defaults)
  user_id            uuid pk → auth.users(id) on delete cascade
  autopost_started   boolean not null default false
  autopost_finished  boolean not null default true
  autopost_dropped   boolean not null default false
```

- Default propuesto: **finished ON; started y dropped OFF** (menos ruido; el usuario los
  activa). El progreso **nunca** es preferencia: es el toggle por-compartir.
- **No hay `autopost_watched`**: una película es un **pase**, y marcarla vista = pase
  `finished` (cubierto por `autopost_finished`). El `kind` `watched` es **solo para episodios
  de serie**, que en v1 son **share-only** (§5.1), no autopublican, así que no necesitan
  preferencia.
- RLS self-only. **Grants por columna** en la misma migración (regla #375 / DRIFT-CHECK
  superficie 6): una columna nueva sin grant rompe la escritura entera de la tabla.

---

## 5. Modelo de publicación híbrido

| Actividad | ¿Genera post? | `kind` | Default |
|---|---|---|---|
| Empezar una obra (→ `in_progress`) | Sí, hito | `started` | auto (pref, OFF) |
| Terminar / completar (→ `finished_on`) | Sí, hito | `finished` | **auto (pref, ON)** |
| Abandonar (→ `dropped`) | Sí, hito | `dropped` | auto (pref, OFF) |
| Marcar **película** vista (= pase completado) | Sí, hito | `finished` | **auto (`autopost_finished`, ON)** |
| Valorar / Reseñar | **Atributo** del post `finished`, no post suelto | — | — |
| Registrar **progreso** (sesión) | Solo al **Compartir** | `progressed` | off (toggle) |
| Marcar **episodio** de serie visto | v1: solo al Compartir; end-state: **agrupado** | `watched` | ver §5.1 |
| Añadir a pendientes (`planned`) | **No** (bajo señal; hoy el feed ya lo suprime) | — | — |
| Acción administrativa (editar edición, mover a colección…) | **Nunca** | — | — |
| Pensamiento | Sí, explícito (publicar es la acción) | `thought` | — |

**Quién y cuándo escribe el post:**

- **Hitos de pase** (`started`/`finished`/`dropped`): al aplicar la transición
  (`planTransition`/`applyTransition` en `src/lib/passes/transitions.ts`), tras escribir el
  pase, si la preferencia del tipo está activa → `insert into posts`. Idempotente por el
  `unique`.
- **Progreso**: `addSession` inserta la sesión (fuente de verdad, siempre); si el toggle
  «Compartir» está activo → además un post `progressed` con `body` = texto opcional.
- **Película vista**: es un pase que se completa → lo cubre el writer de `finished` (una peli
  es una obra; no hay writer aparte).
- **Episodio** (`kind='watched'`): al crear el `episode_watch`, v1 solo publica si el toggle
  «Compartir» está activo (sin autopublicar; agrupado en Spec 3).
- **Pensamiento**: el compositor existente escribe directamente `insert into posts (kind='thought')`.

El post referencia la fuente por `source_kind`+`source_id`; borrar la fuente **no** cascadea al
post (el post es la representación social, con su propio texto/hilo — decisión análoga a «un
pase guarda nota y reseña, no se borra en cascada»). Un post huérfano de fuente se degrada con
gracia (se conserva `anchor_*` denormalizado para render).

### 5.1 Episodios agrupados (fase propia)

El end-state elegido: ver varios episodios seguidos **colapsa en UN post** («vio 6 episodios de
X»), por ventana temporal (como ya agrupa el feed hoy). Añade *windowing* real, así que se
**aísla en la Spec 3**. **v1**: el episodio se registra siempre y solo publica al Compartir (sin
autopublicar por episodio para no inundar en maratones).

---

## 6. Migración / backfill

### 6.1 Promoción in-place (evita reescribir comentarios)

Para el historial con interacciones ya existentes, **se promueve el target en su sitio**: misma
fila `interaction_targets.id`, se le cambia `kind→'post'`, `source_id→` (el nuevo `post.id`) y
`href→/post/[id]`. Los `comments`/`reactions`/`notifications` conservan su
`interaction_target_id` **intacto** (misma fila). **Cero re-apuntado.**

Backfill de `posts` (forward-only, en la migración de datos):

- Cada pase con `finished_on` → post `finished` (promueve el target `diary_entry` existente).
- Cada `thought` → post `thought` (promueve su target `thought`; ver §6.2).
- Sesiones con **nota pública** → post `progressed` (promueve el target `progress_session`); el
  resto de sesiones, **sin post** (dejan de ser visibles socialmente — cambio de
  comportamiento aceptado).
- `episode_watches` con interacción → post `watched`.
- Pases `started`/`dropped` históricos: **sin backfill** por defecto (bajo señal; evita llenar
  perfiles de golpe). Revisable.

Los posts **nuevos** (post-lanzamiento) van al revés: `insert into posts` → el trigger crea un
target fresco `kind='post'`. Ambos caminos terminan igual: target `kind='post'`,
`href=/post/[id]`, con `comments`/`reactions` colgando de él.

### 6.2 Absorción de `thoughts`

- Migrar filas `thoughts` → `posts (kind='thought', anchor_*=thoughts.anchor_*, body=thoughts.body,
  is_spoiler, created_at)`.
- Promover cada target `thought` a `post` (in-place; comentarios/reacciones intactos).
- **Retirar** (orden de despliegue, §11): primero el código deja de leer `thoughts` (feed,
  compositor, tarjeta, hilo pasan a `posts`); **después** se hace `drop` de la tabla `thoughts`
  y su trigger. Los **valores de enum muertos** (`thought` en `target_kind`,
  `thought_commented`/`thought_liked` en `notification_type`) **NO se dropean**: quitar un valor
  de enum en Postgres exige recrear el tipo, y son inertes una vez que nada los escribe. Se
  dejan en su sitio (deuda cosmética → issue si molesta).

---

## 7. Superficies de lectura

### 7.1 Feed (`getFeed`)

Reescritura: lee **una** tabla, `posts`, de `author_id in (seguidos ∪ tú)`, orden
`created_at desc, id desc`, cursor keyset trivial. En batch: catálogo del ancla
(`books`/`movies`/`series`/`sagas`/`people`), filas fuente para display extra
(`pass.rating`/`review` en `finished`, `position` en `progressed`, episodio en `watched`), y el
resumen de interacciones por los targets `post` (`getInteractionSummary(supabase, 'post', …)`).

Se elimina el *fan-out* de 6 fuentes, los cursores por-fuente y toda la maquinaria
`orderDate/sortDate/eventDate/sessionRelativeBasis` (el feed ordena por fecha de publicación).
El **problema de inundación por import desaparece** (añadir no autopublica). Los **eventos de
club** siguen como fuente aparte que se mezcla en el orden final.

> **Regla #437 (cache + RLS):** el feed y `/post/[id]` son lecturas **filtradas por RLS por
> usuario** → **no cacheables en servidor**. Nada de `use cache` sobre estas rutas de datos;
> quedan tras `<Suspense>`. Probar los e2e contra **build de producción**, no solo `next dev`.

### 7.2 Perfil (pestaña Actividad)

Misma lectura de `posts` con `author_id = perfil` (reutiliza `getFeed` con `actorId`, como hoy).

### 7.3 `/post/[id]` (ruta nueva)

`src/app/post/[id]/page.tsx`: carga el post (RLS por la audiencia de su target vía
`can_view_interaction_target`) + **el hilo completo**. Es donde aterrizan notificaciones y deep
links. **Notificaciones**: ya llevan `interaction_target_id`; como el `href` del target es
`/post/[id]`, enlazan al post **sin tocar el escritor de notificaciones**.

Requisitos de interacción (§1.1): el hilo es el contenido principal, con **texto grande y
legible**; la caja de comentario es prominente y accesible; reacciones y «comentar» sin fricción.

### 7.4 Gate de prototipos (antes de construir la UI)

Antes de codificar las superficies de lectura (fase de UI), se producen **maquetas PC y móvil**
de **feed, perfil y `/post/[id]`**, con énfasis en los objetivos de interacción (§1.1). El dueño
**aprueba la maqueta** antes de que se implemente. (Herramienta a decidir: companion visual /
mockups HTML / frontend-design.)

---

## 8. Superficies de escritura (compartir en el formulario)

Sin compositor separado: la decisión de compartir vive en el formulario de registro.

- **Sesión de progreso** (`SessionNotebook`/`addSession`): toggle **«Compartir en mi perfil»**
  (default off) + el texto opcional pasa a ser `body` del post `progressed`. Sin compartir →
  solo la sesión (+ nota privada como hoy).
- **Terminar / empezar / abandonar**: autopublican según `post_preferences`; la nota/reseña que
  ya se captura se adjunta al pase y el post la muestra. Indicador sutil de «compartido».
- **Película vista**: toggle de compartir (o autopublicar según pref).
- **Episodio**: toggle de compartir (v1; agrupado en Spec 3).
- **Pensamiento**: el compositor ya es explícito → escribe `posts (kind='thought')`.
- **UI de preferencias** (`post_preferences`): en ajustes, los cuatro interruptores de
  autopublicación.

Las notificaciones sociales se siguen escribiendo desde **servidor con `service_role`**.

---

## 9. Alcance y no-alcance

**Dentro:** entidad `posts` + ruta; target `post`; modelo híbrido; compartir-en-formulario;
preferencias; feed/perfil/`/post/[id]` leyendo de `posts`; absorción de `thoughts`; backfill;
notificaciones al post.

**Fuera (v1):** club como posts (sigue fuente aparte); visibilidad público/seguidores/privado
por post; episodios agrupados (Spec 3); «posts sobre esta entidad» en fichas; edición/borrado
desde la tarjeta más allá de lo que ya permite la RLS.

---

## 10. Descomposición en specs (migración-primero)

1. **Spec 1 — Núcleo `posts`**: esquema + enums + `post_preferences`; target `post` + trigger +
   retirada de triggers fuente; **backfill** (promoción in-place + absorción de `thoughts`);
   `/post/[id]`; reescritura del feed a `posts`; flip de href de notificaciones. Writer mínimo
   (pensamiento + terminar) para probarlo extremo a extremo.
2. **Spec 2 — Compartir en formularios + writers de hito + preferencias**: toggle en
   sesión/episodio/peli, autopublicación en transiciones (started/finished/dropped), UI de
   `post_preferences`. **Gate de prototipos (§7.4) al inicio de la fase de UI.**
3. **Spec 3 — Episodios agrupados**: post-maratón por ventana.
4. **Follow-ups (issues):** posts en fichas, edición desde la tarjeta, etc.

Cada spec → su plan → su implementación, cada una con su ciclo dev-primero-luego-prod y su
casilla en `backlog.md`.

---

## 11. Riesgos y reglas del repo a respetar

- **Migración-primero-luego-merge**, y para cualquier `DROP` (tabla `thoughts`, triggers,
  valores de enum muertos): **código primero, esquema después**; dev primero, prod después.
  Verificar contra objetos reales (`pg_proc`/`pg_class`/`pg_enum`/`to_regclass`), nunca contra
  `list_migrations`.
- **Enums/CHECK reales**: `target_kind += 'post'` y `notification_type += post_*` deben
  ampliarse verificando el enum real en dev **y** prod; los fakes de test no aplican
  constraints.
- **Grants por columna (#375)**: toda columna nueva de `posts`/`post_preferences` con su grant
  en la misma migración (correr DRIFT-CHECK superficie 6).
- **Cache + RLS (#437)**: nada de `use cache` en feed/`/post/[id]`; e2e contra build de prod.
- **Uniones literales de TS** (`NotificationType`/`TargetType`) hay que ampliarlas a mano o
  rompe `tsc`.
- **`database.types.ts`**: acotar a las adiciones de esta feature (`git checkout origin/main --`
  + re-aplicar) para no arrastrar drift ajeno; `git fetch` antes de culpar a un drift.
- **Todo pendiente = issue** con sus tres etiquetas (`area:social`, `tipo:*`, `P*`).

---

## 12. Cuestiones abiertas / a decidir en el plan

- Backfill de `started`/`dropped` históricos: por defecto **no** (bajo señal). Confirmar en el
  plan si se quiere sembrar algo.
- Herramienta del gate de prototipos (§7.4).
- ¿Un post `progressed` sin `body` (compartir «avancé» sin texto) es válido? Propuesta: sí, el
  hito de progreso compartido vale por sí mismo; `body` opcional.
