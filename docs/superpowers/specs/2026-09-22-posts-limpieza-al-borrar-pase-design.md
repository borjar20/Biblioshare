# Posts de hito: limpieza al borrar su fuente y borrado manual

> [Histórico · congelado 2026-09-22] Spec de diseño. El estado vivo lo mandan
> `docs/requirements/data-model.md` (§5.1 `posts`) y `docs/requirements/decisiones.md`.

## 1. Problema

Desde que los posts se independizaron de las acciones (spec `2026-08-09-posts-capa-social-design.md`),
un hito publicado sobrevive a la acción que lo creó. Si alguien marca «Terminado» o «Leyendo» por
error y luego borra el pase o quita la obra de la biblioteca, el post sigue en el feed afirmando algo
que ya no es cierto. Y no hay forma de retirarlo a mano: `deletePost` existe y la RLS deja borrar al
autor, pero solo la tarjeta de pensamiento (`thought-card.tsx`) ofrece el menú de borrar.

Hoy ocurre por diseño. La spec de posts, §5, decidió: «borrar la fuente **no** cascadea al post (el post
es la representación social, con su propio texto/hilo)». Esta spec **revisa esa decisión** para los
posts con fuente.

## 2. Decisión

Un post de hito (`started`, `finished`, `dropped`, `progressed`, `watched`) es una **afirmación sobre
una fuente** (pase, sesión o visionado de episodio). Si la fuente deja de existir, la afirmación es
falsa y el post se borra con ella, **aunque tenga comentarios o reacciones de otras personas**. El
diálogo de confirmación que ya precede a esos borrados lo avisa.

Los pensamientos (`thought`, `source_id` null) no tienen fuente y no cambian.

## 3. Alcance

**Dentro:**

1. **Limpieza automática en BD.** Triggers `after delete` en `passes`, `progress_sessions` y
   `episode_watches` que borran los `posts` de esa fuente.
2. **Borrado manual** desde cualquier tarjeta de post propio: hitos, reseña (`finished`/`watched`) y
   avance (`progressed`). Eso cubre Inicio, la actividad del perfil y `/post/[id]`.
3. **Textos de confirmación** de borrar pase y quitar de biblioteca, que avisan de que se van también
   las publicaciones.
4. **Limpieza única de los huérfanos que ya existen** (§4.3). Es un borrado de datos en prod y queda
   sujeto a la medición previa que se describe ahí.

**Fuera (va a issue aparte):**

- **Deshacer un estado** sin borrar el pase (Terminado→Leyendo, Terminado→Abandonado,
  Leyendo→Pendiente). El pase sigue existiendo, así que el trigger no salta y el post `finished` queda.
  Se resuelve a mano con el borrado de la sección 2 de Dentro; la retirada automática se abre como issue.
- **Audios de comentarios** en Storage cuando el post se borra por trigger (§4.4).

## 4. Diseño

### 4.1 Trigger de limpieza

Función nueva `private.cleanup_source_posts()`, `security definer`, `set search_path = ''`, con el
mismo patrón que `private.cleanup_social_target()` (el `source_kind` llega por `tg_argv`):

```sql
delete from public.posts p
where p.source_kind = tg_argv[0]::public.post_source_kind
  and p.source_id = old.id
  and p.author_id = old.user_id;
```

- `author_id = old.user_id` es una **defensa**. `source_kind`/`source_id` los escribe el cliente al
  insertar (hay grant de INSERT sobre esas columnas), así que alguien podría colgar un post suyo de un
  pase ajeno. Sin el filtro, el trigger borraría posts de un tercero; con él, solo los del dueño de la
  fuente.
- Triggers, uno por tabla:
  - `passes` → `cleanup_source_posts('pass')`
  - `progress_sessions` → `cleanup_source_posts('progress_session')`
  - `episode_watches` → `cleanup_source_posts('episode_watch')`
- Borrar un pase borra sus sesiones en cascada (FK `on delete cascade`), y los triggers de fila
  **también saltan en cascada**. Así, los `progressed` de las sesiones del pase caen solos.
- Borrar el post dispara a su vez `posts_cleanup_social_target`, que se lleva el `interaction_target`,
  los comentarios, las reacciones y las notificaciones. No hay nada nuevo que limpiar ahí.
- `revoke execute ... from public, anon, authenticated`, como la función hermana.

**Por qué en BD y no en las server actions:** cubre cualquier camino que borre pases (`deletePass`,
`removeFromLibrary`, deshacer una importación y los que se añadan mañana). Es la lección de #824: si
cada llamador tiene que acordarse, alguno se olvida.

**Caminos que ya borran pases o sesiones, y qué les pasa:**

| Camino | Efecto nuevo |
|---|---|
| `deletePass` (diario de la ficha) | se van los hitos del pase y los `progressed` de sus sesiones |
| `removeFromLibrary` | lo mismo para todos los pases de la obra, más los `watched` de sus episodios (series) |
| borrado de una sesión suelta | se va su `progressed` |
| deshacer la importación de Letterboxd (`undoArchive`) | la importación no publica hitos (el anuncio es un `thought`, sin fuente). Solo cambia algo si el usuario publicó después sobre un pase importado que el deshacer borra: ese post se va con él, que es lo coherente |
| borrar la cuenta | nada nuevo: los posts ya caían por `author_id on delete cascade` |

