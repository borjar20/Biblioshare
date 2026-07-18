# Cambios de actividades de club — diseño

> Origen: mockup `Biblioshare_mockups/…/Paper - Clubes -cambios-.html` (frames **A · Barra de acciones**, **B · Vista previa sin unirse**) + dos replanteamientos pedidos por el usuario (ubicación de la lista de ítems y opiniones-por-ítem → chat general). Fecha: 2026-07-18. Parte de la iniciativa fidelidad Paper; se ejecuta **después** del plan 04 (frames 1–12).

## Contexto y estado actual

El detalle de una actividad (`components/clubs/activity-detail.tsx`) hoy:

- **Acciones dispersas:** botón verde «Unirse» / «Salir» outline en la fila de participantes; una fila `flex-wrap` de moderación aparte (Activar/Finalizar/Archivar); y un enlace «Editar» junto a la cabecera de la lista de ítems.
- **Lista de ítems** (`activity-item-list.tsx`): al fondo; cada fila se despliega para **opinar por ítem** con nota 1–10 + comentario (`addOpinion`, `activity.opinions`), gateado a participantes (SD-8). Duplica en parte lo que ya enseña el tablero de cada tipo (rejilla del reto de lista, tablero de tierlist, «Tu progreso» de la lectura).
- **Chats:** solo la lectura con hitos (`buddy_read`) tiene chat, y es **por hito** (anti-spoiler). Se apoya en el sistema genérico de interacciones: `getInteractionSummary(supabase, "activity_checkpoint", …)`. `TargetType = "diary_entry" | "episode_watch" | "club_post" | "activity_checkpoint"`.

## Decisiones (confirmadas con el usuario, 2026-07-18)

1. **El chat general SUSTITUYE del todo la opinión por ítem** (nota + comentario). La lista de ítems queda de solo lectura; puntuar cada obra se hace en su ficha (nota de biblioteca normal). Desaparece cualquier «nota media que das» de la actividad.
2. **El chat general es solo para reto de lista, tierlist y reto genérico.** La lectura con hitos **conserva sus chats por hito** (anti-spoiler); no recibe chat general.
3. **Se elimina la lista genérica de ítems**: el tablero de cada tipo es la lista (cada portada enlaza a su ficha). El reto genérico no tiene ítems. La curación del pool sigue en «Modificar actividad».
4. **La vista previa sin unirse (frame B) se aplica a todos los tipos** (extrapolando el patrón del frame B, que solo dibuja la lectura).
5. **Enfoque del chat:** reutilizar el sistema de interacciones/comentarios con un **target nuevo `club_activity`**, en vez de una tabla de mensajes propia. Hereda reacciones/RLS y minimiza superficie.

## Cambios

### A. Barra de acciones (frame A)

Consolidar todas las acciones en **una barra** (`.actbar`: fila con `border-top`, gap, wrap) bajo la fila de participantes de `activity-detail.tsx`:

- **Salir** — outline sm, visible a todo participante.
- Grupo **◈ MOD** (solo dueño/moderadores; separado con `border-left` + tag mono «◈ MOD»): **Modificar** (abre el panel «Modificar actividad»), **Finalizar**, **Archivar**. Cuando la actividad está en estado `proposed`, el grupo incluye **Activar** (hoy vive en la fila de moderación).
- **Se retira** de la fila de participantes el botón verde «Unirse» (pasa a la barra inferior del frame B) y el «Salir» suelto; se retira la fila `flex-wrap` de moderación y el enlace «Editar» de la lista de ítems.

Gating de visibilidad idéntico al actual (participante ve Salir; `isModerator` ve el grupo MOD; el creador no-mod puede Finalizar — se mantiene su caso). Sin cambios de lógica en las server actions (`joinActivity`/`leaveActivity`/`activateActivity`/`finishActivity`/`archiveActivity`).

### B. Fuera la lista genérica de ítems

- **Borrar** `activity-item-list.tsx` y su render en `activity-detail.tsx` (la sección `usesItemPool` con el heading «itemPool» + el enlace «Editar»).
- Asegurar que **cada tablero enlaza sus portadas a la ficha**: la rejilla del reto de lista ya lo hace (`itemHref`); verificar/añadir en el tablero de tierlist (`tierlist-item.tsx`).
- «Modificar actividad» (curación del pool, `activity-item-pool.tsx`) **se mantiene**, accesible desde el botón «Modificar» de la barra de acciones.

### C. Chat general (sustituye opiniones)

