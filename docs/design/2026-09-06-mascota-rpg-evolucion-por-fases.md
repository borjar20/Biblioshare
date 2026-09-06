# Evolución del RPG de mascota por fases

> **[Diseño de producto · dirección adoptada el 2026-09-06 · implementación pendiente]** Punto de entrada para continuar el RPG de mascota en la PR #1079. Por indicación del usuario se adopta esta evolución por fases, con **combate automático con intervenciones y una ulti con minijuego**. Sustituye el alcance de trabajo de la spec de combate del 2026-09-04; los precios, fórmulas, tiempos y ejemplos de contenido siguen pendientes de calibración. Seguimiento: #1082; contratos pendientes del combate: #1081.

## Cómo continuar desde esta PR

El siguiente trabajo es el **primer hito jugable, fases RPG 1 y 2**: definir una progresión independiente de la clase y probar una pelea con básico automático, habilidad manual y ulti con minijuego. Primero se concreta su spec técnica y sus criterios de aceptación con los contratos de #1081; después se implementa y se calibra el prototipo. No se aplica una migración de niveles reales antes de validar la conversión.

Las **fases RPG 1–7 de este documento son la nueva hoja de ruta**. No renumeran ni reabren las antiguas fases de mascota 1–3 (núcleo, misiones/logros y push), que ya están implementadas. #1015 conserva el seguimiento de los jefes PvE; #1082 coordina el nuevo hito y la evolución; #1017, cosméticos/economía; #1016, PvP posterior.

La [spec del 2026-09-04](../superpowers/specs/2026-09-04-mascota-jefes-combate-design.md) queda como antecedente. Se conservan motor puro, determinismo, servidor autoritativo, eventos de replay y pipeline PixelLab. Quedan sustituidos el resultado completo al iniciar, la actitud como única intervención y el intento por obra terminada como único acceso al combate. La tabla y action allí propuestas no son un contrato vigente: requieren rediseño para resolver por tramos, pausar y reanudar. Los jefes derivados exclusivamente del reto mutable también deben revisarse según #1081.

La entrada del 2026-09-06 en [decisiones.md](../requirements/decisiones.md) registra esta precedencia. El [backlog](../requirements/backlog.md) sigue marcando el RPG nuevo como pendiente; este documento define hacia dónde construir, no describe comportamiento desplegado.

## La experiencia que queremos construir

Abres Biblioshare, registras lo que has leído o visto y descubres que tu mascota está preparada para una nueva aventura. Entras en una expedición corta. Ella ataca por su cuenta, pero tú decides cuándo usar su habilidad, cuándo reservarla y cuándo lanzar la ulti. Un pequeño puzzle convierte ese momento en una intervención tuya. Al volver, puedes cambiar cómo pelea, conseguir una pieza de equipo o acercarte a un aspecto que te gusta.

El uso cultural de Biblioshare abre oportunidades de aventura y de progreso. Jugar permite aprovecharlas y tomar decisiones. Repetir combates indefinidamente no sustituye a leer, ver películas, seguir series o utilizar sus herramientas de registro.

Mi recomendación es construirlo en este orden: **combate interesante → progresión vinculada a la app → elecciones de equipo y especialización → colección cosmética → expansión social**. El gacha debe aumentar las ganas de coleccionar algo en un juego que ya apetece jugar.

Para esta propuesta asumo moneda obtenida dentro de Biblioshare, sin compras con dinero real. Añadir pagos sería otra decisión de producto y no hace falta para probar ninguna de estas ideas.

## Qué aprovechamos y qué cambia

Ya existen nombre, seis clases, etapas de crecimiento, atributos derivados de la actividad, misiones diarias, logros, compañera flotante y arte PixelLab. Son la identidad y la conexión con la app sobre las que construir. Las deudas de reactividad, explicación de recompensas y coherencia de fechas siguen siendo trabajo previo o paralelo acotado.

La PR #1079 proponía observar un combate completamente resuelto al iniciarlo, con una actitud como única elección. Tu propuesta cambia esa parte: durante el combate habrá nuevas decisiones que afectan a su resultado. Conservamos la idea de un motor determinista, autoridad del servidor y replay por eventos, pero el servidor tendrá que resolver la pelea por tramos, incorporando las intervenciones. El replay será la historia de lo ocurrido después de esas decisiones.