### 4.2 Borrado manual en las tarjetas

- **Componente compartido** `PostDeleteMenu` (en `src/components/social/`), extraído de
  `thought-card.tsx`: un `ActionMenu` con un único «Eliminar», `window.confirm`, `deletePost(postId)` y
  error en línea si falla. La tarjeta solo desaparece tras `ok: true`, nunca a ciegas.
- Se muestra con `event.viewerCanDelete && event.postId`. El feed ya calcula `viewerCanDelete` para
  todos los posts (`resolvePostInteractions`, dueño o moderador), y `/post/[id]` pasa por el mismo
  resolvedor.
- Dónde se monta:
  - `ThoughtCard`: sustituye su menú propio por el compartido (sin cambio visible).
  - `MilestoneCard` (`started`/`dropped`).
  - `ReviewCard` (`finished`/`watched`).
  - `ProgressTimelineCard`, **solo** cuando el grupo es un singleton que viene de un post
    (`items.length === 1` con `postId`). Los grupos legados de varias sesiones no son un post y no se
    borran desde ahí.
- **En `/post/[id]`** la tarjeta es la cabecera de la página. Si se borra ahí, quedarse en una página
  vacía no tiene sentido: `PostDeleteMenu` recibe `onDeleted`, y la página redirige al feed de Inicio
  (`router.replace("/")`). En feed y perfil, `onDeleted` oculta la tarjeta como hace hoy `ThoughtCard`.
- Textos: se generalizan las claves `feed.thought*` a `feed.postMenu`, `feed.postDelete`,
  `feed.postDeleteConfirm` y `feed.postDeleteError`. El texto de confirmación avisa del hilo: «¿Eliminar
  esta publicación? Se borran también sus comentarios. No se puede deshacer.»

### 4.3 Huérfanos que ya existen

La migración incluye un borrado único de los posts con fuente cuya fuente ya no existe:

```sql
delete from public.posts p
where p.source_kind = 'pass'
  and not exists (select 1 from public.passes s where s.id = p.source_id);
-- ídem progress_session → progress_sessions, episode_watch → episode_watches
```

**Antes de aplicarla en prod, se mide:** el recuento por `source_kind` en dev y en prod, y cuántos
huérfanos tienen comentarios de otras personas. El resultado va en la PR. Si en prod hay huérfanos con
hilo ajeno, se para y se decide con el usuario antes de aplicar. En dev, el ruido de e2e (#825) va a
inflar el número; no es señal de nada.

### 4.4 Límite asumido: audios de comentarios

`deletePost` borra de Storage los audios de los comentarios del post antes de borrarlo. El trigger no
puede hacerlo (SQL no toca Storage). Un post borrado por cascada con comentarios de voz deja sus audios
huérfanos. Es el mismo caso que ya recoge #845 para el borrado de cuenta: se añade allí como camino
nuevo, no se resuelve aquí.

### 4.5 Textos de confirmación

- `passes.deleteConfirm`: «Borrar este pase borra su nota, su reseña, sus sesiones y sus publicaciones
  en el feed. No se puede deshacer.»
- `item.unfollowConfirm`: «Quitarla de tu biblioteca borra TODOS sus pases, con sus notas, reseñas y
  publicaciones. No se puede deshacer.»

## 5. Pruebas

- **SQL (dev, antes de prod), con cliente de sesión:**
  - borrar un pase con post `finished` y otro `started` deja cero posts de ese pase;
  - borrar un pase con sesiones con post `progressed` deja cero posts de esas sesiones (cascada);
  - un post de B colgado de un pase de A **sobrevive** cuando A borra su pase;
  - el `interaction_target` y los comentarios del post borrado desaparecen.
- **Vitest:** `PostDeleteMenu` (confirmar llama a `deletePost`, oculta solo con `ok:true`, pinta error
  si falla, cancelar no llama). Se mantiene lo que ya cubría `thought-card`.
- **e2e (`posts.spec.ts`):**
  1. terminar una obra → aparece el post `finished` en Inicio;
  2. borrar el pase desde el diario → el post ya no está en Inicio;
  3. publicar un hito y borrarlo desde la tarjeta → desaparece;
  4. borrarlo desde `/post/[id]` → redirige a Inicio.

  Contra un `next dev` en 3000 arrancado a mano (memoria: el webServer de Playwright agota el tiempo).

## 6. Documentación

- `decisiones.md`: entrada nueva **al final**. Los posts con fuente se borran con su fuente, lo que
  revisa §5 de la spec de posts, con el motivo del §2 de esta spec.
- `data-model.md` §5.1: la función y los tres triggers, y cambia la frase «posts la referencia» por la
  regla nueva. Actualizar la fecha de verificación.
- `docs/architecture/graph.json`: si el flujo «borrar pase» aparece, añadir el paso del trigger.
- Issues nuevas: (a) retirar el hito al deshacer un estado sin borrar el pase; (b) comentario en #845
  con el camino nuevo de audios huérfanos.
- Sin columnas nuevas, así que no aplica la superficie 6 de `DRIFT-CHECK.md`.

## 7. Orden de despliegue

Migración en dev (`supabase-dev` o, si no conecta, el conector de claude.ai con el project_id de dev),
pruebas SQL, medición de huérfanos en dev y prod, y después prod. El código de UI no depende de la
migración y puede ir en la misma PR.
