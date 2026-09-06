# Madriguera #1083 — verificación de implementación

> **[Histórico · verificado el 2026-09-06 · dev; producción pendiente]**
> Estado vivo: backlog y contrato S1 de la Parte II de la hoja de ruta de mascota.

## Entrega

Sección en `/mascota`, debajo de la ficha propia o del formulario para eclosionar.
Doce visibles incluyendo la propia cuando existe; hasta 60 vecinas con «Mostrar más»
y recuento explícito. Tarjeta seleccionable con apariencia y enlace al dueño, sin nivel
ni humor ajeno. Sprites existentes, caja táctil del personaje, idle y movimiento reducido.

La lectura usa el cliente de sesión y un Suspense independiente. El RPC devuelve campos
mínimos, filtra seguidos aceptados, visibilidad y bloqueos, y no abre la RLS de `pet_state`.
El helper exige que el espectador coincida con `auth.uid()`. Funciones y ACL verificadas
en dev: `docs/requirements/data-model.md` §8bis.6.

## Resultados

Node 22.23.1, Next.js 16.3.0, base de revisión `bdcdd7c39d68fc08bd38762b47ea98d34b3ec56e`.
Se revisaron los cambios de #1083 del árbol de trabajo; los cambios previos ajenos quedaron
fuera del alcance. No se modificaron dependencias ni configuración de producción.

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | PASS |
| ESLint de archivos TS/TSX cambiados y sus tests | PASS |
| `vitest run --maxWorkers=1` | PASS: 293 archivos, 3005 pruebas, 121,17 s |
| `next build` | PASS: compilación, TypeScript y 70 páginas estáticas |
| Playwright de madriguera contra `next start` | PASS: 3 escenarios, 28,0 s, sin reintentos |
| RPC real: visibilidad, bellotas, campos mínimos y RLS directa | PASS en dev |
| RPC real: 65 vecinas, límite 60, total 65 y orden estable | PASS en dev |
| Capturas de móvil/escritorio y ausencia de desbordamiento horizontal | PASS |
| Advisor de seguridad dev antes/después | 87 → 87 avisos; ninguno nuevo |
| `git diff --check` | PASS |
| Matriz SQL transaccional con `SET ROLE authenticated` | BLOCKED: conector de lectura sin permiso; CLI sin sesión |
| Aplicación y prueba con cuentas reales en producción | NO EJECUTADA |

El E2E vive en `e2e/mascota-madriguera.spec.ts`, separado de `mascota.spec.ts` para evitar
sus hooks sobre la cuenta persistente. Solo usa usuarios desechables propios, limpieza
REST previa y en `finally`, y rechaza cualquier destino distinto de biblioshare-dev.
La ejecución aislada omitió el `globalSetup` de sagas para no escribir semillas ajenas.
Configuración usada: `.superpowers/1083/playwright.config.ts`, derivada de la configuración
del repo con ese único spec, sin globalSetup, retries=0 y servidor levantado por separado.

## Fallos interpretables y correcciones

- Primer E2E: timeout al pulsar el radio `sr-only` de clase. Se cambió el test para pulsar
  la tarjeta visible y verificar el radio seleccionado; no se cambió el selector de clase.
- Otra pasada: navegación tras el texto optimista «Siguiendo» antes de acabar la escritura.
  Se espera ahora a que el botón quede habilitado. Los tres escenarios pasaron juntos
  después de la corrección, contra `next start`.
- ESLint detectó JSX dentro del `try/catch` de la sección. Se separó la lectura protegida
  del render; el lint final pasó.
- `next dev` mostró avisos de `Date.now()` del problema ya registrado en #895. El build
  terminó correctamente y los tres E2E pasaron contra ese build.
- Al recoger el log de `next start` también aparecieron rechazos con digest
  `HANGING_PROMISE_REJECTION` en `/` y `/mascota`: «During prerendering, fetch() rejects
  when the prerender is complete». El stack incluye el cliente de autenticación
  (`_useSession`). No se ha determinado su causa ni si está relacionado con #895;
  no se atribuye al cambio ni se afirma que sea preexistente. Los E2E pasaron, pero
  no se acredita un log de servidor libre de errores. Borrador de seguimiento separado
  en `.superpowers/1083/prerender-issue.md`, pendiente de autorización para publicar.

Los logs y capturas locales se conservan bajo `.superpowers/1083/`: `vitest-final.log`,
`build.log`, `results/`, `results-final/`, `results-ui-2/`, `results-ui-3/` y
`results-production-build/`. Son artefactos locales ignorados por Git, no un requisito
para ejecutar los tests versionados.

## Standards

Revisión independiente aprobada después de usar `EmptyState` de panel y limpieza REST
en `try/finally`. Sin hallazgos pendientes. Se mantiene `search_path = ''` por el contrato
actual de #1083 y los precedentes sociales de referencias cualificadas.

## Spec

Revisión independiente sin hallazgos bloqueantes. Documentación sincronizada con estado
dev, pruebas del límite incluidas y recuento fiel al número realmente mostrado cuando
la guarda descarta filas inválidas. La matriz SQL y producción siguen pendientes en #1083;
S1 conserva su casilla abierta y no se cierra la issue.

## Integración antes de publicar

Rebase sobre main 93c1053: se conservan las entradas documentales nuevas, Madriguera pasa a §8bis.6 y su migración se incorpora al manifiesto y baseline del bootstrap local. Tras integrar: typecheck PASS, 17 tests de Madriguera PASS y 7 tests de bootstrap PASS. La suite completa, el build y los tres E2E descritos arriba corresponden a la base anterior; no se presentan como reejecutados sobre este main.