También cambia el alcance de las recompensas. La PR descartaba XP de combate, armas y habilidades por nivel en esa fase. Aquí se propone añadir equipo y especialización gradualmente. La propuesta principal mantiene que el crecimiento vertical procede de la actividad cultural: combatir entrega primeras recompensas de aventura, opciones y colección, pero no una fuente ilimitada de niveles.

Finalmente, monedas, compras, equipo adquirido y elecciones de especialización necesitan estado persistente. La regla actual de derivar atributos no permite reconstruir cuánto dinero ya se gastó ni qué opción eligió alguien. Es una ampliación explícita del modelo, no un contador que se deba deducir del inventario actual.

## Fase 1. Dar una base coherente al nivel y a los atributos

**La historia del jugador.** «Entiendo qué hace crecer a mi mascota y puedo elegir una clase porque me gusta jugar con ella». Antes de convertir las estadísticas en poder, hay que revisar qué representan y cuánto influyen.

Hoy el nivel depende de un bonus al atributo principal de la clase. Cambiar de clase puede cambiar el nivel sin hacer actividad nueva. También crecen de formas muy diferentes las sesiones, las notas y la participación social. Eso puede funcionar como retrato de hábitos, pero necesita otra calibración cuando determina quién gana una pelea.

Propongo que el nivel sea común e independiente de la clase. La actividad cultural da crecimiento general; la clase define el estilo de combate. Los seis atributos aportan afinidades y pequeñas ventajas con límites, de forma que no sea obligatorio publicar en un club para que un mago de fuego sea viable. Cada clase tiene una base suficiente para jugar bien, aunque el historial de su dueño sea desigual.

Las identidades pueden mantenerse: FUE favorece golpes contundentes; CON aguante; INT potencia y recursos mágicos; SAB protección y control; DES precisión y oportunidades; CAR inspiración y efectos de apoyo. Es una propuesta semántica, no una tabla de coeficientes cerrada. El daño de una técnica de mago debería apoyarse en su identidad mágica, y no depender por accidente del atributo de quien acumula más episodios.

La curva debe dar novedades frecuentes al principio y dejar espacio de crecimiento después. Primero llega la habilidad; pronto se enseña la ulti; más adelante, una elección de especialización. No pondría mejoras automáticas de todas las estadísticas en cada nivel y además en cada arma: se dispararía el poder antes de tener enemigos interesantes.

Para las mascotas existentes, se diseña una migración que conserve nivel, etapa e hitos ya alcanzados. Antes de aplicar números se comparan perfiles: libros largos, películas, series, uso social, usuario nuevo e historial importado. La conversión y el crecimiento futuro se prueban sin modificar las cuentas mientras se calibra.

**Terminamos esta fase cuando** cambiar de clase deja de provocar saltos de nivel, distintos hábitos permiten jugar y se entiende qué concede la siguiente mejora. Se resuelven los contratos de autoridad, reintentos y conservación de victorias de #1081 antes de conectar recompensas reales.

## Fase 2. La primera pelea que apetece repetir

**La historia del jugador.** «Mi mascota sabe luchar; yo puedo ayudarla a hacerlo mejor». El primer prototipo tiene dos clases contrastadas, por ejemplo maga y guerrera, y dos o tres enemigos con comportamientos legibles. El resto de clases existentes siguen disponibles en la mascota; el prototipo de combate es una prueba acotada, no un lanzamiento que las elimina.

El ataque básico es automático. La habilidad es un botón que usas cuando te conviene y después entra en cooldown. La ulti carga durante la pelea y propone una intervención especial. El enemigo anuncia sus momentos importantes: carga un golpe fuerte, levanta una defensa o prepara una acción que conviene interrumpir. Esa información da sentido a esperar en vez de pulsar la habilidad en cuanto se ilumina.

Ejemplo con la maga: el básico lanza proyectiles; la habilidad provoca una explosión; el enemigo prepara un ataque; decides gastar la habilidad para romper su preparación o reservarla para aprovechar una vulnerabilidad posterior. Ejemplo con la guerrera: el básico mantiene la presión y la habilidad concede una guardia que conviene activar antes del golpe anunciado. Las diferencias tienen que notarse en el momento de intervenir.

Un primer objetivo de prueba sería una pelea de unos 45–75 segundos, con dos o tres decisiones útiles y una ulti disponible. Son tiempos orientativos para el prototipo, no requisitos de balance demostrados. Un botón de pausa permite interrumpir la sesión. El combate no sigue avanzando en el servidor mientras la persona está fuera.

