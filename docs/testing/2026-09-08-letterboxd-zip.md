# ZIP completo de Letterboxd — verificación local

> [Evidencia · 2026-09-08 · tickets #1137–#1145 · base 44545b478c71ff41e63bb5a27bb08edd4d725991]

Implementación local de la spec `docs/superpowers/specs/2026-09-08-letterboxd-zip-design.md`.
No demuestra despliegue, aplicación remota de migraciones ni aceptación con una cuenta real.
No se utilizó ni versionó el ZIP personal: todos los archivos, textos y cuentas de prueba son sintéticos.

## Resultados

| Comprobación | Resultado |
|---|---|
| TypeScript `npx tsc --noEmit` | PASS |
| ESLint de las superficies modificadas | 0 errores; 1 warning preexistente en `importar/actions.ts` (`_prevState`) |
| Suite completa `npm test` — una ejecución | 3.432 PASS / 1 FAIL, de 3.433 pruebas |
| Fallo de suite completa | El guard detectó `revalidatePath` fuera del módulo central; corregido mediante `revalidateArchiveImports` |
| Regresión final dirigida | 96 PASS en 9 archivos, incluido el guard corregido y 2 pruebas nuevas de estadísticas sin fecha |
| `npm run test:db:bootstrap` | 7 PASS; manifiesto y baseline completos |
| Bootstrap local vacío | 249 etapas aplicadas; siete migraciones nuevas de Letterboxd |
| `supabase/tests/letterboxd_archive.sql` | PASS, transacción revertida |
| `npm run build` y `next start` | PASS, build de producción local |
| `playwright.archive-local.config.ts` | 2 PASS contra `next start` |
| `node docs/architecture/sync.mjs --check` | PASS |

El resultado final combina la suite completa y las comprobaciones dirigidas posteriores;
no se presenta la primera ejecución como una suite íntegramente verde.

## Contratos comprobados

1. Subir ZIP, analizar sin crear pases, confirmar, cerrar la página y volver al historial.
   Dos pases del mismo día, notas históricas, formato de reseña y nuevo pendiente se conservan.
2. Repetir el archivo y aplicar concurrentemente la misma fila no duplica efectos.
   Un ZIP posterior fechado conserva el pase anterior sin fecha. Las correcciones de fecha
   del mismo origen actualizan el pase y su orden activo; deshacer restaura fecha y procedencia.
3. Dos cuentas autenticadas: la segunda no lee trabajos ni pases privados de la primera y
   no puede confirmar su trabajo. `anon` no accede a las tablas de importación.
4. El cron real rechaza llamadas sin secreto y procesa pendientes sin intervención del navegador.
   Diez trabajos antiguos con errores dejan de bloquear el trabajo ejecutable posterior.
5. Cambiar una reseña localmente provoca conflicto al actualizar desde ZIP. Deshacer preserva
   esa edición y el pase; las sesiones añadidas a un pase nuevo también impiden borrarlo.
   Las sesiones anteriores de un pase preexistente no impiden restaurarlo.
6. Resolver conflictos no asigna varios orígenes a un solo pase. Varias coincidencias locales
   siguen pendientes hasta que se decide conservarlas y añadir pases distintos.
7. Una reseña sin fecha queda persistida en la cola de revisión. Al asociarla a un pase sin
   nota se conserva su valoración; no se fabrica una fecha. Una URI distinta no se fusiona
   automáticamente con un diario solo por compartir día.
8. El anuncio desactivado no crea posts. El anuncio público explícito crea un solo `thought`,
   nunca eventos de visionado. Deshacer elimina ese post si permanece intacto.
9. ZIP inválido, fecha imposible, ruta inválida o cabeceras incompletas se rechazan. Se muestran
   exclusiones. Las reseñas se renderizan como nodos React con formato básico y enlaces seguros.
10. Los completados sin fecha cuentan en el total de actividad, sin crear un año ficticio,
    y quedan fuera de los periodos fechados.

## Base de datos y permisos

Instancia desechable `biblioshare-local-2ee24f98`, API en `127.0.0.1:54321`;
sin consultas ni escrituras a dev remoto o producción. Bootstrap reproducible mediante
`scripts/db/bootstrap.mjs` y `supabase/bootstrap/manifest.json`.

Se ejecutó la superficie 6 de `docs/DRIFT-CHECK.md`: `passes` conserva 19 columnas,
14 con INSERT y 13 con UPDATE para `authenticated`. Las tablas nuevas son de lectura por
dueño y escritura exclusivamente mediante RPC: no tienen grants de escritura directa.
La prueba SQL comprueba SELECT del dueño, ausencia de INSERT/UPDATE/DELETE y ausencia de
acceso anónimo, además de la columna nueva `announcement_snapshot`. Las reseñas de pases
se leen mediante `pass_reviews`; no se amplían los grants de `passes.review`.

Para ejecutar el E2E, exportar desde `supabase status --output json` los valores **locales**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`,
sin imprimirlos ni guardarlos en el repo. Usar un `CRON_SECRET` sintético idéntico en servidor
y prueba. Compilar y arrancar con `NODE_OPTIONS=--require ./e2e/support/archive-tmdb.cjs`,
que exige Supabase local e intercepta únicamente TMDB con una película sintética. Ejecutar:

```text
npx playwright test --config playwright.archive-local.config.ts
```

Los tests crean y borran sus cuentas y película en `finally`. No requieren modificar `.env`.

## Revisión de estándares

Revisión independiente, de solo lectura, contra la base confirmada. Hallazgos corregidos:
invalidación incompatible con cron (`updateTag`), bloqueo de cola por trabajos con errores y
errores sin mensaje inline. Seguimiento de revisión: sin nuevos bloqueos en estas correcciones.

## Revisión de especificación

Revisión independiente, de solo lectura. Hallazgos corregidos: colapso de visionados al aceptar
conflictos, asociación de reseñas solo por fecha, bloqueo de cola, identidad reutilizada al
elegir otro visionado, correcciones de fecha ignoradas y pérdida de nota al asociar reseñas.
La protección de sesiones al deshacer se limitó a altas propias para permitir restaurar pases
previos intactos. El E2E ampliado detectó además un alias SQL que impedía guardar conflictos
de reseñas; se corrigió y quedó cubierto tanto por SQL como por resolución mediante API real.

## Límites y seguimiento existente

- Publicación y migraciones de producción pendientes en #1137–#1145 / #1136; no se cierran issues.
  La recuperación programada requiere `app_base_url` y `cron_secret` existentes en Vault y
  `CRON_SECRET` en el servidor. La prueba usa el endpoint real con configuración sintética;
  no acredita la configuración de un entorno remoto.
- Durante navegación/prefetch aparecieron avisos de Auth con `HANGING_PROMISE_REJECTION`.
  Coinciden con el síntoma de [#1098](https://github.com/borjar20/Biblioshare/issues/1098)
  (también #1126); los flujos probados pasan. No se ha demostrado aquí la causa ni corregido
  ese problema ajeno a la importación.
- No se mide precisión de identificación contra el archivo personal ni disponibilidad de
  TMDB: el E2E usa el proveedor sintético y las pruebas existentes cubren el matcher real.

## Validación remota en dev y CI de PR #1147

Las siete migraciones se aplicaron a biblioshare-dev (tyvzpuhxfwxrnkcpzxyg).
Verificados cuatro objetos con RLS, permisos del propietario, siete RPC y cron registrado.
Prueba REST con dos cuentas desechables: PASS para borrador sin pases, repetición y
aplicación concurrente idempotentes, RLS entre cuentas, vista sin fecha con nota,
pendiente, visionado posterior y deshacer protegido tras editar. Ambas cuentas se
eliminaron en finally; el catálogo compartido no se modificó.
El primer intento consultaba también pases públicos: se corrigió el filtro del fixture
para limitarlo al propietario. El conector SQL rechaza DML por ser de solo lectura;
la comprobación funcional se realizó mediante REST.

CI inicial: quality y empty-database PASS; critical-flows 3 PASS / 1 FAIL porque el
servidor carecía de CRON_SECRET sintético (503 frente a 401 esperado). El runner de CI
ahora proporciona ese secreto y precarga TMDB sintético, restringido a Supabase local.
Nueva ejecución pendiente al publicar esta corrección.

Activación remota pendiente: dev no tiene app_base_url ni cron_secret en Vault.
El conector Vercel devuelve 403 para el equipo y la CLI está sin sesión. No se acredita
recuperación programada remota ni despliegue de producción.
