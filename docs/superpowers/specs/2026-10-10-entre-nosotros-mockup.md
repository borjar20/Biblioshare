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

## Aclaración posterior del 2026-10-10: conservar los colores de la app

El usuario acota la libertad visual: quiere quitar sobriedad al diseño manteniendo
la paleta de Biblioshare. Se reemplazan los fondos azulados y marinos del primer
mockup por los tokens reales de `src/app/globals.css`: papel cálido/crema, espresso,
terracota y los acentos secundarios existentes. También se ajustan controles,
selecciones, hallazgos, sombras y el fondo exterior del sitio.

Se revisan en navegador claro y oscuro; el JavaScript, composición, tipografía,
datos, portadas, iframe aislado y CSP conservan su contenido y comportamiento.
Esta aclaración sustituye la propuesta cromática inicial, no el carácter expresivo
solicitado. Sigue siendo una maqueta para revisión en #1462.

## Iteración posterior del 2026-10-10: portadas reales y movimiento

Se sustituyen las 26 ilustraciones por miniaturas de portadas y carteles reales:
Wikipedia para libros y películas, TVmaze para series. Las imágenes se incluyen
en la maqueta para mantener el iframe y sus CSP sin depender de nuevas peticiones.
El detalle identifica la fuente y el repositorio del sitio conserva su procedencia
por obra. Los datos de personas, consumo y notas siguen siendo ficticios.

El movimiento responde a las acciones: abanico de la pila activa, paso del mapa al
Venn, recolocación de obras al filtrar, cambios entre Obras/Gustos y movimiento de
las medias de notas. No se anima la carga inicial, no hay bucles y se respeta
`prefers-reduced-motion`. Se conserva la paleta cálida/terracota de Biblioshare;
las imágenes muestran los colores de sus portadas originales.

Comprobación en navegador: 26 de 26 imágenes cargadas, cruces de pareja y trío,
filtros, zona vacía, detalle de obra, géneros/creadores, animaciones ejecutadas y
ninguna animación programática en la prueba de movimiento reducido. Revisión en
claro y oscuro, con 320 px sin desbordamiento ni solapamiento de los controles del
Venn. Se comprueba también que el iframe aislado y ambas CSP siguen intactos.
Se publica en el mismo sitio. La implementación de la feature sigue en #1462.
La densidad también se verifica a 570 px: se usa una portada por zona cuando el
panel es estrecho o bajo, evitando que el abanico invada cruces vecinos.
