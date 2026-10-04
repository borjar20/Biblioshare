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
| Local (bootstrap vacío, Docker) | Cinco migraciones aplicadas en el orden del manifiesto; `npm run test:db:local` PASS con 287 pasos de bootstrap. |
| `biblioshare-dev` | Cinco migraciones aplicadas con `apply_migration`, contenido exacto de cada fichero; objetos verificados contra `pg_proc`/`pg_class`/`pg_policies`; `experiences_reviews.sql` PASS con rollback. |
| E2E | 16/16 contra `next build` + `next start` en el puerto 3000, un worker, cero reintentos. |
| Producción | **No aplicado.** Sin migraciones, sin verificación de objetos, sin despliegue de código. Se hará en una operación aparte, tras revisión de la PR y visto bueno del propietario. |

## Migraciones

En orden de dependencia (la de enums va sola, porque Postgres no deja usar un valor de enum
en la transacción que lo crea):

1. `20261004100000_experience_reviews_enums.sql`
2. `20261004100100_experience_moment_kinds.sql`
3. `20261004100200_experience_reviews_core.sql`
4. `20261004100300_experience_reviews_social.sql`
5. `20261004100400_experience_reviews_moderation.sql`

## Unitarios (Vitest, local)

| Corte | Resultado |
|---|---|
| Acciones, validación y componentes de Experiencias tras la ronda de correcciones de las server actions | 14 archivos, 93 pruebas PASS (`src/lib/experiences`, `src/components/experiences`) |
| Suite `src/lib src/components src/app` tras el delta de feed y perfil | 461 archivos, 4.586 pruebas PASS |
| Suite `src/components src/lib src/app` tras favorito, tipos nuevos, nota en tarjetas y orden del hub | **465 archivos, 4.607 pruebas PASS** (último corte de la suite completa) |
| Panel de moderación (reseña con nota de solo lectura) | 3 pruebas nuevas; 19 pruebas PASS en admin y moderación |

`tsc --noEmit`: 0 errores en cada corte. `eslint` limpio sobre los ficheros cambiados; el
`npm run lint` global conserva 9 errores y 28 avisos previos en `test-results/*.cjs` sin
seguimiento, ajenos a esta rama.

## SQL local (`supabase/tests/experiences_reviews.sql`)

Reconstrucción vacía del stack local y `npm run test:db:local`, con el test terminando en
`rollback`. La suite recorre al creador, aceptado asistente, aceptado no asistente, pendiente,
retirado, tercero, anónimo, bloqueado y administrador. Cubre, entre otros:

- sin `attended`, en `planned`/`cancelled` o sin cuenta: rechazo; trigger de respaldo;
- cambiar asistencia con reseña: `PT409` sin `p_drop_reviews`; con él, borra reseña y post;
- revertir a `planned` oculta y volver a `lived` recupera;
- terceros sin consentimiento no ven reseñas ni identidades ocultas; media fuera del
  grupo solo con compartidas; bloqueo creador↔autor oculta la atribución;
- retirar consentimiento, borrar y despublicar funcionan bajo bloqueo y bajo moderación,
  sin dejar marcador de operación ni historial falso;
- publicación concurrente produce un único post; el post de una reseña moderada por un
  administrador no se recrea (borrado y retirada);
- denuncia: sin acceso, propia, motivo inválido y detalles largos se rechazan; la evidencia
  no es legible por quien denuncia; al borrar la reseña, la denuncia queda `actioned`;
- moderación: listar, retirar, restaurar y eliminar; cascada desde la experiencia;
- cero `EXECUTE` de `PUBLIC` en las funciones nuevas.

Cada tarea se comprobó con RED antes de implementar (error esperado) y GREEN tras
reconstruir; varias aserciones se mutaron a propósito para comprobar que fallan. Última
ejecución completa: `PASS: 287 bootstrap steps, schema contracts and role privileges.`

## SQL en dev

`supabase/tests/experiences_reviews.sql` ejecutado entero en `biblioshare-dev` mediante
`execute_sql` (BEGIN … ROLLBACK): PASS, ninguna excepción `FAIL`. Comprobación de que no
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
