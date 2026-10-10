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

## Iteración del 2026-10-10: detalle lateral, hallazgos y zoom por cruce

El usuario pide ver las propuestas anteriores en la maqueta y explorar un zoom
que revele más portadas. La publicación aprovecha hasta 1.160 px en escritorio:
el Venn y el detalle del cruce comparten fila, con una portada destacada, sus
personas/estados y miniaturas para cambiar la obra inspeccionada. Se retiran la
bandeja y la galería duplicadas en esta vista. En pantallas estrechas, el detalle
queda debajo del diagrama.

Las tarjetas de hallazgos incorporan portadas reales y seleccionan su cruce. Las
exclusivas significan «solo hay registro visible en esta persona», no ausencia
real de consumo en las demás. En Gustos, dos hallazgos derivados de las notas de
la conexión elegida muestran cercanía y diferencia, con nombres, notas y tamaño
de muestra. Se omiten cuando no hay datos comparables; no se inventa afinidad.

Se prueba un zoom guiado, no una cámara de desplazamiento libre: vista general,
seis portadas y todas las del cruce. Tocar de nuevo la pila activa o usar el botón
de acercamiento despliega las portadas y amplía los círculos del fondo. El camino
«Venn completo / cruce» conserva el contexto; los botones permiten acercar, alejar
y volver. El nivel adicional se desactiva si ya están todas las obras visibles,
y un cruce vacío no admite zoom. Filtrar vuelve a la vista general con el filtro
aplicado. El nivel se guarda y restaura con la selección personal de la maqueta.

Verificado en navegador: revelado de 6 y 13 portadas, restauración tras recarga,
apertura y cierre del detalle, hallazgo exclusivo de Ana, cruce vacío, Libros con
2 obras y zoom sin niveles sobrantes. A 570 y 320 px no hay desbordamiento; las
13 portadas caben en el flujo vertical, incluida la última. La prueba instrumentada
completa 7 animaciones de acercamiento, 14 de revelado total y 53 de regreso al
grupo desde el zoom, todas con fotogramas intermedios y sin cancelaciones. Con
movimiento reducido, el zoom funciona con 0 animaciones. Pasa el test del guardado
y restauración. Se conservan ambas CSP, el iframe aislado, la paleta y el recorrido
mapa/Venn de 850 ms. Sigue siendo una maqueta con datos ficticios, seguida en #1462.

## Iteración del 2026-10-10: exploración dentro del lienzo

El usuario pide que todo el recorrido del zoom ocurra dentro del lienzo y evitar
modales y paneles laterales. Esta dirección sustituye la propuesta lateral de la
iteración anterior. Mapa, Venn, portadas desplegadas y obra individual ocupan una
misma superficie; los hallazgos y la galería del grupo quedan dentro de ella.

Abrir una portada la lleva a una escena centrada, con título, personas, estado de
consumo y nota, manteniendo los círculos del cruce como contexto. Se puede avanzar
entre las obras del cruce. La ruta superior y el botón de regreso recuperan el
mismo cruce y nivel de zoom. La transición de portada dura 700 ms en ambos sentidos;
Escape vuelve un nivel. Gustos también abre las obras en esta escena y conserva
su conexión al volver. El editor del grupo pasa a una vista integrada, sin diálogo.

Verificado en navegador: seis y trece portadas; apertura, siguiente obra, regreso
al mismo zoom, Escape, cruce exclusivo con dos personas sin registro visible,
detalle desde Gustos y regreso, apertura/cierre del editor, restauración y tamaños
de 570 y 320 px sin desbordamiento horizontal. El detalle muestra 0 elementos
dialog y 0 aside. La prueba instrumentada completa las 5 animaciones de apertura
y las 11 de regreso, con fotogramas intermedios y sin cancelaciones espontáneas.
Con movimiento reducido, abrir y volver funcionan con 0 animaciones. Pasa el
test de guardado/restauración; no aparecen errores de consola. Se conservan CSP,
iframe aislado, portadas reales y paleta de la app. La integración sigue pendiente
en #1462: estos cambios solo afectan a la maqueta publicada.

## Iteración del 2026-10-10: cámara libre y desenfoque de contexto

