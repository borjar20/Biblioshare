# Recuperación y revisión de importaciones de Letterboxd

> [Diseño confirmado · 2026-09-08 · Q1–Q6 aceptadas por José Ángel]
> No acredita implementación ni autoriza aplicar una reparación a datos personales sin revisar sus efectos.

## Problema y evidencia

La verificación con catálogo preexistente y fixtures pequeños no cubrió el alta de películas
nuevas por el procesador automático ni la convivencia con historial importado anteriormente.
La observación de producción encontró errores sin causa conservada, propuestas de asociación
presentadas como conflictos genéricos, fichas sin título ni carátula y candidatos homónimos
indistinguibles. La interfaz carece de selección múltiple y comparación de cambios.

El procesador automático usa una identidad de servidor y alcanza una operación de alta que
exige sesión de usuario. Es una incompatibilidad identificada; no demuestra la causa individual
de todos los errores históricos, pues no se guardaron. El alta individual de catálogo crea una
ficha con identificador externo, pero el recorrido observado no completa sus metadatos.

No hay evidencia en el trabajo examinado de sobrescritura de pases anteriores ni de altas
solapadas con películas ya presentes. No confundir los conflictos retenidos con duplicados
efectivamente escritos. El ZIP original facilitado y la carga actual son archivos diferentes.
No incluir credenciales, textos privados ni el archivo personal como fixtures públicos.

## Contrato que se mantiene

- Un pase por visionado; diario y reseña de igual identidad se unen. Watched y ratings no
  crean otro visionado cuando ya está representado. Dos visionados distintos del mismo día
  sobreviven. Fecha o título por sí solos no prueban identidad.
- Conservar fechas desconocidas, notas históricas y reseñas; ratings actualiza el último pase
  del origen sin autorizar cambios silenciosos en las ediciones locales.
- Watchlist equivale a pendiente y puede coexistir con historial completado.
- Mantener procedencia, privacidad, anuncio opt-in, reimportación idempotente y deshacer
  protegido. No borrar historial porque falte en un ZIP posterior.
- Un visionado nuevo fechado en otro ZIP conserva el pase anterior sin fecha, como ya se acordó.

## Decisiones confirmadas

### Q1. Asociación con historial anterior

Una única película identificada, un único pase local en la misma fecha y la misma nota
producen «Posible mismo visionado». Mostrar comparación y permitir confirmación conjunta.
No fusionar automáticamente por esos atributos. Si varios orígenes compiten por el mismo
pase, o existen varios pases candidatos, no proponer una correspondencia individual segura.
Una asociación confirmada debe persistir para que las siguientes cargas la reconozcan.

### Q2. Completar y comparar

Tras confirmar que se trata del mismo pase, rellenar automáticamente huecos con información
del archivo. Conservar valores presentes. Mostrar discrepancia cuando ambos valores existen
y difieren en contenido. Comparar el contenido de reseñas sin confundir diferencias puramente
de formato; preservar el texto y formato originales y su representación segura. No concatenar
dos reseñas ni sustituir valores distintos sin una decisión explícita.

### Q3. Acciones conjuntas

Selección por fila, por filtro y de todas las incidencias de un mismo tipo. Mostrar el alcance
y cantidad seleccionada; no mezclar silenciosamente filas ocultas ni estados incompatibles.
Operaciones: reintentar errores, confirmar asociaciones propuestas, completar huecos y descartar
filas conservando datos locales. Las operaciones de sobrescritura y de añadir pases distintos
exigen resumen previo explícito de sus efectos y confirmación.

Los fallos parciales deben conservar resultados y decisiones por fila, con reintento idempotente.
Si cambian los datos después de la comparación, conservarlos y exigir revisar los nuevos efectos;
la selección múltiple no elimina la protección de ediciones locales ni la comprobación de dueño.

### Q4. Revisión visual

Mostrar carátula, título, año, director y duración cuando estén disponibles. Al desplegar,
sinopsis y comparación Biblioshare / archivo de fecha, nota y reseña. Indicar por campo
«se conserva», «se añade» o «se sustituye», y distinguir una ficha no disponible de un dato vacío.
Los candidatos con distinta identidad permanecen separados aunque coincidan título y año;
los duplicados de una misma identidad se unifican sin perder información.

### Q5. Recuperar la carga existente

Continuar el trabajo existente conservando lo correcto. Preparar un plan de reparación con
fichas incompletas, errores reintentables y asociaciones pendientes. El usuario debe aprobar
ese resultado concreto antes de aplicarlo a su cuenta. No deshacer toda la importación,
reanudarla ni modificar el catálogo de producción como efecto de abrir el diagnóstico.
Mostrar que completar fichas compartidas no equivale a modificar solo datos de una cuenta.

### Q6. Verificación y estado veraz

Probar un volumen comparable a 940 películas con fixtures sintéticos: catálogo nuevo y previo,
historial anterior, interrupciones y fallos de proveedor. Verificar visualmente el resultado y
la revisión masiva. Distinguir fin del procesamiento de resolución de la importación:
«Importación parcial: N incorporadas, M pendientes de revisión» mientras queden incidencias.
«Finalizada» cuando no queden incidencias pendientes; las exclusiones y descartes explícitos
siguen visibles y no se cuentan como incorporaciones.

## Correcciones técnicas necesarias, no decisiones nuevas de producto

- Dar al procesamiento automático una vía válida y acotada para registrar catálogo sin
  debilitar los permisos de las funciones expuestas a usuarios.
- Completar las fichas desde el proveedor fiable y no publicar una incorporación como
  resuelta si deja una ficha inutilizable. Respetar datos curados y distinguir errores
  de proveedor de datos legítimamente no disponibles.
- Conservar causas de error clasificadas y mensajes útiles sin secretos ni textos privados.
  Distinguir fallos temporales de errores permanentes y de decisiones que requiere el dueño.
- Mantener el mismo contrato de aplicación y recuperación en primer plano y en segundo plano.

## Criterios de aceptación

1. Catálogo vacío: el procesador automático crea la película y completa su ficha; el pase es
   visible con título y carátula disponible sin necesitar abrir antes la ficha individual.
2. Historial previo: misma fecha/nota genera propuesta; confirmarla completa reseña ausente
   sin nuevo pase. Reseña distinta exige decisión y se muestra el antes/después.
3. Dos candidatos homónimos de distinta identidad muestran información diferenciadora;
   la misma identidad repetida no produce dos opciones.
4. Diario + reseñas + watched + ratings conservan exactamente los visionados esperados;
   mismo día con dos orígenes distintos no se colapsa ni se asigna a un único pase local.
5. Lote seleccionado: afecta exactamente al conjunto mostrado, conserva ediciones concurrentes,
   informa de fallos parciales y tolera repetir la confirmación sin duplicar efectos.
6. Cerrar la página, interrumpir un lote y simular fallos de proveedor conserva progreso,
   deja causas visibles y permite recuperación sin repetir altas correctas.
7. Plan de reparación: lectura previa sin mutaciones; aplicación limitada a lo aprobado;
   protección de ediciones posteriores y deshacer verificable.
8. Prueba de volumen y comprobación real del cron cubren películas nuevas, no solo una
   película precargada. Verificar privacidad con dos cuentas y representación de resultados.

## Estado

Diseño confirmado. Implementación, verificación de las correcciones y plan concreto de
reparación todavía pendientes. El diseño histórico original permanece congelado.

Especificación publicada en [#1150](https://github.com/borjar20/Biblioshare/issues/1150).
