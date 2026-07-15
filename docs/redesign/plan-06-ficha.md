# Fidelidad Paper · 06 — Ficha de título

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - Ficha de título completa.html` → frames **1 · Libro Info**, **2 · Comunidad**, **3 · Registro (pase activo)**, **4 · Serie Episodios**, **5 · Película Info**, **6 · Moderador Editar ficha**, **7 · Registro — elegir edición**
- `Paper - Episodios rejilla.html` → rejilla de episodios (mías/comunidad, escala cálida)
- `Paper - Registrar sesión.html` → hojas modales de sesión (ver §3-P4)

**Objetivo:** afinar la pantalla más importante de la app. Toda la funcionalidad de los 7 frames existe (`info-panel`, `community-panel`, `log-panel` + pases, `edition-strip`, `catalog-editor` de moderador, `episode-*`), así que es trabajo de detalle visual — con dos decisiones de sistema pendientes (§3).

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

### Escritorio/tablet (P-T7 — los 7 frames son de móvil; layout ancho de diseño propio)
24. La ficha es la pantalla que más gana con dos columnas. En `lg:` (hoy todo va en `max-w-4xl` apilado), a proponer al abrir la sesión:
    - **Hero a lo ancho:** portada más grande a la izquierda, título/byline/nota/estado a la derecha, con más aire (el hero ya es fila en `sm:`, ensancharlo).
    - **Info a dos columnas:** sinopsis + sagas + ediciones a la izquierda (columna principal), **sidebar de metadatos sticky a la derecha** (`metadata-sidebar.tsx` ya se llama "sidebar" — en escritorio que lo sea de verdad, no una tabla apilada abajo).
    - **Comunidad:** tarjeta resumen + histograma arriba a lo ancho; reseñas en una o dos columnas.
    - **Registro:** panel del pase (estado + progreso) a la izquierda, sesiones + diario de pases a la derecha; o el pase arriba a lo ancho y sesiones/diario en dos columnas debajo.
    - **Episodios:** temporadas a lo ancho; la rejilla ya aprovecha el ancho de forma natural.
    - **Moderador:** formulario a doble columna (metadatos que hoy van en grid estrecho) manteniendo la barra sticky de guardar.
    - Las **hojas de sesión** (P4) en escritorio pueden ser modal centrado en vez de hoja inferior a pantalla completa.

## 3. Divergencias funcionales / de sistema — RESUELTAS (2026-07-15)

- **P1 · DECIDIDO: híbrido de la maqueta.** **Estrellas gold /5** para agregados de comunidad (hero de ficha, histograma, reseñas ajenas — en ficha, feed, perfil y clubes) y **dots** para la nota propia 1–10 (rate-pick, diario, tarjetas propias). Norma de sistema: documentarla al aplicarla.
- **P2 · DECIDIDO: SÍ, menú ⋯ del hero** — quitar de mi biblioteca, editar ficha (solo moderador); "compartir" entrará cuando se decida (plan 01 P4 pospuesto).
- **P3 · Delta del diario: coordinación** — hacer cuando PR #32 (nota por pase) esté mergeado; confirmar orden con pase-hub (#42) al arrancar la sesión.
- **P4 · DECIDIDO: hojas modales sobre la ficha, CON cronómetro.** Las 5 hojas de `Paper - Registrar sesión.html` (tramo de páginas con delta, selector de temporada, **cronómetro en vivo con pausar/reiniciar que vuelca la duración** — feature nueva, no existe hoy —, sesión que completa el pase, retomar abandonado). `/sesion/[entryId]` queda como fallback deep-link. Añadir como bloque de tareas propio (probablemente su propia sesión).

## 4. Tareas

> Orden recomendado. Las del Registro (T4–T6) tras confirmar P3/pase-hub.

1. **Hero fiel** (§2.1–2.5) — `item-hero.tsx`. Commit: `style(ficha): hero fiel (serif, top bar, borde de portada)`
2. **Pestañas sans semibold sticky** (§2.6, tras P-T2) — `item-detail-tabs.tsx`. Commit: `style(ficha): pestañas del mockup`
3. **Info: sagas, ediciones, sinopsis, metadatos, fila moderador** (§2.7–2.10) — commits separados por pieza.
4. **Registro: progreso con pin + closehint** (§2.15) — `log-panel.tsx`. Commit: `style(ficha): barra de progreso con cursor del pase`
5. **Registro: cabecera de pase, seg, panel, sesiones** (§2.13–2.17).
6. **Diario de pases + delta** (§2.18–2.19, tras P3).
7. **Comunidad** (§2.11–2.12, tras P1).
8. **Episodios** (§2.20) — sesión propia si hace falta (rejilla + lista + temporadas).
9. **Película** (§2.21) y **Moderador** (§2.22).
10. **Elegir edición** (§2.23).

## 5. Verificación de cierre

- [ ] Los 7 frames lado a lado con un libro (con saga y 2+ pases), una serie (con episodios vistos) y una película (con reparto y plataformas).
- [ ] Acentos por tipo correctos en hero, tabs, ediciones y episodios (ámbar/teal/ciruela).
- [ ] Cierre automático: sesión que llega al final → Completado (e2e existente del flujo de pases en verde).
- [ ] Moderador: editar ficha solo visible con rol; guardar/cancelar funcionan.
- [ ] Modo oscuro (Ficha está en Paper - Modo oscuro.html).
- [ ] `npx playwright test` verde (Node 22).
- [ ] P1–P4 respondidas y registradas.
