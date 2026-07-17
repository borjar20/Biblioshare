# Fidelidad Paper · 06 — Ficha de título

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

> ✅ **PLAN CERRADO el 2026-07-17.** T1–T8 hechas y mergeadas, y la verificación de cierre (§5) pasada. Lo que quedó por el camino, con su porqué, en **§6d** (T4–T8) y **§6e** (Episodios rehecha por escala + el cierre). Si vas a tocar la ficha, lee antes el **choque de shells de escritorio** de §6e: mientras la ficha conserve el raíl lateral, **el cuerpo de cualquier pestaña está topado en 771px**.

> ⚠️ **La maqueta se ACTUALIZÓ el 2026-07-16 (12 frames, antes 7).** Lo escrito antes de esa fecha en §2 sigue valiendo para móvil, pero la distribución de Info cambió y **ahora hay vista de PC de verdad** (§2bis), que sustituye al "diseño propio a proponer" del §2.24 original. Si vienes de la versión vieja, lee §2bis y §4 antes de nada.

**Maquetas de referencia**
- `Paper - Ficha de título completa.html` → **móvil**: **1 · Libro Info**, **2 · Comunidad**, **3 · Registro (pase activo)**, **4 · Serie Episodios**, **5 · Película Info**, **6 · Moderador Editar ficha**, **7 · Registro — elegir edición**. **PC**: **8 · Libro Info**, **9 · Libro Comunidad**, **10 · Libro Registro**, **11 · Serie Episodios**, **12 · Película Info**.
- `Web - Ficha de titulo (PC).html` (2026-07-16 16:58) → **manda para PC**: son los mismos frames, con `.desk-bd` fuera y `.desk-tabs` translúcida. El resto de `.desk-*` es idéntico al fichero grande.
- `Paper - Episodios rejilla.html` → rejilla de episodios (mías/comunidad, escala cálida)
- `Paper - Episodios (escala y PC).html` (2026-07-17 01:01) → **manda para Episodios**, y es POSTERIOR a todo lo demás: rehace la pestaña en tres niveles por escala. Frames elegidos por el usuario: **E3** (índice en rejilla) → **E2** (temporada) en móvil lista, **C3** (rejilla transpuesta) en móvil rejilla, **PC·1** (master-detail) en PC. Ver §6e — incluido por qué PC·1 acabó con dos columnas y no tres.
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

