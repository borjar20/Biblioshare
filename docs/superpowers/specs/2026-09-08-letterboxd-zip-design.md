# Importar el ZIP de Letterboxd con historial, reseñas, valoraciones y pendientes

> [Histórico · congelado el 2026-09-08 · diseño y cobertura confirmados por José Ángel · implementación pendiente]

## Problem Statement

Migrar desde Letterboxd requiere conservar toda la biblioteca sin seleccionar ni combinar CSV manualmente. El importador actual admite el diario, pero deja fuera películas vistas sin diario, valoraciones complementarias, reseñas y pendientes. Agrupar por película tampoco conserva plenamente las opiniones de cada visionado. Usar la fecha de importación para vistas sin fecha falsearía historial y estadísticas.

## Solution

Subir el ZIP original, analizar sus archivos conjuntamente, mostrar un resumen y confirmar una vez. Incorporar automáticamente coincidencias claras y conservar ambigüedades y conflictos para revisión posterior. Mantener cada pase con sus datos, incluir vistas sin fecha y convertir watchlist en pendientes. El trabajo continúa con la página cerrada, se recupera tras fallos y puede deshacerse protegiendo datos previos y ediciones posteriores.

## User Stories

1. Como usuario, quiero subir el ZIP original para evitar combinar CSV manualmente.
2. Como usuario, quiero revisar un resumen antes de confirmar para conocer altas, cambios y exclusiones.
3. Como usuario, quiero identificar automáticamente coincidencias claras para reducir trabajo manual.
4. Como usuario, quiero elegir entre películas ambiguas para evitar asociaciones erróneas.
5. Como usuario, quiero resolver después las películas no identificadas para no perder registros.
6. Como usuario, quiero incorporar todas mis películas vistas para conservar mi biblioteca.
7. Como usuario, quiero conservar las fechas del diario para reconstruir mi historial.
8. Como usuario, quiero pases completados sin fecha conocida para no inventar cuándo vi una película.
9. Como usuario, quiero que estos pases cuenten en totales pero no en periodos fechados para mantener estadísticas honestas.
10. Como usuario, quiero un pase por visionado para conservar las repeticiones.
11. Como usuario, quiero conservar dos registros distintos del mismo día para no perder un visionado.
12. Como usuario, quiero unir diario y reseña del mismo visionado para no duplicarlo.
13. Como usuario, quiero conservar nota y reseña por pase para mantener mis opiniones históricas.
14. Como usuario, quiero que ratings actualice la nota del último pase para reflejar mi valoración actual.
15. Como usuario, quiero asignar la nota al pase sin fecha cuando no hay diario para aprovecharla igualmente.
16. Como usuario, quiero conservar reseñas sin entrada de diario para no perder textos.
17. Como usuario, quiero mantener párrafos, énfasis y enlaces seguros para conservar el sentido de las reseñas.
18. Como usuario, quiero revisar reseñas sin asociación inequívoca para no atribuirlas al pase incorrecto.
19. Como usuario, quiero convertir watchlist en pendientes para continuar mi planificación.
20. Como usuario, quiero un nuevo pendiente si ya vi la película para planificar otro visionado.
21. Como usuario, quiero repetir el mismo ZIP sin duplicados para recuperar una carga con confianza.
22. Como usuario, quiero incorporar novedades de otro ZIP para actualizar mi historial.
23. Como usuario, quiero conservar mis ediciones de Biblioshare para que importar no sobrescriba mi trabajo.
24. Como usuario, quiero revisar conflictos juntos para resolverlos sin interrupciones continuas.
25. Como usuario, quiero que un nuevo visionado fechado conserve el anterior sin fecha para mantener ambos pases.
26. Como usuario, quiero cerrar la página sin detener el trabajo para no depender del navegador abierto.
27. Como usuario, quiero recuperar progreso y resultados tras fallos para no empezar de cero.
28. Como usuario, quiero deshacer una importación para corregir una carga equivocada.
29. Como usuario, quiero proteger mis ediciones posteriores al deshacer para no perder cambios recientes.
30. Como usuario, quiero elegir visibilidad con mi preferencia habitual preseleccionada para controlar quién ve mis datos.
31. Como usuario, quiero decidir por separado si anuncio la importación para evitar actividad social no deseada.
32. Como usuario, quiero que lo antiguo no aparezca como visionados de hoy para no falsear mi actividad.
33. Como usuario, quiero conocer los archivos excluidos para saber qué se ha conservado.

