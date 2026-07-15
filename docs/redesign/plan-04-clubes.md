# Fidelidad Paper · 04 — Clubes

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - Clubes.html` → frames **1 · Inicio**, **2 · Feed**, **3 · Actividades**, **4 · Lectura con hitos**, **5 · Reto de lista**, **6 · Gestión**, **7 · Tierlist**, **8 · Reto genérico**
- `Paper - Proponer actividad.html` / `Proponer actividad (standalone).html` → wizard de propuesta (5 pasos)

**Objetivo:** afinar visualmente la sección de clubes, cuya funcionalidad ya está completa (epic social, bloques A–H). Es la pestaña con más superficie: se recomienda **repartirla en 2–3 sesiones** (landing+club, actividades, wizard).

---

## 1. Estado actual

La funcionalidad de los 8 frames existe y fue construida contra el handoff, así que la base visual ya es Paper. Mapa frame → código:

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

Piezas ya muy fieles (verificado): `club-summary.tsx` (tarjetas de actividad activa 208px con kchip + próximos hitos con fecha serif), `club-card.tsx` (banda de cover 74px, tag privado/público con blur, dot de no-leídos, botón verde Unirse).

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

### Frame 1 · Inicio
1. **Topbar/cabecera** — Maqueta: título en topbar + botón **"+ Crear" primario compacto en el topbar**. Actual: h1 en página + botón normal al lado. Ajustar a fila compacta (h1 serif ✔ ya).
2. **Buscador de clubes** — Maqueta: campo estilo "composer" (píldora surface con ⌕ y placeholder "Buscar clubes…", radio 12px). Actual: `Input` estándar. Restylear.
3. Tarjetas: comparar `.clubcard` al detalle — nombre Fraunces 16px ✔, descripción 12px, foot con miembros mono 10.5px ✔. Diferencia menor: maqueta usa sombra `0 6px 16px -12px`; revisar `shadow-card`.

### Frame 2 · Club › Feed
4. **Banner con botones superpuestos** — Maqueta: ‹ y ⋯ **dentro del banner** (esquinas, `bg surface/80 + blur`). Actual: banner limpio y acciones fuera. Añadir el botón volver superpuesto (el ⋯ puede quedar como está si no existe menú).
5. **Estado "Miembro ✓"** — Maqueta: chip outline "Miembro ✓" en la cabecera (en vez del botón "Salir" siempre visible). Propuesta fiel sin perder función: mostrar "Miembro ✓" y que el "Salir" viva detrás (menú ⋯ o el mismo botón con confirm). Si se prefiere no tocar la interacción, dejar "Salir" pero con estilo outline sm.
6. **Composer colapsado** — Maqueta: fila avatar + "Comparte algo con el club…" + glifos de encuesta/compartir a la derecha. Actual: `club-post-composer.tsx` con modos pero disparador distinto. Restylear el estado cerrado a esa fila.
7. **Encuestas** — Maqueta `.poll`: opciones con **barra de relleno proporcional** (`accent` al 12%), % en mono a la derecha, opción propia con borde accent. Verificar `club-post-card.tsx` y ajustar.
8. **Pestañas del club** — Maqueta: Fraunces serif con pip de contador y ◈ en Gestión. Actual: mono uppercase (patrón deliberado) con pip ✔ y ◈ ✔. **No tocar hasta resolver P-T2** (serif vs mono, plan transversal).

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

## 3. Divergencias funcionales — RESUELTAS (2026-07-15)

- **P1 · DECIDIDO: progreso real por hitos.** Sustituir la barra temporal de `club-summary.tsx` por el avance real ("Hito 3/5 · pág 320", "14/40") vía query o vista agregada por actividad.
- **P2 · DECIDIDO: SÍ, menú ⋯ del club** en el banner (agrupa Editar / Ajustes / Salir) y el botón de cabecera pasa a "Miembro ✓". La §2.5 deja de ser condicional.
- **P3 · DECIDIDO: SÍ, construir el flujo de invitar.** El backend ya tiene `acceptInvite`/`declineInvite`; falta la UI: "+ Invitar" en Gestión → buscar usuario → invitación + notificación. Añadir como tarea propia en la sesión C.

## 4. Tareas (sugerencia de reparto en sesiones)

### Sesión A — Landing + Club shell (frames 1–2)
1. Restylear cabecera y buscador de `/clubes` (§2.1–2.3). Commit: `style(clubes): landing fiel al frame 1`
2. Banner con volver superpuesto + estado Miembro ✓ + descripción (§2.4–2.5). Commit: `style(clubes): cabecera del club fiel al frame 2`
3. Composer colapsado + encuestas con barra de relleno (§2.6–2.7). Commit: `style(clubes): composer y encuestas del feed`

### Sesión B — Actividades (frames 3–5, 7, 8)
4. Listado de actividades y propuestas (§2.9–2.11). Commit: `style(clubes): listado de actividades fiel al frame 3`
5. Detalle de actividad: cabecera + participantes (§2.12). Commit por tipo al ir cerrando: hitos (§2.13), reto de lista (§2.14), tierlist (§2.16), genérico (§2.17).

### Sesión C — Gestión + wizard (frames 6 + Proponer)
6. Gestión (§2.15). Commit: `style(clubes): gestión fiel al frame 6`
7. Wizard (§2.18), un commit por paso si hay cambios sustanciales.

> En cada sesión: abrir el frame correspondiente de la maqueta en el navegador y comparar con datos reales de dev antes y después.

## 5. Verificación de cierre

- [ ] Los 8 frames comparados lado a lado con datos de un club real (privado, con actividad de cada tipo, con propuestas pendientes).
- [ ] Roles: mirar Gestión como dueño, mod y miembro (la pestaña no debe salir para miembro).
- [ ] Modo oscuro (Club·Feed está en Paper - Modo oscuro (resto).html).
- [ ] `npx playwright test` verde (Node 22) — clubes tiene e2e del epic social.
- [ ] P1–P3 respondidas y registradas.
