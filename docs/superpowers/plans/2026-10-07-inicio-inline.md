# Plan y ledger — Inicio inline

> [Histórico · congelado el 2026-10-07 · resultado en docs/testing/2026-10-07-inicio-inline.md]

Base92776090, rama/PR1457 existente. Diseño de expansión en Inicio aprobado por respuesta del usuario; no se reabre esa elección. Ejecutar como cambio acotado sobre el componente compartido, con TDD y una revisión final del delta.

1. Actualizar pruebas de TodayPicker y agregar exclusión de paneles. Ejecutar RED.
2. Reemplazar diálogo por región inline montada, contexto de un solo bloque y grid/animación CSS; GREEN + tipos/lint.
3. Adaptar E2E a regiones y scroll natural. Build/start local con backend desechable, controlar móvil/PC, sesión, cola/colección, crónica e integridad de feed.
4. Revisión independiente final, corregir hallazgos pertinentes con regresiones. Sincronizar UI/decisiones/mapa/QA y subir a PR existente. Limpieza de servidores propios.

Ruling: usar CSS grid0fr/1fr con clipper min-height0 — evita medir alturas y carreras con WAAPI para despliegues, respeta movimiento reducido. StoryPlayer conserva su animación aparte.

Revisión independiente del delta92776090..d414b5a4: P2Activity conserva selección abierta al ocultar. Repro componente real en React/JSDOM; RED1/6 reproducido. Corrección useLayoutEffect cleanup del provider y componente aislado, conservando estado funcional del hijo. Diferencia menor de skeleton10px corregida reservando106px para la pieza semanal en móvil. Native preserving-ui-state.md16.3.8 confirma el patrón de cleanup.

EE final inicial4/6PASS, resize esperaba cero CSSanimaciones antes de asentarse: se ajusta a polling acotado. Segundo corte2casos: fríoPASS, navegación detecta dialogopen oculto bloqueandoEscape. Corregido guard para hojas renderizadas (clientRects), REDpropio y GREEN10pruebas UI; testfixture aislado incluso enRED. Suitegeneral default5415PASS/1timeout en escánerFS5s ya registrado#1395/#1402; no hay llamadas nuevas revalidatePath. Focalcon15slocal y corte completo siguiente en ejecución.

Hecho: revisión/fixes cubiertos,6/6E2E29.9sPASS (navegaciónNextrealincluida),547files/5417testsPASS253.94scon15slocal,11focalesPASS,build AQjhfFuJrDuSNkvuSe4qA+tipos+lintPASS. UI/backlog/decisiones/mapa y QA sincronizados. Watchers/servidores propios apagados; recibos en.superpowers/qa/2026-10-07-inicio-inline.