## Implementation Decisions

- Ampliar las responsabilidades existentes de detección, parseo, normalización, identificación de catálogo, escritura de pases y revisión de pendientes. Mantener el CSV existente como compatibilidad; el ZIP cruza los archivos antes de escribir historial.
- Procesar watched.csv, diary.csv, reviews.csv, ratings.csv y watchlist.csv. Watched no añade un pase extra si el mismo conjunto ya documenta visionados de la película. Ratings enriquece pases, no genera otro visionado por contener una nota.
- El contrato normalizado distingue película y pase. Cada pase conserva identidad de origen, fecha conocida o desconocida, nota y reseña. Diario y reseña se unen solo si corresponden al mismo visionado. Dos registros distintos del mismo día se conservan; ni título ni fecha solos bastan para identificar un pase.
- Rewatch no inventa un pase anterior. Una vista sin visionados documentados se registra completada sin fecha conocida, separando fecha administrativa y fecha real. Cuenta en total de vistas pero no en agregados por día, mes o año.
- Revisar la invariante actual que equipara ausencia de fecha con pase abierto, sus restricciones y consumidores: biblioteca, historial, estadísticas, último pase y actividad social. El esquema concreto se definirá al implementar; no se afirma que el actual admita esta semántica.
- La nota presente en ratings prevalece sobre la del último pase importado de la película, sin cambiar notas anteriores. Sin diario se asigna al pase sin fecha. No existe una valoración general independiente del pase; una nota ausente no borra otra existente.
- La precedencia entre archivos no autoriza sobrescribir ediciones propias de Biblioshare: completar huecos, añadir novedades y presentar discrepancias como conflictos persistentes.
- Watchlist crea un pendiente; si ya hay visionados, crea un nuevo pase pendiente conservándolos. Reimportar no lo duplica. La nota del visionado permanece en el pase completado, no pasa al pendiente.
- Un visionado fechado nuevo de un ZIP posterior es OTRO pase respecto a uno previamente importado sin fecha: conservar ambos sin preguntar ni fusionar. Esto no permite recrear registros de origen ya importados.
- Mantener procedencia persistente para distinguir registros, reintentos, cambios del origen y ediciones locales. Reimportar el mismo ZIP tiene los mismos efectos netos; uno posterior incorpora novedades. Revisar la deduplicación actual por día sin perder protección contra concurrencia.
- La confirmación inicia un trabajo persistente independiente de la página. Progreso, resultados, candidatos y conflictos son recuperables por su dueño. Los reintentos no duplican efectos. Ejecutor y esquema concretos se reservan a implementación.
- Deshacer retira altas propias y restaura modificaciones cuando no hay cambios posteriores; conserva datos previos y ediciones posteriores, señalando conflictos para revisión. No elimina películas del catálogo compartido para deshacer historial personal.
- Proponer la privacidad habitual y permitir elegirla en el resumen, sin forzar público. Anuncio social separado y desactivado por defecto. No convertir historia antigua o sin fecha en visionados aparentes de hoy.
- Conservar párrafos, énfasis y enlaces seguros de reseñas mediante representación saneada. Sin fecha o asociación inequívoca conservar el contenido para revisión, sin inventar fecha ni destinatario.
- Excluir favoritos, etiquetas, listas personales y carpetas deleted/orphaned, informándolo junto a archivos no soportados. ZIP y textos se interpretan exclusivamente como datos.
- Resumen y resultado distinguen películas, pases, pendientes, conflictos, exclusiones y errores; una fila no equivale necesariamente a una película nueva. Analizar no modifica la biblioteca personal antes de confirmar.