- ~~**P1 · DECIDIDO: híbrido de la maqueta.** **Estrellas gold /5** para agregados de comunidad (hero de ficha, histograma, reseñas ajenas — en ficha, feed, perfil y clubes) y **dots** para la nota propia 1–10 (rate-pick, diario, tarjetas propias). Norma de sistema: documentarla al aplicarla.~~ → **DEROGADA por el usuario el 2026-07-16: DOTS EN TODO.** No hay estrellas en ninguna parte. `RatingDots` es el componente canónico (5 dots sobre escala 1–10, mitades pulsables), `--surface-3` es el dot apagado y `star-rating.tsx` está **borrado**. Las maquetas siguen dibujando ★ para los agregados (incl. las de episodios de 2026-07-17): **la maqueta no manda aquí**, manda esta derogación.
- **P11 · DECIDIDO: "Nuevo pase" pregunta solo sobre un pase ABIERTO.** Sobre uno abierto no puede decidir por su cuenta cómo se archiva el que cierra —o se completó, o se abandonó—, así que pregunta; sobre uno ya cerrado actúa directo. (T4, PRs #55–#60.)
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

3. ~~**T3 · Shell de PC + Info** (frames 1 y 8)~~ ✅ **HECHA** — shell (#50 `e76ebfa`, #51 `bbb7f41`), cuerpo de Info (#53 `4a23362`) y sagas a N (#54). Detalle:
   - ~~`desk-shell`: grid `300px 1fr` en `lg:`, **rail sticky** (P5) bajo la topbar (P8)~~ ✅
   - ~~Rail: portada 256×384, estado, progreso (salvo película), CTA (P6), "Tu nota"~~ ✅ — **en MODO LECTURA**, ver §6b.
   - ~~Cabecera común: título 44px, byline serif, nota en línea~~ ✅ — **falta la línea de saga** (necesita `getItemSaga`, hoy tras el `<Suspense>`).
   - ~~Pestañas con piel de PC~~ ✅ (#51, según la maqueta nueva de PC).
   - ~~Cuerpo de Info: orden móvil, dos columnas de PC, ediciones, sagas a N~~ ✅ — ver §6c.
   - **La cola de la cabecera de PC (sinopsis + géneros + facts, §2bis.33) NO se hace** — decidido, ver §6c/P9.
4. ~~**T4 · Registro** (frames 3 y 10)~~ ✅ **HECHA** (PRs #55, #56, #58, #59, #60) — progreso con pin + `closehint`, cabecera de pase, seg, sesiones; en PC "Datos del pase" y "Quitar de mi biblioteca" a la derecha. Diario + delta. Trajo P11 y el token `--surface-3`.
5. ~~**T5 · Comunidad** (frames 2 y 9)~~ ✅ **HECHA** (PR #61) — reseñas + histograma; en PC el histograma es tarjeta lateral fija.
6. ~~**T6 · Episodios** (frames 4 y 11)~~ ✅ **HECHA** (PR #62) — **y luego REHECHA entera** por escala: ver §6e.
7. ~~**T7 · Película** (frames 5 y 12) y **Moderador** (frame 6)~~ ✅ **HECHA** (PRs #63 y #64).
8. ~~**T8 · Elegir edición** (frame 7) y el **menú `⋯`** del hero móvil (P2, pendiente de la #49)~~ ✅ **HECHA** (PR #65).

**Todas las tareas cerradas el 2026-07-17.** La verificación de cierre (§5) está hecha; sus dos hallazgos, en la PR #68.

## 5. Verificación de cierre — HECHA el 2026-07-17

- [x] Los **12** frames lado a lado con un libro (con saga y 2+ pases), una serie (con episodios vistos) y una película (con reparto y plataformas) — **móvil Y PC**. Sujetos: *The Final Empire* (saga de 10 + 2 pases), *Juego de tronos* (8 temporadas), *Batman Begins* (reparto + 7 plataformas con la atribución a JustWatch).
- [x] Acentos por tipo correctos en hero, tabs, ediciones y episodios (ámbar/teal/ciruela). **Medidos**, no mirados: libro `#a15a34`, película `#3f6b6e`, serie `#7a5676`.
- [x] Cierre automático: sesión que llega al final → Completado (e2e existente del flujo de pases en verde).
- [x] Moderador: editar ficha solo visible con rol; guardar/cancelar funcionan (T7b, PR #64).
- [x] Modo oscuro (Ficha está en Paper - Modo oscuro.html) — incluido el anillo de progreso de episodios, que es un `conic-gradient` sobre tokens y adapta solo.
- [x] `npx playwright test` verde (Node 22) — **22 pasados · 1 saltado · 0 fallos**.
- [x] P1–P8 respondidas y registradas (§3), **más P9/P10 (§6c) y P11 (§3)**. Ojo: **P1 quedó DEROGADA** — dots en todo.
- [x] En PC: el rail se queda quieto al scrollear y las pestañas se pegan bajo la topbar (P5/P8); el rail y el Registro no se contradicen al cambiar de estado (P7). Ver §6e para la cautela de la medición.

**Dos hallazgos, los dos arreglados en la PR #68** — ver §6e.

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

## 6c. Hallazgos del cuerpo de Info (PRs #53 y #54 · 2026-07-16)

- **P9 · DECIDIDO: la sinopsis se queda en el CUERPO de Info, no en la cabecera.** El frame 8 la pone encima de la barra de pestañas, pero solo en Info (los frames 9 y 10 cortan la cabecera en la nota) — y nuestra cabecera vive FUERA de `ItemDetailTabs`, que es quien sabe qué pestaña está activa. Las salidas eran: contexto de pestaña activa (fontanería nueva), leer `?tab=` en el servidor (**descartada: convertiría cada cambio de pestaña en una ida y vuelta**, justo lo que el diseño evita) o dejarla donde está. Se deja donde está: la cabecera de PC queda más corta que el frame, y se asume. **Consecuencia: `headerExtra` de `ItemShell`/`ItemHeaderWide` queda muerto — quitarlo.**
- **El panel "Esta edición / Volver a la obra" NO existía en ninguna maqueta.** Era invención nuestra (#21-33) y repetía lo que la tarjeta ya enseña. Al quitarlo se fue `viewingId`, que era **el único motivo** por el que la sinopsis y los metadatos vivían dentro de `EditionsSection`: sin él, cada pieza se coloca donde diga el frame. `edition-details.tsx` pasó de 242 a 65 líneas y `MetadataSidebar` dejó de depender del `<Suspense>` de ediciones. **Lección: antes de dar por hecho que algo es un refactor, mirar si el acoplamiento lo sostiene una feature que la maqueta ya no quiere.**
- **En PC solo 5 ediciones de primeras, la tuya primero, y "Ver todas (N)".** El frame dibuja 4 pero un libro real trae hasta 18 tras sincronizar con OpenLibrary y la rejilla se comía seis filas. Ordenar por "la tuya primero" jubiló de paso un `scrollIntoView` que existía solo para que no hubiera que buscarla en la tira. El recorte es **solo de PC** (`lg:hidden`, no cortar el array): en móvil la tira ya scrollea.
- ⚠️ **BUG LATENTE arreglado:** `getItemSaga` usaba `maybeSingle()`, que **revienta con más de una fila**. `saga_items` nunca impuso una saga por ítem, así que **un libro en dos sagas rompía la ficha**; no había saltado porque en dev no hay ninguno. La maqueta ("Sagas · 4") lo destapó antes que un usuario.
- **P10 · DECIDIDO: la saga principal es la PRIMERA** (la más antigua, por el `created_at` de la membresía). Regla única para los tres tipos: el modelo no puede marcar una principal y una heurística que acierte a veces es peor que una regla que se explica en una frase. El `total` del "nº 4 de 20" va como agregado anidado en la misma consulta (`sagas(id, name, saga_items(count))`) — una consulta por saga serían N viajes.
- ⚠️ **Sin comprobar a ojo:** el render de 2+ sagas. En dev no hay ningún ítem con dos, y una saga sembrada con la service-key **no la ve el usuario de la app** (probablemente RLS sobre `sagas` manuales sin dueño).

## 6b. Hallazgos del shell de PC (T3, PRs #50 y #51 · 2026-07-16)

- **Dos árboles (móvil y PC), no un hero que se estira.** La portada cambia de columna entre las dos vistas y el DOM no se reordena así con CSS sin trucos frágiles. Precio: una portada oculta de más (~15 KB). Las pestañas, en cambio, se pintan UNA vez como slot, así que el `<Suspense>` de la Fase B queda intacto.
- **El rail va en MODO LECTURA** (decisión del usuario). En la maqueta el estado es un desplegable, pero cambiarlo no es escribir un campo: abandonar encadena la hoja de cierre y retomar pregunta continuar/de cero, y esa máquina vive en `ManagedLog` (`log-panel.tsx`), tras el `<Suspense>`. Duplicarla serían dos máquinas contradiciéndose. Así que el rail enseña y el control sigue en Registro; la pastilla **no lleva el `▾`** de la maqueta (prometería un desplegable que no hay) y enlaza a `?tab=log`. Si algún día se levanta esa lógica a un sitio compartido, el rail pasa a control.
- **Los datos del rail no cuestan un viaje más:** la consulta del pase activo ya existía para el badge; ahora trae `id, rating, position`. Con Supabase remoto lo caro es la ida y vuelta, no las columnas.
- **`--foreground-faint`** (#a89e8d / #6f665a, par sacado de los `.html` de modo oscuro como en P-T6): un peldaño más claro que `--muted-foreground`, para etiquetas que solo deben estar. Lo pidieron las pestañas inactivas de PC.
- ⚠️ **REGLA e2e nueva:** con dos árboles por breakpoint, **todo locator de la ficha debe ser `:visible`**. La suite corre a 1280 y `getByTestId`/`getByText().first()` cazaban el elemento del OTRO árbol, apagado pero presente en el DOM — 5 asserts rojos con "hidden". La pastilla del rail lleva el mismo `data-testid="status-badge"` que la píldora del hero (las dos son "el estado en modo lectura") y los helpers filtran por `:visible`. De paso queda probado P7: los tests cambian el estado en Registro y comprueban la pastilla del RAIL.
- **La maqueta es un documento VIVO.** Cambió dos veces el mismo día (7→12 frames, y luego `Web - Ficha de titulo (PC).html`). **Comprobar la fecha del `.html` antes de calcar.** La versión de PC aparte solo cambió dos reglas (`.desk-bd` fuera y `.desk-tabs` translúcida), que validaron los ajustes ya pedidos a ojo; el resto de `.desk-*` era idéntico byte a byte.

## 6d. Hallazgos de T4–T8 (PRs #55–#65 · 2026-07-16)

- **La corrección del `1fr 340px`.** El cuerpo de PC es `grid-cols-[minmax(0,1fr)_340px]` con `gap-x-11` — la misma `.desk-cols` para Registro, Comunidad y Episodios. Se descubrió pintándolo: sin `minmax(0,…)` la columna flexible no baja de su contenido y la tarjeta lateral se salía. (#60/#61.)
- ⚠️ **Bug real que destapó T5:** el histograma hacía `avgRating.toFixed(1)` sobre la escala **1–10** y decía "8,4" donde el hero decía "4,2". La media se guarda 1–10 y se enseña en 5: `formatDots` es el único módulo que conoce la equivalencia. (#61.)
- **T6: el estado por episodio se LEVANTÓ al panel.** El frame 11 ancla el detalle en una tarjeta y el 4 lo despliega inline: son el **mismo dato**, y con copias locales por fila puntuar desde un sitio y desde el otro divergía. Parches optimistas sobre los props del servidor. De regalo, el contador "N/M vistos" se mueve al instante.
- **El "16/20 vistos" del rail sin viaje extra:** `.select("pass_id, passes!inner(is_active)", { count: "exact", head: true })` filtra por el pase activo sin saber su id. (#62.)
- **T8 traía una feature que no existía**: §23 pedía "reusar la edición del pase anterior" y no había ninguna forma de hacerlo. `EditionPicker` agrupa "Ya las has usado" (los pases llegan de más nuevo a más viejo ⇒ el primero visto por edición es su último uso) y el reuso es **un clic**. "+ Es una edición nueva" crea Y elige: `createEdition` devuelve el id.
- **El `⋯` del hero se comunica por la URL**, porque el hero y el editor viven en subárboles distintos: `?editar=ficha`. Obligó a que `ItemDetailTabs` **siga los cambios externos de `?tab=`** (ajuste durante el render) y a que `CatalogEditor` limpie el parámetro al cerrar (ahí sí un `useEffect` legítimo: `router.replace` es navegación, no `setState`).
- ⚠️ **Lección repetida DOS veces (T7b y T8): los scripts de verificación con esperas fijas MIENTEN en dev.** Guardados de 2–4s y revalidaciones en vuelo hicieron que un script informara "no se guardó" y que un `<select>` leyera "Sin asignar" **cuando la BD tenía el dato correcto**. Verificar contra la BD o con esperas de Playwright de verdad (`waitForURL`, asserts), nunca con `sleep`.

## 6e. Episodios rehecha por escala + verificación de cierre (PRs #67 y #68 · 2026-07-17)

**T6 se rehízo entera.** Maqueta nueva: `Paper - Episodios (escala y PC).html`. La pestaña apilaba TODAS las temporadas en acordeones — con 8 temporadas y 73 episodios era un scroll interminable, y con 20 sería inutilizable. Ahora **tres niveles** (temporadas → episodios de una → detalle de uno) y cada breakpoint enseña los que le caben: móvil lista = índice en rejilla (E3) → pantalla de temporada (E2); móvil rejilla = **transpuesta** (C3), temporadas en columnas y episodios en filas, con ventana de 6 paginada, para que el eje que crece sin límite crezca hacia donde el móvil tiene sitio; PC lista = raíl + lista (PC·1). **La rejilla de PC no se toca** (decisión del usuario): el ancho ya daba para las 12 temporadas en filas. Un solo estado `openSeason`: `null` = índice en móvil / la del cursor en PC. Nuevo "Marcar próximo episodio"; **"Marcar hasta aquí" queda fuera a propósito** — marca N de golpe y necesita decidir confirmación/deshacer/si pisa notas.

⚠️ **CHOQUE DE SHELLS DE ESCRITORIO — la tensión de fondo, y volverá a salir.** Las maquetas dibujan **dos fichas de PC distintas**:

| Maqueta | Escritorio | Cuerpo de la pestaña |
|---|---|---|
| `Ficha de título completa` (**lo implementado**, T3–T7) | `.desk-rail` lateral con la portada | **771px, a cualquier viewport** |
| `Episodios (escala y PC)` (**más nueva**) | `.dhead`: portada 78×117 en cabecera, sin raíl | ~1160px |

El shell lo fija `item-shell.tsx`: `lg:max-w-[1160px] lg:grid-cols-[300px_1fr]`. Medido a 1280/1440/1600/1920: **siempre 771** (hay max-width, no es cuestión de pantallas grandes). Por eso PC·1 `220|1fr|340` **no cabe**: la lista quedaba en 208px y los títulos se partían **letra a letra**. **Decisión del usuario: dos columnas en PC** (raíl 220 + lista 549) y el detalle desplegado bajo su fila en ambos breakpoints; `EpisodeDetailCard` **borrada**. Si algún día se adopta el shell nuevo, la tercera columna vuelve a caber y **PC·2** (muro/heatmap), hoy dibujado sin usar, pasa a ser viable.

**Lección e2e:** `pase-hub.spec.ts` localizaba temporadas con `page.locator("section")` — ya no existe, la pestaña enseña UNA temporada. Helper `openLastSeason()` que entra por el raíl.

### Los dos hallazgos de la verificación de cierre (PR #68)

- **"1 valoraciones"**, dos veces por ficha (hero + histograma). La causa no era la cadena sino **la forma**: `ratingsLabel` era un sustantivo suelto que cada consumidor anteponía al número (`{count} {label}`), así que no había dónde meter el plural — y no vale pasar la función de traducción hacia dentro (páginas de servidor → consumidores de cliente). Ahora es plural ICU y **las páginas pasan la cadena ya formateada**; `#` formatea con separadores de locale igual que el `toLocaleString("es")` que sustituye. La prop `ratingCount` se quedó muerta en los tres consumidores y se retiró de la cadena entera.
- **El nombre de la saga truncaba a media fila** ("Batman …", "Nacido…") con el ancho de al lado vacío: `lg:grid-cols-2` es para emparejar sagas, pero con **una sola** la segunda columna se queda vacía. Una sola saga ocupa ahora la fila entera.

### Cautela sobre la medición de P5

Las tabs se pegan **exactamente en 59px = `--topbar-h`** ✔ y el raíl se queda clavado en 93px durante todo el recorrido real a 900px de alto ✔. Con un viewport artificialmente corto (560px) el raíl acaba subiendo a −123: **no es un bug**, es el empuje normal de `sticky` al acabarse su contenedor (`overflow: visible` en toda la cadena). Queda escrito porque una medición de dos puntos lo hacía parecer roto.

### Verificación

Suite e2e completa **21/21 sin reintentos** (la línea base tras #47 era 20 + 1 flaky). Los 3 fallos que salieron por el camino eran **consecuencias reales del cambio de copy**, no flakiness — se distinguen del ruido del entorno porque fallaban SIEMPRE, en el mismo assert, y no se movían de sitio (la señal contraria a la de la #47). Comprobado en navegador a 390 y 1280, claro y oscuro, con la barra pegada tras scroll, y la nota en estrellas contra una obra puntuada de dev.

**Ojo con `npx next build`:** falla en `main` y en cualquier rama por `rimraf` no resoluble desde `exceljs` (cadena `parse-bookmory` → `exceljs` → `unzipper` → `fstream`). Es preexistente y ajeno a la iniciativa, pero significa que **el build de producción no sirve hoy como verificación**: tsc + eslint + e2e sí.
