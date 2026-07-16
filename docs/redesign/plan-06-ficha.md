# Fidelidad Paper · 06 — Ficha de título

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

> ⚠️ **La maqueta se ACTUALIZÓ el 2026-07-16 (12 frames, antes 7).** Lo escrito antes de esa fecha en §2 sigue valiendo para móvil, pero la distribución de Info cambió y **ahora hay vista de PC de verdad** (§2bis), que sustituye al "diseño propio a proponer" del §2.24 original. Si vienes de la versión vieja, lee §2bis y §4 antes de nada.

**Maquetas de referencia**
- `Paper - Ficha de título completa.html` → **móvil**: **1 · Libro Info**, **2 · Comunidad**, **3 · Registro (pase activo)**, **4 · Serie Episodios**, **5 · Película Info**, **6 · Moderador Editar ficha**, **7 · Registro — elegir edición**. **PC**: **8 · Libro Info**, **9 · Libro Comunidad**, **10 · Libro Registro**, **11 · Serie Episodios**, **12 · Película Info**.
- `Paper - Episodios rejilla.html` → rejilla de episodios (mías/comunidad, escala cálida)
- `Paper - Registrar sesión.html` → hojas modales de sesión (ver §3-P4)

**Objetivo:** afinar la pantalla más importante de la app. Toda la funcionalidad existe (`info-panel`, `community-panel`, `log-panel` + pases, `edition-strip`, `catalog-editor` de moderador, `episode-*`), así que en móvil es trabajo de detalle visual. **En PC no**: el layout ancho es una estructura nueva (§2bis) y ahí sí hay construcción.

