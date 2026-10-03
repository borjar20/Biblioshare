# Experiencias — publicación en producción (#1293, PR #1323)

> **[Evidencia de release · corte previo al merge, 2026-10-03;
> esquema verificado a las 10:04:01 UTC; smoke SQL sin persistencia a las 10:04:49 UTC]**

Esta evidencia registra la publicación de `codex/experiencias` mediante
[PR #1323](https://github.com/borjar20/Biblioshare/pull/1323). La implementación
funcional se verificó en local/dev el [2 de octubre](2026-10-02-experiencias.md),
y el [álbum](2026-10-03-experiencias-album.md) y la
[navegación](2026-10-03-navegacion-app.md) el 3. Esos registros conservan el
estado de sus respectivas verificaciones.

## Estado de la publicación

| Paso | Estado verificado |
|---|---|
| Esquema en producción | Ocho migraciones aplicadas en orden y transacciones separadas el 2026-10-03. Objetos, definiciones y ACL verificados a las 10:04:01 UTC. |
| Merge a `main` | Aún no ejecutado en este corte; seguimiento en PR #1323 y #1293. |
| Despliegue de aplicación | Aún no ejecutado en este corte; seguimiento en #1293. |
| Comprobación tras publicar | Se registra en #1293 tras el despliegue: rutas de Experiencias y navegación, privacidad y entrega de fotos. |

La aplicación del esquema y la publicación del código son pasos distintos.
La navegación y el álbum no añaden migraciones a las ocho de Experiencias.
El estado posterior de merge, despliegue y comprobaciones queda en
[#1293](https://github.com/borjar20/Biblioshare/issues/1293), que permanece
abierta para las ampliaciones. Este documento conserva su corte previo al merge.

## Esquema que se promueve

En orden de dependencia, con enums y consumidores en transacciones separadas:

1. `20261002092735_experiences_enums.sql`
2. `20261002092737_experiences_core.sql`
3. `20261002095236_experiences_deletion.sql`
4. `20261002105627_experiences_participation.sql`
5. `20261002112531_experiences_photo_mutations.sql`
6. `20261002120712_experiences_social_visibility.sql`
7. `20261002125917_experiences_advisor_hardening.sql`
8. `20261002132635_experiences_review_fixes.sql`

Las verificaciones local/dev previas incluyen reconstrucción vacía y regresiones
SQL, participación, fotos, publicación y moderación. Antes de promover se
comprobaron diez helpers anteriores: cuerpos, firmas y configuración coinciden
con el contrato canónico previo. La cuota de Google Books se conserva y se
incorpora `experience_write` con 60 escrituras por minuto; se confirmaron los
seis valores de enum nuevos.

El ledger de producción se normalizó a las versiones y nombres canónicos de
estos ocho archivos: el transporte MCP asignaba timestamps propios, que habrían
hecho parecer pendientes las migraciones ya ejecutadas. La normalización no
repite el DDL. No se añaden columnas a tablas existentes.

## Verificación de producción

Comprobación del 2026-10-03 a las 10:04:01 UTC contra objetos reales:

| Superficie | Resultado |
|---|---|
| Tablas y RLS | Seis públicas y `private.experience_photo_cleanup`: RLS activo y una política en cada tabla. |
| Grants de tabla | `anon` y `authenticated` sin INSERT/UPDATE/DELETE en las siete. SELECT en las seis públicas, filtrado por RLS; sin SELECT en la cola privada. |
| Enums | Las seis etiquetas nuevas de la migración de enums están presentes. |
| Storage | `experience-photos` privado, límite de 2097152 bytes y JPEG/PNG/WebP. |
| Funciones | 68 contratos y helpers: firma, cuerpo normalizado, SECURITY/configuración y ACL idénticos a dev; diferencia cero. Incluye los diez helpers anteriores. |
| EXECUTE | Cero permisos de PUBLIC en los contratos nuevos; ACL idénticas a dev. |
| Ledger | Ocho versiones y nombres canónicos, coincidentes con los archivos listados. |
| Smoke SQL | PASS a las 10:04:49 UTC, dentro de BEGIN/ROLLBACK, sin datos persistidos. `anon`: lecturas/portadas/fotos vacías y creación denegada. `authenticated` sin JWT: acompañantes, membresías, invitaciones, fotos huérfanas y perfil vacíos; creación rechazada por falta de identidad. |

La comparación ampliada dev/producción coincide también en los siguientes
digests. El alcance son las siete tablas de Experiencias y las políticas con
nombre de Experiencias; no acredita el esquema completo de ambos proyectos.

| Superficie | Recuento | MD5 común dev/producción |
|---|---:|---|
| Columnas | 48 | `8827ed6126935c670d65e61755265c62` |
| Constraints | 46 | `645700e02aae4792a0bdfefdf41acf42` |
| Índices | 25 | `896ad41fdfa8d39e9a87d918de6f009b` |
| Políticas | 10 | `cc319163c1106fa2625c73f71ba3460f` |
| Triggers | 7 | `46daa2c71510a0f162dc881c01ad1a0f` |

El JSON seguro de la comprobación se conserva como artefacto local en
`experiencias-release-2026-10-03/schema-verification.json`.

La comprobación en producción no siembra fixtures ni repite allí la matriz
multiusuario. Esa matriz, la privacidad/media y las carreras permanecen
acreditadas en local/dev por los registros anteriores. Las comprobaciones de
aplicación posteriores al despliegue se siguen en #1293.

Los advisors conservan los cuatro ERROR anteriores de vistas
`profile_identities`, `club_identities`, `club_stats` y `pass_reviews`, sin cambio.
Los WARN de funciones SECURITY DEFINER ejecutables por anon pasan de 23 a 28
(cinco proyecciones públicas deliberadas); los de authenticated, de 62 a 95
(33 RPC deliberadas). No hay permisos de PUBLIC en los contratos nuevos.
En rendimiento, Experiencias sólo añade 12 `unused_index` de nivel INFO propios
de un dominio recién creado. Sin nuevos avisos de FK, initplan o políticas en
Experiencias. Los avisos globales anteriores no se interpretan como un esquema
de producción libre de hallazgos.

## Alcance que sigue abierto

La publicación conserva las ampliaciones de #1293: catálogo externo de eventos
y lugares, fusión de recuerdos independientes y filtro de una persona entre
hobbies. Los dos hallazgos menores previos siguen registrados en
[#1321](https://github.com/borjar20/Biblioshare/issues/1321) y
[#1322](https://github.com/borjar20/Biblioshare/issues/1322).

## Corrección de recursión antes del merge (#1335)

Esta ampliación conserva el corte de las ocho migraciones originales a las
10:04:01 UTC y su smoke a las 10:04:49 UTC. La corrección posterior se sigue
en [#1335](https://github.com/borjar20/Biblioshare/issues/1335) y PR #1323;
la novena migración se aplicó después en dev y producción, y se verificó
en producción el 2026-10-03 a las 15:36:19 UTC.

El [check empty-database del run 37132961205](https://github.com/borjar20/Biblioshare/actions/runs/37132961205)
falló a las 15:23 UTC con `54001: stack depth limit exceeded`, en
`experiences_social.sql:60`: consultar el target de un comentario después de
privatizar la experiencia. El SQL, el runner y el workflow no cambiaron entre
el HEAD anterior que pasó y la integración de main. Otra ejecución del mismo
contrato también pasó; la variación procede del plan de ejecución.

La rama `comment` de `public.can_view_target` unía comentarios y targets con
la llamada recursiva en un `WHERE ... AND`. El planner podía evaluarla antes
de filtrar el comentario solicitado o comprobar su target padre. Un comentario
tiene además un target propio; recorrer ese target vuelve a consultar el mismo
comentario, aunque las relaciones almacenadas no tengan un ciclo de padres.
`private.moderation_available` aparece dentro del stack, pero no inicia ese ciclo.

| Comprobación de la corrección | Resultado |
|---|---|
| Fixture original en dev, plan normal | Doce consultas consecutivas del comentario privado devuelven false. |
| Rama SQL reducida en pg_temp, un comentario y sus targets padre/propio, plan secuencial y nested-loop forzado | RED: SQLSTATE 54001. BEGIN/ROLLBACK, sin persistencia. |
| Mismo caso reducido con el CASE propuesto | GREEN: público=true y privado=false, sin recursión. BEGIN/ROLLBACK. |
| `supabase/tests/experiences_target_planner.sql`, función pública real en dev | RED: SQLSTATE 54001 en la consulta del comentario privado; fixtures sintéticos dentro de BEGIN/ROLLBACK. |
| Regresión real tras aplicar la corrección en dev | GREEN: experiences_target_planner.sql en 3,639 s; público/privado por planes de índice y secuenciales. BEGIN/ROLLBACK. |
| Fixture social original tras aplicar la corrección en dev | GREEN: experiences_social.sql en 7,804 s. BEGIN/ROLLBACK. |
| Novena migración en producción | Aplicada; verificación a las 15:36:19 UTC: cuerpo dev/producción idéntico, firma y atributos conservados, dueño postgres y ACL exactas antes/después. Sin fixtures sintéticos en producción. |
| Ledger de la corrección en producción | Versión 20261003153110 y nombre guard_comment_target_recursion canónicos. |
| Smoke de producción después de la corrección | PASS a las 15:37:36 UTC: comentario e interaction target inexistentes devuelven false. Sólo lecturas, cero escrituras. |

La migración correctiva es
`20261003153110_guard_comment_target_recursion.sql`. Mantiene la función SQL,
STABLE, SECURITY DEFINER, firma, search_path y permisos existentes. Su `CASE`
exige `c.id = p_target_id` y `t.id = c.interaction_target_id` antes de la llamada
recursiva; ninguno de esos guards se delega al orden del WHERE o del join.
Las ocho migraciones ya aplicadas permanecen intactas. El nuevo test compara
planes por índice y planes secuenciales sobre comentarios públicos y privados,
y se incorpora al runner `scripts/db/verify.mjs`.

El orden de evaluación de expresiones booleanas no está fijado y PostgreSQL
permite reordenarlas; CASE protege la evaluación condicional de esta llamada.
Referencia: [documentación PostgreSQL 17](https://www.postgresql.org/docs/17/sql-expressions.html#SYNTAX-EXPRESS-EVAL).

El manifest canónico incorpora la novena migración al final del orden de
dependencias. `npm run db:baseline` regeneró `schema-baseline.sql` y
`npm run test:db:bootstrap` pasó sus ocho comprobaciones (8/8).
El baseline resultante ordena 282 pasos; los 281 de la verificación original
permanecen como evidencia histórica de las ocho migraciones iniciales.

SHA256 del SQL aplicado:
`3ABB26C2092309E79B02A89A614D486952EA3B099BE3145D048390D74F71DD15`.

El JSON seguro de la comparación y del smoke posterior se conserva como
artefacto local en
`experiencias-release-2026-10-03/comment-recursion-verification.json`.

La publicación del código continúa detrás del gate final de CI y merge.
El fallo posterior de navegador ajeno a la recursión —POST ERR_ABORTED en
local-speed-insights, 137/138 recorridos PASS— se sigue en
[#1336](https://github.com/borjar20/Biblioshare/issues/1336). La repetición del
HEAD final sigue pendiente en este corte; no altera la verificación del esquema.
