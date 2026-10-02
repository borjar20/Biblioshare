# #1237 — cuota de altas nuevas de Google Books

> **[Canónico · verificado en código, SQL local/dev y navegador contra build/start el 2026-10-02; producción y CI pendientes]**

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

## Verificación disponible

Base de trabajo: `89d82e83749350cc761b4a5bdd1d1188a34ff3cb`.
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
| Producción y CI de la PR | Pendientes de entrega |

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

La comprobación final de navegador usa Node 24.19.0 y el build
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

## Evidencia y fallos conservados

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

La migración tiene SHA-256
`955d10fda883d61bb7ac994a166574664163be24d251199c457db27cc2657227`.
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
