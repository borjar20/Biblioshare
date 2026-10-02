# Hidratación de fichas nacidas de Google Books (#1290)

> **[Trabajo pausado a petición del usuario el 2026-10-02 · código, unitarios y primera tanda de navegador comprobados; gate final y CI pendientes]**

## Fallo confirmado y alcance

El registro por volumen crea una shell honesta: los textos del resultado recibido
del navegador no se consideran metadatos fiables. El hidratador anterior no leía
el ID de Google persistido y podía enviar una propuesta vacía a `hydrate_book`.
La RPC estampaba `hydrated_at` aunque la ficha siguiera mostrando «Sin título»;
el cooldown impedía recuperarla inmediatamente.

La reproducción conservada en
`.scratch/ticket-campaign/qa1290/confirmation-1790933100999/` obtuvo un control
OpenLibrary PASS y un caso Google-only FAIL, sin reintentos. El caso Google
persistió campos nulos con sello, siguió vacío tras recarga y registró cero GET
por ID desde la aplicación. Una consulta separada al proveedor de prueba obtuvo
200: acredita el contrato de la fixture, no una consulta real de la aplicación.
La observación de la RPC de hidratación fue indirecta, mediante su definición
SQL y el estado final de la fila. El cooldown de 30 días se verificó en código;
no se simuló el paso de un mes.

Esa reproducción utilizó el build anterior `oobcOzt56D-A60o0uIKZF`, basado en
`b94d0dad`. No se atribuye al código corregido. Su manifiesto final tiene SHA256
`5f4c508afc2494899b8e103841f94945fb2b07a9b92d3eb986a166604a0eeaba`.
Las tandas previas con límites de preparación se conservan y no se suman a los
resultados de esta.

## Contrato corregido

- Las acciones de abrir y añadir leen la fila real por el UUID devuelto por el
  registro. No fabrican su identidad, representación ni cooldown a partir del
  `SearchResult` del navegador.
- Una ficha sin work key y con volumen persistido consulta exactamente
  `GET /books/v1/volumes/{volumeId}`. El cliente rechaza IDs fuera del contrato
  local y respuestas cuyo ID no coincida, y mantiene timeout y caché pública.
- Título, primera autoría no vacía, sinopsis, portada y páginas se proponen a la
  RPC existente. Las páginas son enteros entre 1 y 20000, sólo para rellenar un
  hueco. Se conserva `volume.language`; un idioma desconocido es `other`.
- La nueva rama no propone ISBN, work key, QID, año ni géneros. La protección
  SQL existente vuelve a leer la fila y conserva la curación manual.
- Un error del proveedor o un volumen sin título útil no llama a la RPC ni
  estampa una hidratación vacía. El siguiente acceso puede reintentar.
- Sólo la shell completamente vacía, sin identidad OL/QID ni representación
  previa y con `repr_meta` nulo u objeto vacío, puede saltarse el cooldown para
  rescatar el fallo histórico. Una ficha poblada o curada mantiene el gate.
- `HydrationWatch` compara con el sello de partida y refresca una sola vez al
  observar otro sello. No interpreta el sello antiguo como una recuperación.

El enriquecedor de créditos anterior puede buscar OpenLibrary usando los textos
canónicos después de la hidratación. Su comportamiento no se ha sustituido;
la ausencia de búsquedas por ISBN/OL/QID describe la nueva rama de hidratación,
no todas las tareas de la ficha.

## Pruebas locales y revisión

| Comprobación | Resultado | Alcance |
|---|---|---|
| Cliente Google Books | PASS, 86/86 | ID exacto, respuesta inválida, fallo de red/HTTP, timeout y mapa existente |
| Hidratador, acciones, watcher y controles de representación/after | PASS, 125/125 en 5 archivos | UUID persistido, fallo sin sello, rescate estricto, cooldown, curación y refresco acotado |
| TypeScript y ESLint del producto | PASS | Sin errores; comprobados antes del spec nuevo |
| Revisión independiente del delta del coordinador | PASS estático | Sin hallazgos accionables; no sustituye navegador ni CI |
| Primera tanda de build nuevo y navegador, 7 casos nuevos + 4 de cuota | FAIL: 8 PASS / 3 FAIL | Una igualdad prematura del sello y dos desbordamientos móviles, registrados en #1300 |
| Checks obligatorios de la PR | Pendiente | Deben corresponder al commit final de entrega |

El cliente tiene evidencia sellada en
`.scratch/ticket-campaign/qa1290/provider-1790933797227/`: cinco artefactos,
cero discrepancias, manifiesto SHA256
`9cdef93dc8431373dc86d74df6fdc9f6866dc85fb633943517e48c2ea2a53328`.
Los otros unitarios y controles estáticos viven en
`.scratch/ticket-campaign/qa1290/root-static-1790933897779/`; el JSON nativo
de unitarios tiene SHA256
`65cde0b7b9d65cf3e4a15a823123349dc854afc186aae3ba84a214e854054e85`.

