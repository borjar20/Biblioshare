# Glosario de UI — un nombre por concepto

> **[Delta calendario lateral Paper #1450 · 2026-10-07 · candidato de PR #1455; integración/publicación pendientes.]**

> **[Canónico · verificado 2026-08-20]**
> Delta de navegación principal y herramientas de Biblioteca verificado 2026-10-03;
> el resto conserva su fecha de verificación.
>
> Cierra **F3-011** de la auditoría 2026-08 (acción 7 del roadmap). Aquí manda el
> término que ve el usuario, en español; el nombre técnico (tabla, tipo, ruta) va
> al lado solo para poder cruzarlo con `docs/requirements/data-model.md`. Los
> principios que lo obligan están en `docs/UI-GUIA.md` (principio 8).
>
> **Cómo se usa:** al escribir cualquier copy —`messages/es.json`, un título de
> página, una etiqueta de botón— se coge el término de la columna «Se dice» y no
> otro. Si hace falta un concepto que no está aquí, se añade **aquí primero**.

## Por qué existe este doc

El mismo concepto se llamaba de tres formas según la pantalla: la página `/notas`
se titulaba «Cuaderno», la ficha decía «Mis notas y citas» y el Rincón «Notas
guardadas». Y peor: **«colección» significaba dos cosas a un clic de distancia**
—la nav decía «Colección» para TODA tu biblioteca, y dentro había una pestaña
«Colecciones» que eran tus listas—. Con eso no se puede construir un mapa mental
de la app, por bien dibujada que esté cada pantalla.

## Los términos

Novedades: base publicada el 2026-10-06; delta de calidad con esquema local/dev/producción el 2026-10-07 (#1451, PR #1452):
**Novedades** reúne próximos **Lanzamientos** de obras culturales. **Explorar**
es la selección pública y **Lo que esperas** parte de Pendiente, del seguimiento
de series o sagas y de los avisos elegidos. **Añadir a Pendiente** registra una
obra; **Avisarme** elige un aviso para un lanzamiento concreto. **Retirar aviso**
conserva Pendiente. **Cine** y **Digital** son modalidades de una película y se
presentan dentro de una misma obra. **Temporada {número}** identifica un anuncio
de temporada, sin confundirlo con un estreno de serie. **Primera traducción al
castellano** distingue una salida editorial de un libro nuevo. **Fecha por
confirmar** conserva la ausencia de un día; **Anuncios sin día exacto** separa
meses, años y fechas desconocidas. **Internacional** identifica un mercado
distinto de España. **Sale esta semana** enlaza desde Inicio al calendario.
**Anuncios con información limitada** agrupa obras sin portada segura o sinopsis;
**Sin portada** y **Sin sinopsis** explican el motivo. **Sinopsis en inglés** describe el
texto disponible, sin cambiar el mercado ni el idioma de edición/doblaje del lanzamiento.
El candidato Paper local de #1450 añade **Fuente y revisión** para la procedencia por
lanzamiento y **Detalles del lanzamiento** para el anuncio abierto. **Pendiente** es la
etiqueta breve del botón compacto; su nombre accesible sigue siendo **Añadir a Pendiente**.
El calendario lateral del candidato muestra **Estrenos** e **Información limitada**
para el mes o día consultado; **Sin mes confirmado** reúne anuncios con año o fecha
por confirmar, accesibles desde cualquier mes. **Ir a un mes**, **Mes actual** y
**Ver mes completo** navegan sin inventar una fecha exacta. **Volver arriba** devuelve
al título de Novedades desde la lista móvil sin cambiar el período ni los filtros.
Integración/publicación pendientes; no cambia el vocabulario de acciones ni su efecto.
La administración usa **Borrador**, **Publicado**, **Cancelado**, **Revisar** y
**Publicar**; publicar un anuncio no registra la obra en su biblioteca.

Delta 2026-10-02, Experiencias (#1293): **Experiencia** es una salida o recuerdo
compartido; **Escapada** agrupa varios **Momentos** en el mismo recuerdo;
**Acompañante** es una cuenta invitada o una etiqueta privada sin cuenta.
Estados: **Por vivir**, **Vivida**, **Cancelada**. Aceptar una invitación confirma
participación en el grupo; **Fui**, **Por confirmar** y **No fui** describen presencia
en cada momento. **Mi momento favorito** pertenece a quien lo elige.
Compartir significa publicar la experiencia en el perfil/feed según su audiencia.
Avisos: «te invitó a una experiencia», «aceptó tu invitación», «compartió una experiencia».
Un recuerdo inaccesible se presenta como «Experiencia no disponible», sin distinguir
entre ID inexistente, privacidad o retirada.
«Participaciones sin acceso» permite «Retirar mi participación pública» o «Salir
de la experiencia». «Fotos fuera de un grupo» muestra una vista previa exclusiva
del autor para reconocer la aportación que va a eliminar.
Invitaciones: «Aceptar invitación» / «Rechazar invitación». «Mostrar mi participación
en el perfil» es consentimiento individual, separado de aceptar y de «Fui».
«Añadir acompañante» admite «Cuenta de Biblioshare» o «Invitado sin cuenta»;
invitar abre el recuerdo a acompañantes aceptados y lo avisa antes de enviar.
Galería: «Añadir foto», «Portada» y «Mostrar esta foto en el perfil». La autoría
no concede consentimiento de identidad. «Fotos fuera de un grupo» permite quitar
aportaciones propias tras salir, sin volver a abrir el recuerdo.
Publicación: «Compartir en el feed», «Ver publicación» y «Quitar publicación del
feed»; quitar el post conserva la experiencia. Perfil: pestaña «Experiencias».
Moderación: «Reportar experiencia» y «Imagen de evidencia», reservada al administrador.

Delta 2026-10-03, rediseño de Experiencias como álbum social: se conservan los
conceptos **Experiencia**, **Momento**, **Escapada** y **Acompañante**. «El recuerdo»
y «El recorrido» organizan la experiencia y sus momentos; «álbum» describe la
presentación de las fotos, sin introducir otro contenedor de datos. La creación
empieza por «¿Qué vas a vivir?» y el nombre; «Añadir fecha o lugar» permite ampliar
los detalles. «Fechas y privacidad» reúne esos ajustes dentro del recuerdo y
«Tu participación» agrupa la presencia y las decisiones personales.
**Vivida** sigue siendo el estado de la experiencia y **Fui** la presencia de cada
persona en un momento: elegir uno no confirma el otro. «Visible dentro del
recuerdo» y «Visible en el perfil según cada permiso» describen la audiencia sin
sustituir el consentimiento individual de identidad y fotos. «Revisar mis
participaciones» y «Revisar mis fotos» mantienen el acceso a la gestión de
aportaciones propias cuando ya no se puede abrir el recuerdo.

Delta 2026-10-04, reseñas de momentos en feed y perfil: la cabecera de un post de
reseña dice «reseñó {momento}» (en minúscula, tras el nombre de quien escribe) en
vez de «Compartió una experiencia»; debajo de la tarjeta, la nota en dots y el texto
enlazan al momento. En la pestaña «Experiencias» del perfil, cada tarjeta muestra
un extracto de la mejor reseña propia compartida en el perfil; si solo tiene nota,
«Solo puso nota».

Delta 2026-10-04, reseñas en el detalle de la experiencia: una **Reseña de momento**
es la nota 1–10 (en dots, nunca estrellas) y/o el texto que cada persona deja sobre
un momento al que fue («Fui») en una experiencia **Vivida**; la experiencia no tiene
nota propia, solo la media de sus reseñas. Sin presencia confirmada no se ofrece
«Reseñar» desactivado: se explica «Confirma que fuiste a {momento} para poder
reseñarlo». **Compartir fuera del grupo** es el consentimiento de cada reseña para que
la vean quienes ven la experiencia en el perfil de su autor; sin él, solo la leen los
acompañantes aceptados. **Publicar en tu actividad** es la acción explícita y
adicional que la lleva al feed, y solo se habilita con la reseña compartida y la
experiencia visible en el perfil. Las reseñas ajenas se pueden «Denunciar reseña»;
si ya la denunciaste: «Ya denunciaste esta reseña.». **Mi momento** sustituye a «Mi
momento favorito» como etiqueta del favorito (icono de cinta, no estrella).
**Lo vivimos** es la acción rápida del creador que pasa un plan a **Vivida** y lleva
a confirmar la presencia y reseñar.
Copy del flujo: título «¿A qué fuiste?», ayuda «Marca los momentos en los que
estuviste. Podrás cambiarlo después.», botón «Guardar», y al acabar «Reseñar ahora» o
«Más tarde». En una experiencia **Vivida** con tu presencia aún «Por confirmar», el
selector se encabeza con «¿Fuiste? Confirma y reseña». Pasar a «No fui» o «Por
confirmar» un momento que ya reseñaste pide confirmación: «Borrar tu reseña» — «Tienes
una reseña de {momento}. Si dices que no fuiste, se borrará junto con su
publicación.» — botón «Cambiar y borrar la reseña».
Tipos de momento nuevos: «Gastronomía», «Festival», «Deporte» y «Naturaleza» (junto a
Concierto, Espectáculo, Exposición, Museo, Paseo y «Otra experiencia»). El favorito se
llama «Mi momento»; el de otra persona, «Momento de {nombre}»; sus acciones son
«Marcar {momento} como mi momento» y «Quitar {momento} como mi momento». Las tarjetas
muestran la media visible en dots con «N reseñas» solo cuando hay alguna. En el hub,
«Orden» ofrece «Recientes» (por defecto) y «Mejor valoradas» (por media visible).
Avisos: «{nombre} reseñó un momento de una experiencia» (solo al grupo; el texto de la
reseña no viaja en el aviso). Moderación: el tipo de contenido se llama «Reseña de
experiencia».

Delta 2026-10-03, navegación de la app: **Inicio**, **Biblioteca**,
**Experiencias**, **Comunidad** y **Buscar** son las entradas principales.
**Comunidad** reúne **Clubes** y **Personas**: aquí «Personas» son cuentas de
Biblioshare, no autores del catálogo. **Retos y objetivos** es el acceso al
**Rincón** desde Biblioteca; conserva los objetivos, retos, memorizar y sorteo
existentes. El **Perfil** muestra identidad y contenido compartido y se abre
desde el avatar global. Las funciones de la app tienen navegación propia;
**Más opciones** ofrece los accesos secundarios globales, incluida **Partidas**.

| Se dice | NO se dice | Qué es | Dónde vive |
|---|---|---|---|
| **Retirar** / **Restaurar** | Suspender / Reactivar (contenido) | Ocultar contenido para todos de forma reversible / recuperar su visibilidad previa. | Moderación, `/admin` (#1183) |
| **Eliminar definitivamente** | Retirar (borrado irreversible) | Borrar contenido y dependencias, conservando evidencia administrativa. | Moderación, `/admin` (#1183) |
| **Biblioteca** | Colección, Mi colección | Todo lo que has añadido: lo leído, lo que lees y lo pendiente. Es el contenedor grande. | `/coleccion` (la URL se queda: cambiarla rompería enlaces) |
| **Colección** | Lista, Estantería | Una agrupación **que tú creas** dentro de tu biblioteca («Para el verano»). Es una de muchas. | pestaña «Colecciones», `/coleccion/c/[id]` |
| **Cuaderno** | Notas guardadas, Mis notas y citas | El sitio donde viven tus notas y citas. En una ficha: «Tu cuaderno». | `/notas`, sección de ficha, tarjeta del Rincón |
| **Nota** / **Cita** | Anotación, Apunte | Las dos piezas que guarda el cuaderno: la cita es literal del texto, la nota es tuya. | tabla `notes`, campo `kind` |
| **Pase** | Lectura, Entrada de diario, `diary_entry` | Una pasada completa por una obra (1.ª lectura, 2.º visionado). **Es donde vive el estado vivo del usuario.** | tabla `passes` |
| **Sesión** | Registro, Avance | Un rato concreto dentro de un pase, con su página o minuto. | tabla `progress_sessions` |
| **Estado** | Progreso | Dónde estás con una obra: Pendiente / Leyendo / Leído / Abandonado (y su equivalente en película y serie). No es lo mismo que el porcentaje. | `passes.status` |
| **Obra** | Título, Ítem, Ficha | La cosa del catálogo: un libro, una película o una serie. En copy dirigido al usuario suele ser mejor decir el tipo concreto. | `items` |
| **Edición** (libro) / **Versión** (película) | Ejemplar, Copia | La materialización concreta de la obra: tapa dura, montaje extendido. **Es del catálogo común, no tuya.** | tabla `editions` |
| **Saga** | Serie de libros, Colección (de estudio) | Un conjunto de obras con orden narrativo. | `/saga/[id]` |
| **Universo** | Metasaga, Franquicia | Una saga que agrupa otras sagas. Es una saga, no un tipo aparte. | `sagas.parent_id` |
| **Club** | Grupo | El espacio compartido donde varias personas leen o ven algo a la vez. | `/club/[slug]` |
| **Comunidad** | — | El destino compartido de Clubes y Personas. | `/comunidad`; pestaña Personas con `?tab=personas` |
| **Personas** (en Comunidad) | Autores | Cuentas de Biblioshare que puedes buscar y conocer. | `/comunidad?tab=personas` |
| **Perfil** | Mi espacio | La identidad y el contenido que comparte una persona. El avatar global da acceso al perfil propio. | `/u/[username]` |
| **Madriguera del club** | Ranking del club, Equipo de combate | El espacio de compañía de las mascotas de quienes pertenecen al club, respetando la privacidad de cada perfil. | S3 #1129; implementada en desarrollo el 2026-09-07, aceptación visual de José Ángel el 2026-09-07; publicación pendiente |
| **Actividad** | Evento, Lectura conjunta | Lo que se hace dentro de un club y tiene calendario: lectura conjunta, tierlist, evento… | `club_activities` |
| **Hito** | Checkpoint, Punto de control | La marca de «he llegado hasta aquí» dentro de una actividad; es lo que abre el capítulo sin spoilers. | `club_checkpoints` |
| **Reto** | Challenge, Objetivo | La meta contable del usuario («50 libros en 2026»). | `/estadisticas`, `challenges` |
| **Retos y objetivos** | Mi espacio | El acceso desde Biblioteca al Rincón y sus objetivos, retos, memorizar y sorteo. | `/coleccion/rincon` |
| **Rincón** | Mi rincón, Panel | El espacio de objetivos, retos, memorizar y sorteo integrado en Biblioteca. | `/coleccion/rincon`; los enlaces antiguos del perfil propio redirigen aquí |
| **Campamento** | — | Inicio de la mascota, con su estado, acceso a aventuras y entrenamiento, equipo y misiones. | `/mascota?view=camp`, navegación verificada 2026-09-09 |
| **Personaje** | Ficha | Sección de la mascota con sus atributos, clase, nombre y el equipo: aquí comparas el botín conseguido y eliges arma y amuleto para el próximo combate. | `/mascota?view=character`, navegación verificada 2026-09-09 |
| **Mochila** | — | **Retirada el 2026-09-09 (#1166).** Fue destino propio hasta que el equipo entró en Personaje; `?view=bag` sigue llevando allí. No reimplementar leyendo un mockup viejo. | `/mascota?view=character` |
| **Diario** (de la mascota) | — | Sección de misiones y logros de la mascota. | `/mascota?view=diary`, navegación verificada 2026-09-09 |
| **Madriguera** | Ranking de mascotas, Clasificación | El espacio de compañía con las mascotas visibles de tus seguidos y la tuya, si tienes una. Puedes verlo antes de eclosionar. | `/mascota?view=burrow` (navegación verificada 2026-09-09); S1 #1083 aceptada el 2026-09-07; ampliación de nivel verificada en dev; migración aplicada también en producción el 2026-09-07, publicación web en PR #1128 |
| **Botín** | Loot | Objetos obtenidos al superar aventuras de la mascota. | `/mascota`, R4b #1123 |
| **Equipo** | Loadout, Build | Arma y amuleto elegidos para el próximo combate. | `/mascota`, `pet_loadout` |
| **Potencia** (del objeto) | Calidad, Roll, Reroll | Multiplicador fijo del efecto adicional de una copia de botín. No es el nivel de la mascota. | `/mascota`, R4b #1123 |
| **Sorteo** | Ruleta, Random | El «Sacar un lomo»: el azar elige entre tus pendientes. | Rincón |
| **Ajustes** | Configuración, Preferencias, Opciones | La pantalla donde decides sobre tu cuenta: perfil, visibilidad, contraseña, tus datos y avisos. | `/ajustes` |
| **Más opciones** | Mi espacio | El menú de accesos secundarios de la app, disponible en cualquier pantalla. Incluye Partidas y Ajustes. | navegación global; separado del enlace de perfil en el avatar |
| **Partida** | Juego | Una sesión de juego concreta; la unidad principal del dominio. | dominio `play`, `/partidas` |
| **Herramienta** | Tracker, Módulo | Cada tracker del hub de Partidas, y es el **juego**, no el modo: «Magic: The Gathering», no «Commander». Nadie se pregunta «¿tendrá Commander?», se pregunta «¿tendrá Magic?». | `/partidas` (hub principal) |
| **Jugador** | Usuario, Participante | Quien participa en una partida, sea cuenta Biblioshare, habitual o invitado; su origen no se distingue durante la partida. | dominio `play` |
| **Invitado** | — | Jugador temporal que no persiste tras la partida. | dominio `play` |
| **Jugador habitual** | Contacto, Amigo | Persona sin cuenta que acumula historial; vinculable a una cuenta solo manualmente (nunca por nombre). | dominio `play` |
| **Modo** | Variante, Formato | Cada forma de jugar dentro de una herramienta (Commander, Duelo). La herramienta es el JUEGO; el modo aporta configuración —vidas, si hay daño de comandante—, no un motor nuevo. | `/partidas/mtg`, `mtg/modes.ts` |
| **Mesa** | Tablero, Partida (como sitio) | El conjunto de jugadores de una partida y su disposición en pantalla. «La mesa decide» = las personas, no la app. | `/partida/activa` |
| **Asiento** | Posición, Puesto, Slot | El sitio de un jugador en la mesa. Su orden **es** el orden de turnos y da el color con el que se le reconoce. | `setup.participants` (el orden) |
| **Reparto** | Layout, Distribución, Disposición | Cómo se colocan los asientos en pantalla: en filas, con cabecera o todos igual. Es preferencia de vista, no estado de partida. | hoja de partida, `ui/layout.ts` |
| **Mazo** | Baraja, Deck | El mazo con el que juega alguien; texto libre, sin catálogo de cartas. | `participant.deckName` |
| **Comandante** | — | Carta comandante de un mazo; texto libre, sin catálogo. Un asiento lleva uno o dos. | herramienta Magic (`/partidas/mtg`) |
| **Partner** | Compañero, Segundo comandante | El segundo comandante de un asiento. En la interfaz es «añadir comandante», no un campo aparte: el mismo hueco sirve para partner, background y companion. | ficha del jugador |
| **Daño de comandante** | — | Daño acumulado que un comandante **concreto** ha hecho a un jugador (21 de uno mismo = condición de derrota). Nunca se suma entre comandantes. | herramienta Magic |
| **Veneno** | — | Contadores de veneno (10 = condición de derrota). | herramienta Magic |
| **Monarca** / **Iniciativa** | — | Estados globales de mesa con un único poseedor. | herramienta Magic |
| **Ronda** | Turno (como conteo) | Vuelta completa de turnos; es el número que la UI muestra como «Turno N». | herramienta Magic |
| **Eliminado** | Muerto, Fuera, Perdedor | Quien ya no juega. La app **avisa** de que se cumple una condición de derrota, pero eliminar siempre lo decide la mesa. | panel de jugador, hoja de jugador |
| **Consola** | Barra, Controles, HUD | La franja central con deshacer, turno, crono y menú. Se lee desde cualquier lado de la mesa. | `/partida/activa` |
| **Revancha** | Repetir, Otra vez, Rematch | Empezar otra partida con la mesa ya puesta y el turno inicial rotado un asiento. Pasa por la configuración, no arranca sola. | resumen final |

## Reglas de escritura que se derivan

1. **«Biblioteca» nunca en plural y nunca por una lista.** Si es una agrupación
   que el usuario creó, es una **colección**. Si son todas ellas, son
   «tus colecciones», no «tu biblioteca».
2. **«Pase» no se traduce a «lectura» en copy de serie o película.** El término
   es del dominio y es único a propósito: sirve para los tres tipos. Lo que sí
   cambia por tipo es el VERBO (ver abajo).
3. **Los verbos del CTA principal, decididos de una vez** (F3-006): libro
   «Registrar sesión», película «Registrar visionado», serie «Marcar episodio».
   El color es el mismo naranja en los tres; lo que cambia es el verbo, no la
   identidad del botón.
4. **Los nombres técnicos no salen a la interfaz.** `pass`, `item`, `entry`,
   `checkpoint` y `diary_entry` no se le enseñan a nadie. `diary_entries`
   además ya no existe: se llama `passes` (ver `data-model.md` §0).

## Lo que este glosario NO resuelve todavía

- La página `/coleccion` se titula «Mi Biblioteca» y la nav dice «Biblioteca».
  Coherente, pero la **URL sigue siendo `/coleccion`**: cambiarla rompería
  enlaces compartidos y las rutas guardadas de la PWA. Es deuda consciente, no
  un olvido.
- «Actividad» significa dos cosas según el sitio: lo que se organiza en un club
  y lo que se ve en el feed de gente («actividad reciente»). No se ha tocado
  porque el segundo casi nunca aparece como sustantivo suelto — pero si alguna
  vez hay una pantalla titulada «Actividad» fuera de un club, hay que resolverlo.
- El vocabulario de **series** (temporada, episodio, T2·E3) no está aquí porque
  no tiene competencia: nadie lo llama de dos formas.
- **«Tú» no llegó a ser una etiqueta visible** (acción 8, 2026-08-21). La
  propuesta de la auditoría era renombrar la pestaña «Perfil» de la barra
  inferior a «Tú»; se descartó por no estrenar un término tres días después de
  cerrar este glosario, y porque el problema no era el nombre de la pestaña sino
  que no colgaba nada de ella. Aquella navegación se sustituyó el 2026-10-03:
  el perfil se abre desde el avatar, las secciones tienen entradas propias y
  **«Más opciones»** reúne los accesos secundarios globales. «Tu cuenta» y
  «Lo tuyo» ya no describen la navegación principal ni la cabecera del perfil.

Delta 2026-10-04, notas en el margen: **nota en el margen** es la nota breve que una
persona deja anclada a un punto de una obra para quien la lea después; **encontrada**
es la nota que un lector se topa por proporción de avance (hilo privado entre autor y
lector, `interaction_targets.kind = margin_encounter`); **dedicada** es la nota que su
autor dirige a una persona concreta (aviso `margin_note_dedicated`). Los avisos de
respuesta y reacción en ese hilo llegan a ambos: «respondió en vuestra nota del margen».

Delta 2026-10-05, notas en el margen (escribir): los botones que abren el formulario dicen **«Dejar en el margen»** (hoja de sesión), **«Dejar nota en este episodio»** (episodio visto) y **«Dejar una nota en el margen»** (ficha); la hoja se titula «Una nota en el margen» y el guardado dice «Nota dejada en el margen». «Margen» solo se usa para estas notas, nunca para el cuaderno privado de la sesión («Notas»).
