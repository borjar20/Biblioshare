# Celebraciones: expansión compatible en producción (#1334)

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
