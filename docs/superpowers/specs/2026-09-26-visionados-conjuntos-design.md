# Visionados conjuntos — diseño (#1220)

> [Histórico · congelado 2026-09-26] Estado de hoy: `docs/requirements/data-model.md` §5.4 y
> `backlog.md`. Decisión: `decisiones.md` 2026-09-26.

## Qué

Fuera de los clubes, un usuario marca que vio / leyó una obra **con otros usuarios**. El feed de
Inicio enseña una tarjeta «Ana, Luis y 1 más vieron X juntos» con la nota y la reseña de cada uno.

Decisiones del dueño: solo **seguidos mutuos**; **todos los tipos** de obra; el `finished` suelto
de un miembro **se oculta** del feed; los miembros que quien mira no puede ver salen como
**«y N más»**.

## Flujo

1. Dos entradas, las dos a la vista:
   - **Al terminar**: la hoja de cierre («¿Qué te ha parecido?», `ClosePassSheet`) trae
     «¿Con quién la viste?» con fichas de seguidos mutuos (`JointCompanionsPicker`). Al guardar,
     `create_joint_viewing`. Solo al completar, y solo si hay seguidos mutuos.
   - **Después**: en el diario, cada pase **terminado** lleva un botón «＋ ¿Con quién la viste?»;
     si ya está compartido, muestra los avatares («Con Ana y Luis», «Pendiente» si falta alguien
     por contestar). Abre `JointViewingSheet`: ver quién está, invitar a más (quien lo creó) o
     salirse. El diario pide los visionados de todos sus pases en UNA llamada.
2. Cada invitado recibe `joint_viewing_invite` (campana + push) que abre `/juntos/[id]`. Además
   (#1224) las invitaciones sin contestar se leen de la tabla, no de la campana, y se ven en dos
   sitios aunque el aviso se pierda: un bloque «Te han etiquetado» en Inicio, encima del feed, y
   un aviso encima de la tarjeta del pase en la ficha de la obra (`PendingJointInvites`,
   `getPendingJointInvites`). Se contesta ahí mismo cuando no hay que elegir pase; si tienes
   pases terminados de la obra pero ninguno de ese día, «Confirmar» lleva a `/juntos/[id]`.
3. En `/juntos/[id]` (`JointInviteResponse`) elige cuál de sus pases terminados es (se preselecciona
   el del mismo día) o «uno nuevo», y acepta; o dice «No fui yo». Aceptar llama a
   `respond_joint_viewing`, que publica el post `joint` si aún no existe. Quien invitó recibe
   `joint_viewing_accepted`.
4. Cada uno puntúa y reseña en su propio pase, como siempre; la tarjeta lo lee en vivo.
5. Desde la misma hoja, cualquiera puede salirse (`leave_joint_viewing`); el pase no se toca.

## Piezas

| Capa | Fichero |
|---|---|
| Esquema | `supabase/migrations/20260926120000_joint_viewings_enums.sql`, `20260926120100_joint_viewings.sql` |
| Lecturas | `src/lib/social/joint-viewings.ts` |
| Acciones | `src/lib/social/joint-viewing-actions.ts` |
| Feed | `src/lib/social/feed.ts` (`resolveJointCards`, `jointViewingIdsFor`, `withoutJointFinished`) |
| Tarjeta | `src/components/social/joint-card.tsx` |
| Hoja | `src/components/detail/joint-viewing-sheet.tsx` (desde `pass-diary.tsx`) |
| Página | `src/app/juntos/[id]/page.tsx`, `src/components/social/joint-invite-response.tsx` |

## Límites asumidos

- Si quien creó el visionado se sale, el post conjunto sigue firmado por él (la tarjeta pinta a
  los miembros, no al autor). Si su perfil es privado para quien mira, la tarjeta no le llega y
  ve los `finished` sueltos.
- El feed busca posts `joint` entre los 200 visionados más recientes de tus seguidos; uno más viejo
  solo se pierde si además no sigues a quien lo creó.
- Reabrir un pase enlazado (volver a «en curso») no lo saca del visionado.
