# Backlog — Biblioshare

> **[Canónico · verificado contra prod el 2026-07-20]**

> **[Estado vivo · actualizado 2026-07-26]** Qué está hecho y qué queda. La narrativa de *cómo* se construyó cada cosa vive en `docs/superpowers/specs/` y `plans/` (historia). Aquí solo el estado + un enlace a su spec cuando exista.

> Fuente canónica: `REQUIREMENTS.md` §6 y §7. Los ficheros partidos `backlog-done.md`/`backlog-pending.md` son instantáneas más antiguas (no reflejan §7.37–§7.39 ni Sagas v2); en caso de conflicto manda §7.

## Hecho

### Base / MVP (§6)
- [x] **Perfiles** — tabla `profiles` con `username` único e `is_public`.
- [x] **Progreso unificado** — tabla `library_entries` con RLS de lectura pública según `profiles.is_public`.
- [x] **Diario de pases** — tabla `diary_entries` para relecturas/re-visionados.
- [x] **i18n** — `next-intl` sobre App Router (idioma inicial español).
- [x] **TMDB** — clave de API en variable de entorno.
- [x] **Offline de solo lectura** — service worker + estrategia de cache para PWA.
- [x] **Onboarding** — asistente de 3 pasos + bienvenida tras registrarse: intereses, primeros títulos (con **importación desde Goodreads/Letterboxd** en el mismo paso) y gente/clubes. El `username` se elige ya en el registro.
- [x] **Perfil público** `/u/[username]` con toggle público/privado.
- [x] **Capa de dominio de `position`** (JSONB por tipo) + UI de edición de rating/progreso/notas.
- [x] **UI del diario** de pases en "Mi biblioteca".
- [x] **Añadir ítem manualmente** `/buscar/manual` sin depender de la API externa.

### Catálogo y fichas
- [x] **Metadatos de libro más ricos** (§7.1) — editorial, páginas y encuadernación (esta última reemplazada luego por ediciones, §7.37).
- [x] **Búsqueda por ISBN** (§7.2) — autodetección y lookup; rehecha sobre OpenLibrary en §7.39.
- [x] **Páginas de detalle por ítem** (§7.8) — `/libro/[id]`, `/pelicula/[id]`, `/serie/[id]` con portada, metadatos condicionales y añadir a biblioteca.
- [x] **"¿Dónde lo veo?"** (§7.25) — disponibilidad en streaming vía TMDB/JustWatch en cine y series.
- [x] **Búsqueda "local primero"** (§7.32) — catálogo local + persistencia automática. *Superado por §7.39 para libros.*
- [x] **Personas** (§7.34) — fichas de autor/reparto/equipo (`people`/`credits`), enriquecimiento perezoso TMDB/Open Library.
- [x] **Registro de pases y ediciones** (§7.37) — `diary_entries` pasa a ser el "pase" (dueño de nota/reseña), `book_editions`/`movie_versions`, cronómetro persistente, comunidad agregada desde pases. Spec: `docs/superpowers/specs/2026-07-14-registro-pases-ediciones-design.md`
- [x] **Ediciones en la ficha + editor oficial** (§7.38) — la ficha muestra la edición mirada, sync de ediciones desde OpenLibrary, editor de catálogo collaborator+ (título/sinopsis/géneros/portada/ediciones/sagas). Spec: `docs/superpowers/specs/2026-07-14-ediciones-ficha-y-editor-design.md`
- [x] **Búsqueda e hidratación de libros** (§7.39) — la "escalera de tres peldaños" sobre OpenLibrary (tarjeta / ficha hidratada / géneros canónicos); la búsqueda ya no escribe en BD. Spec: `docs/superpowers/specs/2026-07-14-busqueda-e-hidratacion-de-libros-design.md`

