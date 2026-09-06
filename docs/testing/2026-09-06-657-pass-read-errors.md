# #657 — Fallos de lectura de pases

> **[Verificado contra código · 2026-09-06]**

`getPasses` y `isAutoCloseable` propagan ahora un Error con causa cuando falla la
consulta. `getActivePass` conserva ese rechazo; `applyTransition` se interrumpe
antes de escribir o publicar. Una lectura vacía correcta sigue devolviendo ausencia.
El render utiliza el error boundary existente y las mutaciones conservan sus
manejadores de error; no se cambian permisos ni se cachean datos de usuario.

TDD: se observaron los resultados incorrectos `[]` y `false` ante errores de BD;
las pruebas correspondientes exigen ahora rechazo. La regresión de transición
comprueba que no hay escrituras ni publicaciones cuando la lectura falla.

Revisión acotada del hub: los otros lectores de `passes/actions.ts` para fecha
de inicio y reseña previa también descartan `error`. Requieren un seguimiento
separado porque sus consecuencias son distintas (validación de fecha y menciones):
[issue #1110](https://github.com/borjar20/Biblioshare/issues/1110).

Verificación: 44 pruebas del módulo PASS, `tsc --noEmit` PASS y lint de los tres
archivos TypeScript afectados PASS. No se modificaron datos remotos.

Suite completa: 321 archivos y 3302 pruebas PASS, 0 fallos (151,71 s).
Revisión Standards: 0 hallazgos. Revisión Spec: 0 hallazgos.
