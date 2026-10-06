# Novedades culturales

> [Diseño de producto acordado · cuatro rondas aceptadas el 2026-10-06; hechos de partida contrastados con origin/main; fuentes editoriales consultadas el 2026-10-06. Implementación local/dev y seis recorridos con revisión independiente de navegador R3 PASS el mismo día; entrega a usuarios pendiente.]

## Acuerdos de la primera ronda

La respuesta «Si a todo» se interpreta como aceptación de las tres recomendaciones presentadas en la entrevista grill-with-docs:

1. Novedades permite descubrir lanzamientos generales en «Explorar» y consultar los relacionados con intereses propios en «Lo que esperas». La segunda selección parte de Pendiente y del seguimiento de series o sagas.
2. España y las publicaciones en castellano son la referencia predeterminada. Una fecha internacional se identifica como tal; no se sustituye silenciosamente por una fecha española.
3. La primera versión incluye películas, nuevas series o temporadas, libros nuevos y primeras traducciones al castellano. La recomendación aceptada deja episodios semanales y reediciones fuera de esta primera versión.

El vocabulario acordado se incorpora a CONTEXT.md. Una salida editorial pertenece a una edición, idioma y mercado; no equivale al año de publicación original de la obra ni a una publicación del feed.

## Acuerdos de la segunda ronda

La segunda respuesta «Si a todo» acepta las recomendaciones de Q4–Q7:

4. La primera versión usa fuentes gratuitas de libros, con una selección acotada y revisión periódica. No depende de contratar DILVE ni promete cubrir toda la producción editorial.
5. Las películas contemplan cine y distribución digital, identificados por separado. Se muestra una plataforma concreta solo cuando la fuente permite acreditarla; la fecha de estreno digital por sí sola no lo demuestra.
6. Novedades puede consultarse dentro de la app. Recibir push requiere elegir expresamente «Avisarme» para un lanzamiento; añadir una obra a Pendiente no activa esa elección.
7. Los anuncios sin día exacto se incluyen con la precisión disponible —por ejemplo, mes o «Fecha por confirmar»— y se separan de los lanzamientos con fecha exacta. No se inventa un día para ordenar o avisar.

La segunda ronda deja abiertos el mecanismo de extracción, la responsabilidad de revisión, el momento del aviso y los cambios y cancelaciones; la tercera ronda resuelve los puntos siguientes.

## Acuerdos de la tercera ronda

La respuesta «Si» acepta las recomendaciones de Q8–Q11:

8. Administración revisa y publica la selección inicial de libros. Las propuestas de usuarios quedan para una ampliación y no forman parte de esta entrega inicial.
9. Elegir «Avisarme» programa un aviso el día anterior a un lanzamiento con día conocido. Confirmar una fecha que antes era desconocida, cambiar la fecha o cancelar el lanzamiento son hechos que pueden producir avisos adicionales. La elección puede desactivarse en cualquier momento.
10. Una película aparece como una obra única con fechas de cine y digital separadas. «Avisarme» se elige por modalidad; «Añadir a Pendiente» actúa sobre la obra y no crea un pendiente distinto por modalidad.
11. «Explorar» es público. «Lo que esperas», «Añadir a Pendiente» y «Avisarme» requieren sesión. Los intereses de una persona no forman parte del calendario público.

El lanzamiento y la obra son conceptos distintos: una obra puede tener varios lanzamientos según modalidad y mercado. El paso de la fecha de estreno no equivale a que una persona haya leído o visto la obra; conserva su estado personal hasta que ella actúe. Retirar un aviso tampoco elimina un pendiente.

## Acuerdos de la cuarta ronda y cierre

La última respuesta «Si» acepta las recomendaciones de Q12–Q13, presentadas como las dos decisiones restantes para cerrar el diseño:

12. La selección inicial de libros se introduce y revisa manualmente desde administración a partir de anuncios de editoriales. Una futura importación automática depende de encontrar y comprobar una fuente gratuita, fiable y mantenible; no forma parte de esta primera versión.
13. Las fechas de películas y series se actualizan automáticamente cada día desde TMDB. La selección de libros se revisa editorialmente cada semana. Se muestra cuándo se revisó la información por última vez; la cadencia de consulta no garantiza que la fuente haya publicado un dato nuevo.

Con estas respuestas queda cerrado el diseño de producto. La selección editorial es acotada y no se presenta como un calendario exhaustivo. Las fuentes, la modalidad, el mercado y la precisión de cada fecha deben poder distinguirse al consultar una novedad.

## Presentación de referencia

Acceso desde Buscar y un bloque breve «Sale esta semana» en Inicio. Tarjetas con portada, título, fecha, modalidad del lanzamiento y acción «Añadir a Pendiente». La disposición exacta se concretará en la especificación, dentro del alcance acordado.

## Hechos de origin/main que condicionaron el diseño

El catálogo actual conserva principalmente años. El adaptador TMDB recibe fechas de películas y series y las reduce a año; las series sí conservan la fecha del siguiente episodio. No hay un proveedor de agenda editorial futura ni seguimiento de autores. Las acciones existentes de búsqueda permiten incorporar una obra a Pendiente sin crear una segunda watchlist.

La campana y los transportes Web Push/Android existen. Las preferencias actuales son por categoría y canal; no constituyen una elección de recibir avisos de un lanzamiento concreto. Los recordatorios de eventos de club son un patrón reutilizable, pero describen eventos organizados por un club y no lanzamientos generales.

