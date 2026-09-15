# Recuperar importaciones de Letterboxd y resolver incidencias con comparación y acciones conjuntas

> [Especificación · 2026-09-08 · diseño Q1–Q6 y cobertura confirmados · implementación pendiente]

Seguimiento: [#1150](https://github.com/borjar20/Biblioshare/issues/1150).

## Problem Statement

Una importación puede terminar de procesarse sin incorporar buena parte de la biblioteca.
Los errores no conservan una causa útil, algunas películas incorporadas quedan sin título
ni carátula y los visionados anteriores se presentan como conflictos sin comparación.
El usuario no sabe si está duplicando un visionado, completando información o sustituyendo
su trabajo. Los candidatos homónimos son indistinguibles y resolver cientos de incidencias
una por una resulta impracticable.

El diagnóstico de producción identificó una incompatibilidad entre la identidad del
procesador automático y el requisito de sesión del alta de catálogo. También identificó
un recorrido que registra identificadores sin completar la ficha. No se atribuye a esa
incompatibilidad cada error histórico: sus causas individuales no fueron conservadas.
En el trabajo examinado no se observaron sobrescrituras de pases anteriores ni altas
solapadas con películas previamente presentes; conflicto retenido no equivale a duplicado.

## Solution

Recuperar el trabajo existente conservando lo correcto. Corregir el procesamiento de
películas nuevas y la completitud de sus fichas; conservar causas útiles de los fallos
y mostrar el progreso real. Ofrecer propuestas de asociación con historial anterior,
comparación por campo y candidatos visualmente distinguibles. Permitir seleccionar y
resolver grupos de incidencias con alcance explícito, protección de datos locales y
resultados recuperables por fila.

Antes de reparar una cuenta, presentar un plan de reparación concreto que incluya fichas
incompletas, errores reintentables y asociaciones pendientes. Su aplicación requiere la
aprobación del usuario sobre los efectos mostrados; diseñar o publicar esta especificación
no aplica esa reparación.

## User Stories

1. Como usuario, quiero importar películas que aún no existen en el catálogo para conservar toda mi biblioteca.
2. Como usuario, quiero que el trabajo continúe con la página cerrada para no depender de mi navegador.
3. Como usuario, quiero ver título y carátula disponible al terminar para reconocer cada película sin abrir su ficha previamente.
4. Como usuario, quiero distinguir metadatos no disponibles de una ficha que falló al cargarse para entender qué falta.
5. Como usuario, quiero que completar fichas respete datos curados para no degradar el catálogo.
6. Como usuario, quiero conservar las partes ya incorporadas cuando algo falla para no empezar de cero.
7. Como usuario, quiero conocer la causa comprensible de cada error para decidir cómo recuperarlo.
8. Como usuario, quiero reintentar errores temporales sin duplicar resultados para recuperar la carga con confianza.
9. Como usuario, quiero distinguir errores de decisiones pendientes para saber cuáles requieren mi intervención.
10. Como usuario, quiero ver una importación parcial cuando quedan incidencias para no confundir procesamiento terminado con éxito.
11. Como usuario, quiero ver películas, pases, pendientes, descartes y errores por separado para interpretar correctamente los totales.
12. Como usuario, quiero recibir una propuesta de mismo visionado cuando exista una coincidencia local única para evitar conflictos genéricos.
13. Como usuario, quiero comparar los dos registros antes de asociarlos para no fusionar visionados distintos.
14. Como usuario, quiero confirmar varias asociaciones propuestas juntas para revisar mi historial anterior sin cientos de clics.
15. Como usuario, quiero que una asociación confirmada se recuerde para que una carga posterior reconozca ese pase.
16. Como usuario, quiero completar los campos vacíos del pase asociado para incorporar información que antes no tenía.
17. Como usuario, quiero conservar mis valores presentes al completar huecos para no sobrescribir mis ediciones.
18. Como usuario, quiero distinguir diferencias de formato y contenido en reseñas para no resolver falsos conflictos.
19. Como usuario, quiero ver qué fecha, nota o reseña se sustituiría para aprobar cambios informados.
20. Como usuario, quiero conservar ambos visionados cuando sean distintos para no perder repeticiones reales.
21. Como usuario, quiero que dos orígenes distintos no se asignen al mismo pase por compartir fecha para mantener mi historial correcto.
22. Como usuario, quiero reconocer candidatos por carátula, título, año, director y duración para elegir entre películas homónimas.
23. Como usuario, quiero consultar la sinopsis al desplegar un candidato para diferenciar obras que comparten título y año.
24. Como usuario, quiero una sola opción por identidad de película para no confundir duplicados del proveedor con alternativas reales.
25. Como usuario, quiero seleccionar filas individuales para decidir exactamente sobre cuáles actuar.
26. Como usuario, quiero seleccionar las incidencias de un filtro o tipo para resolver conjuntos coherentes.
27. Como usuario, quiero ver cuántas filas y cuáles abarca la selección para no modificar otras sin saberlo.
28. Como usuario, quiero reintentar, asociar, completar huecos o descartar en conjunto para gestionar una importación grande.
29. Como usuario, quiero un resumen antes de sobrescribir o añadir pases distintos en lote para prevenir cambios accidentales.
30. Como usuario, quiero resultados por fila cuando un lote falla parcialmente para saber qué queda pendiente.
31. Como usuario, quiero que una edición posterior a la comparación quede protegida para que una aprobación antigua no la sustituya.
32. Como usuario, quiero revisar un plan de reparación antes de aplicarlo a mi cuenta para conocer sus efectos reales.
33. Como usuario, quiero continuar la importación actual conservando sus resultados correctos para no deshacer todo.
34. Como usuario, quiero saber si una reparación modifica fichas compartidas para distinguir ese efecto de cambios en mi historial personal.
35. Como usuario, quiero deshacer cambios propios de una importación protegiendo ediciones posteriores para recuperar el estado previo con seguridad.
36. Como usuario, quiero que diario, reseñas, vistas y notas representen cada visionado una sola vez para evitar duplicados entre archivos.
37. Como usuario, quiero conservar vistas sin fecha, notas históricas y pendientes para no perder información al recuperar la carga.
38. Como usuario, quiero que nadie más consulte o resuelva mis incidencias para mantener mi privacidad.
39. Como usuario, quiero que una reparación respete mi visibilidad y anuncio elegidos para evitar publicaciones inesperadas.
40. Como usuario, quiero que el flujo se pruebe con un volumen similar al mío para que su fiabilidad no dependa de ejemplos pequeños.

## Implementation Decisions

- Ampliar los módulos existentes de identificación de catálogo, aplicación de pases,
  trabajos persistentes y revisión de incidencias. Mantener el importador CSV y el contrato
  de ZIP anterior; no sustituir toda la arquitectura por un segundo importador.
- El procesador automático debe disponer de una vía válida de registro de catálogo con
  permisos acotados y origen verificado. No resolver la incompatibilidad debilitando permisos
  de operaciones expuestas a usuarios ni confiando en una identidad de usuario aportada por el cliente.
- Completar metadatos desde el proveedor fiable respetando curación. No considerar resuelta
  una incorporación que deja una ficha inutilizable. Una carátula legítimamente inexistente
  se representa como no disponible; no se inventan datos para ocultar un fallo.
- Primer plano y segundo plano comparten contratos de aplicación, recuperación, privacidad
  e idempotencia. La persistencia conserva progreso y efectos por fila incluso tras interrupciones.
- Registrar causas clasificadas y mensajes útiles sin credenciales ni textos privados.
  Separar error temporal, error no recuperable automáticamente y decisión pendiente del dueño.
  No inventar retrospectivamente la causa de los errores históricos sin diagnóstico guardado.
- Distinguir película candidata y coincidencia propuesta de visionado. Una película identificada,
  un único pase local en igual fecha y con igual nota permiten proponer «Posible mismo visionado»;
  no permiten asociarlo automáticamente. Ausencia de fecha no constituye evidencia de igualdad
  de visionado. Múltiples candidatos u orígenes competidores requieren revisión explícita.
- Confirmar una asociación persiste la procedencia individual. Reintentar o cargar otro ZIP
  no vuelve a crear ese pase. Dos orígenes diferentes no se colapsan sobre un único pase local.
- Tras confirmar la asociación, completar valores vacíos con los presentes del archivo.
  Conservar valores locales presentes y mostrar discrepancias cuando ambos contenidos difieren.
  Valores ausentes del ZIP no borran información local. No concatenar reseñas automáticamente.
- Comparar reseñas atendiendo a contenido y formato seguro sin destruir los originales ni
  tratar como equivalentes diferencias de contenido. La normalización concreta deberá probarse
  con ejemplos positivos y negativos; no se decide aquí una equivalencia basada solo en texto plano.
- Mostrar por campo el resultado previsto: se conserva, se añade o se sustituye. Mostrar
  fecha, nota y reseña de Biblioshare y del archivo, sin atribuir una fecha a vistas desconocidas.
- Los candidatos muestran carátula, título, año, director y duración cuando existan; al desplegar,
  sinopsis. Deduplicar por identidad estable, no por título/año. Las obras homónimas distintas
  siguen siendo alternativas separadas y reconocibles.
- Selección individual, por filtro y de todas las incidencias del mismo tipo, con alcance y
  cantidad explícitos. La interfaz distingue toda la selección de las filas visibles y no
  incorpora silenciosamente nuevas filas o tipos incompatibles por cambiar un filtro.
- Acciones conjuntas: reintentar errores, confirmar asociaciones propuestas, completar huecos,
  descartar conservando datos locales. Sobrescribir valores y añadir pases distintos exigen
  resumen explícito y confirmación previa. No convertir esta confirmación en permiso general
  para cambios nuevos o no mostrados.
- Aplicación de lotes recuperable por fila: conservar éxitos, identificar fallos, evitar efectos
  duplicados y mantener comprobaciones de dueño. Revalidar datos antes de escribir; si cambiaron
  desde la comparación, protegerlos y mostrar el nuevo conflicto antes de una sustitución.
- El plan de reparación se prepara sin modificar historial, ejecutar reintentos ni completar
  catálogo como efecto de abrirlo. Identifica cambios personales y efectos sobre fichas compartidas.
  Solo se aplica el conjunto concreto aprobado, revalidado frente al estado actual.
- Recuperar el trabajo existente y conservar lo correcto. No deshacer toda la carga ni borrar
  películas compartidas. Mantener deshacer protegido, con trazabilidad de los efectos aplicados
  durante la reparación y conservación de ediciones posteriores.
- Mantener un pase por visionado, unión de diario/reseña por identidad, watched sin pase extra
  si ya está representado y ratings sobre el último pase del origen. Mantener dos visionados
  distintos del mismo día, fechas desconocidas y pendientes coexistentes con vistas.
- Un visionado nuevo fechado de un ZIP posterior conserva el pase anterior sin fecha, como
  ya se acordó. No borrar registros por ausencias del ZIP ni ampliar el alcance a favoritos o listas.
- Presentar «Importación parcial: N incorporadas, M pendientes de revisión» mientras queden
  incidencias. «Finalizada» significa sin incidencias pendientes, no que todas las filas fueron
  importadas: descartes y exclusiones explícitos se muestran aparte.
- Mantener visibilidad elegida, anuncio separado opt-in y protección de ediciones locales.
  Esquema y detalles de ejecución se concretarán en implementación según estas invariantes;
  esta especificación no prescribe nombres de tablas nuevos ni migraciones todavía inexistentes.

## Testing Decisions

Cobertura confirmada por el usuario en Q6 y en el diseño aceptado. Usar como frontera principal
el recorrido observable ZIP → resumen → confirmación → procesamiento real → biblioteca y revisión
de incidencias → acciones conjuntas → resultado y deshacer. Extender los E2E de importación ya
existentes antes de introducir una infraestructura nueva. Verificar interfaz contra build de
producción y persistencia con consultas independientes.

Complementar esa frontera con integración de operaciones persistentes para concurrencia,
propiedad, asociaciones y deshacer; y pruebas del parser y del matcher donde ya hay regresiones.
Probar resultados y protecciones, no nombres internos de funciones ni snapshots de la implementación.
La evidencia del cron debe incluir película nueva, no solo catálogo precargado.

Casos exigidos:

1. Catálogo vacío y proveedor sintético con ficha completa: el worker registra y completa la
   película, crea el pase y la biblioteca muestra título y carátula sin abrir su ficha previamente.
2. Proveedor sin carátula legítima frente a fallo del proveedor: distinguir ambos y conservar
   el estado recuperable adecuado; no contar una ficha inutilizable como resuelta.
3. Historial anterior con coincidencia única de fecha/nota: proponer asociación sin mutación;
   confirmarla completa reseña vacía sin alta de otro pase y persiste su procedencia.
4. Reseña local distinta: mostrar comparación y conservarla hasta decisión explícita. Formato
   equivalente no produce falsa diferencia; contenido realmente diferente sí la produce.
5. Dos orígenes distintos el mismo día, varios pases locales candidatos y fecha desconocida:
   ninguna asociación automática insegura ni colapso de identidades.
6. Películas homónimas con año igual e identidades distintas: información diferenciadora visible;
   una identidad repetida en resultados locales y externos produce una sola opción.
7. Cruce diario/reseñas/watched/ratings/watchlist: exactitud del número de pases, notas históricas,
   último pase, fechas desconocidas y pendientes; repetir el ZIP no duplica efectos.
8. Selección por fila, filtro y tipo con más de una página: cantidad y conjunto explícitos;
   cambiar filtro no amplía silenciosamente la selección. Acciones incompatibles no se ejecutan.
9. Acciones masivas y repetición concurrente: solo afectan al conjunto aprobado y conservan
   resultados por fila tras fallos parciales; sobrescrituras y altas distintas muestran resumen.
10. Edición local después de comparar o preparar reparación: se conserva y exige revisar el
    nuevo conflicto. No se aplica una decisión obsoleta sobre el nuevo contenido.
11. Interrupción, cierre de página y fallos temporales del proveedor: progreso persistente,
    causa útil y recuperación idempotente en el worker real y en acciones de usuario.
12. Plan de reparación: generarlo no escribe historial ni catálogo; aplicarlo afecta solo al
    alcance aprobado; conservar altas correctas y verificar deshacer y ediciones posteriores.
13. Estado parcial cuando quedan errores o decisiones; estado final sin incidencias pendientes;
    descartes/exclusiones no se presentan como incorporaciones ni errores sin resolver.
14. Dos cuentas: solo el dueño consulta y resuelve su trabajo; mantener visibilidad y anuncio
    sin publicaciones inesperadas ni filtraciones mediante operaciones conjuntas.
15. Al menos 940 películas sintéticas con mezcla de catálogo nuevo/previo, historial anterior,
    homónimos, fallos e interrupciones. Afirmar totales esperados y ausencia de duplicados,
    comprobar recuperación y la revisión visual; ejecutar dentro de los límites declarados.
16. Mantener regresiones de CSV, biblioteca, historial y estadísticas, incluido que vistas sin
    fecha cuentan como completadas pero no se asignan a periodos inventados.

Los fixtures son sintéticos y reproducibles. No versionar archivos personales ni reseñas reales.
Las pruebas locales/dev no acreditan por sí solas producción; registrar cada nivel de evidencia.
La validación de reparación sobre una cuenta real requiere el plan concreto aprobado.

## Out of Scope

- Aplicar ahora la reparación a la cuenta o alterar producción al redactar esta especificación.
- Deshacer la importación completa como solución por defecto o eliminar catálogo compartido.
- Fusionar automáticamente visionados por título, fecha o nota sin identidad o asociación confirmada.
- Sobrescribir ediciones locales silenciosamente o borrar datos ausentes de un ZIP posterior.
- Importar favoritos, etiquetas, playlists, contenido eliminado, perfil o relaciones sociales.
- Sincronización continua con Letterboxd, scraping o nuevas credenciales de esa plataforma.
- Inventar fechas, carátulas, causas históricas de error o metadatos no disponibles.
- Sustituir el importador CSV o realizar una remodelación general ajena al flujo de importación.

## Further Notes

Esta especificación continúa la importación original de #1136, implementada en #1147 y documentada
al publicar en #1148. Los tickets anteriores cerrados no acreditan que estos problemas posteriores
estén corregidos. Esta issue es el seguimiento operativo de recuperación y revisión.

Diseño Q1–Q6 confirmado expresamente; síntesis documental sin nueva entrevista. Glosario y
decisión complementaria de asociación y reparación ya registrados en el repositorio. El diseño
histórico original se conserva; los cambios de semántica descritos aquí quedan explícitos.
Implementación, validación y propuesta concreta de reparación siguen pendientes.
