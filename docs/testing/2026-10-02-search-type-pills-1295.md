# #1295 — filtros de tipo dentro de su contenedor

> **[Canónico · verificado contra código, ocho recorridos de QA y cuatro regresiones durables de navegador local el 2026-10-02]**

La fila compartida de filtros permite saltar de línea cuando sus tres
enlaces no caben. Conserva texto, tamaño de cada enlace y destinos; afecta
a Buscar y al formulario manual. No hay cambio de esquema, permisos o copy.

## Diagnóstico confirmado y límites

El código anterior era idéntico en main `89d82e8` y la rama de cuota #1237.
Después de `document.fonts.ready`, a 320 px, el contenedor de Buscar va de
x=16 a x=304 (288 px), pero tiene scrollWidth 297. Series termina en
x=313,171875: sobresale 9,171875 px. Ocurre con búsqueda vacía, corta y larga,
antes de abrir una obra o consumir cuota. A 1280 px los enlaces caben.

Documento y body permanecen en 320 px en ese baseline. No reproduce los
325 px globales del FAIL de CI de #1237, ni los atribuye exclusivamente a
los filtros. Las comprobaciones de overflow de aquella prueba se conservan.

El intento de manual con el actor ordinario redirigió a Buscar por su gate
de rol. Sus medidas no acreditan el formulario manual. La verificación
final debe exigir la URL/formulario reales y un actor temporal collaborator.

## Evidencia conservada

`.scratch/ticket-campaign/qa1237/type-pills-repro-1790928370063/` conserva
ocho controles y ocho PNG inspeccionadas, sin retries. El resultado nativo
es 1 PASS / 7 FAIL / 0 SKIP: cuatro controles móviles fallan en geometría
(incluida la redirección desde manual); seis casos además activan un guard
del harness que contó POST next-action de fondo como si fuesen acciones de
cuota. SQL a cero y ausencia de clics de alta acotan esa interpretación.
Son seis observaciones reales de Buscar y dos intentos manuales redirigidos.

- Build del baseline: `-3H-UXeHRKnHi4s6cWdAq`.
- `evidence-final.json` SHA256:
  `a1cbe4417af464da88a1ac3e16000e0c033251d706caf0a78d54e3dca1bd9290`.
- Manifiesto de 43 archivos SHA256:
  `05718c49e8144354c549166981f9c34c24142a39a0f0d399c4e9237fd231af90`.
- Fuentes/build estables antes y después. Limpieza local PASS, actores Auth
  404 y ocho tablas/cuotas/pases/libros a cero. Backup de Supabase conservado
  y puerto 3000 libre al terminar.

El fix sólo añade `flex-wrap` a `TypePills`. ESLint focal y diff check pasan.
La QA final usa un build nuevo y comprueba los enlaces dentro del contenedor,
documento/body dentro del viewport, las dos rutas reales y sus destinos.
No se corrige el problema reduciendo letra, recortando texto o relajando
las aserciones.

## Verificación final local

La pasada `qa-1790929435269/` ejecuta ocho controles: 8 PASS / 0 FAIL /
0 SKIP / 0 flaky / 0 retries, 10,384 segundos nativos. Usa el build nuevo
`Bz0BVK4sKeyhOSqYDtXgj`, Node 24.19, con 17 fuentes estables antes/después.
Ocho capturas inspeccionadas muestran Series en segunda fila móvil. Buscar
tiene contenedor/scrollWidth 288 px y documento/body 320; a 1280 cabe toda
la fila. Manual conserva sus 400 px máximos en escritorio y cabe en móvil.

El actor temporal collaborator accede a la URL y formulario manual reales
en ambos anchos, con heading y campos verificados. Los destinos conservan
tipo y query. No hay acciones `openCatalogItem`, avisos ni errores de página.
Se conservan los 404/MIME locales de Speed Insights y abortos de solicitudes;
no se afirma cero errores de consola ni se cierran #1251/#1263.

- `.scratch/ticket-campaign/qa1295/qa-1790929435269/evidence-final.json`:
  SHA256 `e927c69fc2b44648099dca66e9668e9b43e4ee6e88fce96be2f2221f14a9572b`.
- Manifiesto final de 43 archivos:
  SHA256 `b40faee017682b979a24a864d912e33b271b492fef6486a8e00be8305ab8fb4c`.
- Limpieza PASS: actor Auth 404, ocho tablas/cuotas/obras/pases a cero,
  Supabase detenido conservando backup y puerto 3000 libre.

`qa-1790929083921/` queda conservado: 6 PASS / 2 FAIL / 0 SKIP por un
selector de H1 que encontraba también el heading de login retenido durante
la transición. Se corrige únicamente el selector del harness a nombre exacto;
la segunda pasada usa el mismo build y aserciones de geometría/destinos.
Sus 38 huellas y las 43 del baseline permanecen intactas. No se suman esas
pasadas al total final.

## Regresión durable comprobada

`e2e/ci/search-type-pills.spec.ts` ejercita cuatro recorridos, 320/1280 ×
Buscar vacío/formulario manual real. Comprueba geometría, selección visual
y acceso de teclado Libro → Series → Película, sin verificar nombres de
clases CSS. La tolerancia geométrica de 0,5 px admite fracciones de píxel;
el desbordamiento de documento/body no tiene tolerancia añadida.

El lote `durable-qa-1790929756824/` ejecuta 4 PASS / 0 FAIL / 0 SKIP /
0 flaky / 0 retries, 7,597 segundos nativos. Sus doce adjuntos de geometría
acreditan las tres selecciones en las cuatro combinaciones. Usa el mismo
build Bz, 17 fuentes y spec idénticos antes/después. Lint, TypeScript y
listado CI también pasan; los cuatro PASS se atribuyen al navegador real.

- Spec SHA256: `bed17a8e63a8151adb58ecba776d2f39b7f85d18ba25f138c2cfc6fc47eec8ca`.
- Evidencia durable SHA256:
  `383710b0db270fa78d18293650e7808dc8b4148019c5c327d2b755a37953b11f`.
- Manifiesto durable de 32 archivos SHA256:
  `a31a1067ce6665c4a32ef04bcfb465f1b6096689c6ccb45af601f1cf352f4d5b`.
- Actor collaborator nuevo, limpieza REST antes/después, Auth 404, ocho
  tablas y cuota privada a cero. Catálogo books/movies/series y cuota
  global permanecen a cero; Supabase detenido con backup y puerto libre.

El baseline, la candidata inicial, los ocho controles finales y los cuatro
casos durables tienen sellos separados e intactos. No se usa la suma de
ejecuciones históricas como recuento de la suite durable.

La rama de entrega incorpora después main `a264cf2` (#1292); el componente
y el spec son idénticos a los verificados. Los cuatro casos se descubren
mediante el glob existente de CI, sin cambiar configuración. El merge
exige todos los checks obligatorios del head de la PR: esta evidencia local
no sustituye ese gate remoto.
