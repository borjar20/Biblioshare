# Biblioteca grande — #1161

Verificado localmente el 2026-09-08. Publicación pendiente.

## Diagnóstico

En producción, el resumen contaba 895 obras y la rejilla de `/coleccion` mostraba
«Tu biblioteca está vacía». Las 891 películas tenían su correspondiente ficha
(consulta SQL de solo lectura). La lectura conjunta por UUID generaba una URL
larga; con el cliente Node y el endpoint público, 50 UUID devolvieron HTTP 200
y 500 UUID provocaron `UND_ERR_HEADERS_OVERFLOW`. No se usaron credenciales de
usuario para esta comprobación del catálogo público.

Los errores de hidratación se convertían en mapas vacíos y la función descartaba
todas las obras. También faltaba paginación para bibliotecas de más de 1000 obras.

## Cambio y pruebas

- Hidratación por lotes de 50 con concurrencia de cuatro lotes, conservando orden.
- Lecturas paginadas de pases y episodios; facetas de género también acotadas.
- Propagación de errores: un fallo no devuelve una biblioteca vacía falsa.
- Regresión con constructores PostgREST reales y transporte simulado: 895 y 1205
  películas, notas, reseñas, recuentos de visionados y géneros. Antes fallaba
  (incluido el caso que resolvía una lista vacía ante error); después pasa.
- 75 pruebas de biblioteca, retos y lotes: PASS.
- Suite completa: 3443 pruebas, 343 ficheros, PASS (38,51 s).
- Typecheck y lint de los ficheros modificados: PASS.
- Compilación de producción contra base local desechable: PASS.
- E2E de importación de 940 películas: PASS (44,5 s), comprobando las 939 obras
  resultantes y 938 películas con pase activo completado, antes de deshacer.

La inspección de accesibilidad recortaba la lista a 500 elementos, pero el DOM
contenía las 940 filas. No se cambió la pantalla de importación por ese indicio.
La prueba de navegador emitió avisos de prerender de `/clubes`; no impidieron
el flujo ni las aserciones de biblioteca.

No se modifican esquema, datos remotos ni permisos como parte de este arreglo.
La reparación de cuenta solicitada por el usuario es una operación separada.