### Biblioteca y progreso
- [x] **Perfil personalizable** (§7.9) — favoritos fijados (hasta 6) y OG image del perfil. *Estanterías nombradas: diferido.*
- [x] **Estantería "Ahora mismo"** (§7.11) — ítems `in_progress` en el home.
- [x] **Buscar y ordenar en tu biblioteca** (§7.12) — caja de texto + orden recientes/valoración/título.
- [x] **Relecturas visibles + comparativa entre pases** (§7.13) — `rereadCount` y delta contra el pase anterior.
- [x] ~~**Cola priorizada con tiempo estimado**~~ (§7.22) — **RETIRADA el 2026-07-20.** `/cola` reordenable (DnD), estimación por ritmo personal y colas múltiples nombradas se construyeron y funcionaron, pero al integrar Colección v2 la pantalla quedó **inalcanzable** (fuera de las subpestañas, sin ningún enlace a `?tab=colas`). Su único papel vivo —acotar el sorteo a un subconjunto— lo cubren ahora las colecciones `is_sorteable`. La UI está borrada; la tabla `queues` sigue en pie a la espera de su `DROP`. Ver `decisiones.md` (2026-07-20).
- [x] **Random picker** (§7.28) — "sacar un lomo" con ruleta y filtros (tipo/duración/sin empezar **y colección sorteable**). Spec/plan en `docs/superpowers/` (2026-07-17); filtro por colección añadido el 2026-07-20.
- [x] **Notas ancladas al punto de progreso** (§7.24) — captura desde la hoja de sesión y desde la ficha, con el anclaje siguiendo en vivo a la página/episodio que marcas; relectura en la ficha ordenada por posición. Spec en `docs/superpowers/specs/` (2026-07-21).
- [x] **Citas y frases destacadas, texto** (§7.27) — mismo ciclo, más el **cuaderno `/notas`**: filtros (obra, tipo, etiqueta, favoritas), búsqueda y paginación en servidor.

### Estadísticas y hábitos
- [x] **Sesiones de progreso diarias** (§7.14) — `progress_sessions` + estadísticas diarias, calendario mensual, rachas y anuales (objetivos por tipo). Dashboard privado en el home.
- [x] **Retos de lectura/visionado anuales** (§7.10) — tabla `challenges`, `/retos`, progreso al vuelo por criterio (género/saga). *(Verificado contra prod: la tabla `challenges` existe; la casilla `[ ]` de §7.10 en el monolito estaba obsoleta.)*

