# Hidratación tardía del chrome: #1534

Verificación focal del 2026-10-14 sobre React 19.2.4, Next 16.3.8 y Vitest 4.1.11.
La incidencia es [#1534](https://github.com/borjar20/Biblioshare/issues/1534).

La regresión previa de #1385 retenía la sesión después del commit de los gates.
La nueva retiene el propio pathname: `main` confirma un handler interactivo,
la navegación cambia a `/comunidad/entre-nosotros` y después se libera la ruta.
El SSR contiene Header, BottomNav y una compañera de prueba. Con el gate original,
este orden provoca tres recuperaciones por discrepancia con `- <Suspense>`.
El control simétrico comienza sin chrome en el atlas y vuelve a `/comunidad`
antes de liberar la ruta; también falla con el gate original.

Se descartó un primer candidato que conservaba siempre el límite interior:
desplazaba las tres discrepancias a `header`, `nav` y `aside`, sin curarlas.
El arreglo final conserva la topología de #1385 y serializa sólo la visibilidad
SSR en un `template` identificado por `useId`. `useSyncExternalStore` recupera
ese booleano mediante `getServerSnapshot` durante la hidratación de cada gate;
después `getSnapshot` aplica el pathname vigente. No contiene identidad, URL ni
datos de sesión; no usa estado mutable compartido, scripts ni APIs privadas.
El `template` no tiene contenido visible, y el SSR inicial conserva la decisión
de mostrar u omitir las barras. No introduce un fallback visual adicional.

RED inicial: 1 FAIL / 5 PASS. RED con retorno simétrico: 2 FAIL / 6 PASS.
El refuerzo final añade sesión resuelta y retenida en ambas direcciones:
10/10 pruebas de hidratación y 39/39 controles focales PASS, con cero
`onRecoverableError` y cero `console.error` en los casos GREEN.
La pantalla completa inicial sigue sin leer sesión; el retorno restaura las
tres piezas y mantiene los fallbacks de sesión mientras corresponda.

Comandos ejecutados (todos desde la raíz del repositorio):

```text
node node_modules/vitest/vitest.mjs run src/components/nav/chrome-boundary.test.tsx src/components/nav/fullscreen-routes.test.ts src/components/nav/navigation.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose
node node_modules/eslint/bin/eslint.js src/components/nav/chrome-gate.tsx src/components/nav/chrome-boundary.tsx src/components/nav/app-shell.tsx src/components/nav/chrome-boundary.test.tsx
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

Los cuatro comandos finalizan con código 0. El resumen saneado y hashes están
en `unit-summary.json`; las salidas completas locales están bajo
`.superpowers/sdd/2026-10-14-atlas-items/chrome-hydration-1534/`.

Límite de la evidencia: el store de pathname y las promesas retenidas son
costuras controladas, no App Router, Auth o transporte RSC reales. Header anónimo,
BottomNav y los dos helpers son reales; `aside` representa la compañera. Esta
pasada no modifica `.next`, no construye ni reinicia el servidor existente y no
acredita todavía el recorrido real de navegador sobre una build nueva.

Referencia de la API pública usada:
[React: getServerSnapshot y transferencia del snapshot inicial](https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