## Testing Decisions

Cobertura confirmada expresamente el 2026-09-08. Probar comportamiento observable, no estructura interna ni llamadas exactas. Frontera principal: ZIP → resumen → confirmación → resultados persistidos y visibles. Complementar con integración para recuperación, deshacer y restricciones reales.

- Antecedentes: pruebas existentes de detección, matching y revisionados, E2E del proyecto e infraestructura de base de datos local. El mock actual por fecha no demuestra que el esquema acepte dos pases distintos el mismo día: comprobarlo en integración real.
- ZIP sintético cruzado: película en watched, diary, reviews y ratings produce los pases esperados; reseña una sola vez y precedencia de nota correcta.
- Vistas sin diario: completadas sin fecha ficticia; cuentan en totales, no en periodos; conservan nota y reseña asociables.
- Pases con notas distintas: ratings actualiza solo el último visionado, incluso si existe pendiente. Dos visionados distintos del mismo día sobreviven a reimportaciones.
- Watchlist sola y solapada con vistas: historial y pendientes correctos sin duplicados.
- Repetición y reintentos concurrentes: mismos efectos netos. ZIP posterior con visionado fechado conserva el anterior sin fecha y añade otro, sin diálogo de fusión.
- Ediciones locales: conflicto revisable sin sobrescritura silenciosa; notas vacías no borran valores existentes.
- Ambigüedades, reseñas no asociables y archivos excluidos: estados explícitos y recuperables, sin pérdidas silenciosas.
- Cierre de página y fallo parcial: continuación o recuperación sin duplicados; al volver muestra progreso y resultados reales.
- Deshacer: restaura datos intactos, protege ediciones posteriores y catálogo compartido, informa de conflictos y tolera repetición.
- Dos cuentas: solo el dueño accede a importación/conflictos; se respeta visibilidad, anuncio desactivado por defecto e historial no presentado como visionados de hoy.
- Reseñas con formato y contenido activo: formato básico conservado, contenido peligroso inerte. ZIP inválido o archivos no soportados generan errores/exclusiones comprensibles, sin modificaciones personales previas a confirmar.
- Regresión de CSV y consumidores de pases: estado, reseñas, notas, orden y estadísticas mantienen contratos salvo cambios explícitos de fecha desconocida.
- Fixtures sintéticos reproducibles: no versionar ni adjuntar el ZIP personal o sus reseñas. Verificación local, desarrollo y producción son evidencias distintas; esta tarea no ejecuta importaciones ni pruebas con datos personales.

## Out of Scope

- Favoritos, etiquetas, listas personales, perfil, comentarios y relaciones sociales de Letterboxd; watchlist sí se incluye.
- Restaurar deleted/orphaned.
- Sincronización continua, scraping o credenciales de Letterboxd; la actualización usa otro ZIP.
- Inventar fechas o visionados a partir de Rewatch.
- Valoración general independiente de pases o fusión del nuevo pase fechado con el anterior sin fecha.
- Borrar datos porque falten en un ZIP posterior: no es un espejo destructivo.
- Implementación, migraciones, importación personal y despliegue durante esta tarea documental.

## Further Notes

Diseño funcional y cobertura confirmados; implementación pendiente. Persistencia, migraciones, ejecución en segundo plano y adaptación de consumidores requieren trabajo técnico posterior. No se fijan nuevos proveedores, dependencias ni nombres de tablas.

El ZIP privado no es un fixture público ni una garantía de coincidencias de catálogo. Aceptar el resultado exige conservar los datos soportados o señalar el conflicto pendiente; terminar el proceso no basta para afirmar éxito.