Al activar la ulti se pausa la pelea y se abre el minijuego. La maga podría conectar runas para preparar el hechizo. Una resolución mejor añade un bonus moderado o un efecto secundario; la ulti conserva un efecto base útil si el resultado es flojo. No conviene que diez segundos de puzzle anulen todo el equipo y las decisiones anteriores.

El minijuego expresa la clase, pero no pretende medir la inteligencia, fuerza o carisma reales del usuario. Habrá alternativas de interacción: menos presión temporal, controles por pulsaciones y una resolución asistida viable. Se prueba que esa configuración permite completar el contenido. La accesibilidad se plantea desde el prototipo, especialmente porque el minijuego forma parte del combate.

Técnicamente, el motor avanza por tramos cortos con estado guardado. Acepta una intervención válida, consume su recurso una sola vez y emite los siguientes eventos. El cliente anima lo sucedido. Los cooldowns se miden en tiempo de simulación y se detienen al pausar. El servidor verifica las soluciones o acciones del puzzle; no acepta un «he sacado 100 puntos» enviado por el navegador. Resolver un puzzle lógico es verificable, pero eso no demuestra que no se haya automatizado: la integridad competitiva se evalúa aparte si llega PvP.

**Terminamos esta fase cuando** varios combates siguen resultando interesantes, se entiende por qué usar la habilidad en un momento u otro y cambiar esa decisión produce resultados distintos. No se empieza un árbol enorme ni la producción de todo el arte para compensar un combate que aún no funciona.

## Fase 3. Convertir el uso de Biblioshare en aventuras

**La historia del jugador.** «Lo que hago en la app me da motivos para volver a jugar». La mascota deja de tener como única puerta al combate terminar una obra completa. Esa condición de la PR penaliza especialmente a quien lee novelas largas.

Propongo dos recompensas conectadas con la app: **bellotas**, la moneda de compra y colección, y **aventuras pendientes**, oportunidades de jugar contenido con recompensa. Las aventuras se presentan como salidas disponibles, no como otra tienda de energía. No caducan ni requieren entrar todos los días para conservarlas. Practicar, probar builds y repetir una pelea conocida sigue siendo gratuito, sin recompensas repetibles.

Una actividad cultural significativa puede abrir una aventura del día. Una sesión de lectura real, avance de episodios o una película terminada son vías alternativas. Las misiones añaden bellotas y los objetivos semanales dan una salida adicional. Se limita la emisión por periodo y se cuenta una acción una sola vez: dividir una sesión en diez registros no genera diez recompensas. Seguir, dejar de seguir, borrar y volver a puntuar tampoco debe convertirse en un cajero.

Como ejemplo para probar la economía: primera actividad válida del día, 10 bellotas; cada una de hasta tres misiones, 5; un objetivo semanal, 25. Una persona con cuatro días activos y seis misiones completadas obtendría 95 bellotas si también cumple el objetivo semanal. No son las cifras de un balance aprobado, sino un punto de partida para medir cuánto tarda en conseguir algo que desea.

Cada aventura ofrece una pequeña ruta: combate sencillo, elección entre riesgo o recuperación y encuentro final. Las primeras rutas pueden ser más cortas. La admisión se consume una sola vez al comenzar; si se interrumpe se retoma la misma aventura, sin generar otro resultado ni perder el acceso. Volver a luchar tras una derrota permite terminarla, pero no acumular recompensas de sus nodos indefinidamente.

La XP de nivel se concede por la actividad de la app y sus misiones. La aventura entrega primeras recompensas de equipo, nuevas opciones y cosméticos. Así leer sigue siendo la base del crecimiento, mientras jugar sirve para construir y utilizar una forma propia de combatir. La misma actividad puede dar XP y bellotas: tienen funciones distintas y se muestran juntas en una recompensa comprensible.

Los jefes de retos de #1079 se incorporan como encuentros especiales con daño persistente. Se separan del pequeño combate de expedición. Sus condiciones se fijan al activar el encuentro para que editar un reto no cambie una batalla histórica. Completar el objetivo cultural garantiza su recompensa cultural; el trofeo de combate identifica un logro distinto. Los intentos ya ganados necesitan un margen de cierre explícito, no desaparecer a medianoche.

**Terminamos esta fase cuando** una persona que usa Biblioshare normalmente tiene oportunidades de juego suficientes, puede acumularlas para otro día y no necesita falsear registros ni realizar actividad social que no le interesa. Se comprueban compras y recompensas con reintentos, dos dispositivos y correcciones de actividad.

## Fase 4. Equipo que cambie cómo se juega

