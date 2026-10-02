# Bootstrap del aviso de mención — #1299

> **[Evidencia · verificada el 2026-10-02 · replay vacío, contratos SQL,
> idempotencia, tipos locales y objetos remotos PASS; CI de entrega pendiente]**

El bootstrap vacío omitía `public.notification_type = 'mentioned'`, aunque
`src/lib/social/notification-types.ts` y `notify-mentions.ts` lo consumen.
La comprobación nueva, aplicada antes de cambiar el SQL, reproduce exactamente
esa omisión: siete tests pasan y uno falla con `actual: ['mentioned']`.

## Corrección

`20261002102913_notification_type_mentioned.sql`, creada con
`supabase migration new` (CLI 2.116.0), añade el valor con `IF NOT EXISTS` y
lo sitúa después de `club_event_created`. El manifiesto la ejecuta justo después
de `20260722_activity_kind_evento.sql`, que crea ese vecino; la migración del
enum termina antes de cualquier consumidor. El baseline psql se regenera desde
las mismas fuentes. El plan resultante contiene 273 pasos.

La comprobación estructural inspecciona el DDL de todas las fuentes del plan y
lo compara con todos los valores de `NotificationType`. Un comentario SQL no
cuenta como declaración. Después de la corrección pasan los ocho tests, sin
skips. Esta comprobación no sustituye la ejecución de PostgreSQL.

El nuevo contrato `supabase/tests/notification_type_mentioned.sql`, integrado en
`scripts/db/verify.mjs`, consulta `pg_enum`, inserta una notificación de mención
como `service_role` y comprueba su lectura. Usa dos usuarios aleatorios dentro
de una transacción que termina en rollback; no repara el enum durante la prueba.

## Objetos remotos reales

Consulta de solo lectura ejecutada por MCP en ambos proyectos el 2026-10-02:

```sql
select n.nspname as schema_name,
       t.typname as enum_name,
       count(*)::integer as label_count,
       bool_or(e.enumlabel = 'mentioned') as has_mentioned,
       'mentioned'::public.notification_type::text as cast_result
from pg_catalog.pg_type t
join pg_catalog.pg_namespace n on n.oid = t.typnamespace
join pg_catalog.pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'notification_type'
group by n.nspname, t.typname;
```

| Entorno | Valores del enum | `has_mentioned` | Cast |
|---|---:|---|---|
| biblioshare-dev (`tyvzpuhxfwxrnkcpzxyg`) | 43 | true | mentioned |
| biblioshare / prod (`vmutcradmodhiltuohys`) | 40 | true | mentioned |

También se enumeraron todos los labels: `mentioned` ocupa la posición 18 en
ambos. El problema es de reconstrucción local; este ticket no requiere DDL
remoto. La decisión se basa en los objetos y en un cast real, no en el ledger.
No se insertaron fixtures ni se aplicó ninguna migración remota.

## Gate local desde cero: PASS

Se preparó una ruta nueva con el generador canónico `prepare(root, destination)`:
`.scratch/ticket-campaign/1299-local-1790937673011/supabase-local`.
El proyecto nuevo `biblioshare-local-d4b9828b` arrancó vacío con los 273 pasos,
sin copiar ni resetear la instancia anterior de `.superpowers/supabase-local`.
El harness sólo adapta las rutas de imports y del stamp generado para ejecutar
las mismas aserciones del verificador. No adapta SQL ni omite errores.

| Comprobación | Resultado |
|---|---|
| Tests del generador | 8 PASS / 0 FAIL / 0 SKIP |
| Replay y verificador completo | PASS: 273 pasos y 18 contratos SQL |
| Familias concurrentes del verificador | 4 PASS: cuota social, altas Google, referencias e ISBN |
| Contrato de mención | PASS: inserción como service_role, lectura y rollback |
| Reaplicación de la migración | PASS: 40 labels, exactamente un `mentioned`, orden sin cambios |
| Cast y tipos generados localmente | PASS: 40 variantes, incluida `mentioned` |
| Fuentes congeladas | 313 archivos idénticos antes/después |
| Inspector de residuos | PASS: cero usuarios, perfiles, avisos, libros, ediciones, notas, cuotas, claves ISBN y conexiones de prueba |

Los verificadores concurrentes observan el solapamiento real: cuota social
25 conexiones → 20 admitidas/5 rechazadas; mismo volumen Google → un libro,
mismo UUID y sólo una cuota cobrada; última plaza → una inserción y un PT429.
Las referencias prueban ambos órdenes de la carrera y los cinco casos ISBN
incluyen READ COMMITTED, REPEATABLE READ y cascada de borrado.

El contrato de mención deja cero usuarios y notificaciones antes/después. Las
17 regresiones SQL terminan en rollback; el contrato estructural completa las
18 comprobaciones. Los tipos herméticos generados no sustituyen los tipos de
aplicación ni los contratos de Experiencias. No se añadió columna ni grant.

Evidencia conservada en
`.scratch/ticket-campaign/20261002-resolve-all/1299-bootstrap-red.log`,
`1299-bootstrap-green.log` y `1299-remote-enum-proof.json`.
El replay y sus métricas están en
`.scratch/ticket-campaign/1299-local-1790937673011/summary.json`, SHA256
`504c34fbd0cd88867d290cf7451de1fa8c33ec71c76c14b1edf263b69029afb7`.
Manifiesto público `evidence-sha256-final.json`, SHA256
`1bdf717f8587f77d8ccbc9fe28b88c430fbac9c49bf8c24d78f075a207db6d10`.
Log del verificador completo, SHA256
`90d0c2dbeeb3c02302ff198f119df61ebdb8d3189efe8f994b74bca975aa8df5`.
El log privado de arranque contiene las claves locales y está excluido del
manifiesto público. La instancia se conserva para los gates #1092/#995 y su
parada corresponde al coordinador; este resultado no acredita esos e2e.

## Referencias de implementación

El [changelog oficial](https://supabase.com/changelog.md) se consultó antes de
implementar, incluyendo el
[cambio de PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
Ese aviso trata índices, cifrados y operadores; no modifica esta operación de enum.
La sintaxis está contrastada con
[Supabase: enums](https://supabase.com/docs/guides/database/postgres/enums) y
[PostgreSQL 17: ALTER TYPE](https://www.postgresql.org/docs/17/sql-altertype.html):
`IF NOT EXISTS` conserva un valor ya presente y el valor nuevo se usa tras el
commit de su migración. La creación del archivo sigue la
[referencia CLI](https://supabase.com/docs/reference/cli/supabase-migration-new).
