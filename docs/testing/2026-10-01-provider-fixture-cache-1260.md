# Aislamiento del proveedor sintético entre ejecuciones — #1260

> [Verificado localmente · 2026-10-01] · evidencia de integración con #1250.

## Incidencia y causa

Dos pasadas del smoke de importación local terminaron en 6/7: el caso de 940
filas no veía el error sintético `provider_temporary`, incluso al secuenciar el
POST y el cron. Las evidencias conservadas en
`.scratch/ticket-campaign/qa1250-local/failure-1` y `failure-2`, junto con
`provider-cache-match.json`, mostraron una respuesta HTTP 200 previa
para «Archive Recovery 0» en `.next/cache/fetch-cache`, con
`revalidate: 86400`.

La clave de caché de Next incluye los encabezados de la petición. El token
constante `ci-letterboxd-fixture-only` hacía que una ejecución posterior usara
esa respuesta ya almacenada y no alcanzara la respuesta 503 de primera consulta
que inyecta la fixture.

## Cambio

`scripts/ci-local.mjs` crea una vez `fixtureNamespace = String(Date.now())`
antes de arrancar el proceso y lo usa en ambos contratos de fixture:

- `TMDB_API_KEY=ci-letterboxd-fixture-only-${fixtureNamespace}`
- `DETAIL_NOTES_NAMESPACE=${fixtureNamespace}`

No se borra `.next/cache`: se conserva la reutilización dentro de una pasada y
solo se separan las respuestas sintéticas entre ejecuciones. El valor no es una
clave real ni se escribe en el entorno persistente. La guardia de la fixture
permanece limitada a Supabase local en el puerto 54321.

## Evidencia y límite de verificación

Al cambiar únicamente el token de fixture, la integración local que contenía el
e2e de #1250 completó 7/7 en 1,2 minutos, con los asertos estrictos de 940
filas. En esa pasada, el caso de 940 películas tardó 51,4 s; la prueba nueva de rating con
caché caliente de #1250 tardó 5,9 s. Esos resultados pertenecen a la
integración local, no a este worktree aislado, que parte de `9f5099d` y no
incluye el e2e de #1250. Las comprobaciones del candidato aislado se consultan
en [PR #1261](https://github.com/borjar20/Biblioshare/pull/1261).

El candidato `7e101d2` completó los controles publicados de calidad, flujos
críticos, CodeQL y Vercel. El resultado de la versión final se consulta en la
PR, con las comprobaciones asociadas a su commit correspondiente.

En este cambio aislado se comprobó la sintaxis del runner y el diff. No se
arrancó un servidor desde este worktree ni se modificó la base de datos o
eliminó la caché.
