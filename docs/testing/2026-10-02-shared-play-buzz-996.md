# Vibración compartida de Play (#996)

> **[Histórico · congelado el 2026-10-02]** Verificación local con Node
> 24.19.0, TypeScript 5.9.3, ESLint 9.39.4 y Vitest 4.1.11.

`buzz` pasa de los helpers internos del escenario Aleatorio a
`src/lib/play/ui/buzz.ts`. Conserva exactamente la función anterior: comprueba
que exista `navigator.vibrate` y solicita 30 ms. `stage-helpers.ts` reexporta
esa misma función para mantener los imports actuales de Aleatorio.

Los consumidores externos encontrados son `clock/chess-game.tsx`,
`clock/countdown-panel.tsx` y `turns/turns-game.tsx`. Sus únicos cambios son
los imports a `@/lib/play/ui/buzz`; no cambian las llamadas, efectos, referencias
ni condiciones que deciden cuándo vibrar. Los dos componentes de Recursos
importan `stableColor`, no `buzz`, y quedan intactos.

## Comprobaciones locales

| Comprobación | Resultado |
|---|---|
| Función antes/después, normalizando sólo CRLF a LF | PASS: contenido idéntico |
| `stage-helpers.ts` frente al original | PASS: sólo sustituye la definición de `buzz` por el reexport |
| Tres consumidores externos frente a sus originales | PASS: sólo cambia el import en cada archivo |
| Lint de las cinco fuentes afectadas | PASS: cinco archivos analizados, cero errores y cero advertencias |
| `tsc --noEmit --incremental false --pretty false` | PASS: exit 0, sin diagnósticos |
| Unitarios existentes de `stage-helpers.test.ts` y `use-landing-gate.test.tsx` | PASS: nueve pruebas en dos archivos, cero fallos y ninguna pendiente |
| `git diff --check` | PASS |

Las pruebas existentes se ejecutaron con un worker, sin añadir ni modificar
tests. La lista final de imports confirma que los tres consumidores externos
usan la utilidad compartida y que Aleatorio conserva la ruta del reexport.

## Evidencia

Artefactos locales no versionados en `.scratch/buzz996/`:

- `before/*.before.txt`: copias originales de los cuatro archivos modificados.
- `check-extraction.mjs`, `extraction.json` y `final-importers.txt`:
  equivalencia de la función, cambios limitados a imports y consumidores.
- `lint.json` y `lint-status.json`: los cinco archivos y sus diagnósticos.
- `types-status.json`: comando, estado PASS, exit 0 y duración. No hay una
  copia del stdout guardada.
- `unit-output.txt` y `unit-status.json`: comando, resultados y duración.

SHA-256 de la función completa, normalizada a LF, antes y después:
`771ff2c2e8ff6476304ae23a0aa83f82038b8e568d1f5a2d484ec37fda0867b1`.

SHA-256 de `stage-helpers.ts` original, conservado sin normalización:
`bef024ada4eb872803644d0b9aa6a4d7638dc30e0afb69350ad775eddb5da277`.

Esta verificación cubre la extracción, resolución de imports y compatibilidad
de los consumidores. No acredita vibración física, navegador, wrapper nativo,
build, CI ni producción. La utilidad no incorpora plugins ni dependencias de
Capacitor.
