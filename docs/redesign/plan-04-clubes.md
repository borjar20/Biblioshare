# Fidelidad Paper · 04 — Clubes

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - Clubes.html` → frames **1 · Inicio**, **2 · Feed**, **3 · Actividades**, **4 · Lectura con hitos**, **5 · Reto de lista**, **6 · Gestión**, **7 · Tierlist**, **8 · Reto genérico**, **9 · Miembros (directorio)**, **10 · Feed PC**, **11 · Miembros PC**, **12 · Actividades PC**
- `Paper - Proponer actividad.html` / `Proponer actividad (standalone).html` → wizard de propuesta (5 pasos)

> **Actualización 2026-07-18.** La maqueta de Clubes pasó de 8 a 12 frames y esto reordena el plan. Lo nuevo no es fidelidad de algo existente, es **superficie nueva**:
> - **Frame 9 · Directorio de miembros** — hoy la lista de miembros solo vive en Gestión (moderación). El frame 9 es una pantalla **abierta a todo miembro**, solo lectura, a la que se llega por el enlace «N miembros ›» de la cabecera. Es funcionalidad nueva (ruta + datos), no un restyle. → **Sesión D**.
> - **Frames 10–12 · Escritorio** — el plan tenía el ancho como "diseño propio a proponer" (P-T7) y esparcido por sesión. La maqueta ahora lo concreta: **shell con sidebar de navegación del club** (Feed·Actividades·Miembros·Gestión) + columna central + rail. Se **consolida en una sola sesión de escritorio al final** en vez de improvisarlo tab a tab. → **Sesión E**.
>
> Decisiones que trae esta ampliación: **P4–P8** en la §3. Reparto actualizado en la §4 (ahora **5 sesiones**: A–C ya existían, D y E son nuevas).

**Objetivo:** afinar visualmente la sección de clubes, cuya funcionalidad de los 8 frames originales ya está completa (epic social, bloques A–H), y **construir la superficie nueva** que trae la maqueta ampliada (directorio de miembros + escritorio). Es la pestaña con más superficie: se reparte en **5 sesiones** (landing+shell, actividades, gestión+wizard, directorio, escritorio).

---

## 1. Estado actual

La funcionalidad de los 8 frames originales existe y fue construida contra el handoff, así que su base visual ya es Paper. Los frames 9–12 son **superficie que aún no existe** (directorio abierto a todos + escritorio). Mapa frame → código:

| Frame | Páginas/Componentes |
|---|---|
| 1 Inicio | `src/app/clubes/page.tsx`, `clubs/club-card.tsx`, `clubs/club-cover.tsx` |
| 2 Feed | `src/app/club/[slug]/page.tsx`, `clubs/club-header.tsx`, `clubs/club-tabs.tsx`, `clubs/club-summary.tsx`, `clubs/club-post-composer.tsx`, `clubs/club-post-card.tsx`, `clubs/club-feed.tsx` |
| 3 Actividades | `clubs/activity-list.tsx`, `clubs/activity-card.tsx`, `clubs/proposal-moderation.tsx`, `clubs/activity-composer.tsx` |
| 4 Hitos | `src/app/club/[slug]/actividad/[id]/page.tsx`, `clubs/checkpoints/*` (buddy-read-checkpoints, checkpoint-list, checkpoint-chat) |
| 5 Reto de lista | `clubs/list-challenge/*`, `clubs/member-rank-row.tsx` |
| 6 Gestión | `clubs/club-management.tsx`, `clubs/manage-members.tsx`, `clubs/join-request-list.tsx`, `clubs/proposal-moderation.tsx` |
| 7 Tierlist | `clubs/tierlist/*` (board, row, item) — verificar que el PR #13 (H2) esté mergeado antes de restylear |
| 8 Reto genérico | `clubs/criteria-challenge/*` |
| Wizard | `clubs/propose/propose-wizard.tsx`, `clubs/propose/checkpoint-draft-editor.tsx`, `clubs/tierlist/tierlist-fields.tsx`, `clubs/criteria-challenge/criteria-challenge-fields.tsx` |
| **9 Miembros (directorio)** | **NO EXISTE.** Ruta nueva `src/app/club/[slug]/miembros/page.tsx` + `clubs/member-directory.tsx` (fila `.mdir`). Datos: `listMembers()` en `lib/clubs/clubs.ts` ya da `joinedAt`+`role` (roster gateado a miembros por RLS); falta el recuento «en N actividades» (P4). |
| **10–12 Escritorio** | **NO EXISTE** como layout ancho. Shell nuevo: sidebar de navegación del club (`.cnav`) + main con header sticky. Se monta sobre `src/app/club/[slug]/*` en `lg:`; los grids (`.mgrid` miembros, `.actgrid` actividades) y el rail del feed son variantes de escritorio de los componentes ya citados. |

Piezas ya muy fieles (verificado): `club-summary.tsx` (tarjetas de actividad activa 208px con kchip + próximos hitos con fecha serif), `club-card.tsx` (banda de cover 74px, tag privado/público con blur, dot de no-leídos, botón verde Unirse).

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

### Frame 1 · Inicio
1. **Topbar/cabecera** — Maqueta: título en topbar + botón **"+ Crear" primario compacto en el topbar**. Actual: h1 en página + botón normal al lado. Ajustar a fila compacta (h1 serif ✔ ya).
2. **Buscador de clubes** — Maqueta: campo estilo "composer" (píldora surface con ⌕ y placeholder "Buscar clubes…", radio 12px). Actual: `Input` estándar. Restylear.
3. Tarjetas: comparar `.clubcard` al detalle — nombre Fraunces 16px ✔, descripción 12px, foot con miembros mono 10.5px ✔. Diferencia menor: maqueta usa sombra `0 6px 16px -12px`; revisar `shadow-card`.

### Frame 2 · Club › Feed
4. **Banner con botones superpuestos** — Maqueta: ‹ y ⋯ **dentro del banner** (esquinas, `bg surface/80 + blur`). Actual: banner limpio y acciones fuera. Añadir el botón volver superpuesto (el ⋯ puede quedar como está si no existe menú).
5. **Estado "Miembro ✓"** — Maqueta: chip outline "Miembro ✓" en la cabecera (en vez del botón "Salir" siempre visible). Propuesta fiel sin perder función: mostrar "Miembro ✓" y que el "Salir" viva detrás del menú ⋯ (P2: agrupa Editar / Ajustes / Salir). En Gestión (frame 6) el botón de cabecera es "Ajustes".
5-bis. **Enlace "N miembros ›"** — Maqueta (frames 2/3/6): el recuento de miembros de la cabecera (`.sub .memlink`, subrayado con `text-decoration-color: faint`) es un **enlace al directorio** `/club/[slug]/miembros`. Hoy `club-header.tsx` pinta el recuento como texto muerto. Convertirlo en `<Link>` (Sesión A) — el destino (frame 9) lo construye la Sesión D, así que hasta entonces el enlace puede quedar tras un flag o apuntar a una ruta que aún da el shell vacío. Coordinar el orden A→D.
6. **Composer colapsado** — Maqueta: fila avatar + "Comparte algo con el club…" + glifos de encuesta/compartir a la derecha. Actual: `club-post-composer.tsx` con modos pero disparador distinto. Restylear el estado cerrado a esa fila.
7. **Encuestas** — Maqueta `.poll`: opciones con **barra de relleno proporcional** (`accent` al 12%), % en mono a la derecha, opción propia con borde accent. Verificar `club-post-card.tsx` y ajustar.
8. **Pestañas del club** — Maqueta: Fraunces serif con pip de contador y ◈ en Gestión. Actual: mono uppercase con pip ✔ y ◈ ✔. **P-T2 resuelto: pasar a serif** (`club-tabs.tsx`, junto al resto de subtabs en la tarea transversal 1d).

### Frame 3 · Actividades
9. **Botón proponer full-width** — "+ Proponer actividad" primario a lo ancho arriba del listado. Verificar disposición actual de `activity-composer.tsx`.
10. **Filas de actividad** — `.actrow`: tile de icono 40px redondeado teñido por tipo (accent lectura / teal reto lista / gold tierlist / green genérico — ya existe `ACTIVITY_ACCENT`), título serif 14px, meta mono uppercase 10px, chip de estado a la derecha (`stt-active` teñido accent / `stt-prop` / `stt-fin` apagado). Secciones "Activas · N", "Propuestas · esperan moderación", "Finalizadas" (finalizadas con `opacity .75`).
11. **Tarjeta de propuesta** — `.propcard`: borde y fondo **teñidos de gold** (`color-mix(gold 40%, border)` / `gold 5%`), botones Aprobar (verde) / Rechazar (outline). Verificar `proposal-moderation.tsx`.

### Frames 4–5 · Detalle de actividad (hitos y reto de lista)
12. Cabecera de actividad: kchip del tipo + h1 Fraunces 23px + descripción muted 13px; fila de participantes con **avatares solapados** (28px, borde bg, margin -8px) + "N participan" + acción a la derecha (Salir / Compartir la mía). Verificar página de actividad.
13. Hitos `.cp`: dot 26px (✓ accent al alcanzarse), "Chat abierto" en mono verde, chat embebido sobre `surface-2` con label mono verde, hito bloqueado con franja rayada y texto "El chat se abre cuando…". Verificar `checkpoints/*`.
14. Reto de lista: anillo cónico "Tu avance" + texto "Vas 2º del club…", grid 5-col de portadas con ✓ overlay verde (`st-done` 55%) y no-vistas `opacity .55`, clasificación con `member-rank` (track 80px + recuento mono). Verificar `list-challenge/*`.

### Frames 6–8 · Gestión, tierlist, reto genérico
15. Gestión: propcards gold, solicitudes con Aceptar verde + ✕ iconbtn, miembros con `rolechip` (Dueño teñido accent, Mod teñido verde) y "Hacer mod" outline. Verificar `manage-members.tsx` / `join-request-list.tsx`.
16. Tierlist: filas S–D con etiqueta Fraunces 700 20px sobre color (S rojo `#b0492f`, A gold, B green, C teal, D faint), slots con mini-portadas 34×51, pool con borde discontinuo sobre `surface-2`. Verificar `tierlist/*`.
17. Reto genérico: segmented control Colaborativo/Competitivo (`.modeseg`: fondo surface-2, opción activa surface con sombrita), anillo y barras en **verde**, tarjeta informativa verde al pie. Verificar `criteria-challenge/*`.

### Wizard Proponer actividad
18. Contra `Paper - Proponer actividad.html`: paso 1 con 4 tarjetas de tipo (icono teñido + nombre + descripción), pasos por tipo (fechas, editor de hitos, niveles de tierlist editables, ítems del reto). Auditar `propose-wizard.tsx` frame a frame en su sesión.

### Frame 9 · Directorio de miembros (NUEVO — abierto a todos)
Pantalla nueva, no un restyle. Ruta `src/app/club/[slug]/miembros/page.tsx`, **solo lectura**, visible para cualquier miembro (la moderación sigue en Gestión). Se llega por el enlace «N miembros ›» de la cabecera (§2.5-bis).

19. **Cabecera** — topbar con `‹` + "Miembros" + subtítulo mono "«nombre club» · N", y a la derecha `⊕` que abre el flujo de invitar **solo si el viewer es moderator+** (reutiliza el de P3/Sesión C; oculto para miembro normal).
20. **Buscador + filtros** — `.searchbar` (píldora surface con ⌕, placeholder "Buscar miembro…") y `.seg2` segmentado: **Todos · N / Equipo · N / Más activos / Nuevos** (este último por paridad con el frame 11, P8). Resueltos server-side (P5).
21. **Secciones** — "Equipo" (dueño + moderadores) y luego "Miembros · N". Cada fila `.mdir`: avatar 38px, nombre + `rolechip` (Dueño/Mod) o `youtag` "Tú", meta mono "DESDE «mes año» · EN N ACTIVIDADES" (dueño: "FUNDÓ EL CLUB · «mes año» · EN N ACTIVIDADES"; sin participación: "SIN ACTIVIDADES AÚN"), chevron `›`. **Toda la fila es un enlace real al perfil** (`<Link>`, foco visible), no un div con onClick.
22. **Paginación** — pie "Mostrando 8 de 40 · desliza para ver más" / "cargar más". Página server-side (~30), P5.
23. **Datos** — `listMembers()` ya da `joinedAt`+`role`. Falta el recuento «en N actividades» cruzando participaciones de todos los tipos (buddy-read / list-challenge / tierlist / criteria) → **P4**. El directorio y el roster de Gestión deben **compartir la misma función de datos**, no duplicar queries.
24. **Privacidad** — `/miembros` de un club privado es members-only (la RLS de `club_members` ya lo gatea). Un no-miembro que llegue por URL cae al **stub privado** (mismo patrón que `[slug]/page.tsx`), no a 404.

### Frames 10–12 · Escritorio del club (NUEVO — ahora hay maqueta; deroga P-T7 "diseño propio" para Clubes)
La maqueta concreta el ancho con un **shell de sidebar** propio del club. Se monta en `lg:` sobre `src/app/club/[slug]/*`; en móvil se mantienen los tabs horizontales y el enlace de cabecera. Se hace **en una sola sesión (E)**, después de que existan las pantallas móviles.

25. **Shell `.cdesk` / sidebar `.cnav` (256px, frames 10–12)** — banner del club con `‹`, identidad (nombre Fraunces 19px + "◍ Privado · N miembros"), lista de navegación con item activo teñido accent y pips: **Feed · Actividades `pip` · Miembros `N` · Gestión `◈`**, y pie con "Miembro ✓". `main` con header sticky (título Fraunces 23px + acción primaria a la derecha: "+ Publicar" / "+ Proponer actividad" / "+ Invitar"). El sidebar es navegación **del club**, anidada bajo el topbar global de escritorio (P-T1) — reconciliar ambos (P6). "Miembros" es item de primera clase del sidebar (P7).
26. **Feed PC (frame 10)** — `.cfeed` a dos columnas: hilo (`1fr`) + `.caside` sticky (296px) con "Actividades activas" (aacards a ancho completo), "Próximo" (cal-strip en columna) y una `.asidecard` de miembros (avatares solapados + "Ver todos los miembros" → directorio).
27. **Miembros PC (frame 11)** — mismo directorio en ancho: `.mgrid` de 3 columnas de `.mcard`, buscador + filtros en el header, "+ Invitar" (moderator+). Sigue siendo solo lectura.
28. **Actividades PC (frame 12)** — `.actgrid` de 2 columnas por estado (Activas / Propuestas / Finalizadas), propcards resaltadas.
29. **Landing PC** — sin frame propio; se mantiene la pauta ya escrita: grid de tarjetas de club a 2–3 columnas, "Tus clubes" y "Descubrir" como secciones anchas.
30. **Detalle de actividad PC** — sin frame propio: cabecera + progreso a la izquierda, hitos/lista/tierlist a lo ancho; el chat de hito puede ir en columna lateral (diseño propio, se propone al abrir la Sesión E).

## 3. Divergencias funcionales — RESUELTAS (2026-07-15)

- **P1 · DECIDIDO: progreso real por hitos.** Sustituir la barra temporal de `club-summary.tsx` por el avance real ("Hito 3/5 · pág 320", "14/40") vía query o vista agregada por actividad.
- **P2 · DECIDIDO: SÍ, menú ⋯ del club** en el banner (agrupa Editar / Ajustes / Salir) y el botón de cabecera pasa a "Miembro ✓". La §2.5 deja de ser condicional.
- **P3 · DECIDIDO: SÍ, construir el flujo de invitar.** El backend ya tiene `acceptInvite`/`declineInvite`; falta la UI: "+ Invitar" en Gestión → buscar usuario → invitación + notificación. Añadir como tarea propia en la sesión C.

### Decisiones de la ampliación (frames 9–12, 2026-07-18)

Del re-troceo salieron cinco preguntas nuevas. Recomendaciones abajo, **aprobadas por el usuario el 2026-07-18** — si al ejecutar surge una divergencia, se pregunta (regla de la iniciativa).

- **P4 · DECIDIDO: construir el recuento «en N actividades».** Es el diferenciador del directorio frente al roster de Gestión, así que se construye un recuento de participación cruzando los tipos (buddy-read / list-challenge / tierlist / criteria). **Fallback:** si sale caro para el cierre, v1 muestra solo "DESDE «mes año»" y el recuento queda como follow-up anotado — nada de un "0 actividades" mentiroso mientras tanto.
- **P5 · DECIDIDO: lista paginada server-side.** Los clubs públicos llegan a 300+ miembros; nada de cargar todo en cliente. `listMembers()` pasa a aceptar paginación (~30/pág), búsqueda y orden (Todos/Equipo/Más activos/Nuevos) resueltos en servidor. La maqueta ya dibuja "Mostrando 8 de 40 · cargar más".
- **P6 · DECIDIDO: sidebar del club en `lg:`.** Se adopta `.cnav` (frames 10–12) como navegación del club en escritorio, **anidada bajo el topbar global** (P-T1) — no lo sustituye. En móvil se mantienen los tabs horizontales. Reconciliar visualmente ambos niveles al montar la Sesión E (que el sidebar del club no compita con la barra global).
- **P7 · DECIDIDO: `/club/[slug]/miembros` es ruta real.** Un único destino para móvil y escritorio: en móvil se llega por el enlace de cabecera «N miembros ›»; en escritorio es item del sidebar. No es una bottom-tab.
- **P8 · DECIDIDO: filtro "Nuevos" también en móvil.** La maqueta solo lo dibuja en el frame 11 (PC), pero incluirlo en el `.seg2` móvil es barato y da paridad. Los cuatro filtros: Todos / Equipo / Más activos / Nuevos.

## 4. Tareas (reparto en 5 sesiones)

> A–C son fidelidad de lo existente; **D y E son la superficie nueva** (directorio + escritorio). Orden: A → B/C (móvil) → **D** (directorio; necesita el enlace de cabecera que deja la A) → **E** (escritorio; necesita que todas las pantallas móviles existan).

### Sesión A — Landing + Club shell (frames 1–2)
1. Restylear cabecera y buscador de `/clubes` (§2.1–2.3). Commit: `style(clubes): landing fiel al frame 1`
2. Banner con volver superpuesto + menú ⋯ + estado Miembro ✓ + **enlace «N miembros ›»** (§2.4–2.5-bis). Commit: `style(clubes): cabecera del club fiel al frame 2`
3. Composer colapsado + encuestas con barra de relleno (§2.6–2.7). Commit: `style(clubes): composer y encuestas del feed`

### Sesión B — Actividades (frames 3–5, 7, 8)
4. Listado de actividades y propuestas (§2.9–2.11). Commit: `style(clubes): listado de actividades fiel al frame 3`
5. Detalle de actividad: cabecera + participantes (§2.12). Commit por tipo al ir cerrando: hitos (§2.13), reto de lista (§2.14), tierlist (§2.16), genérico (§2.17).

### Sesión C — Gestión + wizard (frames 6 + Proponer)
6. Gestión (§2.15). Commit: `style(clubes): gestión fiel al frame 6`
7. Wizard (§2.18), un commit por paso si hay cambios sustanciales.
8. **UI de invitar (P3):** "+ Invitar" en Gestión → buscar usuario → `inviteMember` + notificación. Commit: `feat(clubes): invitar miembros desde gestión`. *(El mismo flujo se reutiliza tras el `⊕` del directorio en la Sesión D.)*

### Sesión D — Directorio de miembros (frame 9, NUEVO)
9. **Datos (P4/P5):** extender `listMembers()` con paginación/búsqueda/orden server-side + recuento «en N actividades»; compartir la función con el roster de Gestión. Commit: `feat(clubes): datos del directorio de miembros`
10. **Ruta + pantalla móvil (§2.19–2.24):** `club/[slug]/miembros/page.tsx` (members-only, stub privado para no-miembros) + `member-directory.tsx` con searchbar, `.seg2` de 4 filtros, secciones Equipo/Miembros, filas `.mdir` enlazadas al perfil, paginación. Commit: `feat(clubes): directorio de miembros abierto a todo el club`

### Sesión E — Escritorio del club (frames 10–12, NUEVO)
11. **Shell de escritorio (§2.25, P6/P7):** sidebar `.cnav` del club + `main` con header sticky, anidado bajo el topbar global; reconciliar ambos niveles. Commit: `feat(clubes): shell de escritorio del club`
12. **Feed PC (§2.26):** dos columnas + rail sticky. Commit: `style(clubes): feed del club en escritorio`
13. **Miembros PC (§2.27) y Actividades PC (§2.28):** grids `.mgrid` / `.actgrid`. Un commit cada uno.
14. **Landing y detalle de actividad en ancho (§2.29–2.30):** diseño propio, proponer al abrir la sesión.

> En cada sesión: abrir el frame correspondiente de la maqueta en el navegador y comparar con datos reales de dev antes y después.

## 5. Verificación de cierre

- [ ] Los 12 frames comparados lado a lado con datos de un club real (privado, con actividad de cada tipo, con propuestas pendientes, con ≥30 miembros para ver la paginación).
- [ ] Roles: mirar Gestión como dueño, mod y miembro (la pestaña no debe salir para miembro); el `⊕`/"+ Invitar" del directorio solo aparece para moderator+.
- [ ] Directorio: buscador y los 4 filtros (Todos/Equipo/Más activos/Nuevos), «en N actividades» correcto (o el fallback de P4 anotado), cada fila enlaza al perfil; un no-miembro en `/miembros` de un club privado ve el stub, no un 404.
- [ ] Escritorio (`lg:` a 1280): sidebar del club sin competir con el topbar global; feed a dos columnas, grids de miembros y actividades.
- [ ] Modo oscuro (Club·Feed está en Paper - Modo oscuro (resto).html).
- [ ] `npx playwright test` verde (Node 22) — clubes tiene e2e del epic social; añadir cobertura del directorio (Sesión D) siguiendo la regla de los dos árboles (`:visible`).
- [ ] P1–P8 respondidas y registradas.
