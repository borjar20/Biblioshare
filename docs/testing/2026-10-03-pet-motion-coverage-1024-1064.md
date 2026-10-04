# PetSprite: cobertura de movimiento y CSS — #1024 / #1064

[Histórico · verificado 2026-10-03 sobre base `31430e62d41de11c6f525062eeee7c6146d11a33`]

Se añaden 17 pruebas durables sobre PetSprite y su CSS real. La suite focal termina
en **29/29 PASS en tres ficheros**: 12 pruebas existentes, ocho de DOM y nueve de CSS.
Producto, sprites, dependencias y configuración global de Vitest no cambian.

## Fronteras y garantías

- `pet-sprite.motion.test.tsx` renderiza PetSprite, manifiesto y datos reales. Sólo
  sustituye el loader CSS de identidad de Vitest por exportaciones compiladas del
  fichero real. Comprueba cada humor, la prioridad de joy, bucles y duración,
  sleepy → sad → joy → sad y evolve → salida sobre el mismo nodo, bellota
  idle → ready y dirección estática. Los nombres emitidos deben corresponder a
  keyframes presentes en el CSS compilado.
- `pet-sprite.css.test.ts` lee y compila el CSS de producto con **Lightning CSS
  1.32.0**, ya instalado, y examina AST y reglas con **PostCSS 8.5.25**, también
  instalado. Los cinco strip deben tener endpoints completos y exportaciones
  locales distintas. Dos ejemplos conocidos resueltos por el parser acreditan
  desplazamientos de −864 px (9 × 96) y −208 px (2 × 104), evitando una mera
  búsqueda del nombre o una comparación circular con `styles.foo`.
- La rama `prefers-reduced-motion: reduce` debe cancelar los strips con
  `!important`. Evolve usa un selector más específico y otro `!important`,
  con fundido de 0.6 s, una iteración y sólo opacidad 0.4 → 1. El efecto normal
  conserva destello y escala de 1.2 s.

PetSprite no consulta `matchMedia`: reduced-motion es una regla CSS. No se añade
una simulación de una API que el componente no usa ni `css: true` global.

## Controles causales preservados

Los originales nunca se escribieron. Se emplearon copias CSS y pretransformaciones
aisladas de Vite, con configuración, caché, comandos y resultados propios:

| Control | Resultado esperado observado |
| --- | --- |
| Quitar `@keyframes stripReady` | **3 FAIL / 26 PASS**: dos aserciones CSS y bellota ready en DOM. Los 12 tests antiguos siguen PASS. |
| Endpoint joy con `not-a-position` | **1 FAIL / 8 omitidos**, recibido valor inválido en vez de −864 px. |
| Reduced evolve usa `evolve` en vez de `fadeIn` | **1 FAIL / 8 omitidos**, se observa el nombre del efecto con escala. |
| Mood sleepy resuelve idle | **1 FAIL / 7 omitidos**, DOM emite idle donde se exige sleepy. |

El primer intento de quitar ready mediante mock de filesystem sólo alcanzó la
suite Node (**2 FAIL / 27 PASS**); se conserva y se acota. Una nueva ruta inyecta la
misma entrada CSS en el lector de la fixture y confirma también el FAIL de DOM.
El primer arranque de las nuevas pruebas tuvo un error de URL del arnés bajo
jsdom; se corrigió el lector y se conserva el log, sin atribuirlo a producto.

## Verificación y evidencia

Node explícito `v24.19.0`; Vitest `4.1.11`. Comandos y resultados están en
`.scratch/ticket-campaign/20261002-resolve-all/pet-motion1024-1064-20261003/`
en la raíz del repositorio:

- `focal-03.json`: **29/29 PASS**, tres ficheros, después de los controles negativos.
- `types-01.receipt.json`: typecheck completo sin emisión ni caché incremental, **PASS**.
- `lint-01.receipt.json`: tres fuentes nuevas de pruebas/fixture, **PASS**.
- `negative-*/`: entradas mutadas, configuración, invocación y cada FAIL material.
- El recibo de integridad contrasta las 13 referencias previas, incluidos los dos
  archivos de producto, con las huellas del preflight. El handoff final contiene
  el commit, las cuatro fuentes propias y su manifiesto.

La CI debe ejecutarse sobre el HEAD final de la PR antes de integrar este lote.

## Límite del navegador y siguiente gate

La compilación y el DOM jsdom **no acreditan cascada efectiva, reproducción,
reinicio temporal, pixels ni empaquetado de CSS de Next**. No se ha arrancado
Next, Docker ni navegador; no hay PASS nativo en este informe.

En la evidencia `native/` quedan una fixture privada que importa el PetSprite de
producto y `petMotionNativeGate(page, fixtureUrl, onObservation?)`, entregadas a
QA para coordinación de Root. La fixture no requiere sesión, BD ni proveedores.
Ambas pasan el typecheck aislado con los globals instalados de Next; el primer
intento sin esos globals se conserva como fallo de preparación. No se generó
`next-env.d.ts` ni se cambió la configuración del proyecto.

El gate preparado requiere una ruta temporal montada por Next real. Observa
`getComputedStyle`, `getAnimations` y rAF reales: idle con más de 1.2 s → joy con
tiempo reiniciado, strip por humor, evolve simultáneo, reduce con strips
cancelados, fundido sin transform/filter/desplazamiento, dirección estática y
bellota ready. El callback permite persistir observaciones parciales antes de
dictaminar. Esta ejecución corresponde a QA; su preparación no equivale a
validación nativa.
