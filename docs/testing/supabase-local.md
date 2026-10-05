# Pruebas con Supabase local

> **[Canónico · receta de activación actualizada el 2026-10-03 (#1334);
> replay histórico #1299 verificado el 2026-10-02; no verifica dev ni producción]**

Requisitos: una versión Node admitida por `package.json` (probado con 22.23.1 y
24.19.0), Docker en marcha y Supabase CLI **2.116.0**.
No requiere credenciales remotas. No ejecutar esta receta con un proyecto enlazado remoto.

```sh
npm run test:db:bootstrap
npm run db:local:prepare
supabase --workdir .superpowers/supabase-local start --exclude studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor,realtime
node scripts/db/activate-local-celebrations.mjs --privileged-dispatch-paused
npm run test:db:local
```

El `start` aplica el esquema inicial y las migraciones automáticas; falla en el primer
error SQL. La activación de celebraciones queda diferida hasta observar PostgreSQL real
después del cierre de admisión. El wrapper comprueba identidad y hashes del directorio,
ejecuta el [gate de quiescencia](../../scripts/db/celebrations-cutover.md) y registra
la fase final y su ordinal en una sola transacción. Sólo después materializa su SQL generado.
En una instancia vacía controlada por esta receta, la bandera declara que no se ejecutan
despachos privilegiados; no sustituye la inspección ni permite saltar el guard SQL.

El verificador comprueba el ledger completo, renombres, funciones finales, RLS
activada y privilegios de hidratación. Es una comprobación estructural: las pruebas E2E de
cada feature siguen siendo necesarias. Los servicios excluidos no forman parte de este gate.
También ejecuta con rollback el contrato SQL de reserva, FIFO, separación entre cuentas,
tokens antiguos, ACK idempotente y no-op legacy. `test:db:bootstrap` y los tests del checker
se ejecutan juntos en CI con `node --test scripts/db/bootstrap.test.mjs scripts/db/celebrations-cutover.test.mjs`.

`supabase --workdir .superpowers/supabase-local status --output json` proporciona las claves
**locales** para exportar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y
`SUPABASE_SERVICE_ROLE_KEY` al proceso de build/test. No guardar esa salida en logs públicos.
Usar un checkout sin `.env.local` remoto y ejecutar E2E contra `next build` + `next start`.

## Fuente única y orden

- `supabase/bootstrap/initial.sql`: esquema histórico inicial (7–9 de julio), recuperado de
  `schema-baseline.sql` en main `bdcdd7c`.
- `supabase/migrations/*.sql`: fuentes originales; no se reescriben sus versiones ni su SQL.
- `supabase/bootstrap/manifest.json`: orden explícito, exhaustivo y sin duplicados. Hay
  versiones históricas repetidas y nombres cuya fecha no refleja las dependencias.
- `npm run db:baseline`: regenera `supabase/schema-baseline.sql` como inclusiones `psql`.
  Necesita el árbol `supabase/` completo y se ejecuta con
  `psql -v celebrations_privileged_dispatch_paused=true -f supabase/schema-baseline.sql`
  sobre una base **Supabase** vacía, con sus roles y esquemas de plataforma ya inicializados.
  El baseline toma una observación autocommit después del REVOKE y antes de la activación;
  exige Auth/celebraciones vacíos y visibles, estadísticas completas y cero otras
  transacciones. Sin la declaración explícita o sin ese gate, falla cerrado.
- `db:local:prepare`: materializa las mismas fuentes en `.superpowers/supabase-local`, con
  versiones ordinales únicas para el ledger **local** y un mapa con hashes. No usar ese
  ledger para reconciliar migraciones remotas ni ejecutar `db push` desde ese directorio.

Excepción explícita: `20260728_migrar_grafos_a_itinerarios.sql` solo mueve datos de dos sagas
con UUID de producción. En una base vacía se sustituye por `empty-graph-data.sql`, que exige
que no haya sagas. No se inventan esos registros ni se modifican las restricciones. El mapa
conserva también el hash de la fuente original. Esto reproduce el esquema, no datos ni
configuración de servicios de producción.

Dependencias históricas que los nombres no expresan: follows antes de notifications; clubs
antes de posts/activities; tierlists antes de propose_with_setup; enums/helper de solicitud
antes de sus consumidores; club_share_ownership antes de passes_review_privacy; renombre a
passes antes de notes/goals; feed_targets_enum y feed_targets_can_view antes de social_phase0;
checkpoint_audience_fix antes del contrato de interaction_targets. El manifiesto fija el
orden comprobado al ejecutar SQL, no un orden alfabético supuesto.

## Añadir migraciones y limpiar

1. Crear el SQL normal y situar su nombre en el manifiesto después de sus dependencias.
2. Ejecutar `npm run db:baseline` y `npm run test:db:bootstrap`.
3. Arrancar una instancia vacía con la receta anterior. CI repite ese recorrido sin secretos.

Para liberar los contenedores y borrar **solo los datos de esta instancia**:

```sh
supabase --workdir .superpowers/supabase-local stop --no-backup
```

Después se puede borrar `.superpowers/supabase-local` y preparar otra vez. Si cambian las
fuentes, el generador exige esta limpieza: nunca cambia silenciosamente una historia aplicada.
La activación guardada no admite un `db reset` que reproduzca directamente su SQL final
sin el contexto de quiescencia. Para repetir el recorrido completo, retirar sólo la
instancia desechable y su directorio generado y volver a preparar/arrancar/activar.
No usar `--all` ni reutilizar este directorio para una base con datos.

Si una campaña necesita conservar un backup anterior, `prepare(root, destination)` admite
un directorio nuevo. Pasar esa misma ruta a `supabase --workdir <ruta>`, al wrapper mediante
`--workdir <ruta>` y a verificación/build/pruebas mediante la variable de proceso
`SUPABASE_LOCAL_WORKDIR`. Los helpers validan su identidad y firma; no aceptan una URL
remota ni escriben `.env`. La ruta predeterminada de CI sigue siendo la de esta receta.

## Verificación actual (2026-10-02)

Con #1299: 273 pasos desde cero, 8 tests del generador sin SKIP, 18 contratos
SQL y cuatro familias concurrentes PASS. El valor `mentioned` se rescata al
historial local; inserción/lectura con rollback, idempotencia y tipos locales
verificados. Las 313 fuentes permanecen idénticas antes/después. Evidencia:
[bootstrap de menciones](2026-10-02-notification-type-bootstrap-1299.md).

La campaña usa una ruta generada nueva en `.scratch` para conservar el backup
previo de `.superpowers/supabase-local`; sólo cambia rutas en el harness, sin
adaptar SQL ni saltar contratos. El recorrido normal de CI conserva la receta
de arriba. Esta comprobación no sustituye el gate de navegador de cada feature.

## Verificación anterior (2026-09-06)

Con #879: 236 pasos (inicial + 235 migraciones). El gate incluye la regresión SQL de
enlaces de pases, sesiones y comentarios, con datos sintéticos y rollback.

## Verificación inicial (2026-09-06)

En main `bdcdd7c`: 233 pasos (inicial + 232 migraciones) aplicados sin errores mediante
`supabase start`; contratos SQL y 7 tests del generador pasan. La entrada psql también se
ejecutó completa después de un reset de plataforma sin migraciones de aplicación y de
comprobar que `public` no tenía tablas. Pasan los mismos contratos de objetos y privilegios.

Composición local con #1088 (`79a1161`), añadiendo `20260907_pet_battles.sql` al final del
manifiesto: 234 pasos desde cero, SQL de permisos de batallas, 80 tests de motor + 7 de CLI/
limpieza, build completo con Node 22.23.1 (70/70 páginas) y 3 E2E contra `next start` pasan.
Cero skips/reintentos; al terminar, cero usuarios de prueba y cero combates. Esta composición
es evidencia local de compatibilidad; las dos PR siguen separadas y no implica un merge.
