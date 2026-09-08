# R4b — verificación de implementación

> **[Evidencia de ejecución · 2026-09-08 · rama codex/mascota-r4b]**

Entorno: Windows, Node 22.23.1, Next 16.3.0, Supabase CLI 2.116.0.
Base remota de pruebas: **dev** `tyvzpuhxfwxrnkcpzxyg`; producción sin modificar.
Los E2E usan cuentas sintéticas desechables, con limpieza previa por nombre y correo
verificados y `finally` posterior. No se usaron cuentas reales para medir balance.

## Evidencia obtenida

| Comprobación | Resultado |
|---|---|
| Balance | 1.254.400 simulaciones; método y datos en [balance](2026-09-08-r4b-balance.md) |
| Migración dev | Aplicada `20260908074921_pet_r4b_equipment.sql`; matriz SQL transaccional pasa |
| Grants reales | authenticated SELECT propio, sin INSERT/UPDATE; RPC de escritura solo service_role; helpers fuera de API |
| Bootstrap vacío | 243 etapas, contratos SQL y permisos pasan; también matriz R4b local |
| Composición bootstrap | 7 tests pasan |
| CLI, freeze, muestreo y limpieza | 14 tests pasan |
| Compatibilidad | r2.2/r3.1/r4.1 sin diff contra cbf9d65e; fixtures y manifiestos conservados |
| TypeScript | `tsc --noEmit` pasa |
| Suite completa final | 347 archivos, 3470 tests, cero fallos ni errores de worker (184 s) |
| Lint de superficie | 0 errores; cuatro avisos de destructuración no usada en fixtures de test |
| Lint general del repo | 22 errores heredados fuera de R4b; archivos y configuración sin diff contra cbf9d65e, seguimiento actualizado #856 |
| Build final | `next build` pasa con la base dev y la migración aplicada |
| Primer E2E de autoridad | Pasa: dos conexiones, inicio/equipar, doble resolución, permisos y privacidad |
| Primer E2E de UI | Pasa: comparar, equipar, recargar, snapshot real, efecto, replay y entrenamiento sin botín |
| Reanudación/replay | 25 tests de sesión pasan, incluidos r4.1 abierto, hash desconocido y cura/recarga r4.2 |

La primera suite completa dio 3.452 tests correctos y dos fallos: un selector ambiguo
tras agrupar objetos (corregido) y un timeout de barrido de archivos durante la descarga
de Docker. Además un worker agotó su espera de arranque. La repetición enfocada con Docker
cerrado verifica contraste e interfaz; un fixture nuevo de medallón necesitó elegir una
semilla que alcance el segundo tramo. Ese test ya pasa. No se han aumentado timeouts para
ocultar errores. El cierre de la suite completa y los seis E2E finales se registrará abajo.

## Autoridad y revisión focalizada

- El action autentica antes de construir service_role; solo recibe ranura/id, no calidad.
- SQL valida dueño, victoria, catálogo y ranura. El mismo lock serializa selección e inicio.
- Se recupera la intención guardada antes de capturar otra selección. Una foto nueva se
  obtiene dentro de la transacción, sobrescribiendo el equipo recibido del cliente.
- La resolución repetida devuelve el resultado previo antes de validar un payload nuevo;
  índice único impide dos victorias del mismo día. Calidad depende del día, no del intento.
- Legacy se proyecta neutral sin escrituras; el catálogo y el orden de sorteo se conservan.
- Lectura de copias paginada por id, prueba con 1.001 victorias. No se cachean datos privados.
- Las cuatro versiones se seleccionan por versión **y** hash. r4.2 exige equipo válido;
  ninguna versión antigua se adapta añadiendo campos antes del digest.
- El replay aplica cantidades efectivas; reconstruir el log no relanza VFX antiguos. El
  puzzle usa su generador histórico y explica los bonus de las copias del snapshot.
- UI confirma la respuesta del servidor, conserva selección ante error y bloquea doble
  envío. Agrupación por objeto, potencia descendente y desempate por copyId; teclado y foco
  de comparación explícitos, reduced-motion conserva texto. Victoria no autoequipa.