- **Retirar** `addOpinion` y el campo `opinions` de `ActivityDetail` en `core.ts`, y todo su consumo. La tabla de opiniones de actividad se **deja muerta (sin DROP)** para no perder datos; limpieza posterior anotada como cabo suelto.
- **Nuevo target `club_activity`** en el sistema de interacciones:
  - TS: añadir `"club_activity"` a `TargetType` en `lib/social/interactions.ts`.
  - **Migración:** políticas RLS para comentar/reaccionar sobre `target_type = 'club_activity'` gateadas a **participantes de la actividad** (espejo de las de `activity_checkpoint`). Confirmar si el modelo usa enum de BD o `text` + CHECK; ampliar en consecuencia.
- **Componente `ActivityChat`** (estilo `checkpoint-chat.tsx`): lista los mensajes (comentarios sobre `("club_activity", activityId)`) + composer. Se monta al fondo del detalle **solo** para `list_challenge`, `tierlist`, `criteria_challenge`. Gateado a participantes (RLS ya lo hace; la UI muestra el teaser del frame B a no-participantes).

### D. Vista previa sin unirse (frame B), todos los tipos

Cuando el viewer **no es participante** de una actividad activa:

- Cabecera (kchip + h1 + descripción) + fila de participantes (avatares + «N participan») en solo lectura.
- **Estructura del tipo en solo lectura:** hitos previstos (lectura), rejilla/tablero (reto de lista/tierlist), meta (genérico) — sin controles de participación.
- **Chat/progreso bloqueados** tras un teaser: bloque con `filter:blur` + overlay «Únete para…» (como el frame B).
- **Barra inferior fija** (`sticky`/`fixed bottom`, con `env(safe-area-inset-bottom)`): texto contextual a la izquierda (p. ej. «Empieza el 20 jul» · «Puedes salir cuando quieras») + botón primario **«Unirme»** que llama a `joinActivity`.
- Sustituye el texto actual «opinionsLocked» y el botón verde suelto de unirse.

## Datos y migraciones

- **1 migración:** `club_activity` como `target_type` de interacciones + políticas RLS de participante (INSERT/SELECT de comentarios y reacciones), espejo de `activity_checkpoint`. Verificar `information_schema` de grants si el modelo los tiene por columna.
- **Sin DROP** de la tabla de opiniones de actividad (datos preservados); su uso se retira del código. Cabo suelto: limpieza/DROP futuro.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `components/clubs/activity-detail.tsx` | Barra de acciones; quitar lista de ítems; montar `ActivityChat` (tipos no-lectura); vista previa B para no-participantes |
| `components/clubs/activity-item-list.tsx` | **Borrar** |
| `components/clubs/activity-chat.tsx` | **Nuevo** (chat general, estilo checkpoint-chat) |
| `lib/clubs/activities/core.ts` | Quitar `addOpinion` y `opinions` de `ActivityDetail` |
| `lib/social/interactions.ts` | `TargetType += "club_activity"` |
| `components/clubs/tierlist/tierlist-item.tsx` | Verificar enlace a ficha |
| migración nueva | RLS de `club_activity` |
| `messages/es.json` | claves de la barra (`modTag`, etc.), chat, teaser B, barra inferior |

## No-objetivos

- No se tocan las server actions de participación/moderación (solo su presentación).
- No se DROPea la tabla de opiniones (solo se deja de usar).
- La lectura con hitos **no** gana chat general.
- No se rediseña el listado de actividades (frame 3) ni el resto del plan 04.

## Verificación de cierre

- [ ] Barra de acciones: participante ve Salir; dueño/mod ven ◈ MOD (Modificar/Finalizar/Archivar; +Activar en propuesta); el creador no-mod ve Finalizar.
- [ ] Ítems: no hay lista genérica; cada tablero enlaza a ficha; «Modificar» abre la curación del pool.
- [ ] Chat general en reto de lista/tierlist/genérico; NO en lectura (que mantiene sus chats por hito). Gateado a participantes.
- [ ] Vista previa (no-participante): estructura visible, chat/progreso bloqueados, barra inferior con «Unirme» que une de verdad.
- [ ] Migración `club_activity` aplicada (dev→prod) y RLS verificada (un no-participante no lee/escribe el chat).
- [ ] `tsc` + `eslint` limpios; e2e de clubes verdes (ver si algún spec tocaba opiniones por ítem); verificación en navegador (móvil claro/oscuro).
