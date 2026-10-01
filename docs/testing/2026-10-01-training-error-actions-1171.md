# #1171 — mensajes y recuperación de errores del entrenamiento

> **[Canónico · verificado contra código y build/start local el 2026-10-01]**

## Resultado y alcance

El panel distingue fallo de conexión (`NETWORK`/`UNAVAILABLE`), sesión caducada
(`UNAUTHENTICATED`), combate incompatible (`UNKNOWN_RELEASE`/`INVALID_SNAPSHOT`/
`UNSUPPORTED_BATTLE`) y otros fallos. Conexión y errores genéricos permiten
reintentar el mismo combate; la sesión caducada ofrece volver al login; una
incompatibilidad al iniciar entrenamiento permite elegir explícitamente un
combate nuevo. No se crea ni sustituye un combate automáticamente.

Sólo el rechazo de una llamada remota se normaliza a `NETWORK`. Los códigos
devueltos por el servidor y los errores locales del motor/recuperación conservan
su significado. `LOCAL_RECOVERY`, la resolución con sus inputs y los reintentos
idempotentes mantienen sus contratos anteriores. El inicio nuevo se limita a
entrenamiento en fase idle; no reemplaza una aventura ni una resolución pendiente.

El enlace de reautenticación hace navegación de documento a
`/login?next=/mascota?view=training|adventure`, construido con `loginHref`.
Se reconstruye el panel después del login desde el checkpoint existente.
Un `Link` de navegación cliente conservaba el error en `TrainingSession` por
Activity: el primer lote de navegador lo reprodujo tras volver autenticado.
No se limpian errores durante render ni antes de comprobar el login.

Hay cinco claves nuevas en `pet.training` de `messages/es.json`. La revisión
i18n confirma su presencia, el alcance de RouteMessages y los usos condicionales;
la copia de recuperación local no cambia. No hay cambios de esquema,
dependencias, rutas ni contenido de los motores congelados.

## Entorno y comandos

- Node 24.19.0, Next 16.3.8, React 19.2.4, Vitest 4.1.11 y Playwright 1.61.1/Chromium.
- Supabase desechable local: `http://127.0.0.1:54321`; claves sólo en memoria.
- Base main `0c74b3aa4e1ba4366a193e2212fb86bd29de763f`; baseline de navegador
  sobre build `NYgySNmOllDNr16gZQKpz`. Build final `Tdr0cRN-uPSRb23R4K0TF`.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `node node_modules/eslint/bin/eslint.js src/components/pet/training/training-session.ts src/components/pet/training/training-panel.tsx src/components/pet/training/training-session.test.ts src/components/pet/training/training-errors.test.tsx e2e/ci/training-errors.spec.ts`.
- `node .scratch/ticket-campaign/qa1171/units.mjs red|green|reauth` ejecuta los
  tests de sesión, panel y errores, con un worker y sin paralelismo de ficheros.
- `node .scratch/ticket-campaign/qa1171/run.mjs baseline|build|prod` usa la
  configuración acotada al nuevo spec. Playwright levanta `next start` en
  localhost:3000 y lo cierra; un worker y cero reintentos.

## Verificación y FAIL conservados

| Control | Dictamen | Evidencia |
|---|---|---|
| Unitarios antes de la corrección | FAIL: 57 PASS / 13 FAIL | Once fallos distinguen comportamiento de producto; dos dependían de un nombre de radio incorrecto en el test |
| Unitarios finales | PASS: 70 PASS / 0 FAIL / 0 SKIPPED | Sesión, panel y nuevos casos de error |
| Tipos iniciales | FAIL | Opciones `exact` de Testing Library, tupla del capturador E2E y parámetro opcional del mock; corregidos en los tests |
| Baseline inicial de navegador | FAIL: 0 PASS / 2 FAIL | Mensaje genérico ante corte de red y sesión caducada; error adicional del cleanup por consultar `celebrations` |
| Baseline con cleanup corregido | FAIL: 0 PASS / 2 FAIL | Mismos dos fallos de producto; Auth 404 y ocho superficies a cero |
| Primer build candidato | FAIL | Tipificación del mock de `start`; no era un fallo del código de producto |
| Primer lote candidato de navegador | FAIL: 8 PASS / 2 FAIL | Tras login correcto persistía el aviso de caducidad; corregido con navegación de documento |
| Build final | PASS | 16,830 s; TypeScript completo y 73/73 páginas |
| Primer lote ampliado | FAIL: 10 PASS / 2 FAIL | El test esperaba resultado inmediato aunque la recuperación había restaurado un checkpoint en pausa |
| Lote final ampliado | PASS: 12 PASS / 0 FAIL / 0 SKIPPED / 0 flaky | 49,663 s de Playwright; 50,295 s totales |
| Tipos y lint finales | PASS | Exit 0; un aviso preexistente por `_equipment` en `training-session.test.ts` |
| Limpieza final y agregada | PASS | Once actores propios ausentes de Auth, ocho superficies a cero y cero marcas propias Auth/perfiles |

