# Verificación de moderación administrativa — #1183

> Desarrollo, 2026-09-15. No acredita despliegue ni verificación de producción.

## Contrato

Retirar oculta el contenido a todos fuera de moderación. Restaurar un padre
conserva retiradas individuales; borrar conserva evidencia y no borra pases.
Admin global y moderador de club son permisos distintos. El audio normal y el
audio de evidencia tienen rutas separadas, autorizadas en cada petición.

## SQL

Ejecutar `supabase/tests/admin_content_moderation.sql` en dev o base local
desechable. Crea fixtures dentro de una transacción y termina en `ROLLBACK`.
Incluye anónimo, admin, owner, miembro, moderador y tercero, visibilidad normal,
RPCs administrativas, escrituras denegadas, restauración, confirmación del
borrado, cascadas, preservación del pase, audio de evidencia, reportes y avisos
legacy de eventos. Está incorporado al verificador `npm run test:db:local`.

Migraciones aplicadas y comprobadas en dev:

- `20260915145340_admin_content_moderation.sql`
- `20260915150429_moderation_event_notification_visibility.sql`

Los advisors de seguridad no añadieron ni quitaron avisos frente al baseline
capturado antes del cambio. No se modificaron Auth ni grants de columnas públicas.
El manifiesto/baseline se regeneró; sus siete pruebas de generación pasan.
La reconstrucción completa desde cero con Docker no se ha ejecutado en esta sesión.

## Aplicación

```sh
npx vitest run src/app/admin/moderation-actions.test.ts src/app/admin/moderation-controls.test.tsx src/lib/storage/voice-notes.test.ts src/app/api/voice-notes src/app/api/admin/voice-notes src/lib/social/moderation.test.ts src/lib/social/post-actions.test.ts --maxWorkers=1 --no-file-parallelism
npx tsc --noEmit
npx playwright test --config playwright.moderation.config.ts
```

La suite dedicada también está disponible como `npm run test:e2e:moderation` y
se excluye de la configuración general para no ejecutar fixtures de evidencia
privada sin su limpieza SQL. `MODERATION_PRODUCTION=1` usa `next start` tras un
build, manteniendo la base de datos de desarrollo.

En máquinas de 8 GB, ejecutar Vitest, build y navegador de forma secuencial.
El arranque de un worker jsdom agotó su tiempo al coincidir con la compilación
fría de Next; no cuenta como una pasada de la suite completa.

Durante el navegador aparecieron avisos globales de `Date.now()` en rutas
existentes, ya registrados en #895. El panel nuevo espera una petición real
dentro de `Suspense`; no se añade caché compartida para silenciar esos avisos.

Los e2e usan únicamente el proyecto dev y fixtures con identificadores propios.
Limpian usuarios y objetos vivos por REST antes/después. La evidencia privada no
es una API de mantenimiento: `e2e/fixtures/moderation-admin-cleanup.sql` contiene
la limpieza SQL acotada para ejecutar antes y después de esta prueba desde una
conexión privilegiada. No se añade una puerta de borrado de auditoría a la app.

## Resultado final — 2026-09-15

- Build de producción y TypeScript: correctos.
- Vitest: 65 pruebas, siete archivos, todas correctas en la ejecución final secuencial.
- ESLint de los archivos de aplicación y e2e modificados: correcto.
- Regresión SQL con roles reales en dev: correcta; siete pruebas de bootstrap correctas.
- Navegador contra servidor dev: una prueba completa correcta (56,7 s).
- Navegador contra `next start`, usando la base dev: una prueba completa correcta
  (44,4 s), con capturas de escritorio y móvil revisadas tras hidratar el panel.
- Fixtures vivos y evidencia privada eliminados; puerto 3000 libre al terminar.
- Sin nuevos avisos de bloqueo de prerender del panel. Persisten avisos globales
  previamente registrados en #895 y `HANGING_PROMISE_REJECTION` de Auth en
  #1126/#1098. No impidieron completar el recorrido.
- Arquitectura sincronizada y `git diff --check` correcto.

## Verificación para la PR #1184

La suite completa antes de integrar main pasó: 3.541 pruebas en 353 archivos.
Tras resolver las adiciones concurrentes de main en tipos, documentación y
bootstrap, pasaron TypeScript, las siete pruebas de bootstrap y la suite completa:
3.568 pruebas en 360 archivos (182,64 s). El build y los recorridos de navegador
indicados arriba corresponden al commit de implementación anterior a esa integración.

## Pendiente de producción

Aplicar ambas migraciones y desplegar la aplicación de manera coordinada.
No habilitar las operaciones de retirada con el cliente anterior: emitía URLs
de audio firmadas con una hora de validez. Tras sustituirlo, las URLs ya emitidas
pueden vivir hasta su vencimiento; las nuevas rutas no emiten credenciales de
Storage y no cachean el audio. Esta ventana de transición queda en #1183.