La primera tanda de integración vive en
`.scratch/ticket-campaign/qa1290/integration-1790934023415/`: build nuevo
`aZE2SR1r2YHEzCrcw2Bjz`, Node 24.19.0, 11 casos en 62,908 s, sin SKIP,
flaky ni reintentos. TypeScript y ESLint finales pasan; 49 fuentes RAW/LF
permanecen iguales y los 58 artefactos sellados tienen cero discrepancias.
Manifiesto SHA256
`4981954309b9c5b3e261ed7af3daa8c03100cd5ec714053e3324b6c5bbf7a967`.

El caso de alta recuperó los canónicos y la UI sin recarga, pero comparó el
sello mientras la segunda hidratación Action/RSC seguía en vuelo: sólo cambió
`hydrated_at`, de `09:56:45.270001` a `09:56:45.759185` UTC. La revisión posterior
del spec espera esa finalización antes de fijar su snapshot; no se relaja el
contrato de cooldown. Esa revisión aún no se ha ejecutado en navegador.
Los otros seis casos de hidratación pasan. Los dos casos de
cuota a 1280 px pasan; a 320 px los títulos con un token de 32 caracteres
producen documentos de 603/585 px. La CSS del hero coincide con el código base
`030426a`; este fallo se rastrea y corrige por separado en
[#1300](https://github.com/borjar20/Biblioshare/issues/1300).

La limpieza de los once actores pasa: Auth 404, tablas propias, cuotas,
ediciones, ISBN keys, créditos, sesiones y refresh tokens a cero; sin residuos
de personas ni escrituras tardías. Next se detuvo antes de la auditoría final,
Supabase se detuvo con backup y el puerto 3000 quedó libre. El gate #1092 no
se ejecutó después de este FAIL. Esta tanda se conserva aunque el siguiente
intento pase.

La corrección del spec observa los dos POST reales de `hydrate_book` por
UUID propio y sus respuestas 204 antes de fijar la fila final; después de
recargar exige fila completa idéntica y ninguna nueva llamada GET/RPC. La
observación es pass-through: no sintetiza la respuesta de la DB ni guarda
propuestas, cabeceras o credenciales. Sólo acepta el host local, la ruta y el
método exactos y una identidad de fixture demostrada. La revisión estática,
TypeScript, ESLint y sintaxis Node 24 pasan; no acredita una segunda tanda de
navegador. Firmas RAW de las fuentes revisadas:

- Spec: `4d70e6e731acb7acce2415e9f66ea5ee10d95980b69ab2a9b242b0a6a094fd73`.
- Provider: `0aa8738dbcc14e5e0a5fd1ef03909b1af3887bf5a657968eb49ce8c017206601`.

El producto y esta revisión quedan guardados en el commit local
`1ff2dde7777fb9e4f6cf02c451d5be18d2cd677c`, rama
`codex/google-books-hydration-1290`. No hay PR ni cierre de #1290. Para
reanudar: terminar #1300 en su rama independiente, integrar su CSS, construir
de nuevo y ejecutar los siete casos de hidratación más los cuatro de cuota;
después sincronizar los documentos canónicos de estado y pasar los checks de
la PR final. #1092 y #831 conservan sus issues y su alcance separado.

Los siete casos permanentes de
`e2e/ci/google-volume-hydration.spec.ts` cubren alta por ISBN y refresco sin
recarga; dos shells históricas con metadatos nulos/vacíos; fallo 503 seguido de
recuperación; curación existente; cooldown; y precedencia de OpenLibrary.
El proveedor acepta únicamente IDs/ISBN/textos registrados por el caso.
Las credenciales quedan en memoria y no se guardan en traces ni capturas.
La limpieza comprueba ownership, revoca sesiones antes de borrar Auth y audita
filas, cuotas privadas, ediciones y claves ISBN por UUID propio.

## Ancla externa y límites

La [ficha pública de Google Books](https://books.google.es/books?id=zyTCAlFPjgYC&hl=en&redir_esc=y)
confirma el volumen `zyTCAlFPjgYC` y el ISBN `9780440335702` de *The Google
Story*. La [referencia oficial de volumes.get](https://developers.google.com/books/docs/v1/reference/volumes/get)
documenta la consulta por ID. La consulta JSON pública real de esta sesión
respondió **429 RESOURCE_EXHAUSTED**, con cuota disponible cero. No acredita
un GET real 200 ni el idioma del volumen; `hl=en` sólo es idioma de interfaz.

La ancla vive en `.scratch/ticket-campaign/qa1290/real-anchor-20261002-v001.json`,
SHA256 `38dc426db4e2f7596ef2813b03e266b62fb66340d0033d86ed1d93790d3d16b4`.
No se le atribuyen los metadatos del proveedor de prueba. Las pruebas de
navegador verificarán el consumo de ese contrato, pero no la disponibilidad
actual de Google ni una reparación masiva de fichas en producción.

No hay cambio de esquema, permisos, dependencias ni configuración productiva.
La recuperación de shells históricas ocurre al acceder a ellas; el seguimiento
de identidad y fusiones de producción mantiene su issue y sus gates propios.
