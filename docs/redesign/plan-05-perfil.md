# Fidelidad Paper · 05 — Perfil

> Parte de la iniciativa **fidelidad Paper**. Índice y convenciones en [`README.md`](./README.md).

**Maquetas de referencia**
- `Paper - IA nueva (Inicio + Perfil).html` → frames **B · Panel (privado)**, **C · Colección**, **D · Perfil de otro · Actividad** (la verdad vigente)
- `Paper - Perfil.html` → frames **A/B móvil**, **C · Escritorio** (cabecera a lo ancho, destacados en fila de 6, overview a dos columnas)
- `Paper - Colas, Retos, Usuarios, Admin.html` → frame **2 · Retos personales en Panel**

**Objetivo:** rematar la fidelidad del perfil (la estructura Panel·Colección·Actividad ya se hizo en PR #28) y darle el layout de escritorio.

> ⚠️ Coordinación: el PR #30 (draft, "objetivos plegados") toca `GoalsForm`/panel. Revisar su estado antes de empezar; si sigue abierto, ejecutarlo o cerrarlo primero para no pisarse.

---

## 1. Estado actual

| Pieza | Archivo | Estado |
|---|---|---|
| Página | `src/app/u/[username]/page.tsx` | IA nueva completa: Panel privado (con nota), Colección, Actividad; visitante sin Panel; stub de perfil privado. |
| Cabecera | `src/components/profile-header.tsx` | Fiel: avatar 60, nombre serif 22, @user mono, counts, bio, chips con dot por tipo + "Desde YYYY". |
| Subtabs | `src/components/section-tabs.tsx` | Mono uppercase (patrón app); maqueta serif → decisión transversal P-T2. |
| Panel | `OwnerPanel` + `src/components/stats/*` | Todas las tarjetas del frame B existen: semana (con anillo diario), racha, meta libros, objetivos+form, calendario. Más retos personales (frame 2 de Colas/Retos). |
| Colección | `CollectionTab` en la página | Reusa ContinueStrip + CollectionSummary + LibraryFilters + grid (dot-only ✔ como frame C). |
| Actividad | `ActivityTab` + `activity-chart.tsx`, `favorites-shelf.tsx` | Orden del frame D ✔: gráfico anual → destacados → reseñas recientes (FeedCard `hideActor`). |

## 2. Diferencias visuales con la maqueta (hacer sin preguntar)

1. **Eyebrow "Ahora consumiendo"** — Frame B: eyebrow mono sobre la tira, tarjetas de 100px con track de 4px, título serif 11px y cursor mono 10px ("240/662", "T2·E6"). Verificar `now-consuming.tsx` variant="strip" contra esos tamaños y añadir el eyebrow si falta.
2. **Título "Retos personales"** — `page.tsx:361`: `text-lg font-semibold` sin serif. Poner `font-serif`. Comparar `challenge-card.tsx` contra el frame 2 de Colas/Retos (tipo, criterio, rango de fechas, progreso, estado, acciones editar/archivar/eliminar).
3. **Colección del perfil: eyebrows y píldoras** — Frame C: píldoras de tipo con dot (`.pill`, activa rellena de accent), eyebrow "Ahora mismo · En curso", resumen, eyebrow "Toda tu colección" antes del grid. Actual: sin eyebrows y filtros genéricos. Añadir eyebrows; restylear las píldoras de tipo de `library-filters.tsx` al `.pill` de la maqueta (dot 7px + relleno accent en activa) — beneficia también a `/coleccion`.
4. **Resumen dentro del perfil** — mismo restyling que el plan 02 (leyenda 2 col + cifras grandes por tipo); llega gratis al compartir `collection-summary.tsx`.
5. **Layout de escritorio** — `Paper - Perfil.html` frame C: cabecera a lo ancho (avatar izquierda, acciones derecha), **destacados en fila de 6**, overview en **dos columnas**. Actual: una columna `max-w-4xl` en todo. Añadir en `lg:`: FavoritesShelf con `grid-cols-6`, y en Actividad/Panel un grid de dos columnas para las tarjetas (`lg:grid-cols-2`, calendario y semana pueden compartir fila).
6. **Gráfico anual** — Frame D: barras apiladas por tipo con leyenda (dot 8px + label 11.5px). Verificar `activity-chart.tsx` (existía antes del rediseño); alturas, `stackbar` con esquinas 4px arriba y meses en mono 8.5px.

## 3. Divergencias funcionales — COMENTAR ANTES DE IMPLEMENTAR

- **P1 · Ajustes del perfil (⚙).** La maqueta solo muestra un icono ⚙ en el topbar del perfil propio; hoy el perfil pinta inline el toggle de visibilidad, las solicitudes de seguimiento pendientes y el enlace admin. ¿Se crea una hoja/página de ajustes colgada de un ⚙ (movería visibilidad + admin ahí; las solicitudes podrían ir a Notificaciones, donde la maqueta de Notificaciones ya muestra solicitudes con aceptar/rechazar) o se deja como está?
- **P2 · Filtros de la Colección del perfil.** El frame C solo enseña píldoras de tipo; hoy hay además búsqueda, estado y orden (los mismos de `/coleccion`). ¿Reducimos el perfil a píldoras de tipo (más fiel; la biblioteca completa con filtros ya vive en `/coleccion`) o conservamos los filtros completos?
- **P3 · "Editar" como botón outline.** La maqueta tiene un botón "Editar" que (se asume) abre la edición; hoy `EditProfileForm` se despliega inline. Si el formulario inline molesta para la fidelidad, ¿lo movemos a hoja modal? (Cambio de interacción, no solo estilo.)

## 4. Tareas

### Tarea 1 — Panel: eyebrow, retos y detalles
- **Modificar:** `src/app/u/[username]/page.tsx`, `src/components/now-consuming.tsx`, `src/components/challenges/challenge-card.tsx`
- §2.1 y §2.2. Verificar tarjeta de semana contra `weekwrap` (barras + anillo "7/10 hoy" a la derecha — ya existe `CircularProgress`).
- Commit: `style(perfil): panel fiel al frame B (ahora consumiendo, retos serif)`

### Tarea 2 — Colección del perfil: eyebrows + píldoras
- **Modificar:** `src/app/u/[username]/page.tsx`, `src/components/library/library-filters.tsx`
- §2.3 (píldoras `.pill` con dot; eyebrows). Si P2 se aprueba, quitar búsqueda/estado/orden del perfil en la misma pasada.
- Commit: `style(perfil): coleccion con eyebrows y píldoras del mockup`

### Tarea 3 — Escritorio
- **Modificar:** `src/app/u/[username]/page.tsx`, `src/components/favorites-shelf.tsx`
- §2.5: fila de 6 destacados y overview a dos columnas en `lg`.
- Commit: `style(perfil): layout de escritorio (Perfil.html frame C)`

### Tarea 4 — Gráfico anual
- **Modificar:** `src/components/activity-chart.tsx`
- §2.6 contra el frame D.
- Commit: `style(perfil): grafico anual fiel al frame D`

### Tarea 5 — (bloqueada por P1/P3) Ajustes y edición
- Alcance según decisión; tocaría `profile-header.tsx`, `edit-profile-form.tsx`, quizá ruta nueva `/cuenta`.

## 5. Verificación de cierre

- [ ] Frames B/C/D (IA nueva) y C (Perfil.html) lado a lado, como dueño y como visitante (y perfil privado → stub).
- [ ] El visitante no ve Panel ni puede forzarlo por URL (ya cubierto, no regresar).
- [ ] Modo oscuro (Perfil·Panel está en Paper - Modo oscuro.html).
- [ ] `npx playwright test` verde (Node 22).
- [ ] P1–P3 respondidas y registradas.