El rol de administrador y el acceso a `/admin` ya se comprueban en servidor. El panel actual no tiene bandeja editorial ni publicación de lanzamientos. El editor de catálogo permite a colaboradores y administradores modificar metadatos directamente; esa facultad no equivale a aprobar una novedad. Tampoco existe una bandeja de propuestas de usuarios para novedades. Referencias: `src/lib/auth/roles.ts`, `src/app/admin/layout.tsx`, `src/app/admin/admin-nav.tsx`, `src/components/detail/catalog-editor.tsx` y `src/lib/catalog/edit-actions.ts` en origin/main bd98ec117567a45436cce4a6c18987d00814ddf7.

La búsqueda y las fichas de obras ya registradas admiten visitantes. Abrir un resultado externo que aún no tiene fila de catálogo exige sesión para crearlo. Por tanto, «Explorar» necesita mostrar información pública del lanzamiento sin depender de ese paso de creación; las acciones personales siguen exigiendo sesión. Referencias: `src/app/buscar/page.tsx`, `src/app/buscar/actions.ts` y páginas de libro, película y serie.

El alta manual de libros admite título con autoría, editorial, año e ISBN opcionales; las ediciones también admiten ISBN ausente y años futuros entre 1400 y 2200. Esto permite anunciar obras que aún no aparecen en proveedores. El formulario manual existente añade además la obra a Pendiente de su creador: el flujo editorial debe reutilizar la capacidad de catálogo sin aplicar ese efecto personal. Relacionar después un anuncio sin ISBN con una identidad de proveedor requiere comprobación de coincidencia; no autoriza fusionar obras por similitud de título. Referencias: `src/app/buscar/manual/actions.ts`, `src/lib/editions/actions.ts`, `supabase/migrations/20260885_repr_d_curacion_alta_manual.sql` y `supabase/migrations/20260714_editions.sql`.

Estas comprobaciones son de código y SQL del repositorio, sin ejecutar altas ni consultar el esquema remoto. El calendario público muestra anuncios y sus fuentes; la selección personal y las elecciones de avisos permanecen privadas.

La lectura inicial se realizó sobre ebffbebfeef0b14382314bfd262f7ca3a6e4db97. Al refrescar origin/main a bd98ec117567a45436cce4a6c18987d00814ddf7, no cambian CONTEXT, catálogo, Buscar ni navegación entre ambos cortes. También se contrastan sin cambios los doce archivos concretos de preferencias, transportes, notificaciones, recordatorios y migraciones identificados en la lectura de avisos.

## Fuentes consideradas

- Películas: [TMDB Discover](https://developer.themoviedb.org/reference/discover-movie) permite filtrar fechas, región y tipos de estreno. La modalidad y la fecha regional deben resolverse antes de prometer disponibilidad en una plataforma.
- [TMDB Release Dates](https://developer.themoviedb.org/reference/movie-release-dates) distingue cine, digital y otras modalidades. [Watch Providers](https://developer.themoviedb.org/reference/movie-watch-providers) aporta disponibilidad por país y proveedor, no una agenda de futuros estrenos de cada plataforma; exige atribución a JustWatch si se utiliza esa información.
- Series: [TMDB Discover TV](https://developer.themoviedb.org/reference/discover-tv) permite filtrar fechas de emisión y primera emisión; ello no demuestra disponibilidad regional en una plataforma concreta.
- Libros: [Google Books Volume](https://developers.google.com/books/docs/v1/reference/volumes) ofrece una fecha bibliográfica por volumen. Por sí sola no acredita un calendario de novedades españolas.
- Selección editorial: [Penguin Libros](https://www.penguinlibros.com/es/content/122-proximos-lanzamientos-en-libros) publica próximos lanzamientos. Es una fuente parcial; aún no se ha comprobado un mecanismo de integración mantenible.
- Fuente sectorial: [DILVE para webs y otros usuarios de información](https://web.dilve.es/dilve/dilve-para-otros-consumidores-de-informacion/) permite extracciones de metadatos por fecha, novedad y otros criterios, con programación periódica. Publica 200 €/año para entidades sin ánimo de lucro y 400 €/año para entidades con ánimo de lucro, con aprobación de acceso por FGEE. La clasificación y las condiciones concretas aplicables a Biblioshare no están confirmadas.

## Estado de implementación y entrega pendiente

Las trece recomendaciones aceptadas se han implementado en `codex/novedades`. El contrato está en [2026-10-06-novedades-implementation.md](2026-10-06-novedades-implementation.md): lectura pública, selección personal, edición de libros, actualización de fuentes y avisos independientes con deduplicación de cambios efectivos.

Unitarios, permisos y concurrencia SQL se han verificado en base local y biblioshare-dev. Navegador R3 completó seis E2E contra build/start local a 390/1280 px, sin reintentos, con revisión independiente funcional y visual PASS. La regresión del selector internacional falla contra el build anterior y pasa contra el final. [Evidencia y límites](../testing/2026-10-06-novedades.md), incluidos los cortes FAIL conservados y las respuestas de red canceladas/incompletas sin causa clasificada. Estas comprobaciones acreditan la implementación local/dev; no acreditan entrega a usuarios.

La entrega a usuarios sigue pendiente en [#1423](https://github.com/borjar20/Biblioshare/issues/1423): publicación del código, esquema en producción y activación del scheduler después de comprobar el destino desplegado. El job de dev permanece inactivo. La autorización posterior para rama/worktree, subagentes y migraciones local/dev no incluye commit, push, PR, merge, despliegue ni datos productivos. El ticket se creó con una aprobación específica separada.
