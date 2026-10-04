# Celebraciones: expansión compatible en producción (#1334)

> **[Estado actual · producción activada el 2026-10-04 a las 20:15:35 UTC,
> objetos y permisos verificados a las 20:16:22 UTC; consumidor PR #1364
> pendiente de integración, despliegue y CI final. El corte de expansión
> siguiente se conserva como historia.]**

> **[Corte real de producción · 2026-10-04, 16:44 UTC; fase 1 aplicada;
> cierre de admisión y activación pendientes]**

La primera fase se confirmó en `vmutcradmodhiltuohys` a las 16:42:17 UTC.
Añade `claim_token`, `claim_expires_at`, CHECK de pareja y las tres RPC invoker
de reserva/confirmación/liberación, cerradas a todos los roles ordinarios.
El legacy sigue con su definición y ACL anterior. Este corte mantiene el
comportamiento de la aplicación desplegada; no acredita el nuevo consumidor.

## Aplicación y verificación

La petición enviada por `apply_migration` incorpora el SQL canónico exacto,
sus guards y el INSERT canónico dentro de BEGIN/COMMIT. No se ejecutó DDL por
`execute_sql` ni se reparó, borró, upserteó o normalizó historia. La respuesta
del transporte fue success y se verificaron después los objetos reales.

| Comprobación posterior, 16:44:40 UTC | Resultado |
|---|---|
| RLS de user_celebrations activa y 11 columnas | PASS |
| SELECT/INSERT/UPDATE authenticated sobre las 11 columnas, superficie 6 | PASS, 33 grants |
| CHECK user_celebrations_claim_pair validado | PASS |
| Tres RPC INVOKER/VOLATILE y search_path public, pg_temp iguales a dev | PASS |
| Tres RPC sin EXECUTE ordinario, incluidos PUBLIC/anon/authenticated/service_role | PASS |
| Legacy conserva cuerpo/definición y ACL anterior | PASS |
| 220 filas históricas conservan MD5 9d3aa09e3634ab4edf328021a71db0fe | PASS |
| Las 301 filas anteriores del ledger conservan versión/nombre/MD5 de statements | PASS |
| Sólo dos filas nuevas de esta fase, ledger 303 | PASS |

Canonical `20261003184419` / `recoverable_celebrations_expand` y carrier real
`20261004164217` / `transport_recoverable_celebrations_expand` se conservan
como filas distintas. Los arrays completos de statements se leyeron después
sin modificaciones; #1355 acredita su mapping con las peticiones auténticas.
SQL canónico Git SHA-256:
`e94cb96c0e417497c2bedb40d814fd3ab54babe99c06b6bf5544ac8ddc5c6d9e`.

Advisors no añade hallazgos: la comparación completa inicial cambió por
130 valores `observed_at`. El recibo revisado excluye sólo esos instantes y
confirma grupos, cantidades y hallazgos iguales. El resultado inicial y la
comparación posterior se conservan; no se afirma resolver avisos preexistentes.

## Evidencia y límites

Recibos en el repo raíz:
`.scratch/ticket-campaign/20261002-resolve-all/celebrations1334-prod-cutover-20261004/phase-1-01/`:

- `prepared.json`, `migration-request.sql`, `tool-response.json`.
- `actual-after.json`, `actual-transport-history-full.json`, `actual-pair-check.json`.
- `security-after.json`, `security-diff-reviewed-01.json`.

Baseline previo: `celebrations1334-resume-20261004/prod-objects-before-02.json`
y `prod-security-before-02.json`. No se sembraron cuentas ni experiencias,
ni se modificaron filas privadas para esta comprobación. Objetos/ACL/ledger
no prueban Auth/REST o presentación del consumidor en producción.

Fases 2 y 3 requieren cierre de admisión confirmado, inspección fresca del
target real y el checker de quiescencia independiente. Que los backends
estuvieran idle en este corte no sustituye ese gate. Tampoco la deuda global
de timestamps del CLI #1366 se considera resuelta al archivar estos carriers.

## Activación final — 2026-10-04, 20:16:22 UTC

El cierre de admisión de la fase 2 recibió success y COMMIT antes del nuevo
cutoff. Dos intentos de fase 3 fallaron con SQLSTATE `55000`, «Other current
transactions block celebration activation», y ROLLBACK; se conservan sus
peticiones y respuestas. No se obtuvo la identidad de esas transacciones y
no se atribuye una causa ni una cura al éxito posterior.

El tercer intento recibió success a las 20:15:35 UTC. Usó dos snapshots reales
completos con estadísticas visibles, cohorte vacía, cero prepared transactions
y cero otras transacciones. Conservó la fuente canónica y el guard independiente
exactos; añadió sólo un diagnóstico PREguard con metadatos, sin texto de
consultas ni secretos. El guard real, DDL y INSERT canónico del ledger se
ejecutaron en la misma transacción. No se sustituyó la barrera por el diagnóstico.

| Comprobación posterior, 20:16:22 UTC | Resultado |
| --- | --- |
| Target real: database OID 5, user_celebrations OID 20578 | PASS |
| 11 columnas, RLS activa y SELECT/INSERT/UPDATE authenticated por columna | PASS, 33 grants |
| Cuatro RPC INVOKER, search_path public, pg_temp y MD5 iguales a dev | PASS |
| EXECUTE sólo de authenticated; legacy compatible de cero filas sin escritura | PASS |
| 221 filas del preflight, MD5 f958c90882c2708b12392d4a0f385dbe | PASS, intactas |
| 303 registros previos del ledger, MD5 49108bb7aa70f5526918f1071f872f59 | PASS, intactos |
| Ledger final 307: 303 previos + dos canónicas + dos carriers | PASS |

Se conservan las canónicas `20261003184423`/`20261003184427` y los carriers
reales `20261004200916`/`20261004201535`, además del par de expansión anterior.
El mapping de #1355 queda intacto, sin normalización del historial.
La relectura de ACL efectivas de las 20:26:21 UTC confirma PUBLIC sin EXECUTE,
`ordinary_executors=[authenticated]` y las cuatro RPC invoker. Las seis filas
de historia se releen con sus arrays completos de statements, sin modificarlos.
La comparación de seguridad excluye exclusivamente `observed_at`: no hay
grupos nuevos ni hallazgos añadidos. SECURITY DEFINER autenticadas baja 95→94
por retirar exactamente `public.pull_pending_celebrations()`; los otros grupos
mantienen 2/4/1/28/1. No se consideran resueltos los avisos preexistentes.

Recibos nuevos en el repo raíz:
`.scratch/ticket-campaign/20261004-continue/`: `prod-preflight.json`,
`dev-contract.json`, `phase2-approved-response.json`, `phase3-response.json`,
`phase3-after-rollback.json`, `phase3-attempt02/`, `phase3-attempt03/`,
`production-final-status.json`, `prior-ledger-before.json`,
`prior-ledger-final.json`, `final-effective-acl.json`,
`transport-history-complete.json` y `security-comparison.json`.

Este corte acredita esquema activo, permisos y preservación de datos/historia.
El consumidor de PR #1364 aún no está integrado ni desplegado: no se acredita
Auth/REST o presentación remota, ni cierre de #1334. La CI debe volver a pasar
sobre su HEAD final. El FAIL global de #1301 y las tres fronteras nativas
pendientes de #1356 conservan sus dictámenes.
