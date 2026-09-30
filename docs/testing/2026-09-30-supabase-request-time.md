# Cliente SSR de Supabase en tiempo de petición — #895

> **[Evidencia de ejecución · desarrollo y build verificados el 2026-09-30]**

El límite final se sitúa en `createClient()`: `connection()` ocurre antes de
`cookies()` y del constructor SSR. Una sonda de diez relojes observó la cadena
`__loadSession → _useSession → _emitInitialSession/timer`; no observó
`fetchWithAuth`. El callback de sesión se encola al construir el cliente, antes
de una llamada a auth o de una consulta. Por eso el primer arreglo, limitado a
helpers, no bastó: un acierto de caché de auth no cubría todos los constructores.

La mutación que retiró solo la guarda central hizo fallar 3 de 4 pruebas. Se
conservan como evidencia material `895-browser-dev-root.log` y
`895-browser-io-probe.log`. `skipAutoInitialize` no es una excepción segura: el
evento asíncrono sigue sucediendo. La consulta de token de auth es una vía
secundaria estática, no el primer disparador observado.

## Comprobaciones

- Tres archivos focalizados, diez pruebas: PASS.
- Navegador real limpio con Node 24 y Next 16.3.0: PASS en 16,3 s. Se comprobaron
  seis rutas autenticadas con cuerpo RSC real (colección y pestañas activas,
  Inicio de `@codex_qa`, sagas con entrada de búsqueda y Buscar con entrada de
  búsqueda) y las superficies anónimas `/sagas` y `/buscar`.
- Resultado de salud del recorrido de desarrollo:
  `consoleErrors=[]`, `pageErrors=[]`, `failedRequests=[]`.
- Build final con la frontera anterior al constructor: PASS, 73 páginas
  generadas y prerender parcial en Inicio, Colección, Sagas y Buscar
  (`895-production-build-final.log`).

No se afirma una campaña completa de rutas, que todas las rutas hubieran perdido
antes su shell estático, ni una ganancia de rendimiento cuantificada. El build
preliminar corresponde a la guarda anterior y no se utiliza como evidencia
de la corrección final.

La pasada de salud general en producción preliminar terminó en FAIL por el 404
local de Speed Insights y solicitudes abortadas; se conserva
`895-browser-production.log` y no se declara consola de producción limpia.