El FAIL del lote ampliado se conserva como error de expectativa del test.
La recuperación de un checkpoint abierto es intencionadamente pausada. Si el
checkpoint aún necesita ejecutar su último tick, se pulsa el control de playback
«Continuar» y se deja terminar antes de exigir resultado. El límite del tick
final vive aparte en #1281; no se modifica el motor ni `restoreLocal` en #1171.

## Casos reales y limpieza

`e2e/ci/training-errors.spec.ts` se incluye automáticamente en la configuración
CI. Seis causas por dos pantallas (320×844 y 1280×900, DPR 1) dan doce casos:
corte de red al iniciar, caducidad al iniciar, caducidad al resolver,
UNKNOWN_RELEASE, INVALID_SNAPSHOT y NO_PET.

El corte aborta únicamente el POST real de entrenamiento; al recuperar conexión
se comprueba idéntica pareja intent/enemigo. La caducidad elimina cookies reales
de Chromium y verifica mensaje, destino seguro, ausencia de reintento inválido,
foco, activación por Enter, login y regreso efectivo. No se fabrican respuestas
RSC ni códigos de error de las acciones.

El caso de resolución juega una habilidad en un combate real y caduca la sesión
antes de guardar. Se controla el reloj de Chromium desde antes del login y se
ejecutan sus timers con [Clock de Playwright](https://playwright.dev/docs/clock).
Tras reautenticación se recupera el intento guardado, se reanuda cuando corresponde
y se verifica una sola fila resuelta, inputs idénticos y digest de 64 caracteres
hexadecimales. Las fixtures de incompatibilidad pertenecen sólo al actor propio;
antes de elegir un combate nuevo se conserva la fila y el puntero, y después
siguen intactos la fila antigua y su log. NO_PET elimina/restaura sólo la mascota
de ese actor y comprueba el reintento con el mismo intent/enemigo.

Cada caso exige cero `pageerror` y cero desbordamiento horizontal. Se conservan
ocho capturas de los estados de error; la inspección visual de móvil y escritorio
confirma legibilidad y acciones visibles. Los adjuntos registran únicamente
intents/decisiones propios; no copian cabeceras ni credenciales.

El actor final se elimina y Auth devuelve 404. `profiles`, `pet_state`,
`pet_battles`, `passes`, `pet_acorn_ledger`, `pet_cosmetics`, `pet_daily_missions`
y `user_celebrations` quedan a cero. Una lectura agregada comprueba los once
actores de todas las pasadas, incluidas las fallidas; no se usa ni elimina
ninguna cuenta persistente. El puerto 3000 queda libre. El lote final registra
cero avisos de Gzip y cero destination-stream; esto no cierra #1251/#1263.

## Artefactos y límites

Raíz local ignorada: `.scratch/ticket-campaign/qa1171/`. Baselines
`baseline-1790866569782/` y `baseline-1790866910673/`; build FAIL
`build-1790866966822/`, build final `build-1790868116964/`; lotes de navegador
`prod-1790867088000/`, `prod-1790868161244/` y `prod-1790868754879/`.
Unitarios finales: `units-reauth-1790868046746/`. Los tres logs de tipos iniciales,
los checks estáticos finales, `cleanup-all.json` y `environment-final.json`
conservan el resto de la evidencia. `evidence-final.json` registra SHA-256 de
fuentes, resultados, logs, trazas y capturas.

| Fuente | SHA-256 local |
|---|---|
| `src/components/pet/training/training-session.ts` | `9c9e10cc4a3f5fe835c390da381a3eda191ef4f6790d8860be1c5294c33bb0e2` |
| `src/components/pet/training/training-panel.tsx` | `e82044c1415c3bcafc8dcfd137eb2ae42db368c5955471940df09c457c29ee08` |
| `e2e/ci/training-errors.spec.ts` | `66474238c4ce7e2827bab83a5396140d06c0cf491941c0e054c9fabf3ece195f` |

Los casos de navegador prueban Chromium contra producción local y Supabase real
local. Los demás códigos, replay, aventura y LOCAL_RECOVERY tienen cobertura de
lógica/interfaz y revisión de invariantes; no todos disponen de E2E individual.
No se promete conservar en RAM la selección de un inicio fallido a través de
una recarga completa ni se afirma aceptación en producción remota u otros
navegadores. La corrección no altera los datos productivos.

Actualización de continuidad: #1281 corrige la recuperación del tick final
para los nuevos checkpoints que guardan su marca de final. Su verificación
posterior y la compatibilidad antigua pendiente #1284 están en
[checkpoint final](2026-10-01-terminal-checkpoint-1281.md). Los recuentos y
hashes de este informe corresponden a la entrega #1171 anterior al cambio.
