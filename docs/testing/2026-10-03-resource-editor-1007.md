# Recursos: identidad del panel de edición — #1007

> **[Histórico · congelado el 2026-10-03]**

## Resultado y alcance

Se reproduce y corrige el traslado de un gesto de mantener pulsado entre
definiciones en `ResourcesConfig`. El panel se remonta con la identidad
`opened.name`; al cambiar de ficha se descartan su vista previa y los timers
del gesto anterior. No cambia el reducer, el formato de eventos, las
definiciones guardadas ni el tablero. No se añade texto de interfaz.

La primera causa sugerida en la issue —que un recurso a medida `Oro` oculta
erróneamente el preset `Oro`— no es un bug con el contrato actual. Un preset
es un atajo para crear una definición; el dominio identifica cada recurso
por su **nombre único**. `resource_added` rechaza otra definición con ese
nombre y `values`, `resource_updated` y `resource_removed` usan ese nombre.
Ocultar el atajo ocupado evita ofrecer un alta que el reducer rechazaría.
Comparar solo el glifo `gold` tampoco identifica un preset: un recurso a
medida `Reserva` puede usarlo sin impedir crear `Oro`.

Las pruebas conservan ambos comportamientos: al quitar el `Oro` a medida
vuelve el atajo y crea un único `Oro` con el glifo `gold`; `Reserva` y `Oro`
pueden compartir ese glifo con nombres distintos. No se introduce una
identidad de preset ni se permiten recursos homónimos.

## Reproducción y evidencia negativa

Antes del arreglo, con Madera inicial `10` y Oro inicial `20`:

1. Abrir la ficha de Madera y iniciar `pointerdown` en «Uno más de inicio».
2. Avanzar el reloj de prueba 640 ms: la vista previa de Madera llega a `13`.
3. Abrir Oro con otra interacción mientras sigue pulsado el primer puntero.
4. El panel reutilizado muestra `23` en vez de `20`.
5. Soltar el puntero anterior emite este evento contra Oro:

```json
{"type":"resource_updated","payload":{"name":"Oro","initial":23,"shared":false}}
```

Este evento altera los valores de Oro que seguían su inicial. Se reproduce
también una vista previa incorrecta desde los extremos `9998` y `-9998`, y
cuando el timer todavía no había empezado al cambiar de ficha. Las pruebas
usan `ResourcesConfig`, `useHoldRepeat` y `resourcesReducer` reales en
jsdom, sin sustituir el botón o el hook por un doble.

La ejecución RED sobre el componente original obtuvo **2 PASS / 5 FAIL**.
No fue un fallo de transporte ni un problema de la infraestructura de
pruebas. El log completo se conservó en
`.scratch/resources1007/r1-red-unit.log` con SHA-256
`630F5B84CC5C259CD292DBA15D495300AA7D2679302D69E609AF3AAA8CA8B057`.
La evidencia interpretable del defecto queda arriba aunque ese artefacto
local se retire al limpiar el worktree.

## Verificación del cambio

Node se invocó explícitamente desde el runtime de Codex. No se arrancó un
servidor ni se consultó o modificó una base de datos para estas pruebas.

| Check | Resultado | Qué comprueba |
|---|---|---|
| RED: `vitest run src/components/play/resources/resources-config.test.tsx --maxWorkers=1 --no-file-parallelism` | 2 PASS / 5 FAIL | Unicidad correcta y arrastre real del gesto antes del cambio |
| GREEN: mismo fichero + `src/lib/play/resources/reducer.test.ts` | 27 PASS | 7 casos de componente y los 20 casos existentes del dominio |
| `eslint src/components/play/resources/resources-config.tsx src/components/play/resources/resources-config.test.tsx e2e/ci/resources-config-identity.spec.ts` | PASS | Sin diagnósticos; salida 0 |
| `tsc --noEmit --incremental false` | PASS | Tipos de las fuentes y pruebas; sin diagnósticos; salida 0 |
| `git diff --check` | PASS | Sin errores de whitespace |
| `e2e/ci/resources-config-identity.spec.ts` | Preparado, pendiente de ejecución coordinada | Dos casos de navegador descritos a continuación |

El log GREEN quedó en `.scratch/resources1007/r2-green-unit.log` con SHA-256
`294A1EA05937F15402EB806149D42CC197DFBF5F8601F6A94118CCB0873E778F`.

La regresión de navegador utiliza un contexto anónimo con IndexedDB propio
a 390 px. Un caso verifica la colisión de nombres y la recuperación del
preset tras quitar la definición. El segundo mantiene pulsado el ratón
sobre el paso de Madera, cambia a Oro mediante foco y Enter sin mover el
puntero, comprueba que no se arrastra el gesto, realiza un ajuste nuevo y
recarga para comprobar los valores persistidos. Cada contexto se desecha
al terminar; no crea cuentas ni datos remotos.

## Límites

Los resultados anteriores prueban la lógica del componente y del dominio.
Este informe no atribuye aún un PASS a la prueba de navegador, a un build
de producción ni a dev o producción remotos. La integración y la
verificación en navegador están coordinadas desde la tarea principal.
