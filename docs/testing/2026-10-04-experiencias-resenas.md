# Experiencias — reseñas por momento

> **[Evidencia · 2026-10-04 · local + biblioshare-dev; producción NO aplicada]**

Cierre de la entrega «reseñas por momento y ampliaciones» sobre la rama
`feat/experiencias-resenas` (seguimiento #1293). Contrato:
[spec](../superpowers/specs/2026-10-04-experiencias-resenas-design.md). Esquema: §8ter.1 de
[data-model.md](../requirements/data-model.md). Node 22, Next 16.3.8 y React 19.2.4 del
lockfile existente; sin dependencias nuevas.

Este documento distingue entorno por entorno. Un resultado de un entorno no acredita
el siguiente: lo verificado en dev no dice nada de producción.

## Estado por entorno

| Entorno | Estado verificado |
|---|---|
| Local (bootstrap vacío, Docker) | Seis migraciones aplicadas en el orden del manifiesto; `npm run test:db:local` PASS con 288 pasos de bootstrap. |
| `biblioshare-dev` | Seis migraciones aplicadas con `apply_migration`, contenido exacto de cada fichero (la sexta, `20261004100500`, tras la revisión final); objetos verificados contra `pg_proc`/`pg_class`/`pg_policies`; `experiences_reviews.sql` PASS con rollback. |
| E2E | 16/16 contra `next build` + `next start` en el puerto 3000, un worker, cero reintentos. |
| Producción | **Aplicado el 2026-10-04 con el visto bueno del propietario**, en el orden de «Despliegue a producción». Antes de aplicar, los 23 digests de funciones, políticas y restricciones afectadas coincidían con los de dev previos a su migración. Tras aplicar se verificaron contra objetos reales: 13 funciones sin EXECUTE de `PUBLIC` (`anon` solo en `get_experience_rating_summaries` y helpers de `private`), RLS, 3 políticas, solo `SELECT` en la tabla, 4 triggers, CHECK ampliados, enums y el filtro de destinatarios. El digest conjunto de las 77 funciones de Experiencias y moderación es idéntico en dev y producción. No se ejecutaron fixtures en producción. Después se fusionó la PR #1376 (merge `bcd3c869`) y Vercel desplegó con éxito. Smoke anónimo: `/`, `/experiencias`, `/comunidad` y la pestaña Experiencias de un perfil devuelven 200 sin errores de render. |

## Migraciones

En orden de dependencia (la de enums va sola, porque Postgres no deja usar un valor de enum
en la transacción que lo crea):

1. `20261004100000_experience_reviews_enums.sql`
2. `20261004100100_experience_moment_kinds.sql`
3. `20261004100200_experience_reviews_core.sql`
4. `20261004100300_experience_reviews_social.sql`
5. `20261004100400_experience_reviews_moderation.sql`
6. `20261004100500_experience_reviews_notify_access.sql` — solo `create or replace` de
   `experience_save_moment_review`: los destinatarios de `experience_reviewed` exigen acceso
   actual (revisión final, I2). Conserva el ACL (`authenticated` y `service_role`).

## Unitarios (Vitest, local)

| Corte | Resultado |
|---|---|
| Acciones, validación y componentes de Experiencias tras la ronda de correcciones de las server actions | 14 archivos, 93 pruebas PASS (`src/lib/experiences`, `src/components/experiences`) |
| Suite `src/lib src/components src/app` tras el delta de feed y perfil | 461 archivos, 4.586 pruebas PASS |
| Suite `src/components src/lib src/app` tras favorito, tipos nuevos, nota en tarjetas y orden del hub | **465 archivos, 4.607 pruebas PASS** (último corte de la suite completa) |
| Panel de moderación (reseña con nota de solo lectura) | 3 pruebas nuevas; 19 pruebas PASS en admin y moderación |
| Correcciones de la revisión final (avisos en paralelo, denunciar solo con sesión, vaciar = borrar con confirmación, diálogo de asistencia solo con `PT409`); `npx vitest run` completo | 5 pruebas nuevas vistas en RED; **466 archivos, 4.615 pruebas PASS** |

`tsc --noEmit`: 0 errores en cada corte. `eslint` limpio sobre los ficheros cambiados; el
`npm run lint` global conserva 9 errores y 28 avisos previos en `test-results/*.cjs` sin
seguimiento, ajenos a esta rama.

## SQL local (`supabase/tests/experiences_reviews.sql`)

Reconstrucción vacía del stack local y `npm run test:db:local`, con el test terminando en
`rollback`. Actores que el test usa de verdad: creador, miembro aceptado asistente, miembro
aceptado no asistente, tercero con cuenta, invitado sin aceptar, anónimo (`set local role anon`
sin claim), invitado sin cuenta (fila de `experience_add_guest`) y administrador. Lo que
afirma, sin más:

- sin `attended` (asistencia `planned`): rechazo `42501`; nota fuera de 1–10 y texto > 4000:
  `22023`; upsert con una fila por persona y momento; escritura directa por REST cerrada;
- invitado sin cuenta: un INSERT directo como superusuario (`reset role`) con su fila de
  participante y asistencia `attended` lo rechaza el guard (`42501`, «attended lived account
  required»). La RPC no tiene camino para él: busca la fila aceptada de `auth.uid()`;
- cambiar asistencia con reseña: `PT409` sin `p_drop_reviews`; con él, borra la reseña; no
  queda la sobrecarga de dos argumentos;
- pasar a `planned` oculta (sin borrar) y volver a `lived` recupera;
- lectura: el grupo lee; el tercero no lee sin `share_with_profile` + `share_identity`, ni
  cuando se retira el flag; bloqueo creador↔autor oculta la atribución; el invitado sin
  aceptar no lee una reseña no compartida ni obtiene media; el anónimo lee solo la reseña
  compartida de una experiencia `profile` (no la no compartida) y la media que recibe cuenta
  solo esa;
- media: dentro del grupo cuenta todo lo visible; fuera, vacía si nada es compartido;
- hub ordenado: solo experiencias propias aceptadas; con dos experiencias, la puntuada va
  antes que una más reciente sin nota; `kind` desconocido: `22023`;
- avisos (`notifyUserIds`): un miembro aceptado normal y el creador los reciben y el autor no;
  un miembro bloqueado con el creador queda fuera; en una experiencia `private` la lista va
  vacía;
- retirar a un participante (`experience_remove_participant` como creador) borra en cascada
  sus reseñas y su post publicado, sin dejar marcador de operación;
- publicación: exige consentimiento y audiencia `profile`; **idempotente (secuencial)**: dos
  llamadas seguidas devuelven el mismo post. No hay prueba concurrente de la publicación de
  reseñas (la de `verify-experience-concurrency.mjs` es de `experience_publish`, el post de
  la experiencia). El post de una reseña moderada por un administrador no se recrea (borrado
  y retirada); el guard exige la RPC aunque se salte la RLS;
- retirar consentimiento, borrar y despublicar funcionan bajo bloqueo y bajo moderación,
  sin dejar marcador de operación ni historial falso;
- denuncia: sin acceso, propia, motivo inválido, detalles largos y reseña inexistente se
  rechazan; la evidencia no es legible por quien denuncia; al borrar la reseña, la denuncia
  queda `actioned`;
- moderación: listar, retirar, restaurar y eliminar; reseña retirada no editable ni vaciable;
  cascada desde la experiencia (retirada y borrado con un historial por reseña);
- cero `EXECUTE` de `PUBLIC` en las funciones `experience%review%`; `anon` sin EXECUTE en
  `experience_save_moment_review`.

Cada caso añadido tras la revisión final va en su propio `savepoint` y deja el estado igual.
Los de avisos se vieron fallar (RED) contra las cinco migraciones previas y pasar tras
`20261004100500`; los de privacidad pasan sin cambio de esquema (cobertura). Última ejecución
completa: `PASS: 288 bootstrap steps, schema contracts and role privileges.`

## SQL en dev

`supabase/tests/experiences_reviews.sql` ejecutado entero en `biblioshare-dev` mediante
`execute_sql` (BEGIN … ROLLBACK): PASS, ninguna excepción `FAIL`. Repetido el 2026-10-04 con
los casos de la revisión final, tras aplicar `20261004100500`: PASS; después, 0 experiencias
`[TEST] reviews%` y 0 perfiles `rev_%`.

`20261004100500` en dev: antes de aplicarla, el `md5(prosrc)` de
`experience_save_moment_review` en dev era idéntico al cuerpo de `20261004100400`
(`8e0b61e9…`). Después: el `prosrc` contiene `e.audience<>'private'`, ACL sin cambios
(`postgres`, `authenticated`, `service_role`; ni `anon` ni `PUBLIC`). Comprobación de que no
queda nada: `experience_moment_reviews` con 0 filas, 0 usuarios sintéticos y 0 perfiles
`rev_%` tras la prueba.

## Verificación de objetos en dev (2026-10-04)

Contra objetos reales, no contra el ledger:

| Superficie | Resultado |
|---|---|
| Funciones | 13: `can_view_experience_review(uuid)`, `delete_experience_review_post(uuid)`, `experience_delete_moment_review(uuid)`, `experience_publish_review(uuid)`, `experience_report_review(uuid,text,text)`, `experience_save_moment_review(uuid,smallint,text)`, `experience_set_attendance(uuid,text,boolean)` (**solo** la sobrecarga de tres argumentos), `experience_set_review_sharing(uuid,boolean)`, `experience_unpublish_review(uuid)`, `get_experience_rating_summaries(uuid[])`, `get_experience_review_publications(uuid[])`, `get_own_experiences_ranked(text,text,uuid,integer)`, `is_experience_kind(text)` |
| RLS | `relrowsecurity = true` en `public.experience_moment_reviews` |
| Políticas | `experience_moment_reviews_read`, `posts_experience_visible`, `content_reports_experience_evidence_private` |
| Grants de tabla | `anon` y `authenticated`: solo SELECT; `postgres` y `service_role` completos |
| Grants de columna | `anon` y `authenticated`: SELECT en las 10 columnas, ningún otro privilegio |
| EXECUTE | `PUBLIC` sin permiso en ninguna de las funciones nuevas; `anon` solo en `get_experience_rating_summaries(uuid[])` |
| Triggers de la tabla | `experience_moment_reviews_guard`, `experience_review_cleanup_post`, `experience_review_cleanup_target`, `moderation_capture_delete` |

## Despliegue a producción (hecho el 2026-10-04 siguiendo este orden)

**Migraciones primero, código después.** El código nuevo depende de objetos que solo existen
tras las migraciones: `getExperiencePreviews` llama a `get_experience_rating_summaries` (la
usan `/experiencias`, la pestaña del perfil y `resolvePostDrafts` para cualquier página del
feed con un post de experiencia: el feed devolvería 500), y `setMomentAttendance` envía
siempre `p_drop_reviews` (contra la función vieja de dos argumentos es PGRST202 y la
asistencia se rompe). Al revés es seguro: el código viejo tolera el esquema nuevo (ver la
revisión final de la rama).

1. **Justo antes de aplicar**, comparar en producción `md5(prosrc)` (y, si difiere,
   `pg_get_functiondef`) de las funciones existentes que las migraciones reescriben con
   `create or replace`, frente al cuerpo de dev del que se copiaron:
   - `20261004100400`: `private.moderation_available`, `private.admin_moderation_list`,
     `private.moderation_row_available`, `private.admin_moderate_content` (las versiones
     `private.`; los envoltorios `public.` del mismo nombre no se tocan),
     `private.capture_moderation_deletion`, `private.prepare_content_report`,
     `private.social_target_owner_id` y `public.can_view_target`;
   - `20261004100300`: `private.guard_experience_post`;
   - `20261004100100`/`…100200`: `public.experience_create`, `public.experience_save_moment`,
     `public.get_profile_experiences` y `public.experience_set_attendance(uuid,text)` (que se
     borra y se recrea con tres argumentos).

   El 2026-10-04, antes de aplicar en dev, los digests de todas ellas coincidían entre dev y
   producción. Esos cuerpos se copiaron de dev el 2026-10-04; si otra
   rama cambió alguna en producción después, aplicar la migración tal cual revertiría ese
   cambio en silencio. Si alguna difiere, parar y fusionar a mano antes de seguir.
2. Aplicar las seis migraciones en orden, la de enums **sola** primero (Postgres no deja usar
   un valor de enum en la transacción que lo crea): `20261004100000`, `…100100`, `…100200`,
   `…100300`, `…100400`, `…100500`. Verificar contra objetos reales con las mismas consultas
   de «Verificación de objetos en dev» (funciones, RLS, políticas, grants de tabla y columna,
   EXECUTE, triggers) y que `experience_save_moment_review` contiene `e.audience<>'private'`.
   No ejecutar `experiences_reviews.sql` con fixtures en producción.
3. **Solo entonces** hacer merge de la PR o promover el despliegue. Después, regenerar
   `database.types.ts` ([#1357](https://github.com/borjar20/Biblioshare/issues/1357)).

Pendientes de la entrega, rastreados como issues: tipos generados
([#1357](https://github.com/borjar20/Biblioshare/issues/1357)), filtro «Reseñas» del feed
([#1358](https://github.com/borjar20/Biblioshare/issues/1358)), paginación por offset del hub
([#1359](https://github.com/borjar20/Biblioshare/issues/1359)), `/post/[id]` 200 en producción
([#1360](https://github.com/borjar20/Biblioshare/issues/1360)), cobertura
([#1361](https://github.com/borjar20/Biblioshare/issues/1361)), deuda de backend y UX
([#1362](https://github.com/borjar20/Biblioshare/issues/1362)) y limpieza de los E2E
([#1363](https://github.com/borjar20/Biblioshare/issues/1363)).

## E2E (Playwright, `next build` + `next start`)

`npm run build` (exit 0) y `npm run start` en el puerto 3000, libre antes y después.
`npx playwright test e2e/experiencias- --workers=1`: **16 de 16 PASS** en 3,2 min, sin
reintentos.

| Spec | Pruebas |
|---|---|
| experiencias-captura | 3 |
| experiencias-historial | 1 |
| experiencias-imagenes | 2 |
| experiencias-moderacion | 1 |
| experiencias-participacion | 2 |
| **experiencias-resenas-social (nuevo)** | 1 |
| **experiencias-resenas (nuevo)** | 3 |
| experiencias-retirada | 2 |
| experiencias-social | 1 |

`experiencias-resenas`: «Lo vivimos», confirmar asistencia, «Reseñar ahora», guardar nota 8 y
texto; un compañero ve la reseña y la media «8.0 · 1 reseña» y reseña a su vez; «No fui» pide
confirmación y borra la reseña. `experiencias-resenas-social`: compartir fuera del grupo y
publicar en Actividad produce un único post; un tercero lo ve en el feed y el extracto en
el perfil; retirar el consentimiento lo revoca.

Nota conocida: tras la revocación `/post/<id>` responde 200, no 404, por la trampa PPR #514
(`notFound()` tras empezar el streaming con `loading.tsx`); la spec acepta 200 o 404 y
comprueba la revocación por contenido, como `posts.spec.ts`.

## Alcance y límites

- Esta evidencia acredita local, dev y E2E. **No acredita producción**: ni migraciones ni
  objetos ni despliegue. La aplicación del esquema en producción se verificará contra
  `pg_proc`/`pg_class`/`pg_policies` y se añadirá aquí como sección propia.
- La superficie 6 de `DRIFT-CHECK.md` (grants por columna) no obliga a ampliar nada: la tabla
  nueva solo concede SELECT y `posts` no gana columnas.
- Ninguna función nueva usa `use cache` (regla #437): la media depende de la sesión.
- Pendiente de decisión del propietario: si el filtro «Reseñas» del feed debe incluir las
  reseñas de experiencia (hoy no; ver `decisiones.md`).
- Issues aparte ya abiertas: #1353 (la cabecera del detalle omite al organizador cuando mira
  un invitado) y #1354 (cada momento del álbum muestra solo su primera foto).