Revisión realizada secuencialmente por el mismo agente, conforme a la petición del usuario;
no se presenta como revisión independiente.

## Arte

PixelLab: seis iconos 64×64 con alfa y cinco efectos de nueve frames 64×64. Dieciséis
generaciones consumidas (saldo 3301 → 3285). Procedencia en
`scripts/pet-pixellab/loot-art.json`; selección y hashes en `src/lib/pet/loot/art-assets.json`.
Archivos comprimidos sin pérdida, caché por hash y tests de presencia, dimensiones/alfa.
Capturas sintéticas de móvil e interfaz final se conservan como evidencia tras los E2E.

## Límites y publicación

- Aceptación jugable pendiente del usuario, seguimiento #1123. La simulación no acredita
  que un objeto dé ganas de probarlo. Tinta/desencantado siguen sin implementar (#1134).
- El servidor emitió `HANGING_PROMISE_REJECTION` de Auth durante prerender de `/mascota`,
  ya registrado en #1126 y #1098; el flujo autenticado y el navegador no mostraron errores.
- El lint general permanece rojo por #856; no se presenta como gate superado. R4b no añade
  errores de lint y no modifica los archivos que producen los 22 errores heredados.
- Antes de publicar: aprobación, migración aditiva en prod, verificar objetos y grants,
  después código y smoke. No desplegar frontend que espere pet_loadout antes del esquema.
- Rollback: conservar migración, copias y motor/reanudación r4.2. Volver al frontend R4a
  dejaría sin reanudación batallas r4.2 abiertas; desactivar solo nuevos inicios si hiciera
  falta. No borrar filas ni versiones publicadas.

## Cierre de verificaciones

Suite final: **3470 tests en 347 archivos**, cero fallos, 184 s. Build final y TypeScript
pasan. Los seis E2E quedan cubiertos: cinco regresiones de aventuras/autoridad pasaron en
la pasada conjunta; el sexto flujo visual pasó después de corregir la duración del texto
(20,8 s, sin reintentos automáticos). El destello dura nueve ticks; el texto mantiene la
última activación hasta la siguiente. También se comprobó teclado (Enter), foco, 390 px,
persistencia al recargar y replay con reduced-motion. No se reejecutaron las cinco pruebas
de autoridad ya verdes tras un cambio exclusivamente visual.

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
node node_modules/next/dist/bin/next start -p 3000
node node_modules/@playwright/test/cli.js test -c .superpowers/playwright-r4b-final.config.ts
node node_modules/@playwright/test/cli.js test -c .superpowers/playwright-r4b-final.config.ts --grep 'R4b interfaz'
```

La configuración temporal usa la de raíz, limita `testMatch` a `mascota-equipo.spec.ts`,
`mascota-aventuras.spec.ts` y `mascota-batallas-autoridad.spec.ts`, fija `retries: 0` y omite
`globalSetup`/`webServer`: el servidor de producción ya estaba iniciado y todas las cuentas
eran propias de esos specs. Para repetirla se pueden pasar esos tres archivos al comando
Playwright habitual usando un único servidor de producción y dev migrado.

Capturas: [equipo](evidence/r4b/equipo-mobile.png) y [efecto](evidence/r4b/efecto-mobile.png).
La cabecera fija aparece superpuesta al capturar un elemento más alto que el viewport;
no se ha retocado la imagen. Se revisaron transparencia y disposición del arte.

Servidor 3000 detenido. Instancia Supabase local y sus datos de fixture eliminados;
Docker Desktop cerrado (se había iniciado para este gate). Worktree previo R4a conservado.
Pendiente aceptación jugable y autorización de publicación, seguimiento #1123.

Implementación guardada en `f1c63aac`. Gate de lint del diff contra `cbf9d65e`: 74 fuentes,
cero errores (cuatro warnings de fixtures). Rama aún local; descripción de PR preparada.
La subida de rama y creación de PR quedaron pendientes de autorización explícita tras el
rechazo de la revisión automática de permisos. No se realizó push, merge ni despliegue.
