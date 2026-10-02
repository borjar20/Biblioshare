# #1237 — cuota de altas nuevas de Google Books

> **[Canónico · verificado en código, SQL local/dev, navegador contra build/start y CI del head b94d0dad el 2026-10-02; SQL aplicado y verificado en prod; entrega por PR #1291 con checks obligatorios antes del merge]**

## Contrato

Cada cuenta puede crear 60 shells de Google Books por ventana fija de una hora.
La ruta legítima es el ISBN escrito o escaneado que Open Library no conoce;
las importaciones CSV y el registro bulk no utilizan este fallback. El límite
se aplica en SQL también a una llamada autenticada directa a la RPC.

La operación `catalog_google_volume_create` usa el UPSERT atómico existente de
`private.request_quotas`. El trigger AFTER INSERT de `books` cobra sólo si
la fila tiene `google_books_volume_id` y carece de `openlibrary_work_key`.
El índice único decide la inserción ganadora; `ON CONFLICT DO NOTHING` no
activa ese trigger. Repetir o compartir un volumen existente es gratis,
incluido un libro que ya tenga ambas claves y cuotas agotadas. Un rechazo
`PT429` revierte shell, edición automática e incremento de contador.

El BEFORE INSERT genérico conserva su momento y capacidad para los demás
libros. Películas, series y las demás operaciones mantienen sus límites,
incluido `import_rows=6000/h`, compatible con dos lotes de 3000 filas.
La RPC de volumen conserva firma, autenticación, validación ASCII de 1–256
caracteres y permisos. No hay nueva tabla, columna, caché ni backfill.
La cuota no verifica que el identificador exista en Google Books.

## Respuesta de la aplicación

Las acciones de búsqueda devuelven `RATE_LIMIT` como fallo esperado: distinguen
la cuota existente de peticiones (60/min) de la de altas Google Books (60/h).
Los errores de infraestructura y otros errores siguen propagándose. El rechazo
corta antes de hidratar, crear un pase, revalidar o redirigir.

El aviso está fuera del botón, unido por `aria-describedby` y agrupado con
la tarjeta en una única celda. Se limpia al reintentar. El componente de añadir
conserva el botón disponible y no marca un alta rechazada como «En tu biblioteca».
`SearchResultCard` actualmente sólo consume `OpenResultButton`: el componente
`AddToLibraryButton` y su acción quedan cubiertos por unitarios; no se atribuye
un recorrido publicado de añadir ni se introduce un consumidor para probarlo.

## Tandas históricas anteriores a la integración

Base inicial de trabajo: `89d82e83749350cc761b4a5bdd1d1188a34ff3cb`.
Runtime local explícito: Node 24.19.0, Next 16.3.8, Vitest 4.1.11.

| Superficie | Resultado |
|---|---|
| Acciones/componentes finales | 10 PASS, 0 FAIL, 0 pendientes; dos archivos reales |
| TypeScript y lint focalizado | PASS |
| SQL local final | 41 PASS, 0 FAIL; psql no publica métricas SKIPPED |
| SQL dev | 41 comprobaciones devueltas, todas PASS; fixtures revertidas |
| Concurrencia local independiente | Dos escenarios PASS, locks reales observados |
| Comprobador durable de concurrencia | Dos escenarios PASS; limpieza a cero |
| Compatibilidad #924 | 19 comprobaciones PASS |
| Compatibilidad #811 | Contrato de cuotas/importación PASS |
| Bootstrap: orden, inventario y baseline | Siete tests PASS |
| Traducciones | Seis claves consumidas resuelven con next-intl real |
| Advisors locales | Ocho antes/después, sin añadidos, eliminados ni cambios |
| Navegador: candidato final, 320/1280 px | 8 PASS, 0 FAIL, 0 SKIP, 0 flaky, 0 retries |
| Cobertura permanente de navegador | 4 PASS, 0 FAIL, 0 SKIP, 0 flaky, 0 retries |
| Producción y CI de la PR en esas tandas | Pendientes entonces; resultado integrado y SQL entregado, debajo |

Los 41 checks prueban 60 altas aceptadas, rechazo de la 61 sin residuos,
reutilización y aislamiento de cuentas, vencimiento, límites de coste,
RPC autenticada real, denegación anónima y tabla privada inaccesible. Las
carreras usan dos conexiones reales: compartir el mismo volumen devuelve
un único UUID y cobra sólo al ganador; competir por el último hueco admite
una alta y rechaza la otra. Se comprueba el bloqueo causado por la conexión
ganadora, sin inferir concurrencia de una espera fija.

En dev, el runner deriva los mismos 41 checks del source SQL final. Captura
sus etiquetas y revierte las fixtures mediante una subtransacción antes
de devolver el resultado. Auth, perfiles, libros y cuotas de ambos actores
quedan a cero. El objeto real confirma un único cambio en el allowlist,
el RPC de volumen idéntico, ACL/RLS idénticas y los dos triggers esperados.
No se escriben datos de prueba en producción.

La comprobación de ocho casos del candidato previo usa Node 24.19.0 y el build
`-3H-UXeHRKnHi4s6cWdAq`. Las ocho pruebas pasan sin reintentos: rechazo de la
alta 61, vencimiento y reintento sobre la misma tarjeta, límite de peticiones
con mensaje distinto, reutilización por UUID y enlace de catálogo con ambas
cuotas agotadas. Las cuatro respuestas de rechazo son Server Actions reales,
HTTP 200 con `RATE_LIMIT` y el motivo correspondiente. Sólo se sustituyen las
respuestas de proveedores para los ISBN sintéticos propios; Auth, acciones,
RPC y estado de base de datos son reales.

Las alertas se alinean con la tarjeta y quedan debajo, en su misma celda,
sin desbordar a 320/1280 px. Se inspeccionan doce capturas finales. No hay
errores de página; se conservan 40 mensajes de consola de SpeedInsights
local (20 pares 404/MIME) y 74 `ERR_ABORTED` (20 de SpeedInsights y 54 de
navegación/prefetch). La ausencia de Gzip/destination-stream en este lote no
resuelve #1251 ni #1263. La limpieza agregada verifica Auth 404 de 18 actores,
552 IDs de libros propios auditados, ocho tablas, cuotas, ediciones y claves
privadas de ISBN a cero; el servidor propio termina y libera el puerto 3000.

Los cuatro casos permanentes pasan después contra el mismo build y fuentes,
con los preloads de proveedores compuestos como en CI. Comprueban cuatro
rechazos reales HTTP 200 y la asociación/geometría del aviso. La limpieza
de este lote elimina cuatro actores y 124 libros; el barrido agregado queda
en 22 actores Auth 404 y 676 libros auditados a cero. El manifiesto nuevo
contiene 178 archivos y mantiene intactas las 158 huellas anteriores.

La navegación a la fila creada no acredita su hidratación canónica: las
fixtures muestran «Sin título» en la ficha. La sospecha y su confirmación
pendiente viven en [#1290](https://github.com/borjar20/Biblioshare/issues/1290).
No se atribuye existencia remota al volumen sintético ni un recorrido de
añadir publicado al componente sin consumidor.

## Verificación integrada y entrega SQL del 2026-10-02

Head verificado: `b94d0dad0ba8c5ea9c2af602d2e2d9be81424040`, integrado con
main `db265d568d43804166969440c500526bdfed5813`. Las tandas anteriores de
ocho y cuatro casos y los dos FAIL de CI se conservan; no se suman a esta
verificación ni se atribuye un PASS a un futuro head documental.

| Superficie del head integrado | Resultado nativo |
|---|---|
| Build/start local nuevo, Node 24.19.0 | PASS; BUILD_ID `oobcOzt56D-A60o0uIKZF`, 73/73 páginas |
| Cuatro casos permanentes locales, 320/1280 px | 4/4 PASS en 24,814 s; 0 FAIL/SKIP/flaky/retries |
| Identidad local | 28 fuentes RAW/LF, refs y build estables antes/después |
| Cleanup local independiente | Cuatro actores Auth 404; ocho tablas y cuotas/books/passes/ediciones/claves ISBN propias a cero |
| CI quality | 3956/3956 unitarios en 407/407 archivos; typegen/tsc PASS; lint 0 errores y 29 avisos |
| CI critical-flows | Build 73/73; navegador 75/75 PASS, 0 FAIL/SKIP/flaky, incluidos los cuatro casos de cuota |
| CI SQL en critical-flows y bootstrap independiente | Cada job: 41 aserciones #1237 y dos carreras PASS; 272 pasos de bootstrap, contratos y privilegios PASS |
| Generador del bootstrap independiente | 7/7 PASS |
| Cleanup de ambos jobs DB | Supabase stop SUCCESS; upload-artifact omitido sólo por `if: failure()` |
| Checks de PR #1291 | 8/8 SUCCESS; obligatorios quality/critical-flows SUCCESS; CLEAN/MERGEABLE en esa observación |
| CodeQL del head integrado | Agregado SUCCESS; JS/TS 87 reglas y Actions 17 reglas, cero resultados; alertas OPEN en `refs/pull/1291/head`: `[]` |
| SQL en producción | Aplicado una vez; pre/post y soporte PASS, objetos y ACL/RLS idénticos a dev |

La tanda local usa únicamente `e2e/support/ci-providers.cjs` como preload y
un registro propio de metadatos para ISBN sintéticos. Conserva sin relajar
las aserciones RSC, la identidad de `openCatalogItem` obtenida del manifest
nuevo, `aria-describedby`, misma celda, alineación y `noOverflow`. Auth,
SDK, acciones, RPC y SQL son reales. El cierre termina los servicios propios,
con backup normal de Supabase y puerto 3000 libre en ese momento; no borra
fixtures ajenas ni cuentas persistentes. No se atribuyen los 325 px de la
segunda CI exclusivamente al ajuste de filtros #1295.

Los jobs `quality`, `critical-flows` y `empty-database` ejecutan el commit
sintético `0913f0041eb7665351542e87006f0def0b96435a`: sus padres son exactamente
main/head anteriores. CodeQL analiza directamente el head `b94d0dad`.
Los resultados nativos están en
[Tests 36987526145](https://github.com/borjar20/Biblioshare/actions/runs/36987526145),
[bootstrap 36987526072](https://github.com/borjar20/Biblioshare/actions/runs/36987526072)
y [CodeQL 36987520476](https://github.com/borjar20/Biblioshare/actions/runs/36987520476).
La ausencia de alertas se limita a la ref de esta PR; no declara resueltas
todas las alertas globales de main. No se repite ninguna ejecución de CI.

La entrega SQL se comprueba contra los objetos reales de producción
`vmutcradmodhiltuohys` y dev `tyvzpuhxfwxrnkcpzxyg`: función de cuota idéntica
a dev, con la única operación nueva prevista de 60/h; RPC de volumen y ACL sin cambios,
helper `private.enforce_write_quota` idéntico y ambos triggers de cuota activos
(`enabled=O`). `consume_request_quota` conserva SECURITY DEFINER, EXECUTE
anon=false/authenticated=true y RLS privado sin SELECT para esos dos roles.
No hay columnas, backfill ni datos de prueba nuevos en producción. Las 41
pruebas de comportamiento se ejecutan en local/dev/CI y las dos carreras en
local/CI; producción se verifica por metadatos, sin fixtures.

**Gate de entrega:** la PR #1291 se integra y cierra #1237 sólo cuando pasan
los checks obligatorios del commit de entrega. El SQL está verificado en prod;
#1290 documenta la hidratación canónica, que esta prueba de cuota no acredita.
`AddToLibraryButton` continúa sin consumidor publicado y su prueba es unitaria.

Los dos sellos finales de esta revisión son independientes de los históricos:

- [QA local integrada](../../.scratch/ticket-campaign/qa1237/integration-1790931572584/result.json):
  16 artefactos, cero discrepancias; SHA-256 de resultado
  `30cd01154a4c9caec9df44f35f8c79cd0266ea499447fae2c70b76f0c7554d0e`;
  [manifiesto](../../.scratch/ticket-campaign/qa1237/integration-1790931572584/sha256.json)
  `416b8967ef97402a4efc729495e133a42b640af2cddddd263df38b758000d8c3`.
- [CI integrada](../../.scratch/ticket-campaign/qa1237/ci-integrated-head-b94d0da/verdict.json):
  20 artefactos, cero discrepancias; SHA-256 de dictamen
  `b5279719c0ba59acbf98a24b2dd5c7f9804c9e0cea28bfa306639616c23be23a`;
  [manifiesto](../../.scratch/ticket-campaign/qa1237/ci-integrated-head-b94d0da/manifest.sha256.json)
  `8ad096de0901b13e402a0dceef6da2c117b5a9816aed67ecebf5dd86706033cb`.

El sello de [entrega SQL de producción](../../.scratch/ticket-campaign/qa1237/root/prod-delivery-20261002-v001/verdict.json)
contiene 14 artefactos, cero discrepancias; SHA-256 de dictamen
`87a8ae4af72518f8bbdd40e25f727fddfcd079ff96d0694e857b0541a8dc52a6`
y del [manifiesto](../../.scratch/ticket-campaign/qa1237/root/prod-delivery-20261002-v001/manifest.sha256.json)
`d66ba5a4f94bc6123a408cf9572cc57d9a66dd4e23816c833d3210880ef7e192`.
Incluye `apply-result.json`, `{dev,prod}-pre.json`, `prod-post.json`,
`check-{pre,post,support}.json` y `{dev,prod}-support.json`, con resultado
de aplicación y las definiciones/ACL/RLS y estados de triggers antes/después.

Se conserva además `integration-1790931490978/` como
`FAIL_HARNESS_IDENTITY_METADATA`: el guard comparaba la huella RAW esperada
del spec con su versión LF. Abortó antes de arrancar servicios, build o
pruebas; la corrección vive en el harness de la ruta nueva, sin convertir
EOL ni tocar fuentes o aserciones. No se interpreta como un fallo de producto.

## Evidencia y fallos conservados

### Primera CI y corrección de la carga de proveedores

El head `695fa1bc4213d6539ae6ea0a9536af4a7530c683` pasa quality con
3913 pruebas y 406 archivos, sin FAIL/SKIP. Los dos jobs de base de datos
completan 41 checks, dos carreras Google y 272 pasos de bootstrap; el TAP
del inventario tiene siete PASS. El navegador no se ejecuta: `next build`
falla antes de smoke al intentar cargar los dos paths de proveedores como
un solo módulo. No existe un contador nativo Playwright para esa pasada.

El formatter de opciones del Next instalado reproduce la concatenación de
los dos `--require`. `e2e/support/ci-providers.cjs` carga la cadena mediante
un único preload, conservando el orden detail-notes/archive → Google y los
guards de cada fixture. Siete comprobaciones nativas de formatter y proceso
hijo pasan sin red/DB, con sintaxis/lint PASS. La segunda CI Node22 confirma
que esta composición permite completar el build; su navegador falla después,
según el apartado siguiente.
Las pruebas anteriores de aplicación se conservan, sin atribuirles el build
fallido de CI ni esta nueva composición.

El check CodeQL también falla con cuatro alertas de OpenLibrary. Los IDs
2–5 estaban abiertos en `main` desde 2026-09-13 y sus sinks no cambiaban en
esa PR. Una reproducción offline de las cuatro funciones reales confirma
desvío de endpoint/query con `../search.json?q=proof#`, conservando el host
inicial; no demuestra una fuga interna o redirects externos. Se corrige
en [#1292](https://github.com/borjar20/Biblioshare/issues/1292), mediante
[PR #1294](https://github.com/borjar20/Biblioshare/pull/1294), integrada antes
del head b94d0dad. Las alertas 2–5 se verificaron FIXED sin dismissals.
Ese cierre no cambia el FAIL de la primera CI; el gate del nuevo head se
comprueba por separado arriba.

### Segunda CI: respuesta del navegador y geometría

El head `8ccae7cb478d865e7e09e47e57314c180dddb7e4` pasa build y quality:
3913 PASS en 406 archivos, sin FAIL/SKIP. Los dos jobs de base de datos
vuelven a completar 41 checks SQL, dos carreras y 272 pasos de bootstrap;
el inventario TAP tiene siete PASS. Las dos paradas terminan correctamente.

El navegador ejecuta los 71 casos: 68 PASS / 3 FAIL / 0 SKIP, sin flaky ni
retries. Los cuatro casos de cuota se ejecutan: uno pasa y tres fallan.
Dos fallos ocurren en `response.text()` con el error CDP «No data found for
resource with given identifier». Sus capturas ya muestran el aviso; no se
atribuye ese error de lectura al producto. El tercero observa un ancho de
documento de 325 frente a un viewport de 320. La captura muestra el filtro
Series en el borde, pero aún falta el control anterior a la acción para
confirmar la causa. No se relaja la comprobación de overflow.

Los cuatro cleanup nativos confirman actores Auth 404, ocho tablas a cero,
cuotas/ediciones/claves a cero y 121 libros eliminados. Los 63 archivos
sellados incluyen el HTML nativo y las tres capturas; las 23 huellas de la
primera CI permanecen intactas. No se repite la CI sin corregir una causa.

El nuevo harness lee en paralelo un clon de la respuesta real del navegador,
sin depender de que CDP conserve el body. Devuelve intacta la Response a
React y restaura `fetch` en `finally`. Identifica sólo `openCatalogItem` por
la entrada única del manifest del build instalado, sin hardcode ni retener
el manifest o su clave. Las acciones de fondo quedan fuera del contador.
Doce controles nativos de la función extraída del spec pasan, incluyendo
delegación, identidad de Response/Request, errores, otra acción y guards de
unicidad; lint y TypeScript pasan. En ese punto aún faltaban los cuatro
recorridos reales del nuevo harness; los pasa después la tanda integrada
documentada arriba. Las aserciones de cuota y geometría siguen intactas.

El control local anterior al clic confirma en Buscar que Series rebasa
9,17 px su contenedor a 320, incluso con búsqueda vacía. No reproduce los
325 px globales de CI. El defecto independiente se sigue en
[#1295](https://github.com/borjar20/Biblioshare/issues/1295). El intento de
formulario manual con un actor ordinario redirigió a Buscar: no acredita
esa ruta. El baseline conserva 1 PASS/7 FAIL y explica por separado el
guard demasiado amplio que contó llamadas de fondo; su limpieza está a
cero. No se atribuye ese guard al producto ni se relaja `noOverflow`.

Raíz ignorada: `.scratch/ticket-campaign/qa1237/`.

- `app/red-1790884394378/`: RED de la acción que antes propagaba la cuota.
- `app/green-1790884394378/`: GREEN previo al ajuste de agrupación visual.
- `app/green-1790894191906/`: GREEN final, 10 casos y fuentes estables.
- `schema/red-1790884516598/`: 7 PASS y 1 FAIL por ausencia del nuevo contador.
- `schema/green-1790885117284/`: 41 PASS con el test SQL final.
- `schema/concurrency-1790884810756/`: FAIL inicial del harness al consultar
  `profiles.id`; la clave real es `user_id`. Cleanup posterior a cero.
- `schema/concurrency-1790884944759/`: dos carreras PASS; su metadato de test
  corresponde a la versión de 39 checks. La migración final es idéntica y los
  dos checks añadidos de reutilización mixta están en el lote final de 41.
- `schema/evidence-final.json` y su manifiesto: 139 huellas originales.
- `schema/durable-concurrency-1790893832086/`: módulo durable, dos escenarios
  PASS y addendum; las 139 huellas anteriores se conservan intactas.
- `qa/build-1790894319822/`: build final, fuentes estables y BUILD_ID anterior.
- `qa/prod-1790894419986/`: ocho casos finales y geometría de las alertas.
- `qa/evidence-final.json` y `qa/evidence-sha256.json`: 158 archivos sellados.
- `qa/durable-1790895770588/`, `qa/evidence-durable-addendum.json` y
  `qa/evidence-sha256-with-durable.json`: cuatro casos permanentes PASS,
  limpieza agregada y 178 archivos, sin repetir ni sobrescribir QA anterior.
- `qa/prod-1790894033840/`: no se ejecutan casos por la ruta de import de
  Windows; corrección exclusiva del harness.
- `qa/prod-1790894063660/`: 0 PASS, 1 FAIL, 7 no ejecutados al consultar
  `books.created_by`, columna inexistente; se corrige la consulta de prueba.
- `qa/prod-1790894101529/`: 0 PASS, 1 FAIL, 7 no ejecutados; el selector de
  alerta también incluía el announcer vacío de Next, aunque el rechazo real
  ya era visible y HTTP 200. Se acota el selector al mensaje esperado.
- `qa/prod-1790894161415/`: ocho PASS sobre el candidato intermedio con
  Fragment. No acredita la agrupación visual del candidato final.
- `root/dev-runner-preparation-fail/`: el colector temporal no podía registrar
  el último check bajo `anon`. Fue un fallo de preparación, sin veredicto
  nativo final; se conservan el runner y el motivo.
- `root/dev-runner-*/`: runner corregido probado en local con 41 etiquetas y
  reversión comprobada, antes de usarlo en dev.
- `root/dev-test-result.json`: las 41 etiquetas y limpieza reales de dev.
- `root/{dev,prod}-preflight.json`, `dev-postflight.json` y
  `dev-object-check.json`: objetos y permisos consultados directamente.
- `root/evidence-check-1790895752856/result.json`: comprobación independiente
  de las 139 huellas SQL, 158 de QA, ocho fuentes de unitarios, 14 de QA,
  métricas nativas, geometría y limpieza. PASS, sin modificar los manifiestos.
- `ci-first-head-36979523086/` y `ci-first-head-36979522903/`: FAIL de build,
  unitarios y bootstrap reales del primer head, logs y manifiesto de 23 archivos.
- `ci-preload-fix-1790927208559/`: reproducción del formatter de Next,
  siete comprobaciones PASS y 18 archivos sellados; no sustituye la CI.
- `ci-second-head-36980748218/` y `ci-second-head-36980748217/`: 68/3
  navegador, 3913 unitarios, build y bootstrap nativos del segundo head.
  `evidence-final.json` SHA256
  `fa739e3922db7f591a850bb0a5c71f1ae5fca8c254b65a1f60942d15fcf26f89`;
  manifiesto de 63 archivos SHA256
  `d0e184b78486e8ecb26119f42705b1ca226c351c49ac56dbed3b89099e3d457b`.
- `ci-failure-diagnosis/capture-1790928733560/`: doce controles PASS del
  harness con ID exacto y 17 huellas; el sello previo de nueve PASS se conserva.
- `type-pills-repro-1790928370063/`: baseline anterior al clic, ocho controles,
  43 huellas y límites del formulario manual/guard de llamadas de fondo.
- `codeql-preexisting-1790927053704/run-1790927120267/`: funciones reales
  con fetch offline, matriz de 44 URLs, fuentes base/head y 11 huellas.

La migración canónica LF, idéntica al blob aprobado y al SQL entregado, tiene SHA-256
`955d10fda883d61bb7ac994a166574664163be24d251199c457db27cc2657227`.
El checkout CRLF tiene SHA-256 RAW
`067e984650cc3cf0b27c42ada7ddf864da931f515a82ed3adf67f5280cd18353`;
la diferencia es de EOL, sin cambio de SQL.
El SQL final tiene SHA-256
`1f93447aaf932662854982e228b337051c6114ca519a0666197e810e7e443591`.
El módulo durable de carreras tiene SHA-256
`ffe969b9e456c57dc0f772b2b8aeaa2bb91eca03280c773a76676a77f6b02f54`.
El runner de dev derivado tiene SHA-256
`e749ae223ada6b6b3ad9071d75e39a7c3f85567482885b304c411aabf147ca15`.
La evidencia final de navegador tiene SHA-256
`9f0e0edb4ea9ab61023b6f9213b21f6f006ea804eca624475204661030e250d6`;
su manifiesto, `19fce9a46d6689382768e40d94d5e2f50bc72556ec65f680aa219b048e7c3882`.
El addendum durable tiene SHA-256
`864a2db3626877972a500307886ee99d9f024c1bf1048c04a2f710d177f482b7`;
su manifiesto, `0b827def9884519f93d7f423bedaca03adb6f9e2c3a9c74f33ca72cc86115c5a`.

Los fallos intermedios no se suman a los éxitos finales. Esta evidencia no
acredita la existencia de volúmenes remotos ni aceptación en otros navegadores.
