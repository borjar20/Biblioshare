# Entre nosotros: maqueta interactiva

> [Histórico · corte de conversación 2026-10-10] Dirección visual propuesta para
> revisión. No describe funcionalidad implementada ni un diseño aprobado.
> Continúa el [acuerdo de producto](2026-10-09-comparar-bibliotecas-design.md).
> Seguimiento operativo: [#1462](https://github.com/borjar20/Biblioshare/issues/1462).

## Encargo y dirección

El usuario pide que esta sección sea especialmente visual e impactante y autoriza
apartarse del diseño actual de Biblioshare para conseguirlo. La maqueta presentada
en la conversación se llama **Entre nosotros**: tipografía expresiva, fondo claro
azulado u oscuro marino, color estable por persona, conexiones espaciales y portadas
ilustradas. La información se descubre tocando el mapa y sus hallazgos.

## Recorridos que permite probar

- Ver el grupo completo, escoger dos o tres personas y explorar sus cruces en Venn.
- Abrir cada intersección, también una vacía, y consultar las obras y notas por persona.
- Filtrar libros, películas o series conservando la selección.
- Alternar Obras y Gustos. En Gustos, explorar géneros o creadores y abrir la evidencia.
- Distinguir obras consumidas de notas disponibles; cada media indica su muestra.
- Crear y editar selecciones personales con nombre; restaurar el estado de la maqueta.
- Consultar series con estados diferentes, incluyendo progreso y ausencia de nota.

Los enlaces representan obras compartidas; la posición del mapa no expresa afinidad.
Las áreas del Venn son esquemáticas y sus números son recuentos exactos del ejemplo.
Las burbujas de consumo representan el número de obras por categoría. No se introduce
un porcentaje global de compatibilidad ni se confunde ausencia de nota con cero.

## Alcance y comprobación

Maqueta independiente con seis personas ficticias y 26 obras de ejemplo, sin consultas
ni escritura en Biblioshare. Las portadas son ilustraciones de muestra. La persistencia
pertenece a la maqueta, no al modelo de datos de la aplicación.

Se han comprobado en navegador los cruces de pareja y trío, filtros, detalle de obras,
progreso de series, evidencia de gustos, falta de notas, cruces vacíos y creación,
edición y restauración de grupos. Se ha revisado el diseño en escritorio y móvil,
incluida anchura de 320 px, y en apariencia clara y oscura.

La revisión del diseño, las reglas reales de elegibilidad de series, la consolidación
de notas, los tamaños de grupo admitidos y la integración siguen abiertos en #1462.
Las medias ilustrativas no fijan todavía el algoritmo de afinidad de producción.

## Iteración posterior del 2026-10-10: portadas en el Venn

A petición del usuario, se prueba un Venn a ancho completo con pilas de hasta tres
portadas por intersección y una sola en pantallas estrechas. El número sigue contando
todas las obras del cruce. La pila activa se muestra en abanico y sus obras se pueden
abrir desde la bandeja inmediata inferior; la galería completa permanece debajo.
Las zonas vacías conservan el cero y una explicación, sin inventar portadas.

Se comprueban parejas y tríos, filtros, correspondencia entre cada pila y su evidencia,
apertura de valoraciones y cruces vacíos. A 320 px los controles no se solapan y no hay
desbordamiento horizontal. Se conservan el iframe aislado y ambas CSP del sitio.
La composición sigue siendo un experimento para revisión, con seguimiento en #1462.