**La historia del jugador.** «He conseguido algo y ahora puedo probar otra manera de pelear». Empezaría con dos ranuras: arma y amuleto. Un pequeño catálogo con efectos claros da más juego que veinte objetos que solo varían en un punto de ataque.

El arma modifica una interacción de la clase. Por ejemplo, un bastón de ascuas hace que la habilidad consuma una quemadura para producir una explosión; un bastón de escarcha mejora la protección si interrumpes una preparación enemiga. El amuleto altera una regla secundaria, como dar una pequeña barrera al usar la ulti. Esos efectos tendrán incompatibilidades, cooldowns o topes para evitar ciclos infinitos.

Al principio el equipo se obtiene por una misión, una primera victoria o elección directa en una recompensa. Las armas importantes deben tener una vía de adquisición conocida. La rareza puede indicar singularidad o presentación, pero no determina que un arma sea mejor en todos los casos. Cambiar equipo y comparar efectos debe ser gratuito fuera del combate.

### Cómo llevarlo a lo visual

El pipeline actual dibuja personajes completos con PixelLab. Sus armas ya forman parte de los frames. Dibujar capas independientes de brazos, ropa y objetos fue descartado: volver a ese sistema sería rehacer el arte, no añadir una ranura de inventario.

La primera solución es que el equipo tenga **icono y tarjeta propios**, y que el combate muestre su identidad mediante proyectiles, impactos y efectos. El bastón equipado puede cambiar el color y la forma del hechizo aunque la silueta del bastón en la mano sea la del personaje base. La interfaz debe dejar claro qué objeto está equipado para que esa simplificación no resulte confusa.

Después llegan **aspectos completos curados** para las identidades más importantes. El mago de hielo tiene un atuendo y un arma visual coherentes, generados como un personaje completo; no se produce un spritesheet nuevo por cada variación estadística del bastón. Arma funcional y apariencia se separan para que elegir lo que más te gusta no empeore tu build.

El orden visual sería: iconos y efectos → dos aspectos de subclase bien terminados → colección de atuendos completos. Se revisa coste de producción, tamaño de descarga y legibilidad en móvil antes de ampliar las combinaciones de clase, etapa y animación.

**Terminamos esta fase cuando** hay varias combinaciones útiles, se entiende qué cambia un objeto y la presentación funciona con el pipeline existente. No hace falta un equipo distinto para cada nivel.

## Fase 5. Subclases y un árbol pequeño de decisiones

**La historia del jugador.** «Mi maga empieza a sentirse distinta de otra maga». Primero se prueban dos ramas de una clase, fuego y hielo, para demostrar que especializarse cambia decisiones y no solo el color del ataque.

La maga de fuego acumula quemadura y busca el momento de detonarla. Su habilidad hace daño explosivo; su ulti convierte el puzzle en una preparación de meteoritos. La maga de hielo usa barreras y ralentizaciones limitadas; guarda su habilidad para reducir una amenaza o crear una ventana segura. Su ulti organiza runas para formar una prisión de hielo. El enemigo conserva posibilidades de responder: no se permite una congelación infinita.

Las dos comparten el sistema de puzzle, con objetivos y efectos diferentes. Crear un minijuego completamente nuevo para cada subclase multiplicaría el contenido y las pruebas demasiado pronto. La variedad inicial viene de cómo sus resultados se integran en la pelea.

El primer árbol puede tener tres elecciones de dos opciones: una modifica el básico, otra la habilidad y otra la ulti. Solo eliges una opción por pareja y no terminas comprándolo todo. Los desbloqueos llegan con hitos de progreso en Biblioshare. Se puede cambiar de rama gratis entre aventuras para experimentar sin miedo a haber elegido mal.

Las otras clases se amplían cuando esta pareja demuestra profundidad. Ejemplos para explorar, no un catálogo comprometido:

| Clase y afinidad | Dos estilos posibles | Ulti y minijuego |
|---|---|---|
| Maga · INT | Fuego: daño acumulado y explosión. Hielo: protección y control | Conectar runas o resolver un puzzle corto. El efecto depende de la rama |
| Guerrera · CON | Guardiana: absorber amenazas. Duelista: responder después de defender | Colocar escudos frente a un patrón anunciado, con tiempo ajustable |
| Bárbaro · FUE | Furia: presión y riesgo. Rompedor: quebrar defensas | Elegir una secuencia de impactos sobre puntos débiles; evitar machacar botones |
| Clérigo · SAB | Luz: curación y barreras. Juicio: convertir protección en daño | Ordenar sellos y elegir a qué efecto dar prioridad |
| Ranger · DES | Tiradora: ventanas de precisión. Trampera: preparar respuestas | Seleccionar puntos de una trayectoria; alternativa por pulsaciones sin arrastre fino |
| Bardo · CAR | Inspiración: sostener efectos. Disonancia: debilitar al enemigo | Completar una secuencia musical con señal visual y modo sin exigencia de ritmo |

