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

## Corrección del 2026-10-10: transiciones canceladas al guardar

El usuario no veía las animaciones. La comprobación anterior solo contaba llamadas
a `animate()`, por lo que no demostraba su reproducción. El runtime exportado emite
`openai:set_globals` al guardar; el listener reconstruía la misma selección y
cancelaba todas las animaciones antes de su primer fotograma. Reproducción medida
al cambiar un cruce: 13 iniciadas, 13 canceladas, 0 completadas y nodos retirados.

Se restaura el estado recibido pero solo se repinta cuando realmente cambia.
El acuse del propio guardado conserva los nodos animados; una selección externa
distinta sigue restaurándose. En paneles estrechos, la portada única se eleva 6 px
y gira 8 grados al seleccionarla para que la transición exista también sin abanico.

Verificación corregida: 13 de 13 transiciones de escritorio completadas y 11 de 11
en la vista estrecha, sin cancelaciones. Se observa una transformación intermedia
de la portada mientras permanece conectada. Con movimiento reducido, 0 animaciones.
El test `checks/motion-state.test.mjs` del proyecto Sites falla contra la versión
anterior y pasa con la corrección; cubre el propio guardado, restauración diferente,
notificaciones repetidas y globals ajenos al estado. Sandbox y CSP conservados.

## Iteración del 2026-10-10: seguir las portadas del mapa hasta el Venn

El mapa muestra una portada representativa de cada cruce no vacío de la pareja o
trío seleccionado. Al explorar, esas mismas obras viajan desde su posición real
hasta su región; las muestras adicionales salen de la pila central. El recorrido
describe una curva ligera durante 1,1 segundos, con salidas escalonadas, aceleración
y frenado suaves. Los círculos se forman a la vez; etiquetas, recuentos y bandeja
entran después para facilitar la lectura. Las otras transiciones también se suavizan.
Se elimina el salto automático de página al explorar para conservar el encuadre.

La prueba instrumentada del HTML exportado registra 11 recorridos en el trío de
escritorio y 8 en la pareja: todos completan, pasan por posiciones intermedias y
terminan exactamente en su destino. Las portadas que ya estaban en el mapa parten
de sus coordenadas con error inferior a 0,001 px. En vistas de 570 y 320 px completan
los 5 recorridos del trío; a 320 px no hay desbordamiento horizontal. Cambiar a
Libros durante el viaje cancela los recorridos anteriores y muestra las obras del
filtro sin dejar elementos en tránsito. El test del acuse de guardado sigue pasando.

Se conserva la paleta, las portadas reales, el iframe aislado y ambas CSP. La
preferencia de movimiento reducido sigue evitando los recorridos. Esta decisión
pertenece a la maqueta; la feature de Biblioshare continúa pendiente en #1462.

## Iteración del 2026-10-10: regreso a la pila y ritmo intermedio

Al volver al grupo, las portadas del Venn regresan a la pila central. Las que
representan cada cruce quedan visibles; las muestras adicionales se incorporan
y desaparecen al llegar. Una capa temporal mantiene el recorrido visible aunque
el panel se estreche al recuperar los hallazgos laterales. Se retira al terminar
o interrumpir el movimiento. Ida y vuelta duran ahora 850 ms más un escalonado
breve, sustituyendo los 1.100 ms anteriores, con la misma aceleración suave.

La prueba del HTML exportado verifica 11 recorridos de vuelta en escritorio,
5 en el trío a 570 px y 3 en la pareja a 320 px: todos muestran posiciones
intermedias y completan sin cancelaciones espontáneas. El error máximo de salida
medido es inferior a 0,01 px y el de llegada inferior a 0,1 px. No quedan capas
temporales ni portadas ocultas; no hay desbordamiento horizontal a 320 px.
La ida a 850 ms también completa los 11 recorridos. Volver y explorar antes de
terminar conserva la continuidad; movimiento reducido crea 0 animaciones en ambos
sentidos. El test de restauración/acuse de guardado pasa. Sandbox y CSP intactos.

El usuario pide además plantear cómo aprovechar el espacio libre. Se propone
ampliar la composición en escritorio y situar el detalle del cruce junto al Venn,
con portadas mayores y personas que comparten cada obra. Como complemento,
hallazgos breves sobre obras de todos o exclusivas de una persona; las diferencias
de valoración permanecerían en Gustos. Son opciones para debatir, todavía sin
aprobación ni implementación, dentro de la exploración de la feature #1462.
