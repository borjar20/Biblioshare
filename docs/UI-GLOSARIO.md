# Glosario de UI — un nombre por concepto

> **[Canónico · verificado 2026-08-20]**
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

| Se dice | NO se dice | Qué es | Dónde vive |
|---|---|---|---|
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
| **Actividad** | Evento, Lectura conjunta | Lo que se hace dentro de un club y tiene calendario: lectura conjunta, tierlist, evento… | `club_activities` |
| **Hito** | Checkpoint, Punto de control | La marca de «he llegado hasta aquí» dentro de una actividad; es lo que abre el capítulo sin spoilers. | `club_checkpoints` |
| **Reto** | Challenge, Objetivo | La meta contable del usuario («50 libros en 2026»). | `/estadisticas`, `challenges` |
| **Rincón** | Mi rincón, Panel | La pestaña personal del perfil, con el sorteo y los accesos a lo tuyo. | pestaña de `/u/[username]` |
| **Sorteo** | Ruleta, Random | El «Sacar un lomo»: el azar elige entre tus pendientes. | Rincón |
| **Ajustes** | Configuración, Preferencias, Opciones | La pantalla donde decides sobre tu cuenta: perfil, visibilidad, contraseña, tus datos y avisos. | `/ajustes` |
| **Tu cuenta** | Mi cuenta, Tú (como etiqueta visible) | El **agrupador** de lo tuyo (perfil, Cuaderno, Estadísticas, Ajustes). Es el nombre del menú del avatar; en el código el concepto se llama «Tú» (`youItems`), pero al usuario no se le enseña esa palabra suelta. | menú del avatar (`sm+`), fila «Lo tuyo» del perfil (móvil) |

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
  que no colgaba nada de ella. El concepto existe en el código (`youItems`) y
  llega al usuario como **«Tu cuenta»** (el menú) y **«Lo tuyo»** (la fila del
  perfil en móvil). Si algún día se rehace la barra principal, decidir la
  etiqueta AQUÍ antes de tocar `nav-items.ts`.