La stat caracteriza la fantasía de la clase y ayuda a su combate. No aumenta a la vez potencia, número de oportunidades y dificultad favorable del minijuego sin comprobar el efecto acumulado.

**Terminamos esta fase cuando** fuego y hielo exigen decisiones distintas contra el mismo enemigo, hay razones para usar ambas y el árbol se explica sin una guía externa. Entonces se amplía clase por clase.

## Fase 6. Gacha y colección cosmética

**La historia del jugador.** «Tengo ganas de gastar las bellotas en algo que me hace ilusión». El gacha tiene sentido aquí porque ya existen juego, moneda y una colección visual que mostrar.

Lo empezaría con cosméticos: atuendos completos, fondos, marcos, efectos de victoria y aspectos visuales de armas. Cada objeto debe tener un lugar visible en la ficha o el combate. No vendería variaciones que apenas se distinguen a escala móvil.

Ofrecería dos vías: sorpresa aleatoria más barata y compra directa más cara. Por ejemplo, 100 bellotas para una apertura y 250 para elegir un objeto de una selección: precios iniciales para probar, no una promesa de cadencia. La economía de ejemplo de la fase 3 tardaría algo más de una semana activa en dar una apertura; eso permite discutir si la recompensa llega demasiado tarde antes de implementarla.

El catálogo muestra qué puede salir y sus probabilidades. Una protección contra duplicados o una garantía de objeto nuevo evita largas secuencias sin progreso. Si hay compensación por repetición, vuelve a bellotas; no hace falta introducir otra moneda. El catálogo permanece disponible y no necesita temporizadores de desaparición para provocar compras.

### Qué haría con el gacha de armas

Lo pondría por detrás del gacha cosmético. Si una build depende de conseguir por azar su arma, el árbol de habilidades deja de ser una elección real para quien tiene mala suerte. La propuesta principal conserva compra, misión o recompensa elegida como acceso a las armas funcionales.

Si después se quiere incluirlas en aperturas, las trataría como una vía adicional para obtener variantes de igual presupuesto de poder, con elección directa garantizada tras un esfuerzo conocido. Otra opción más sencilla es que el gacha entregue exclusivamente el aspecto visual del arma. No usaría duplicados obligatorios para subir el arma varios rangos: añade acumulación y balance antes de demostrar valor.

**Terminamos esta fase cuando** se puede explicar cuánto tarda una persona normal en obtener algo deseado, no se bloquean estilos de combate por mala suerte y la colección se distingue visualmente. La prueba compara satisfacción por compra directa y apertura aleatoria, no solo cuántas veces se pulsa abrir.

## Fase 7. Más aventuras y juego compartido

**La historia del jugador.** «Mi mascota tiene un recorrido y puedo compartirlo». Con el combate, las builds y la economía probados, añadiría familias de enemigos, rutas con decisiones y jefes ligados a retos personales. Cada enemigo nuevo debe pedir una respuesta distinta; aumentar vida no basta.

El primer paso social que exploraría es un jefe cooperativo de club: cada persona aporta cuando utiliza Biblioshare y juega, y el grupo comparte el resultado. Las ausencias no restan vida ni castigan a otros. Compartir un replay o una build también da valor social sin exigir que dos personas coincidan.

El PvP llega más tarde. El motor de combate puede reutilizarse, pero un rival humano que interviene no equivale a una mascota automática. Para PvP asíncrono habría que definir la defensa mediante una configuración o política de IA, informar de ello y equilibrar la ventaja de quien ataca. Además necesita consentimiento, privacidad, bloqueos y reglas de emparejamiento. No lo consideraría «añadir rating» a lo anterior.

BiblioPlay como fuente de progreso sigue siendo una decisión separada. No se reactiva automáticamente una integración anterior que quedó sin escoger.

## Prioridad de tus ideas

