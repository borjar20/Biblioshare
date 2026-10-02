# Experiencias — propuesta de producto

> **[Producto aceptado para preparar implementación · 2026-10-02]** El propietario
> eligió reunir «En vivo» y «Escapadas» y, tras presentarse este documento, pidió
> implementarlo. No describe funcionalidad existente. El diseño técnico y el plan
> concretan los contratos nuevos para su revisión antes de escribir código.

Seguimiento operativo: [issue #1293](https://github.com/borjar20/Biblioshare/issues/1293).

Diseño técnico: [contratos](2026-10-02-experiencias-design.md).
Plan: [implementación](../plans/2026-10-02-experiencias.md).

## 1. Intención acordada

Biblioshare permite compartir lo que vives y con quién lo vives. La nueva sección
reúne conciertos, espectáculos, visitas culturales y escapadas, poniendo el contenido
reconocible y a las personas por delante de la necesidad de escribir un relato.

Una salida concreta y una escapada con varios momentos pertenecen a la misma sección.
Un concierto en tu ciudad funciona por sí solo; ese mismo concierto puede formar
parte del recuerdo de un fin de semana fuera.

La experiencia compartida admite distintas perspectivas: cada persona puede aportar
fotos y destacar su momento favorito. Los acompañantes de una escapada pueden variar
entre sus momentos. La captura debe servir también para experiencias en solitario.

**Éxito de producto:** guardar una experiencia sencilla cuesta pocos pasos; su tarjeta
permite reconocer qué pasó y con quién; volver al historial recupera recuerdos y da
ideas para próximos planes.

«Experiencias» es el nombre de trabajo. Se validará antes de introducirlo en el
glosario canónico y en la interfaz.

## 2. Tres formas de entrar

| Enfoque | Ventaja | Coste de producto |
|---|---|---|
| Buscar primero un evento o lugar | Carteles y datos reconocibles desde el principio | Lo que falta en el catálogo puede bloquear una experiencia real |
| Crear directamente con tus fotos y acompañantes | Sirve para salidas pequeñas, improvisadas y recuerdos antiguos | La persona aporta más contexto y las fichas tienen menos datos comunes |
| Combinar búsqueda y creación libre | Un evento o lugar ayuda a rellenar; cualquier experiencia se puede guardar | Hay que mantener una captura sencilla aunque existan ambas entradas |

**Recomendación para esta propuesta:** combinar ambas, con la creación libre como base.
La selección de un proveedor de búsqueda y sus condiciones pertenece al posterior
diseño técnico; no se compromete ninguna integración en este documento.

## 3. Una experiencia, dos tamaños

- **Experiencia sencilla:** un concierto, una exposición, una visita o un paseo.
- **Escapada:** una experiencia que reúne varios momentos, ordenados por quien la crea.

El formulario empieza por lo vivido o lo que quieres hacer. Agrupar varios momentos
es una ampliación opcional; guardar un concierto suelto no exige crear antes un viaje.

Cada momento puede contener un nombre, una imagen o cartel, lugar, fecha y acompañantes.
En una escapada, la portada y las fechas resumen el conjunto. Añadir un concierto
ya guardado conserva ese recuerdo y sus aportaciones; agruparlo no crea una copia.

Una escapada agrupa momentos concretos. La primera versión no necesita escapadas
anidadas dentro de otras escapadas.

### Ejemplo

**Nuestro fin de semana en Bilbao** · tú, Ana y Marcos

1. Concierto del viernes · los tres · cartel y fotos.
2. Visita al Guggenheim · tú y Ana · imagen del museo y fotos.
3. Paseo por Getxo · los tres · foto y lugar.

Ana destaca el museo; Marcos destaca el concierto. La portada reúne imágenes del
viaje. La tarjeta del conjunto cuenta la escapada y su detalle permite explorar cada
momento. En el historial general aparece el conjunto una vez; sus momentos se pueden
encontrar al filtrar por tipo o lugar, indicando la escapada a la que pertenecen.

## 4. Captura mínima y ampliación

La captura mínima pide un nombre y si es algo por vivir o ya vivido. Fecha, imagen,
lugar y acompañantes se pueden completar después. La fecha admite día único o intervalo;
un plan todavía sin fecha también se puede guardar.

Una foto elegida puede actuar como portada; un cartel o imagen de un lugar sirve
cuando no hay foto propia. El estado sin imagen mantiene título, tipo y personas,
sin inventar una fotografía del recuerdo.

Después de guardar, se puede:

- Añadir momentos a una escapada y ordenar el conjunto.
- Invitar acompañantes o indicar personas sin cuenta.
- Aportar fotos al conjunto o a un momento concreto.
- Destacar un momento favorito propio.
- Compartir explícitamente la experiencia con la audiencia elegida.

Los textos descriptivos y comentarios son complementarios. No se exige reseña,
puntuación numérica ni relato para producir una tarjeta completa.

## 5. Antes y después

Un mismo objeto acompaña el plan y conserva después el recuerdo. Las vistas
**Por vivir** y **Vividas** filtran las experiencias; no crean dos historiales separados.

Quien crea el plan propone momentos e invita a personas. Cada invitado responde por
sí mismo. Que pase la fecha no confirma automáticamente que una persona asistió ni
convierte en vivido un plan cancelado.

Al registrar lo vivido se conserva lo preparado y se puede ajustar quién participó
en cada momento. Cancelar conserva el plan para quien lo organiza, sin presentarlo
como una experiencia vivida. Las fechas se pueden corregir sin duplicar el recuerdo.

La primera versión contempla guardar planes y responder invitaciones. La compra de
entradas, las reservas y el seguimiento automático de rutas quedan fuera del propósito
de esta sección.

## 6. Personas y aportaciones

La experiencia compartida se consulta desde el historial de sus participantes
confirmados. Los datos comunes se mantienen en un solo recuerdo; los favoritos
y las aportaciones conservan autoría individual.

**Reparto propuesto:**

- Quien crea la experiencia organiza título, fechas, momentos, portada e invitaciones.
- Los participantes confirmados aportan sus fotos y eligen sus favoritos.
- Cada participante puede gestionar sus aportaciones y salir de la experiencia.
- Invitar a una persona no escribe una experiencia vivida en su perfil sin aceptación.
- El creador no selecciona favoritos ni publica fotos en nombre de otra persona.

Para una persona sin cuenta se permite una etiqueta privada dentro del recuerdo.
No se exige registrar a todos para guardar una salida. Una posterior vinculación con
una cuenta sería explícita; nunca se deduce por coincidencia de nombre.

**Con una persona:** el filtro de acompañante permite recorrer las experiencias
compartidas dentro de esta sección. Extender «Con Ana» a películas, libros y Partidas
es una evolución adicional y no una capacidad ya existente.

## 7. Visibilidad propuesta

El recuerdo compartido tiene una audiencia clara: solo quien lo crea, sus participantes
confirmados o la audiencia permitida por su perfil. La opción inicial propuesta es
privada para el creador; aceptar invitaciones da acceso a esos participantes.

Una invitación pendiente no permite explorar fotos o aportaciones privadas. Cada
persona decide si su identidad y sus aportaciones pueden aparecer en una publicación
que salga del grupo. Los nombres libres de acompañantes sin cuenta se mantienen
privados en la primera versión.

Mostrar una tarjeta en el feed es una acción explícita. Añadir un momento o una foto
no publica automáticamente otra tarjeta. La publicación del conjunto enlaza al
recuerdo original y respeta su visibilidad actual.

El futuro diseño técnico debe aplicar perfiles privados, bloqueos y moderación a
detalle, tarjetas, fotos, invitaciones, búsquedas y notificaciones. La visibilidad
de un conjunto no puede dar acceso a un momento o una aportación restringida.

## 8. Pantallas y encaje visual propuestos

### Entrada a Experiencias

Un historial visual con tarjetas cuyo contenido principal sea imagen o cartel,
nombre, personas y fecha. Filtros por futuro/pasado, acompañante y tipo de experiencia.
Una acción principal para añadir. El vacío explica la sección y ofrece crear el
primer recuerdo o plan.

### Detalle

Portada y acompañantes visibles desde el principio. Una experiencia sencilla muestra
su contenido directamente; una escapada añade la secuencia visual de momentos.
Los favoritos indican quién eligió cada momento. Las fotos conservan autoría.

En escritorio, contenido y contexto ocupan dos columnas. En móvil, la captura y las
acciones caben en los patrones de hoja existentes. Se mantiene la identidad papel/teja,
los primitivos del sistema y el suelo de accesibilidad de Biblioshare.

### Perfil y feed

Las experiencias tienen entrada desde «Lo tuyo»/«Tu cuenta» y presencia en el perfil
según visibilidad. Se integran tarjetas compartidas en Inicio. La propuesta de producto
no cambia todavía los cinco destinos de la navegación principal; si se propone ese
cambio, se revisará como decisión propia con su composición visual.

## 9. Alcance inicial recomendado

1. Crear una experiencia sencilla, futura o pasada, sin depender de un catálogo.
2. Reunir varios momentos en una escapada sin duplicarlos.
3. Invitar cuentas existentes y conservar acompañantes sin cuenta como etiquetas privadas.
4. Permitir fotos y favoritos con autoría individual.
5. Consultar el historial y filtrar por una persona.
6. Dar acceso desde el perfil y compartir una tarjeta en Inicio de forma explícita.

La búsqueda externa puede incorporarse sobre esta base cuando se elija un proveedor
y se revise su cobertura real. El recorrido manual seguirá siendo completo.

El diseño se descompondrá en hitos verificables antes de implementar. No se asume que
integraciones externas, participación compartida y publicación social deban entregarse
en una única modificación.

## 10. Condiciones para revisar el diseño

- Se guarda un concierto pequeño aunque no esté en un catálogo.
- Se guarda una experiencia en solitario sin acompañantes ficticios.
- Una escapada con tres momentos sigue siendo un recuerdo reconocible en el historial.
- Una persona puede participar en solo dos de esos tres momentos.
- Invitar y confirmar asistencia son acciones distintas.
- Cada favorito y cada foto muestran a su autor real.
- La creación con una foto y un nombre ya aporta valor sin escribir una reseña.
- Un plan sin fecha y un plan cancelado no aparecen como recuerdos vividos.
- Quien no pertenece a la audiencia no accede al detalle ni a sus imágenes.
- Compartir conserva una referencia al recuerdo y evita duplicar publicaciones por momento.

## 11. Paso posterior: especificación técnica

Esta propuesta fija una conversación de producto. La especificación para implementar
deberá definir persistencia, representación del evento/lugar frente al recuerdo personal,
permisos, almacenamiento de imágenes, invitaciones, integración con posts y pruebas.

Se deberá resolver expresamente cómo encaja este dominio con `passes`, fuente de verdad
actual del estado usuario↔obra. Esta propuesta no crea una excepción a esa regla ni
traslada estado existente de libros, películas o series a otra entidad.

Los eventos actuales de clubes son contexto reutilizable, pero no equivalen por sí
solos a un recuerdo colaborativo. La futura especificación debe justificar qué se
reutiliza y qué contrato nuevo hace falta, respetando la moderación vigente.

Fuentes de contexto consultadas: `README.md`, `PRODUCT.md`,
`docs/requirements/vision.md`, `docs/PROYECTO.md`, `docs/architecture/graph.json`,
`docs/UI-GUIA.md`, `docs/UI-GLOSARIO.md`, `src/components/nav/nav-items.ts`
y `src/lib/clubs/activities/kinds/evento.ts`.