El usuario pide zoom con rueda, desplazamiento por arrastre y desenfoque del
fondo al seleccionar una región. El Venn incorpora una cámara continua entre
100 y 450 %, con zoom alrededor del cursor. El mundo se desplaza dentro de un
lienzo recortado de altura estable; los botones de acercamiento y encuadre siguen
disponibles. Los gestos se limitan al Venn, y Ctrl + rueda conserva el comportamiento
del navegador. En el mínimo, alejar con la rueda permite continuar el scroll.

Las pilas del cruce activo se despliegan progresivamente: seis portadas a partir
de 155 %, diez a partir de 205 % y todas a partir de 265 %. Los otros cruces y
los círculos pierden nitidez; la selección y sus portadas permanecen nítidas.
Al arrastrar fuera de la colección activa y llegar a otro cruce con obras, ese
cruce pasa a ser el foco. No se cambia de región mientras se recorre la colección
desplegada. Un arrastre no dispara el clic de abrir obra. Volver del detalle o
recargar recupera la cámara, y Encuadrar Venn restablece escala, posición y foco.

Verificación: los controles del navegador y una prueba temporal con WheelEvent
y PointerEvent dentro del iframe comprueban 6, 10 y 13 portadas, desplazamiento,
supresión del clic tras arrastrar, fondo con seis regiones desenfocadas, vuelta
exacta a la cámara y persistencia. La secuencia de rueda completa 64 animaciones
sin cancelaciones. Con movimiento reducido se llega a 450 %, se despliegan las
21 obras de una pareja y se arrastra sin crear animaciones. A 320 px, la app mide
273 px y su scrollWidth también. Las coordenadas de rueda/arrastre del automatizador
no entregaron eventos al iframe: los gestos se validaron mediante los eventos
inyectados en el arnés local, que no se publica. Pasan los tests de anclaje del
cursor, límites, restauración inválida, revelado y eco de guardado. CSP y sandbox
se conservan. La sensación con ratón físico forma parte de la evaluación del
prototipo de #1462; no se ha integrado la feature en la app.

## Iteración del 2026-10-10: rueda por niveles semánticos

El usuario conserva la rueda pero cambia el modelo a tres estados: Venn general,
cruce completo y obra. El segundo nivel incluye todas las obras del cruce exacto,
sin tramos de seis/diez portadas. La escala de la cámara solo tiene dos destinos
(1 y 1,85); el tercero es la escena de obra existente. Los estados guardados con
escala continua se normalizan al nivel correspondiente. La interfaz identifica
el nivel, no un porcentaje de ampliación.

La rueda hacia dentro toma el cruce bajo el cursor. En el segundo nivel exige
una portada bajo el cursor para abrir su obra. Hacia fuera vuelve al cruce y luego
al Venn. Se acumulan deltas pequeños, se bloquea la inercia del mismo gesto y se
protege la transición durante 720 ms. Los botones y el clic en pilas/portadas
ofrecen el mismo recorrido. Ctrl + rueda conserva el zoom del navegador.

El arrastre mantiene región y nivel. La colección se ajusta a las dimensiones
del lienzo; en móvil, cuando no cabe, empieza por su primera fila y permite
recorrer el resto arrastrando. El detalle conserva el punto de regreso. El fondo
sigue desenfocado al entrar en un cruce y se aclara al volver al Venn general.

Verificación: navegador con 13 obras de tres personas y 21 de una pareja, entrada
en obra y regreso, cruce vacío, restauración y 320 px sin desbordamiento horizontal
(273 px de ancho y scrollWidth). Un arnés temporal dispara WheelEvent y PointerEvent
contra los manejadores reales: una ráfaga de 16 eventos queda en el segundo nivel,
otro gesto abre Piranesi, y los gestos inversos vuelven un nivel cada vez. Arrastrar
conserva las 13 portadas y su región sin abrir una obra. Los tests cubren migración
de escala antigua, colección completa, inercia, deltas pequeños, regreso, ajuste
de la colección y eco de guardado. Con movimiento reducido se recorren los tres
niveles con las 21 obras y cero animaciones. No aparecen errores de consola.
Se conservan CSP, sandbox y paleta. El arnés no
se publica. La sensación física de rueda sigue siendo parte de la evaluación del
mockup; no se ha integrado la feature en la app.

## Iteración del 2026-10-10: cámara sobre la portada y encuadre guiado