| Idea | Valor y prioridad | Primera versión que haría |
|---|---|---|
| Revisar nivel y estadísticas | Muy alta: condiciona todo el RPG | Nivel independiente de clase, afinidades acotadas y simulación de hábitos distintos |
| Combate automático con intervenciones | Muy alta: demuestra que hay un juego divertido | Dos clases de prueba, habilidad manual y enemigos con acciones anunciadas |
| Ulti con minijuego | Alta: identidad e intervención memorable | Un puzzle reutilizable para maga y una mecánica contrastada para guerrera |
| Moneda y requisitos de uso de la app | Alta: conecta los dos productos | Bellotas por actividad/misiones y aventuras acumulables; entrenamiento libre |
| Equipo | Alta después del combate | Arma y amuleto con efectos distintos y acceso directo |
| Árboles y subclases | Media-alta después del equipo básico | Fuego/hielo, tres elecciones excluyentes y cambio gratuito |
| Representación visual del equipo | Progresiva, sin bloquear la prueba de juego | Iconos y efectos primero; después aspectos completos PixelLab |
| Gacha cosmético | Media, después de tener colección y economía | Catálogo permanente, compra directa y protección ante repeticiones |
| Gacha de armas funcionales | Baja y condicionado a acceso garantizado | Preferir aspectos de armas o adquisición aleatoria adicional, nunca única |

## La ruta de implementación

No asignaría fechas todavía: el motor interactivo y el coste de producir variantes necesitan una primera prueba. Cada fase debe producir una experiencia comprobable y una decisión sobre continuar.

**Primer hito jugable: fases 1 y 2.** Ajustar el contrato de progresión y producir una pelea corta con intervención y ulti. Aquí se demuestra la diversión con poco contenido. Lo aprovechan la revisión #1081 y el prototipo de #1082.

**Primer RPG conectado a Biblioshare: fase 3.** Añadir recompensas de app, aventuras pendientes y persistencia segura. La moneda se introduce con recompensas directas sencillas, sin esperar a una tienda gacha. El registro cultural debe seguir siendo rápido y la celebración explicar qué se ha obtenido.

**Primera build propia: fases 4 y 5.** Introducir dos ranuras y después fuego/hielo. No lanzar a la vez doce subclases, seis minijuegos y decenas de armas. Las seis clases base pueden extenderse por tandas antes de abrir el combate a todos los usuarios.

**Primera colección: fase 6.** Producir un catálogo pequeño que se vea bien y medir la economía real antes de aumentar rarezas y contenido. Encaja con #1017, ampliando explícitamente su diseño.

**Juego de largo recorrido: fase 7.** Ampliar encuentros y cooperativo. Retomar #1016 cuando haya suficiente uso y reglas claras para la intervención asíncrona.

El primer lanzamiento no necesita gacha, árbol grande ni un equipamiento visible por piezas. Sí necesita una pelea que quieras repetir, una elección que entiendas y una relación clara entre lo que haces en Biblioshare y lo que puedes conseguir en el juego.

## Referencias y estado de la propuesta

- Base actual contrastada en `main`, commit `bb3e842e`: [balance](https://github.com/borjar20/Biblioshare/blob/bb3e842e/src/lib/pet/balance.ts), [derivación](https://github.com/borjar20/Biblioshare/blob/bb3e842e/src/lib/pet/derive.ts), [misiones](https://github.com/borjar20/Biblioshare/blob/bb3e842e/src/lib/pet/missions/templates.ts).
- [PR #1079](https://github.com/borjar20/Biblioshare/pull/1079): antecedente de autobattle completamente resuelto, jefes de reto y replay.
- [Pipeline de arte PixelLab](https://github.com/borjar20/Biblioshare/blob/bb3e842e/docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md): personaje completo y rig por piezas descartado.
- [#1081](https://github.com/borjar20/Biblioshare/issues/1081), [#1082](https://github.com/borjar20/Biblioshare/issues/1082), [#1017](https://github.com/borjar20/Biblioshare/issues/1017) y [#1016](https://github.com/borjar20/Biblioshare/issues/1016): seguimiento existente. Esta propuesta no cierra sus decisiones.
- [Xbox Accessibility Guideline 108](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/108): referencia para ajustar dificultad e interacción. Las mecánicas concretas propuestas aquí son diseño propio, pendiente de prueba.

La modalidad automática con intervenciones y ulti y la hoja de ruta se adoptan como dirección de trabajo por indicación del usuario. Los precios, ritmos, efectos, coeficientes y catálogo concreto siguen siendo propuestas para validar en cada hito. Esta actualización documental no implementa el RPG ni cambia el balance de producción; la spec anterior conserva su texto histórico con un aviso de sustitución.
