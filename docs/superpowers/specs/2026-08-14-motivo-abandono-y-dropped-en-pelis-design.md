# Motivo de abandono + estado "Abandonada" en películas

> **Spec.** Parte de [Requisitos y alcance](../../REQUIREMENTS.md). Complementa
> `docs/requirements/data-model.md` §3 (el pase) y la decisión del 2026-07-30
> ("Las películas se registran con solo dos estados: Pendiente y Vista") en
> `docs/requirements/decisiones.md`.

## Motivación

El estado `dropped` (`media_status`) ya existe y funciona de punta a punta para
libros y series: enum, `planTransition`, badges, filtros, stats, hitos
sociales. Dos huecos, pedidos por el usuario:

1. **No se guarda por qué se abandonó algo.** Útil para el propio usuario al
   mirar su historial ("¿por qué dejé esto?").
2. **Las películas no pueden marcarse como abandonadas.** La decisión del
   2026-07-30 les quitó las cuatro pastillas a dos (`Pendiente`/`Vista`) con
   el razonamiento "una película se ve de una sentada" — pero deja sin
   representar el caso real de dejar una película a medias.

## Alcance

- Campo de motivo al marcar un pase (cualquier tipo) como `dropped`.
- Categorías cerradas + "otro" con texto libre.
- Motivo **siempre privado** — nunca sale en reseña pública, feed ni perfil,
  con independencia de `passes.is_public`.
- Editable después desde el diario (mismo patrón que reseña/rating).
- Películas ganan la pastilla "Abandonada" en `StatusSegments` y en el filtro
  de biblioteca. **No** ganan "En curso" ni sesiones — eso sigue fuera,
  decisión del 2026-07-30 sin tocar.

Fuera de alcance: estadísticas o agregados sobre motivos (issue aparte si se
quiere más adelante); traducir el motivo a inglés (el repo solo tiene
`messages/es.json`).

## 1. Esquema

Migración nueva (dev primero, luego prod, regla de `AGENTS.md`):

```sql
create type public.pass_dropped_reason as enum (
  'no_enganchado',
  'aburrido',
  'no_es_momento',
  'no_esperado',
  'otro'
);

alter table public.passes
  add column dropped_reason public.pass_dropped_reason,
  add column dropped_reason_note text;

-- Grant por columna (DRIFT-CHECK superficie 6, issue #375): sin esto el
-- UPDATE de savePassFields falla ENTERO en cuanto se nombra dropped_reason,
-- no solo el campo nuevo. SOLO update, a propósito — ver la nota de
-- privacidad más abajo sobre por qué NO lleva select.
grant update (dropped_reason, dropped_reason_note) on public.passes to authenticated;
```

- `dropped_reason` nullable: `null` para pases no abandonados y para los
  cerrados con `completed`. No hay `CHECK` adicional — el enum ya cierra los
  valores válidos.
- `dropped_reason_note` nullable, solo tiene sentido junto a
  `dropped_reason = 'otro'`; el servidor descarta cualquier valor si
  `dropped_reason` no es `'otro'` (ver §2).
