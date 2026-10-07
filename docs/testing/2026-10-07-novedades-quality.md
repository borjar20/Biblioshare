# Novedades: calidad de información y acceso a detalles — 2026-10-07

[Verificación de código y esquema local/dev/producción · base 79fb2d25 · rama codex/novedades-calidad · código en PR #1452]

El cambio de #1451 intenta completar metadatos oficiales ausentes y separa anuncios
limitados sin perder fechas o elecciones personales. #1449 queda cubierto con enlaces
desde título/portada al catálogo existente o al detalle público del anuncio.
El rediseño visual del Inicio y de las tarjetas principales se sigue en #1450.

## Contrato probado

- Primera lectura de TMDB en es-ES; en-US sólo cuando hace falta texto, e imágenes oficiales
  sólo si falta portada. La sinopsis inglesa tiene etiqueta e idioma propio. Fecha, mercado,
  idioma de lanzamiento y temporadas mantienen los datos de la lectura original.
- Errores HTTP/JSON o portadas opcionales mal formadas no suprimen un anuncio válido.
  La escritura conserva portada, sinopsis e idioma conocidos ante entradas nulas/blancas.
- Portada HTTPS segura y sinopsis no vacía se evalúan por obra tras agrupar modalidades.
  Inicio filtra antes del límite semanal. Explorar conserva las obras incompletas en
  «Anuncios con información limitada», con motivo, fecha, fuente y acciones.
- Al completar los datos, la siguiente consulta incorpora la obra al listado principal.
  Lo que esperas y el anuncio abierto preservan sus avisos y su retirada. Leer o elegir
  avisos no crea catálogo ni pases. La precisión de fecha sigue siendo independiente.

## Verificaciones y alcance

| Comprobación | Resultado |
|---|---|
| Provider/presentación/UI/página (primera tanda) | 60 unitarios PASS; RED inicial observado |
| Regresión de imagen opcional mal formada | RED → GREEN; provider 8/8 PASS |
| TypeScript y ESLint de la implementación | PASS |
| Build Next 16.3.8 con Supabase local sintético | PASS, 88 rutas prerenderizadas |
| `novedades.spec.ts` completo contra build/start | 9/9 PASS, 31,3 s, sin retries/skip |
| Ampliación de teclado y Paper claro/oscuro | 2/2 PASS, 7,1 s; 390/1280 px |
| Replay desde cero | 306 pasos; nueva migración aplicada |
| `cultural_releases.sql` local | PASS; roles, privacidad, fechas, avisos y catálogo |
| `release_information_quality.sql` local/dev | RED → GREEN local; PASS dev; todo con rollback |
| Concurrencia nativa de Novedades | PASS; claims/aceptación, leases, retirada, tokens editoriales y fence de TMDB |
| Suite Vitest general | 545 archivos / 5.407 pruebas PASS, 458,52 s |
| Revisión independiente | Dos P2 corregidos; segunda revisión sin hallazgos |

La primera tanda E2E dio 6/9: los nuevos tests navegaban antes de que terminara el guardado
del aviso y evaluaban un locator durante el renderizado por streaming. Se añadió espera
al botón «Retirar aviso» y a la tarjeta única. La segunda tanda completa dio 9/9.
La ampliación posterior comprueba apertura con Enter, tema claro móvil y oscuro escritorio,
sin desbordamiento horizontal; conserva la comprobación de promoción y enlaces.
Capturas con datos sintéticos e imagen SVG controlada:
[escritorio oscuro](evidence/novedades-quality/desktop-dark.png),
[móvil claro](evidence/novedades-quality/mobile-light.png).
No se afirma una auditoría global de red o de oclusiones; la tanda final completa sólo
registró los avisos del runner sobre NO_COLOR/FORCE_COLOR.

El verificador global `npm run test:db:local` quedó NOT_RUN por su guard existente de
Clubes: exige `--club-rounds-receipt <coordinator-GO.json>` antes de cualquier prueba.
No se inventó ni eludió ese recibo. Las comprobaciones de Novedades se ejecutaron directamente.

## Esquema y permisos de desarrollo

Migración: `20261007075832_cultural_release_information_quality.sql`, aplicada en
biblioshare-dev después del replay y las regresiones locales. Firma única
`release_upsert_tmdb(jsonb,timestamptz)`, SECURITY INVOKER, search_path vacío y
EXECUTE sólo service_role. Misma definición local/dev tras normalizar CRLF:
MD5 `d550f1af8192102d8121adaee9eee52e`.

Superficie 6 de `docs/DRIFT-CHECK.md` ejecutada en dev. No se abre escritura a clientes:

| Tabla | Columnas antes/después | INSERT authenticated | UPDATE authenticated |
|---|---|---|---|
| cultural_releases | 31 → 32 | 0 → 0 | 0 → 0 |
| release_subscriptions | 7 → 7 | 0 → 0 | 0 → 0 |
| release_deliveries | 15 → 15 | 0 → 0 | 0 → 0 |
| release_sync_state | 4 → 4 | 0 → 0 | 0 → 0 |

La nueva columna permite SELECT anon/authenticated y SELECT/INSERT/UPDATE service_role.
La prueba ejecuta el upsert con service_role y lee la columna con anon. Un intento
sustituido falla con serialization_failure. Corregir metadatos no aumenta revision ni
genera entregas. Los asesores de seguridad conservan exactamente los seis grupos y
141 hallazgos previos, sin nuevos hallazgos ni cambios de identidad; no equivale a una
auditoría completa ni corrige avisos previos de otros dominios.

## Entrega y limpieza

Corte inicial previo a autorización: no se había aplicado la migración en producción ni
publicado el código. El corte productivo posterior figura debajo. #1451 conserva el
seguimiento de publicación/enriquecimiento; #1449, los enlaces. #1450 conserva el rediseño
visual completo. La siguiente revisión diaria enriquecerá anuncios existentes. La portada ausente seguirá siendo ausencia si TMDB
no aporta imágenes. No se inventan imágenes, sinopsis ni fechas.

Los E2E borran por REST sólo sus actores y datos sintéticos, antes y después, y restauran
release_sync_state. La prueba SQL remota termina en rollback. Servidor Next cerrado por
Playwright; puerto 3000 libre, instancia local biblioshare-local-3e9edd4c eliminada sin backup
y Docker Desktop detenido al terminar (no había otros contenedores activos).

## Aplicación productiva autorizada — 2026-10-07

El usuario autorizó aplicar y fusionar PR #1452. Se aplicó exactamente la migración
publicada, después de verificar los objetos productivos reales y el baseline de seguridad.
Proyecto vmutcradmodhiltuohys; verificación posterior a las 08:57:59 UTC.

- Columna synopsis_language nullable text con CHECK de código de idioma: 31 → 32 columnas.
- SELECT anon/authenticated; sin INSERT/UPDATE ni EXECUTE del upsert. Service_role conserva
  SELECT/INSERT/UPDATE y EXECUTE. SECURITY INVOKER y search_path vacío.
- Firma única y definición iguales a local/dev: MD5 normalizado d550f1af8192102d8121adaee9eee52e.
- Fingerprint de todas las columnas previas de los 311 anuncios idéntico antes/después:
  9521e1fa70339e508c435ed3cba0b486. Suscripciones/entregas: 0/0; fuentes: 2.
- Políticas RLS sin cambios: MD5 259f05286adfb4a1462896ab0f800f07.
- Intento nulo de lote vacío rechazado con serialization_failure, como service_role y
  con rollback; sin insertar fixtures ni alterar anuncios/consentimientos productivos.
- Asesores: mismas 141 identidades en seis grupos, sin altas ni bajas. No equivale a
  resolver los avisos históricos de otros dominios.

La aplicación de esquema ya no bloquea el despliegue. El código se entrega en PR #1452;
CI, publicación y siguiente enriquecimiento se siguen en #1451. Este recibo acredita
esquema y compatibilidad, sin atribuir entrega de notificaciones a usuarios.

## CI de publicación: espera de streaming — R1

En 0f427d0e, calidad, CodeQL, Vercel y bootstrap vacío pasan. La batería completa de
navegador ejecuta 177 casos: 175 PASS y dos FAIL por strict mode en Novedades.
Los selectores de la tarjeta personal y del lanzamiento internacional encuentran la
copia transitoria de streaming antes de que quede un único nodo. Se exige cardinalidad
uno antes de comprobar texto o interactuar, igual que en la prueba de promoción;
no se usa first(), no se ocultan duplicados visibles ni se omiten casos. Las comprobaciones
de consentimiento, deduplicación y ausencia de pases se conservan. La CI completa del
HEAD corregido es el gate de merge; R1 no se presenta como PASS.
Recibo: https://github.com/borjar20/Biblioshare/actions/runs/37597546064