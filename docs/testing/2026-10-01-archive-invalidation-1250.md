# Invalidación de valoraciones durante la importación — #1250

> [Verificado localmente · 2026-10-01] · alcance: build de producción local y navegador contra la app local.

## Cambio comprobado

El POST autenticado del propietario inicia la importación tras validar dueño y
origen permitido. El worker procesa e informa por lotes. La recuperación queda
en `private.dispatch_archive_imports`, llamada por pg_cron, sin volver a iniciar
la invalidación desde `after()`.

La comprobación de objetos reales, solo de lectura, confirmó en producción la
función de despacho, el cron activo cada minuto y la presencia de configuración
de Vault para URL base y secreto. En desarrollo existen función y cron, pero no
esa configuración de Vault; la prueba local invoca el cron existente de forma
manual. No se comprobó la ejecución temporal de un minuto ni una llamada HTTP
en producción. No hay migración ni cambios de grants asociados.

## Evidencia disponible

| Comprobación | Resultado |
| --- | --- |
| Revisión independiente | Aprobable |
| Unitarios dirigidos | 4 archivos, 10 PASS en 2,77 s |
| Typecheck | PASS |
| Lint focal | PASS, 0 avisos |
| Build de producción local (Next 16.3.8) | PASS |
| Smoke de siete casos | PASS 7/7 en 1,2 min |

Las pruebas dirigidas cubren la caché pública de valoración inicialmente vacía,
una importación por cron que deja nota 8/10 visible como 4 de 5 y una segunda
escritura del dueño que deja 10/10 visible como 5 de 5, manteniendo una sola
valoración por usuario y el último pase. También cubren 401 anónimo, 404 de
recurso ajeno, 403 de origen distinto e idempotencia del cron con dos pases. El
primer caso ZIP confirma, cierra e invoca el cron explícitamente. La prueba
nueva de caché y permisos pasó en 5,9 s; el caso de 940 filas, en 51,4 s, y el
primer ZIP, en 4,3 s. El log final no contiene el error de #754 ni el de
`revalidateTag` de #1250.

## Límites

El baseline en Next 16.3.0 ya tenía cinco casos funcionales verdes, pero mostraba
dos errores de `after()` y cinco avisos Gzip. El gate SSR nuevo rechaza de forma
intencionada ese log previo y pasó con el predicado real del runner. El smoke
final aún registró doce avisos Gzip, que continúan como sospecha separada en
`#1251`; por ello no acredita salud global del servidor.

Las dos primeras pasadas del smoke dieron 6/7 en el caso de 940 filas. La
hipótesis inicial de solape entre el POST y el cron quedó refutada: la segunda
pasada ya esperaba al primer POST automático y falló igual. La investigación
confirmó que la caché de disco del proveedor compartía una respuesta 200 entre
pasadas al reutilizar el token constante de la fixture. Usar un token por
ejecución mantuvo los asertos estrictos —940 filas, 25 conflictos, 2 errores y
912 importadas— y produjo el 7/7 final. No fue un fallo atribuido a #1250; el
aislamiento de la fixture se sigue en #1260. Los dos FAIL y sus trazas se
conservan en `.scratch/ticket-campaign/qa1250-local/failure-1/` y
`.scratch/ticket-campaign/qa1250-local/failure-2/`.

La comprobación de producción fue solo de configuración y objetos: despacho,
cron cada minuto y dos indicadores de Vault presentes. La consulta solo
devolvió indicadores, sin extraer valores de secretos ni comprobar HTTP en
producción.