- **Corrección tras revisar el camino de lectura real**: `getPasses`
  (`src/lib/passes/get-passes.ts`) —único lector, siempre invocado con el id
  del propio usuario en sesión (`libro|pelicula|serie/[id]/page.tsx`, dentro
  de `if (userId && activeRow)`)— lee por la vista `pass_reviews`, no por la
  tabla directamente. Esa vista devuelve la FILA ENTERA a cualquiera que
  pueda ver un pase público de OTRO usuario (`is_public and
  can_view_profile(...)`), así que un `SELECT` plano de `dropped_reason` en
  la vista lo filtraría a terceros pese a ser "siempre privado" — la
  regla #437 de `AGENTS.md` aplicada a una vista, no a `use cache`. Se
  enmascara por dueño DENTRO de la vista, no con un grant nuevo:

  ```sql
  case when d.user_id = (select auth.uid())
       then d.dropped_reason else null end as dropped_reason,
  case when d.user_id = (select auth.uid())
       then d.dropped_reason_note else null end as dropped_reason_note
  ```

  Con esto da igual que hoy `getPasses` solo se llame con el propio id: si
  algún día se reutiliza para el perfil de otro, el motivo sigue oculto sin
  tocar nada más.

  **Por qué NO lleva `grant select` en la tabla base, ni siquiera para
  `authenticated`.** La política de SELECT de `passes` ("diary entries select
  visible") es `can_view_profile(user_id)` — visibilidad de PERFIL, no de
  dueño — así que cualquier columna con `grant select` de tabla queda legible
  para cualquiera que pueda ver ese perfil, público o no, con independencia
  de `is_public` del pase (`is_public` solo lo aplica la vista). Es
  exactamente el motivo por el que `review` se sacó del grant de tabla en
  `20260714_passes_review_privacy.sql` y solo se lee por `pass_reviews`.
  `dropped_reason`/`dropped_reason_note` siguen el mismo patrón: sin grant de
  SELECT en ningún lado — ni de tabla ni por columna —, la vista los sirve
  igualmente porque corre con los permisos de su dueño (no es
  `security_invoker`), y la app nunca hace `.from("passes").select("dropped_reason")`
  directo. Solo llevan `grant update` (arriba), que sí hace falta para que
  `closePass`/`updatePass` puedan escribirlos.
- Sin backfill: pases `dropped` ya existentes quedan con `dropped_reason`
  `null`, indistinguibles de "no contestó". Aceptado — no hay forma de inferir
  un motivo retroactivo.

`data-model.md` §3 se actualiza con las dos columnas y su regla de privacidad
en el mismo cambio que la migración (regla "definición de hecho" de
`AGENTS.md`).

## 2. Escritura

`savePassFields` (`src/lib/passes/actions.ts`) gana la validación y el
`update`:

```ts
const VALID_REASONS = ["no_enganchado", "aburrido", "no_es_momento", "no_esperado", "otro"] as const;

function parseDroppedReason(raw: FormDataEntryValue | null): PassDroppedReason | null | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return VALID_REASONS.includes(value as PassDroppedReason) ? (value as PassDroppedReason) : undefined;
}
```

- Vacío → `null` (sin motivo, válido siempre — el campo es opcional incluso
  cerrando como `dropped`).
- Valor fuera de la lista → `undefined` (mismo patrón que `parseRating`):
  `savePassFields` devuelve `{ error: "invalidReason" }` sin escribir nada.
- `dropped_reason_note`: se recorta a texto o `null`; **se fuerza a `null` en
  servidor si `dropped_reason !== "otro"`**, aunque el cliente mande algo (no
  nos fiamos del formulario — es una server action pública).
- `ClosePassState` gana `"invalidReason"` en su unión de errores, con su
  entrada en `passes.errors` (`messages/es.json`).
- `closePass` y `updatePass` siguen siendo la única vía de escritura — sin
  camino nuevo.

## 3. UI — `ClosePassSheet`

Hoy `ClosePassSheet` no sabe si el pase se cierra como `completed` o
`dropped` — el padre (`handleStatusChange` en `log-panel.tsx`) ya conoce el
`next` que disparó el cierre, así que se lo pasamos:

```tsx
<ClosePassSheet
  passId={closingPassId}
  itemType={itemType}
  itemId={itemId}
  status={closingStatus}   // NUEVO: "completed" | "dropped"
  open
  onClose={...}
/>
```

`log-panel.tsx` necesita guardar `closingStatus` junto a `closingPassId`
(mismo `useState` que hoy, ampliado) — se fija en `handleStatusChange` con el
`next` recibido, y en el auto-cierre por `initialClosingPassId` es siempre
`"completed"` (el auto-cierre por sesión solo dispara al terminar un libro,
nunca al abandonar).

Dentro de `ClosePassSheet`, si `status === "dropped"`: bloque nuevo entre
`review` e `isPublic` con 5 pastillas (radio, mismo patrón visual que
`StatusSegments`) + textarea condicional cuando la seleccionada es `otro`
(mismo compañero de patrón que el textarea de reseña, sin mención ni
markdown-lite — es privado). Con `status === "completed"`, la hoja queda
exactamente igual que hoy.

## 4. UI — Diario (editar después)

`PassDiary`/`updatePass`: el motivo se edita igual que reseña/rating desde el
diario de pases, pero **solo se ofrece si el pase en cuestión tiene
`status === "dropped"`** — no tiene sentido en un pase `completed`. Mismo
formulario que `ClosePassSheet` reutilizado o inline, a decidir en el plan de
implementación.

## 5. UI — Películas

Dos ficheros, mismo cambio (añadir `"dropped"` sin tocar `in_progress`):

- `src/components/detail/status-segments.tsx`:
  `MOVIE_STATUS_ORDER = ["planned", "completed", "dropped"]`.
- `src/components/library/library-filters.tsx`:
  `MOVIE_STATUSES = ["planned", "completed", "dropped"]`.

`planTransition` no cambia — ya resuelve `planned→dropped` (sin pase previo o
con uno abierto) y `completed↔dropped` (activo cerrado) para cualquier tipo;
el hueco era solo la UI. `library.status.dropped` ("Abandonado") ya es
genérico por tipo, sin verbo propio que añadir (a diferencia de
`inProgress`/`completed`, que si varían por `itemType` en
`detail.statusSegments`).

El comentario de `status-segments.tsx` ("Las películas se registran de un
gesto... no hay 'en curso' ni 'abandonado'") se corrige para reflejar que
`dropped` ya no es una excepción, solo `in_progress`.

## 6. i18n (`messages/es.json`, namespace `passes`)

```json
"droppedReason": {
  "label": "Motivo (opcional)",
  "options": {
    "no_enganchado": "No enganchó",
    "aburrido": "Me aburrió",
    "no_es_momento": "No es el momento (lo retomaré)",
    "no_esperado": "No era lo que esperaba",
    "otro": "Otro"
  },
  "notePlaceholder": "Cuéntanos más…"
},
"errors": {
  "invalidReason": "Motivo no válido."
}
```

## 7. Documentación a tocar al cerrar (regla `AGENTS.md`)

- `data-model.md` §3: columnas nuevas + regla de privacidad, fecha de
  verificación.
- `decisiones.md`: entrada nueva (append-only) que referencia la del
  2026-07-30 y aclara que `dropped` para películas es aditivo, sin reabrir
  `in_progress`/sesiones.
- `backlog.md`: si el ítem correspondiente está listado, marcar hecho
  (`backlog-scribe`).
- DRIFT-CHECK superficie 6: el grant por columna de `dropped_reason`/
  `dropped_reason_note` entra en la referencia de tablas con hueco
  intencionado.

## Testing

- `transitions.test.ts`: no necesita casos nuevos (la máquina no cambia), pero
  sí vale confirmar `planned→dropped` para `movie` si no hay ya un caso
  agnóstico de tipo.
- Unit test de `savePassFields`/`closePass`: motivo válido, motivo inválido
  (`invalidReason`), nota descartada cuando `dropped_reason !== "otro"`.
- e2e / `qa-verifier`: marcar una película como abandonada desde pendiente y
  desde vista; guardar motivo "otro" con nota; editar el motivo después desde
  el diario; confirmar que no aparece en la reseña pública ni en el feed.