> ⚠️ Coordinación: el **pase-hub** (spec en PR #42: `passes` absorbe estado/cursor/cola y `library_entries` muere) y **PR #32** (pase dueño de nota/reseña, migraciones solo en dev) tocan el corazón del Registro. Antes de restylear el Registro, comprobar el estado de esos PRs para no maquillar código que va a cambiar de forma.

---

## 1. Estado actual

| Frame | Componentes |
|---|---|
| Hero (todos) | `src/components/detail/item-hero.tsx` — backdrop difuminado ✔, portada con borde por tipo ✔, badge + géneros ✔, nota media, statusSlot |
| Pestañas | `src/components/detail/item-detail-tabs.tsx` — Info/(Episodios)/Comunidad/Registro, mono uppercase con acento por tipo |
| 1 Info | `detail/info-panel.tsx`, `detail/saga-strip.tsx`, `detail/edition-strip.tsx`, `detail/edition-details.tsx`, `detail/metadata-sidebar.tsx` |
| 2 Comunidad | `detail/community-panel.tsx` |
| 3 Registro | `detail/log-panel.tsx`, `detail/status-segments.tsx`, `detail/pass-diary.tsx`, `detail/close-pass-sheet.tsx`, `src/components/session-list.tsx` |
| 4 Episodios | `detail/episode-panel.tsx`, `episode-grid.tsx`, `episode-list.tsx`, `episode-rating.tsx` |
| 5 Película | `src/components/credits-section.tsx`, `src/components/watch-providers.tsx` |
| 6 Moderador | `detail/catalog-editor.tsx` |
| 7 Elegir edición | selector de edición en el flujo de pases (PR #33: elección al seguir, ficha sin bloqueo) |

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

### Hero (afecta a los tres tipos)
1. **Título en serif** — Maqueta `.hero-title`: **Fraunces 600 25px, line-height 1.05**. Actual (`item-hero.tsx:99`): `text-3xl font-semibold tracking-tight` sin `font-serif`. Añadirlo.
2. **Barra superior del hero** — Maqueta: volver (ibtn con blur) + **label del tipo en mono uppercase teñido, centrado** + botón ⋯, superpuestos al backdrop. Actual: solo BackButton. Añadir el label centrado (el ⋯ solo si existe menú; si no, dejar hueco simétrico).
3. **Byline en mono** — Maqueta `.hero-byline`: mono 11px muted ("Patrick Rothfuss · 2007"). Actual ✔ (`font-mono text-xs`). Verificar contenido por tipo: película = "Director · año · duración" (frame 5), serie = creador/cadena.
4. **Píldora de estado bajo el hero** — Maqueta `.hero-status`: píldora surface con dot del estado ("En tu biblioteca · Leyendo"). Verificar que el `statusSlot` actual pinte ese formato.
5. **Portada** — Maqueta: 116×174, radio 6px, borde **2px sólido del acento** (no soft). Actual: `border-2 accent.borderSoft` w-32. Endurecer el borde (`accent.border`) y comparar tamaño.

### Pestañas
6. Maqueta `.tab`: **sans (Geist) 13.5px semibold**, subrayado 2px del acento, sticky con blur sobre el fondo. Actual: **mono uppercase 12px**. Este caso no es el debate serif/mono de las subtabs (aquí la maqueta es sans): alinear a sans semibold + sticky (`sticky top-0 backdrop-blur`) salvo que en P-T2 (transversal) se decida unificar todas las pestañas en mono.

### Frame 1 · Info (libro)
7. **Fila moderador** — chips `mod-pill` ("Moderador" gold + "Editar ficha ✎" teñido de acento) encima del contenido, solo para moderadores. Verificar el punto de entrada actual a `catalog-editor.tsx` y darle este formato.
8. **Sagas** — selector de saga (`saga-sel`, píldoras teñidas al activarse) + nombre con posición ("· nº 1 de 3") + tira 66px con actual marcado (outline del acento + ojo ◉). `saga-strip.tsx` existe: verificar outline+ojo y el label mono 9px bajo cada portada.
9. **Ediciones** — tira horizontal `edn` (150px, tag mono del formato, nombre, metadatos mono 9.5px, la tuya marcada con borde del acento y ✓) + tile "+ Añadir edición" discontinuo. `edition-strip.tsx` es reciente (PR #21–33); comparar 1:1.
10. **Sinopsis y metadatos** — "Sinopsis" en `serifh` (Fraunces 17px); tabla `meta` con filas clave/valor (clave muted, valor semibold derecha). `metadata-sidebar.tsx` ✔; verificar tamaños (13px, padding 11×15).

### Frame 2 · Comunidad
11. **Tarjeta resumen** — nota grande Fraunces 42px teñida + estrellas gold + votos mono, con **histograma 5★→1★** al lado (tracks 7px gold). Verificar `community-panel.tsx`.
12. **Reseñas** — separadas por `border-top` (no tarjetas), avatar 34, nombre 13 semibold, fecha mono, **estrellas gold a la derecha de la cabecera**, texto 13.5/1.6 `#584f43`, reacciones ♥/❝. Nota: aquí la maqueta usa ★ gold, no dots — ver §3-P1.

### Frame 3 · Registro
13. **Cabecera del pase** — `pase-hd`: eyebrow mono "PASE ACTIVO" + "3.ª lectura" en Fraunces 16px, botón "+ Nuevo pase" mono outline teñido. Verificar `log-panel.tsx`.
14. **Selector de estado** — `seg`: segmented de 4 opciones con dot de color de estado, activa sobre surface con sombrita. `status-segments.tsx` existe; comparar.
15. **Barra de progreso con cursor** — track 12px con relleno degradado `st-progress`, **pin en forma de gota** (14px, rotado, borde blanco) en la posición actual, extremos mono ("pág. 0 / **pág. 240** · 36% · este pase / pág. 662") y `closehint` verde del cierre automático ("Al registrar una sesión que llegue a la pág. 662…"). Pieza muy característica — probablemente la mayor distancia visual del Registro actual.
16. **Panel Progreso plegable** — nota como `rate-pick` (5 casillas ★, activas rellenas del acento), página actual, formato. Ver §3-P1 (escala).
17. **Sesiones** — línea de edición en mono ("Edición: Plaza & Janés · tapa dura") + filas `sess` con dot, rango "p. 180 → 240 · 45 min" y fecha mono a la derecha. `session-list.tsx`: comparar.
18. **Diario de pases** — tarjetas `diary-entry` sobre `surface-2` con dots de nota, **delta verde "▲ +1★ vs. anterior"**, fecha "2ª lectura · 12 mar 2026" y texto; pases antiguos con `opacity .8`. `pass-diary.tsx`: comparar (el delta puede no existir → calcularlo con la nota del pase anterior, dato ya disponible).
19. **"Quitar de mi biblioteca"** — enlace centrado en rojo `st-dropped` subrayado al final. Verificar.

### Frame 4 · Episodios (+ Episodios rejilla.html)
20. Contador "vistos" con cifra Fraunces 18px, conmutadores `ep-tg` (Rejilla/Lista y Mías/Comunidad), temporadas colapsables (`season`: título Fraunces 15, media y vistos en mono a la derecha), fila de episodio (check 22px que se rellena del acento, nº mono, título 12.5, dots 6px gold, desplegable con sinopsis y reseña). Rejilla: escala cálida Genial→Horrible, celda sin ver tenue. Comparar `episode-panel/grid/list/rating`.

### Frame 5 · Película
21. Acento teal en todo (borde, badge, tabs) ✔ vía `MEDIA_ACCENT`. Reparto `credits`: avatares 56px circulares con iniciales serif; plataformas `providers`: chips con logo 22px. Comparar `credits-section.tsx` y `watch-providers.tsx`; sin pestaña de sesiones para película (estado binario) — ya decidido en flujo de pases.

### Frame 6 · Moderador
22. `catalog-editor.tsx` contra el frame: **banner ámbar sticky** (icono gold + "Editando la ficha oficial"), portada con borde discontinuo y overlay "cambiar", título como input serif 20px, géneros como chips con ✕ + "añadir" discontinuo, metadatos en grid label/input, **barra sticky inferior** Guardar/Cancelar.

### Frame 7 · Elegir edición
23. Selector radio `edpick` (tag del formato, nombre, metadatos, páginas a la derecha; seleccionada con borde+tinte del acento), buscador `edsearch`, chip "RECOMENDADA", opción discontinua "otra edición / edición manual", y en pases nuevos la opción de **reusar la edición del pase anterior**. PR #33 tocó justo esto: comparar contra el frame y afinar.

### ~~Escritorio/tablet (layout ancho de diseño propio)~~ → OBSOLETO

24. ~~A proponer al abrir la sesión.~~ **Ya no hay nada que proponer: la maqueta trae 5 frames de PC (8–12).** Ver §2bis.

## 2bis. Vista de PC (frames 8–12, maqueta del 2026-07-16)

Adaptación **estilo Goodreads en dos columnas**. La estructura (`.desk-shell`) es **idéntica en los 5 frames**; solo cambia el cuerpo. No es "el móvil estirado": es otra pantalla.

```
topbar de la app (sticky, global — P-T1)
├────────────┬──────────────────────────────────┐
│ RAIL 300px │  cabecera (.desk-header)         │
│  (sticky)  │  ── pestañas (sticky) ───────────│
│  portada   │  cuerpo (.desk-cols)             │
│  estado ▾  │    1fr            │   340px      │
│  progreso  │                   │              │
│  + sesión  │                   │              │
│  tu nota   │                   │              │
└────────────┴──────────────────────────────────┘
```

### El rail (`.desk-rail`, 300px, `padding:34px 0 34px 40px`)

25. **Portada 256×384**, radio 8, borde 2px del acento, sombra `0 20px 40px -16px`.
26. **Estado como CONTROL desplegable** (`.desk-shelf`): pastilla sobre `surface` con dot del estado + verbo por tipo ("Leyendo"/"Viendo"/"Vista") + `▾`. **No es la píldora "En tu biblioteca ·" del móvil**: en PC esa píldora no existe.
27. **Barra de progreso** (`.desk-prog`): track de 8px con relleno degradado del estado + `pág. 240 / 662` y `36%` en mono a los lados. **Solo donde hay cursor**: el frame 12 (película) NO la lleva.
28. **CTA de acento** (`.desk-cta`): "＋ Registrar sesión" en libro, **"＋ Registrar visionado" en película** (frame 12). Copy por tipo de medio.
29. **"Tu nota"** (`.desk-userrate`): etiqueta mono + 5 estrellas pulsables. Ojo con P1: es la nota PROPIA y aquí la maqueta usa **estrellas**, no dots.
30. En PC **no hay botón de volver ni label de tipo centrado** (eso es la `.hero-top` del móvil). El badge de medio vive en la cabecera.

### La cabecera (`.desk-header`, dentro de la columna derecha)

31. Backdrop difuminado igual que el móvil, pero `height:200px`, `blur(30px)`, `opacity:.20`.
32. **Común a todas las pestañas** (frames 9 y 10 se paran aquí): `mbadge` → **saga en Fraunces itálica 17px** ("Crónica del asesino de reyes · nº 1 de 3") → **título Fraunces 600 44px**/1.02 → **byline en FRAUNCES 22px** (`#4a4238`, el año en muted) — ojo, **no es el mono de 11px del móvil** → **nota en línea**: `estrellas 22px` → `4,2` (Fraunces 26px, acento) → `1 284 votos · 312 reseñas` (mono 11px). **Sin el sufijo "/5"** que sí lleva el móvil.
33. **Solo en Info** (frame 8) la cabecera se alarga con: **sinopsis** (15.5px/1.7, `max-width:660px`), **géneros** (etiqueta mono "Géneros" + chips 13px sobre `surface-2`) y **fila de datos** (`.desk-facts`: "**662** páginas · Tapa dura · Plaza & Janés · 1.ª ed. 2007").

### Pestañas y cuerpo

34. **`.desk-tabs`**: sticky, **sobre `surface`** (no el translúcido del móvil), borde arriba y abajo, `gap:32`, texto 15px semibold, `padding:16px 0`, subrayado de 2.5px.
35. **`.desk-body`**: `padding:34px 44px 42px` y `.desk-cols` = **grid `1fr 340px`, gap 44, `align-items:start`**. Por pestaña:
    - **Info** (8): izquierda sagas (lista en `rowset` a 2 columnas) + **ediciones YA DESPLEGADAS en rejilla de 3** (en móvil siguen colapsadas); derecha "Ficha" (`meta wide`) + "Editar ficha (moderador) ✎".
    - **Comunidad** (9): izquierda reseñas a toda columna; derecha **tarjeta fija con nota media + histograma** (`.rate-card`).
    - **Registro** (10): izquierda cabecera del pase + segmented de 4 + progreso con pin + `closehint` + sesiones + diario; derecha **tarjeta "Datos del pase"** (nota, página, formato) con "+ Nuevo pase" y, debajo, "Quitar de mi biblioteca".
    - **Episodios** (11): izquierda temporadas/episodios; derecha **el detalle del episodio seleccionado se ANCLA en una tarjeta fija** en vez del desplegable inline del móvil.
    - **Película** (12): reparto en rejilla amplia + plataformas + versiones desplegadas; ficha técnica a la derecha.

### Distribución del Info MÓVIL — también cambió (frame 1)

36. **Sagas son N, no una**: `Sagas · 4` = tira de portadas de la principal (con ojo + anillo) + **lista `saga-row`** para el resto (nombre, `nº 4 de 20` en mono, chevron). Hoy `saga-strip.tsx` asume una sola.
37. **Nuevo orden del pane**: moderador → **sagas → sinopsis → ficha (`meta`) → ediciones**. Las **ediciones bajan al final** y en tono menor (`.eds.minor`). Hoy la app las pinta arriba del todo.

## 3. Divergencias funcionales / de sistema — RESUELTAS (2026-07-15)

- **P1 · DECIDIDO: híbrido de la maqueta.** **Estrellas gold /5** para agregados de comunidad (hero de ficha, histograma, reseñas ajenas — en ficha, feed, perfil y clubes) y **dots** para la nota propia 1–10 (rate-pick, diario, tarjetas propias). Norma de sistema: documentarla al aplicarla.
- **P2 · DECIDIDO: SÍ, menú ⋯ del hero** — quitar de mi biblioteca, editar ficha (solo moderador); "compartir" entrará cuando se decida (plan 01 P4 pospuesto).
- **P3 · Delta del diario: coordinación** — hacer cuando PR #32 (nota por pase) esté mergeado; confirmar orden con pase-hub (#42) al arrancar la sesión.
### Decisiones de la vista de PC (2026-07-16, tras la maqueta nueva)

- **P5 · DECIDIDO: rail sticky con scroll de página, NO scroll interno.** La maqueta monta la columna derecha con `height:680px; overflow-y:auto` y el rail fijo al lado. Se calca el EFECTO (el rail se queda quieto mientras el contenido sube) con `position:sticky`, no la técnica: el scroll interno mete dos barras, hace que la rueda dependa de dónde esté el puntero, rompe la restauración de posición y el enlace profundo, y choca con el streaming por `<Suspense>` de la Fase B. Un contenedor de 680px es cómo se maqueta un frame, no cómo se construye una página.
- **P6 · DECIDIDO: el CTA del rail enlaza al flujo de sesión que ya existe** (`/sesion/[entryId]`). Cuando P4 traiga las hojas modales con cronómetro solo cambia el destino; el rail no se toca. Así el rail nace completo sin meter una feature nueva por delante de la fidelidad.
- **P7 · El rail DUPLICA controles del Registro a propósito** — estado, progreso y nota están en los dos sitios (el frame 10 los enseña a la vez). No es un descuido de la maqueta: el rail es el panel de control siempre visible y el Registro sigue siendo la pestaña de gestión. **Implicación técnica:** dos controles del mismo estado en pantalla ⇒ tienen que compartir fuente, que es justo lo que hace `ItemStatusProvider` (PR #48). Extenderlo a progreso y nota cuando toque.
- **P8 · La topbar de la app se queda.** El frame de PC dibuja cromo de navegador y omite nuestra topbar, pero los frames de PC de las otras pantallas (p. ej. `Paper - Perfil.html` C) sí la llevan: es abreviatura del frame, no ausencia de diseño. El rail y la columna van DEBAJO de la topbar, y las pestañas se pegan bajo ella (`--topbar-h`, ver §6).
- **P4 · DECIDIDO: hojas modales sobre la ficha, CON cronómetro.** Las 5 hojas de `Paper - Registrar sesión.html` (tramo de páginas con delta, selector de temporada, **cronómetro en vivo con pausar/reiniciar que vuelca la duración** — feature nueva, no existe hoy —, sesión que completa el pase, retomar abandonado). `/sesion/[entryId]` queda como fallback deep-link. Añadir como bloque de tareas propio (probablemente su propia sesión).

## 4. Tareas — REORDENADAS el 2026-07-16 (móvil + PC juntos, pestaña a pestaña)

> **Cambio de método (decisión del usuario):** cada tarea trae **su móvil y su PC a la vez**, en vez de hacer todo el móvil y el ancho al final. Motivo: el layout de PC no es un ajuste responsive, es otra distribución (§2bis), y restylear una pestaña sin él obliga a tocarla dos veces.

**Hechas (móvil):**

1. ~~**Hero fiel** (§2.1–2.5) — `item-hero.tsx`~~ ✅ **HECHA** (PR #49, `a963d72`) — la maqueta nueva **confirma que el móvil es correcto**; el hero móvil no cambió.
2. ~~**Pestañas sans semibold sticky** (§2.6) — `item-detail-tabs.tsx`~~ ✅ **HECHA** (PR #49, `19ac1d4`). En PC las pestañas cambian de piel (§2bis.34), no de sitio.

> ⚠️ **Deuda conocida de la #49:** su escritorio (hero móvil ensanchado con `sm:`) se hizo cuando NO había frame de PC y **queda sustituido** por el rail de §2bis. Es provisional a propósito, no un descuido.

**Pendientes, en este orden:**

3. **T3 · Shell de PC + Info** (frames 1 y 8) — la primera trae el layout ancho porque lo sostiene todo:
   - `desk-shell`: grid `300px 1fr` en `lg:`, **rail sticky** (P5) bajo la topbar (P8).
   - Rail: portada 256×384, estado desplegable, progreso (salvo película), CTA (P6), "Tu nota" (§2bis.25–29).
   - Cabecera común: saga itálica, título 44px, byline serif, nota en línea (§2bis.32).
   - Info: cabecera larga (sinopsis + géneros + facts), sagas a N (§2bis.36), ediciones desplegadas en rejilla de 3 en PC / al final y en tono menor en móvil (§2bis.37), `meta` a la derecha.
   - Es la tarea más grande del plan: probablemente 2 PRs (shell+rail primero, cuerpo de Info después).
4. **T4 · Registro** (frames 3 y 10) — progreso con pin + `closehint`, cabecera de pase, seg, sesiones; en PC "Datos del pase" y "Quitar de mi biblioteca" a la derecha. Diario + delta (§2.18–2.19, tras P3).
5. **T5 · Comunidad** (frames 2 y 9) — reseñas + histograma; en PC el histograma es tarjeta lateral fija.
6. **T6 · Episodios** (frames 4 y 11) — temporadas/rejilla; en PC el detalle del episodio se ancla a la derecha.
7. **T7 · Película** (frames 5 y 12) y **Moderador** (frame 6).
8. **T8 · Elegir edición** (frame 7) y el **menú `⋯`** del hero móvil (P2, pendiente de la #49).

## 5. Verificación de cierre

- [ ] Los **12** frames lado a lado con un libro (con saga y 2+ pases), una serie (con episodios vistos) y una película (con reparto y plataformas) — **móvil Y PC**.
- [ ] Acentos por tipo correctos en hero, tabs, ediciones y episodios (ámbar/teal/ciruela).
- [ ] Cierre automático: sesión que llega al final → Completado (e2e existente del flujo de pases en verde).
- [ ] Moderador: editar ficha solo visible con rol; guardar/cancelar funcionan.
- [ ] Modo oscuro (Ficha está en Paper - Modo oscuro.html).
- [ ] `npx playwright test` verde (Node 22).
- [ ] P1–P8 respondidas y registradas.
- [ ] En PC: el rail se queda quieto al scrollear y las pestañas se pegan bajo la topbar (P5/P8); el rail y el Registro no se contradicen al cambiar de estado (P7).

## 6. Hallazgos de ejecución (T1 + T2, PR #49 · 2026-07-16)

### Lo que hubo que decidir sobre la marcha

- **La píldora de estado del hero lleva el verbo POR TIPO, no el genérico.** La maqueta escribe "En tu biblioteca · Leyendo" en el frame del libro y "· Viendo" en el de la serie, igual que los pills de `StatusSegments`. El badge pintaba el genérico ("En curso", "Completado") y había incluso un e2e que lo daba por bueno con un comentario explícito. Se alineó con la maqueta: **"En curso" y "Completado" ya no existen en la píldora** (son "Leyendo"/"Viendo" y "Leído"/"Vista"); "Pendiente" y "Abandonado" siguen igual, que no tienen verbo propio. El prefijo "En tu biblioteca" es clave nueva (`detail.inLibrary`), y las 4 etiquetas las compone `lib/library/hero-status-labels.ts` **en el servidor** — así la isla de cliente del badge (#48) sigue sin arrastrar i18n, y las 3 fichas no triplican la composición.
- **El `⋯` del hero no entró.** P2 lo aprueba, pero necesita menú de verdad (quitar de biblioteca + editar ficha de moderador) y ambas acciones tienen hoy su sitio en Registro/Info; además §2.19 mantiene el enlace rojo de "quitar" al final del Registro, así que el `⋯` sería un segundo punto de entrada. Queda como tarea propia. Mientras tanto, hueco simétrico de 34px para que el label del tipo quede centrado de verdad.
- **`--topbar-h` (nuevo token de layout).** Las pestañas son sticky (§2.6) y la topbar también, así que las pestañas necesitan saber dónde acaba: `sticky top-[var(--topbar-h)]`. Para que esa constante no pueda quedarse obsoleta, **la topbar deja de crecer con su contenido** y se fija a `h-[var(--topbar-h)]` (59px = avatar de 34 + padding + borde). Efecto colateral: en móvil la topbar crece ~2px, porque ahí el elemento más alto es más bajo que el avatar. Toca `header.tsx`, que es del plan 07 — mínimo y documentado en ambos sitios.

### Detalles menores

- **El hero pierde su `border-b`**: la línea la pone ahora la barra de pestañas sticky, y dos bordes seguidos se veían doble.
- **Radio de la portada del hero: 6px literal**, no `--radius-cover` (10px). El token es correcto para el resto de portadas de la app; el frame del hero pide 6.
- **Los géneros del hero NO se tocaron.** El `.g` de la maqueta (10.5px, sans, sin borde, `#6a604f`) no coincide con `GenreTag` (mono uppercase con borde), pero §2 no lo lista como diferencia y `GenreTag` es transversal. Si se quiere alinear, es decisión de sistema → plan 07.
- **Las estrellas del hero funcionan con `StarRating` tal cual** (recibe 1–10 y convierte por dentro) + `formatStars` para el "4,5". Es un componente cliente: el hero deja de ser 100% servidor por esa isla, cosa asumible.

### Verificación

Suite e2e completa **21/21 sin reintentos** (la línea base tras #47 era 20 + 1 flaky). Los 3 fallos que salieron por el camino eran **consecuencias reales del cambio de copy**, no flakiness — se distinguen del ruido del entorno porque fallaban SIEMPRE, en el mismo assert, y no se movían de sitio (la señal contraria a la de la #47). Comprobado en navegador a 390 y 1280, claro y oscuro, con la barra pegada tras scroll, y la nota en estrellas contra una obra puntuada de dev.

**Ojo con `npx next build`:** falla en `main` y en cualquier rama por `rimraf` no resoluble desde `exceljs` (cadena `parse-bookmory` → `exceljs` → `unzipper` → `fstream`). Es preexistente y ajeno a la iniciativa, pero significa que **el build de producción no sirve hoy como verificación**: tsc + eslint + e2e sí.
