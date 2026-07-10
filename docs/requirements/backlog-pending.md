# Backlog v2 — pendiente

> Parte de [Requisitos y alcance](../REQUIREMENTS.md). Subconjunto **pendiente** de la sección §7.
>
> **Candidatas, no compromisos firmes**: no hay fecha ni orden asignado salvo que se diga explícitamente. Formato checklist para seguimiento; se marca `[x]` (y se mueve a [backlog-done.md](./backlog-done.md)) solo cuando se implementa de verdad. La numeración sigue el esquema canónico de §7, así que es **no contigua** a propósito (los números ya hechos viven en el otro fichero). La [tabla de priorización](#7-33-resumen-de-priorización-sugerida) al final propone un orden.

## 7.5 Etiquetas privadas + estadísticas por etiqueta
- [ ] Etiquetas libres y **privadas** por usuario sobre sus ítems (ej. "para regalar", "recomendado por mamá", "confort") — no son públicas ni compartidas entre usuarios, a diferencia del catálogo.
- [ ] Panel de estadísticas agrupadas por etiqueta (depende de lo anterior).

## 7.6 Seguir editoriales y ver sus novedades
- [ ] Seguir editoriales y recibir sus **novedades / próximos lanzamientos**.
  - Depende de capturar la **editorial** en el catálogo (7.1).
  - **Riesgo técnico a investigar**: las APIs actuales (Google Books) no exponen un feed fiable de "novedades por editorial" — evaluar la fuente de datos antes de comprometerlo.

## 7.15 Otras ideas sin desarrollar todavía
- [ ] "Tu año en Biblioshare" — resumen anual compartible (estilo Spotify Wrapped), versión concreta de las estadísticas generales.
- [ ] Comparar bibliotecas entre dos perfiles (solape de ítems) — vía social ligera sin construir seguidores completos.
- [ ] Sistema de seguidores + feed de actividad.
- [ ] Estadísticas y gráficos de hábitos generales (ítems por tipo/estado, actividad del diario por mes).
- [ ] Offline-first completo (edición sin conexión + sincronización posterior).
- [ ] Listas curadas y colecciones temáticas — ver 7.4 (sagas/colecciones personales) y 7.26 (versión colaborativa/multi-usuario).
- [ ] Integración con más fuentes (videojuegos vía IGDB, música, etc.) — encaja con la idea original de "biblioteca de tus hobbies".

## 7.16 Modo "en pausa"
- [ ] Estado intermedio entre "en curso" y "abandonado", con recordatorio configurable (ej. a los 30/60/90 días) para retomar o cerrar. Ver también 7.17 (infraestructura de notificaciones, compartida).
  - **Decidido** (ver §8-A): `paused` es un estado explícito nuevo en `media_status` (`planned | in_progress | paused | completed | dropped`) — barato de migrar (`ALTER TYPE ... ADD VALUE`), evita heurísticas frágiles de inactividad. La señal de inactividad (vía 7.14) se usa solo para **sugerir** el cambio como una notificación (7.17), nunca para aplicarlo sola.
  - Al pausar, guardar opcionalmente el punto de progreso (ya existe vía `position`) — no hace falta un campo nuevo, solo el estado.
  - Transición a "abandonado" conserva el histórico (ya es así: nunca se borra `position`/`diary_entries` al cambiar de estado).

## 7.17 Recordatorios (pausas antiguas y estrenos que sigues)
- [ ] Notificación cuando: (a) un ítem lleva mucho en "pausa" (7.16) sin retomarse, o (b) sale la nueva temporada de una serie que sigues, o la adaptación de un libro que leíste.
  - **Primera pieza de infraestructura de notificaciones del proyecto** — no existe hoy nada de esto (ni email, ni push, ni jobs programados). Ver §8 (Decisiones de arquitectura) antes de empezar cualquiera de las dos, porque comparten la misma base y solo tiene sentido construirla una vez.
  - **Depende de 7.31** (adopción de Capacitor, en curso): push nativo (APNs) para usuarios iOS en la UE, donde Web Push no funciona (ver §8-F); Web Push normal para Android/desktop.
  - "Estrenos que sigues" necesita además saber si una serie/libro sigue activo (temporada en emisión, secuela anunciada) — dato que ni TMDB ni Google Books garantizan de forma fiable; evaluar viabilidad antes de comprometer esta parte.

## 7.18 Diario emocional/contextual
- [ ] Campos opcionales al registrar un pase en el diario: estado de ánimo (selector cerrado de 6–10 opciones, no texto libre — para poder agregarlo en estadísticas), compañía (solo/pareja/amigos/familia/otro), ubicación libre, nota.
  - Extiende `diary_entries` (ya tiene `rating`, `review`) con estos campos nuevos — encaja de forma natural, es la misma tabla y el mismo momento de registro.
  - **Privados por defecto**, con toggle explícito para hacerlos públicos — mismo patrón de `profiles.is_public` ya establecido, pero a nivel de campo/pase en vez de perfil completo.
  - Alimenta "Tu año en Biblioshare" (7.15) con datos más ricos (mood dominante, compañía más frecuente) — construir esto antes ayuda a que esa retrospectiva sea mejor desde el principio.

## 7.19 Recomendaciones cruzadas entre formatos
- [ ] "Si te gustó la serie X, lee el libro Y" — recomendaciones basadas en atributos compartidos (género, temas, tono), con explicación visible y opción de descartar.
  - Esfuerzo alto (XL) y depende de tener géneros/temas normalizados entre fuentes — ver §8 (normalización de géneros). Sin eso, no hay señal fiable de qué es "similar".
  - **MVP realista de esta idea**: tabla curada a mano de equivalencias famosas (adaptaciones conocidas) en vez de un motor de embeddings desde el día uno. Solo merece la pena automatizarlo con más usuarios y más datos de consumo.

## 7.20 Clubs de lectura/visionado con hitos anti-spoiler
- [ ] Grupos con checkpoints ("hasta el capítulo 10") cuyos hilos de discusión se desbloquean según el progreso registrado de cada miembro, con opción manual de "ya llegué aquí".
  - Necesita funcionalidad social real (grupos, roles, moderación) que hoy no existe — de las ideas nuevas, la que más se apoya en tener ya una base de usuarios activa para tener sentido.
  - Reutiliza el sistema de progreso existente (`position`) y comparte con 7.24/7.21/7.30 la necesidad de un mecanismo genérico de "ocultar contenido hasta que el progreso lo permita" (ver §8).

## 7.21 Comparador de adaptaciones (libro ↔ película/serie)
- [ ] Ficha comparativa entre una obra y su adaptación: portadas, ratings medios lado a lado, y voto de la comunidad ("¿cuál es mejor?") habilitado solo para quien terminó ambos.
  - **Requiere un tipo de dato que hoy no existe**: relación entre ítems de catálogo de *tipos distintos* (`books` ↔ `movies`/`series`). **Decidido** (ver §8-B): tabla genérica de relaciones, curada manualmente/por la comunidad — no inferida automáticamente de las APIs. 7.19 (recomendaciones) comparte el mismo mecanismo.
  - Las APIs actuales no siempre exponen esta relación de forma fiable (Wikidata es mejor fuente que TMDB/Google Books para esto) — contribución comunitaria editable, con cola de revisión, es probablemente necesaria tarde o temprano.

## 7.23 Retos personalizables (ampliación de 7.10)
- [ ] Más allá del objetivo simple anual (7.10): retos con **filtros** (género, autor/director, país, etiqueta, periodo), progreso automático al registrar ítems que cumplen el filtro, retos públicos clonables por otros usuarios, y tarjeta de progreso exportable.
  - Reutilizaría el mismo motor de filtros que "Mi biblioteca" (7.12) y las etiquetas (7.5) en vez de construir uno nuevo — buen momento para diseñar ambos pensando en que un tercer consumidor (retos) también los va a necesitar.
  - Criterios como "autoras" o "nacionalidad del autor/a" no los da ninguna API — requeriría etiquetado manual/comunitario, no asumirlo como dato disponible.

## 7.24 Notas ancladas al punto de progreso
- [ ] Notas privadas mientras consumes un ítem, ancladas al capítulo/minuto/episodio actual, con vista de "línea de tiempo" al terminar (para ver cómo evolucionaron tus teorías) y opción de publicar una nota suelta como reseña con aviso de spoiler.
  - Distinto de `notes` (campo único de texto libre que ya existe en `library_entries`) y de `diary_entries.review` (una reseña por pase): esto es **una lista de notas con timestamp/punto de progreso propio** — necesitaría su propia tabla si se construye (`entry_notes`: `library_entry_id`, `progress_point` jsonb, `body`, `created_at`), no encaja en los campos actuales sin perder la ordenación.
  - Comparte con 7.20/7.21/7.30 la necesidad de una utilidad genérica de "spoiler-safe" — ver §8.

## 7.26 Listas colaborativas
- [ ] Listas editables entre varios usuarios (ej. "películas para el maratón de Halloween").
  - Amplía la idea ya registrada de "listas curadas" (7.15) al caso multi-usuario — requiere modelo de permisos (quién puede añadir/quitar) que hoy no existe en ningún sitio del proyecto. Construir primero la versión de un solo dueño (7.15/7.4) y solo dar el salto a colaborativa si hay demanda, es más barato que empezar directamente por la versión multi-usuario.

## 7.27 Citas y frases destacadas
- [ ] Guardar citas/frases de un libro ancladas al ítem, con opción de foto+OCR y exportables como tarjetas visuales para compartir.
  - Versión ampliada de la idea ya apuntada en el backlog general — el OCR y la exportación como imagen son lo nuevo; el guardado simple de texto es barato, OCR es una pieza aparte (servicio externo o librería cliente) a evaluar aparte si se llega a esta idea.

## 7.28 Random picker ("no sé qué ver/leer")
- [ ] Botón que elige al azar un ítem de tu lista de pendientes, con filtros opcionales (ej. "tengo 2 horas" usando `duration_minutes`/`total_pages`/ritmo personal de 7.22).
  - Idea barata y autocontenida: no requiere esquema nuevo, solo una query aleatoria sobre `library_entries` con status `planned` filtrada por los metadatos que ya existen (o existirán tras 7.8/7.1).

## 7.29 Método de adquisición y "dinero ahorrado"
- [ ] Marcar cómo obtuviste cada ítem (comprado / biblioteca / prestado / regalo) y, si se compró, su precio — para poder mostrar una estadística de "dinero ahorrado" con préstamos/biblioteca.
  - Mismo patrón que la encuadernación de 7.1: es un dato **de Ejemplar**, no de Obra ni de Progreso (ver §8-C, decidido) → va en `library_entries.copy_details` (JSONB propio, separado de `position`), no en el catálogo ni mezclado con el progreso.

## 7.30 Modo sin spoilers global
- [ ] Difuminar sinopsis, duración de episodios restantes y temporadas pendientes de lo que estás viendo/leyendo actualmente.
  - Comparte necesidad con 7.20 (clubs), 7.21 (comparador) y 7.24 (notas ancladas): un mecanismo genérico de "ocultar contenido según el progreso/estado del usuario" — ver §8. Construir esta utilidad una sola vez cuando se aborde la primera de las cuatro, en vez de resolver el spoiler-hiding cuatro veces distintas.

## 7.31 Adoptar Capacitor (wrapper nativo) — *en curso*
- [x] Instalar `@capacitor/core` + `@capacitor/cli` + `@capacitor/android`, `capacitor.config.ts` apuntando `server.url` a la app desplegada en Vercel (sin tocar el código Next.js existente — SSR y Server Actions siguen funcionando igual).
- [x] Scaffolding de la plataforma **Android** (proyecto Gradle generado y comiteado). Plugin `@capacitor-mlkit/barcode-scanning` instalado y sincronizado (usado por 7.3).
- [ ] Plataforma **iOS**: solo se puede compilar/probar desde macOS (Xcode) o un runner de CI en la nube — no alcanzable desde Windows. Queda pendiente hasta disponer de esa vía.
- [ ] **Compilar y probar en un dispositivo/emulador Android real** — sigue bloqueado por falta de Android Studio/JDK en esta máquina (ver `docs/TESTING.md`). Todo lo anterior es configuración verificada por `tsc`/`eslint`, no ejecución real en el wrapper nativo.
- Decidido en §8-F como prerrequisito de 7.17 (notificaciones) — ver ahí el razonamiento completo.

## 7.33 Resumen de priorización sugerida

No vinculante — orden propuesto combinando esfuerzo, valor y dependencias, para decidir por dónde seguir. Todo lo ya hecho queda fuera de esta tabla (ver [backlog-done.md](./backlog-done.md)).

| Idea | Esfuerzo | Depende de | Por qué este orden |
|---|---|---|---|
| **7.31 Adoptar Capacitor** | **S-M** | **§8-F (decidido)** | **En curso — falta compilar/probar en Android real; scaffolding y 7.3/7.32 ya construidos sobre esta base** |
| 7.16 Modo "en pausa" | S-M | §8-A (resuelto) | Cierra un hueco real del modelo de estados, ya sin decisión pendiente |
| 7.5 Etiquetas privadas | M | — | Base para 7.23 (retos) y estadísticas por etiqueta |
| 7.4 Colecciones curadas por usuario | S-M | 7.15/7.26 | La parte de **sagas** ya está hecha (7.34, tabla dedicada); queda solo la colección/lista privada del usuario |
| 7.29 Método de adquisición / dinero ahorrado | S-M | §8-C (resuelto) | Ya decidido: va en `copy_details`, separado de `position` |
| 7.6 Seguir editoriales | M | Riesgo de datos sin resolver | No comprometer hasta validar que hay fuente fiable de novedades |
| 7.17 Recordatorios (pausas/estrenos) | M-L | 7.31 (Capacitor) + §8-D | Push nativo vía Capacitor para iOS+UE; Web Push + pg_cron para el resto |
| 7.18 Diario emocional/contextual | M | — | Enriquece 7.15 ("Tu año en Biblioshare") antes de construir esa retrospectiva |
| 7.27 Citas y frases destacadas | S (texto) / M (OCR) | — | Empezar por texto simple; OCR es una fase aparte |
| 7.23 Retos personalizables | L | 7.5, 7.12 | Motor de filtros compartido — construir después de esos dos |
| 7.30 Modo sin spoilers global | M | §8-E (enfoque confirmado) | Vale la pena como utilidad compartida, no antes de tener 1–2 consumidores reales |
| 7.21 Comparador de adaptaciones | M-L | §8-B (resuelto) | Diferenciador fuerte; ya tiene modelo de relaciones definido |
| 7.26 Listas colaborativas | M | 7.4/7.15, modelo de permisos | Construir primero la versión de un solo dueño |
| 7.20 Clubs con hitos anti-spoiler | L | Base de usuarios, §8-E | Necesita masa crítica para tener sentido |
| 7.24 Notas ancladas al progreso | M | §8-E | Tabla nueva; valor real pero no urgente |
| 7.19 Recomendaciones cruzadas | XL | §8-B (resuelto) + normalización géneros (abierta) | El más caro; empezar solo con tabla curada a mano si se aborda |
| 7.28 Random picker | S | 7.1/7.8 (metadatos) | Barato y autocontenido, pero aplazado a propósito para el final — decisión explícita, no por dependencias |

> Nota: 7.8, 7.25 y 7.32 estaban en la tabla original como próximos pasos y ya están **hechos** — se han retirado de aquí y viven en [backlog-done.md](./backlog-done.md).