### Sagas
- [x] **Sagas v2** (§7.4/§7.34) — subsagas anidadas (`parent_saga_id`), multi-membresía, grafo de lectura (`saga_nodes`/`saga_edges`), editor React Flow, seguimiento (`saga_follows`), índice público `/sagas` y pestaña "Sagas" en Mi Biblioteca (5 fases + mejoras post-v2). Spec: `docs/superpowers/specs/2026-07-19-sagas-v2-design.md`
- [x] **Itinerarios de lectura** — rutas curadas con nombre (`saga_routes`/`saga_route_entries`) que sustituyen al toggle Lectura|Publicación cuando una saga tiene más de las dos rutas de siempre; adopción por lector (`saga_route_choices`) y curación (`/saga/[id]/rutas`, crear/renombrar/reordenar/borrar + editor de pasos con bloques-subsaga). Las rutas `lectura`/`publicacion` siguen **sintetizadas en código**, nunca materializadas (ver `decisiones.md`). **Migraciones solo en dev**: `20260723_saga_routes.sql` y `20260723_saga_route_entries_uniques.sql` quedan pendientes de aplicar a prod (fuera del alcance de esta rama, reservado al orquestador). Spec: `docs/superpowers/specs/2026-07-22-sagas-itinerarios-design.md`
- [x] **Rol narrativo de un miembro de saga** (issue #167) — `saga_items.role` (enum `precuela | spin_off | relato | paralela`, nullable, sin backfill): qué ES la obra dentro de esta saga, eje ORTOGONAL a `position` (que dice si tiene hueco fijo). Chip de rol en la grid de miembros de la pestaña Info (la sección dedicada "Fuera del orden principal" que tuvo al principio se fundió el 2026-07-26, ver la fila de abajo) y en el timeline del Mapa (que deja de omitir los sueltos); curación de posición y rol por miembro en `/saga/[id]/editar`. Se derogan `branchOptional`/`bridgeHint` (heurísticas que etiquetaban mal). **Migración `20260723_saga_item_role.sql` aplicada a dev y prod el 2026-07-23**, verificada contra `pg_attribute`/`pg_enum` y anexada a `schema-baseline.sql` en la misma pasada. Spec: `docs/superpowers/specs/2026-07-22-sagas-rol-narrativo-design.md`
- [x] **Orden unificado de sagas, fase 1 de 3: el progreso deja de depender del orden** — el denominador pasa de "el orden principal" a "la pertenencia" (`countedKeys`, `src/lib/sagas/progress.ts`): cuenta las obras del subárbol no marcadas `optional`, deduplicadas; `src/lib/sagas/main-order.ts` se queda solo con la ordenación para pintar. `saga_items` gana `placement` (enum `saga_placement`: `fijo | libre`, nullable = sin clasificar) y `optional` (boolean) — dos ejes ORTOGONALES entre sí y con `role` (#167): `placement` dice DÓNDE se lee, `optional` dice SI cuenta; una obra puede ser libre y contar, o fija y no contar. Mismos tres atributos en `sagas.position_in_parent`/`placement_in_parent`/`optional_in_parent` para el bloque-subsaga dentro de su padre (**sin UI todavía**, solo por SQL). Curación de `placement`/`optional` por miembro en `/saga/[id]/editar`; la ficha gana la sección "Cuando quieras" (lo `libre`), un chip "opcional" y un aviso de deuda de curación para `collaborator+`; la sección "Fuera del orden principal" de la PR #189 se funde en la grid del grupo y desaparece. **Migraciones `20260725_saga_placement.sql`/`20260725_saga_placement_blocks.sql` SOLO en dev, deliberadamente**: el CHECK nuevo rompe `assignItemToSaga` (issue #188), y el arreglo de ese formulario es trabajo de la fase 2, que aplica ambas migraciones a prod al empezar. **Fases 2 (arreglo de `assignItemToSaga` + despliegue a prod) y 3 (editor único de secuencia, `saga_placement_windows`, tándem #168, retirada de `saga_nodes`/`saga_edges`) siguen abiertas.** Spec: `docs/superpowers/specs/2026-07-25-sagas-orden-unificado-design.md`

### Series por episodio
- [x] **Información y puntuación por episodio** (§7.36) — `series_episodes` + `episode_watches`, pestaña Episodios (rejilla comunidad / lista), marcar visto adelanta el progreso.

### Social (EPIC-05)
- [x] **Grafo social + feed** (EPIC-05 Bloques A y C) — seguir usuarios (`follows`, público=accept directo / privado=pendiente), `can_view_profile()`, feed on-read. *(Verificado contra prod: la tabla `follows` existe; la línea "pendiente" de §7.15 en el monolito estaba obsoleta.)*
- [x] **Notificaciones in-app** (EPIC-05 Bloque D) — tabla `notifications` + `NotificationBell`, sin push (push diferido, E5.D4).
- [x] **Eventos de club** — quinto `kind` de `club_activities` (`evento`): fecha señalada por moderador+, no participativa, sin ficha propia; grupo "Fechas señaladas" en la lista de actividades. Migraciones aplicadas en dev y prod. Spec: `docs/superpowers/specs/2026-07-22-club-eventos-design.md`
- [x] **Calendario de club** — vista `/club/[slug]/calendario` (rejilla del mes + agenda) que funde hitos, eventos e inicio/cierre de actividad en una sola línea de tiempo; ranura "Calendario" en el rail de PC entre Actividades y Miembros. El bloque "Próximas fechas" del resumen del club se funde con "Próximos hitos" en una sola tira "Próximo" que enlaza al calendario. Sin migración. Spec: `docs/superpowers/specs/2026-07-22-club-calendario-design.md`

### Importación
- [x] **Importar biblioteca** (§7.7) — `/importar` desde Goodreads (CSV) y Letterboxd (`diary.csv`); matching contra catálogo/APIs, idempotente, resolución manual gateada a collaborator+. También accesible **desde el paso 2 del onboarding**, donde las filas sin match se encolan solas. **Bookmory (`.xlsx`) se retiró el 2026-07-20** y con él la dependencia `exceljs`.

### PWA / nativo
- [x] **PWA instalable + offline de lectura** (§6) — manifest, iconos, service worker.
- [x] **Escanear código de barras por ISBN** (§7.3) — botón de cámara solo en wrapper Capacitor (`@capacitor-mlkit/barcode-scanning`). *Pendiente verificar en dispositivo real.*
- [x] **Capacitor: configuración + scaffolding Android** (§7.31) — `capacitor.config.ts` con `server.url`, proyecto Gradle Android. *iOS y build/test en dispositivo real siguen pendientes (ver Pendiente).*

### RBAC
- [x] **Roles usuario / colaborador / administrador** (§7.35) — enum `user_role`, trigger anti-escalada, gateo de contribución manual, página `/admin`.

## Pendiente

### Biblioteca y colecciones
- [ ] **Colecciones/listas curadas por el usuario** (§7.4) — privadas, distintas de las sagas. Depende de 7.15/7.26.
- [ ] **Etiquetas privadas + estadísticas por etiqueta** (§7.5) — M. Base para 7.23.
- [ ] **Listas curadas y colecciones temáticas** (§7.15) — ver 7.4 y 7.26.

### Estados, progreso y ejemplar
- [ ] **Modo "en pausa"** (§7.16) — S-M. Estado `paused` explícito; §8-A resuelto.
- [ ] **Método de adquisición y "dinero ahorrado"** (§7.29) — S-M. Va en `library_entries.copy_details`; §8-C resuelto.
- [ ] **Modo sin spoilers global** (§7.30) — M. Utilidad spoiler-safe compartida; §8-E.
- [ ] **Citas y frases destacadas, OCR** (§7.27) — M. Texto ya construido (ver Hecho); el OCR sigue sin abordarse.

### Estadísticas y retos
- [ ] **Diario emocional/contextual** (§7.18) — M. Estado de ánimo/compañía/ubicación sobre `diary_entries`.
- [ ] **Retos personalizables** (§7.23) — L. Motor de filtros compartido; depende de 7.5 y 7.12.
- [ ] **"Tu año en Biblioshare"** (§7.15) — recap anual compartible tipo Wrapped.
- [ ] **Estadísticas y gráficos de hábitos generales** (§7.15).
- [ ] **Comparar bibliotecas entre dos perfiles** (§7.15) — solape de ítems, social ligera.

### Social y clubes (EPIC-05)
- [ ] **Clubs con hitos anti-spoiler** (§7.20) — L. EPIC-05 Bloque H; necesita base de usuarios; §8-E.
- [ ] **Listas colaborativas** (§7.26) — M. EPIC-05 Bloque I; requiere modelo de permisos.

### Descubrimiento y recomendación
- [ ] **Seguir editoriales y ver sus novedades** (§7.6) — M. Riesgo de datos sin resolver (no hay feed fiable de novedades).
- [ ] **Comparador de adaptaciones** (libro ↔ película/serie) (§7.21) — M-L. §8-B resuelto (tabla de relaciones).
- [ ] **Recomendaciones cruzadas entre formatos** (§7.19) — XL. §8-B + normalización de géneros (abierta).

### Notificaciones y nativo
- [ ] **Recordatorios** (pausas antiguas y estrenos que sigues) (§7.17) — M-L. Depende de 7.31 (Capacitor) + §8-D.
- [ ] **Capacitor iOS** (§7.31) — requiere macOS/Xcode o runner CI en la nube.
- [ ] **Capacitor: compilar y probar en Android real** (§7.31) — bloqueado por falta de Android Studio/JDK.

### Infraestructura futura
- [ ] **Offline-first completo** (§7.15) — edición sin conexión + sincronización posterior.
- [ ] **Integración con más fuentes** (§7.15) — videojuegos (IGDB), música, etc.

## Priorización sugerida (no vinculante)

Orden propuesto combinando esfuerzo, valor y dependencias (tabla de §7.33, sin las filas ya hechas).

| Idea | Esfuerzo | Depende de | Por qué este orden |
|---|---|---|---|
| **7.31 Adoptar Capacitor** | **S-M** | **§8-F (decidido)** | **En curso — falta compilar/probar en Android real; scaffolding y 7.3/7.32 ya construidos sobre esta base** |
| 7.16 Modo "en pausa" | S-M | §8-A (resuelto) | Cierra un hueco real del modelo de estados, ya sin decisión pendiente |
| 7.5 Etiquetas privadas | M | — | Base para 7.23 (retos) y estadísticas por etiqueta |
| 7.4 Colecciones curadas por usuario | S-M | 7.15/7.26 | La parte de **sagas** ya está hecha; queda solo la colección/lista privada del usuario |
| 7.29 Método de adquisición / dinero ahorrado | S-M | §8-C (resuelto) | Ya decidido: va en `copy_details`, separado de `position` |
| 7.6 Seguir editoriales | M | Riesgo de datos sin resolver | No comprometer hasta validar que hay fuente fiable de novedades |
| 7.17 Recordatorios (pausas/estrenos) | M-L | 7.31 (Capacitor) + §8-D | Push nativo vía Capacitor para iOS+UE; Web Push + pg_cron para el resto |
| 7.18 Diario emocional/contextual | M | — | Enriquece 7.15 ("Tu año en Biblioshare") antes de construir esa retrospectiva |
| 7.27 Citas y frases destacadas, OCR | M | — | Texto simple ya construido (ver Hecho); el OCR queda como fase aparte |
| 7.23 Retos personalizables | L | 7.5, 7.12 | Motor de filtros compartido — construir después de esos dos |
| 7.30 Modo sin spoilers global | M | §8-E (enfoque confirmado) | Vale la pena como utilidad compartida, no antes de tener 1–2 consumidores reales |
| 7.21 Comparador de adaptaciones | M-L | §8-B (resuelto) | Diferenciador fuerte; ya tiene modelo de relaciones definido |
| 7.26 Listas colaborativas | M | 7.4/7.15, modelo de permisos | Construir primero la versión de un solo dueño |
| 7.20 Clubs con hitos anti-spoiler | L | Base de usuarios, §8-E | Necesita masa crítica para tener sentido |
| 7.19 Recomendaciones cruzadas | XL | §8-B (resuelto) + normalización géneros (abierta) | El más caro; empezar solo con tabla curada a mano si se aborda |
