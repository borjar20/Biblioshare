# Hidratación de pantalla — permisos de #1204

> **[Evidencia de ejecución · verificada en local, dev y prod el 2026-09-30]**

Antes del cambio, ambas firmas con `backdrop_url` tenían EXECUTE efectivo para
`anon`, `authenticated` y `service_role` en dev y prod. El guard `auth.uid()`
del cuerpo ya rechazaba al visitante: era deuda de permisos, no prueba de una
escritura anónima permitida.

La migración `20260930151804_hydrate_screen_revoke_anon.sql` solo modifica ACL:
revoca `PUBLIC` y `anon`, y garantiza grants explícitos para los otros dos roles.
La revisión independiente confirmó compatibilidad antes del deploy de código.

| Entorno | Resultado |
|---|---|
| Local, antes | `hydrate_screen_permissions.sql` falla con «anon todavía puede ejecutar», exit 3. |
| Local, después | La misma prueba pasa: ACL efectiva, llamadas anónimas rechazadas y llamadas autenticadas a IDs inexistentes. Transacción revertida. |
| Replay local limpio | 265 pasos; 7/7 pruebas del generador; `test:db:local` pasa con contratos, fixtures transaccionales y concurrencia. |
| Dev | Migración aplicada; la misma prueba de roles con rollback pasa. |
| Prod | Migración aplicada después del gate dev; `pg_proc` confirma las dos firmas y EXECUTE `false/true/true` para anon/authenticated/service_role. Verificación sin escrituras de prueba. |

La prueba forma parte de `scripts/db/verify.mjs`, no de un comando manual que
la CI pueda omitir. El manifiesto y `schema-baseline.sql` incluyen la migración.
SHA-256 de su archivo: `0ffc86afdaf4dee1b6eba562d49411968134e30068ba3dcc8954d775c67d43d2`.