El usuario aprueba los niveles y pide acercarse directamente a la portada elegida,
con las demás desenfocadas detrás, y recorrer el camino inverso al volver. Se usa
el mismo mundo de círculos, pilas y colección tanto en el cruce como en la obra.
La cámara aumenta escala y se centra en las coordenadas de la portada; esta sigue
siendo la portada de la colección. El título, los estados y las valoraciones
aparecen dentro del lienzo. Las otras portadas quedan visibles pero desenfocadas
y sin interacción mientras se muestra la obra.

El recorrido dura 720 ms y usa interpolación simétrica de escala y centro. El
regreso recupera el encuadre calculado del cruce; anterior/siguiente centra la
cámara en otra portada de la misma colección. Se elimina el renderer anterior
que sustituía la colección por un detalle separado. Las transiciones del mapa de
grupo y la apertura desde Gustos conservan su comportamiento.

Se retira el movimiento libre por ratón y flechas. Un gesto de arrastre tampoco
abre accidentalmente una portada. El lienzo crece en altura cuando la colección
no cabe, en vez de ocultar filas detrás de una cámara desplazable. Al abrir desde
una fila inferior se lleva el detalle a la vista con el scroll normal de página;
al regresar se hace visible de nuevo la portada de origen.

Verificación: el arnés local con rueda simulada registra fotogramas intermedios
de ida y vuelta, conserva las 12 portadas vecinas al abrir La llegada y devuelve
exactamente la escala y el centro iniciales. Arrastre y flecha derecha dejan
la cámara intacta y no abren una obra. En 320 px, las 21 portadas de una pareja
quedan dentro de un lienzo de 838 px, sin desbordamiento horizontal (273 px de
ancho y scrollWidth), y se abre Twin Peaks desde la última fila. Se verifica el
regreso al Venn general y la restauración del detalle. Los tests cubren geometría
del foco, trayectoria inversa, accesibilidad de todas las filas, ausencia de pan,
inercia de rueda y eco de guardado. CSP y sandbox se conservan; el arnés no se
publica. Con movimiento reducido, ida y vuelta llegan directamente a sus destinos
sin fotogramas de cámara intermedios; se conservan las 20 portadas vecinas de la
pareja. No aparecen errores de consola. Solo cambia el mockup, con integración
pendiente en #1462.

## Corrección del 2026-10-10: continuidad entre Venn general y cruce

La revisión detecta que la cámara se animaba sobre un diagrama reconstruido con
otra geometría: la altura pasaba de 530 a 630 px y las pilas se sustituían por la
colección antes del primer fotograma. En el trío de escritorio, La llegada saltaba
unos 115 px al entrar; los círculos también cambiaban de tamaño inmediatamente.

Se fija la geometría del mundo independientemente de la altura visible. Durante
720 ms, cámara, altura del lienzo, posición, tamaño y giro de las portadas avanzan
con la misma interpolación. Las obras adicionales salen de la pila; al regresar
se recogen en ella y quedan las muestras originales. El desenfoque acompaña el
recorrido. Una inversión antes de terminar parte de las posiciones visibles,
sin reiniciar desde un extremo. Las copias de transición no son interactivas ni
accesibles y se retiran al terminar; el encuadre sigue sin permitir arrastre.

Verificación en el HTML exportado: continuidad del primer fotograma con error
inferior a 0,04 px en ida/vuelta del trío; altura inicial sin salto y posiciones
intermedias registradas. A 320 px, las 21 portadas de la pareja caben en el lienzo
de 838 px, que crece desde 460 px progresivamente, sin recortes ni desbordamiento
horizontal. Invertir a los 300 ms conserva cámara, altura y portada (error menor
de 0,01 px) y no deja copias temporales. Abrir La llegada conserva sus 12 vecinas
difuminadas y devuelve la cámara exacta del cruce. Con movimiento reducido,
la entrada muestra las 21 obras sin fotogramas de cámara intermedios ni copias
animadas. No se registran errores de consola.

El nuevo test `checks/level-transition.test.mjs` comprueba la reversibilidad de
portadas, altura y cámara en coordenadas de pantalla, el reinicio desde una pose
intermedia y el foco de obra con distintas alturas de lienzo. Siguen pasando los
tests de cámara y eco de guardado. Se conservan iframe y ambas CSP; el arnés de
medición temporal no se publica. La integración sigue pendiente en #1462.
