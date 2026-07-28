# Notas/citas múltiples y progresivas en sesión — Design Spec

**Fecha:** 2026-07-29
**Issue relacionada:** ninguna abierta previamente; nace de petición directa del usuario.

## Problema

La hoja de registrar sesión (`session-sheet.tsx`) solo admite UNA nota/cita por
sesión, capturada en un único `NoteComposer` cuyo texto vive en estado React
hasta que se pulsa "Guardar sesión" — se envía junto al resto del formulario.

Dos limitaciones que el usuario quiere levantar:

1. **Solo una nota por sesión.** Una sesión de lectura larga puede generar
   varias citas/notas y hoy no hay forma de meter más de una.
2. **No se puede capturar "sobre la marcha".** Si usas el cronómetro (sesión
   potencialmente de horas), el texto que vas escribiendo solo existe en
   memoria del componente hasta que registras la sesión entera al final —
   cerrar la pestaña o que falle algo a medio camino se lleva por delante
   cualquier nota que hubieras escrito.

## Decisiones (D1-D6)

**D1 — Persistencia inmediata, no por lotes.** Cada nota se guarda en BD en
cuanto el usuario pulsa "Guardar nota" dentro del compositor — no espera al
envío del formulario de sesión. Justificación: el caso motivador explícito es
un cronómetro de horas; perder texto ya escrito por cerrar la pestaña sería
peor que la complejidad añadida de enlazar las notas a la sesión después.

**D2 — Aplica a los dos modos de duración** (manual y cronómetro), mismo
mecanismo en los dos. Un solo camino, sin casos especiales por modo.

**D3 — Reutilizar `addNote` (ya existe, `lib/notes/actions.ts`).** Es la
misma pieza que usa "Memorizar" desde la ficha (nota suelta, con
`pass_id` pero `session_id: null`). Se invoca como función async directa
desde el cliente (no ligada a un `<form>`) — los server actions de Next no
necesitan estar atados a un elemento `<form>` para invocarse. Se le añade
`id` al estado de retorno en éxito (campo nuevo, no rompe al llamador
existente `NoteForm`, que lo ignora).

**D4 — Enlace a la sesión al guardar, no antes.** Las notas capturadas
mientras la hoja está abierta se envían como `session_id: null`. El
formulario de sesión, además de sus campos actuales, lleva un
`<input type="hidden" name="noteIds">` por cada nota ya guardada. Al
insertar la sesión, `addSession` hace un `UPDATE notes SET session_id = …`
acotado a `user_id` + `pass_id` + `session_id IS NULL` + `id IN (noteIds)` —
la triple condición evita que un POST manipulado enlace notas ajenas o de
otro pase. Si esa actualización falla, no bloquea nada: la sesión ya se
guardó y las notas siguen existiendo sueltas (mismo aspecto que si vinieran
de "Memorizar" desde la ficha). No se surfacea error — no hay pérdida de
datos, solo una etiqueta de agrupación que no se puso.

**D5 — Abandonar la hoja sin guardar la sesión NO borra las notas ya
guardadas.** Quedan como notas sueltas del pase (idéntico a "Memorizar"
desde ficha). Comportamiento esperado dado D1, no un caso a prevenir.

**D6 — `progress_sessions.note` deja de escribirse.** Es la columna legacy
de una sola nota (tope 2000 caracteres) que `addSession` duplicaba junto a
la fila real en `notes`. Búsqueda por el código: el único lector real es
`getTodayFocus` (`lib/stats/get-today-focus.ts`), para el contador "N notas"
de la portada — se cambia para contar filas de `notes` por `pass_id` en vez
de sesiones con `.note` no vacío (más correcto: cuenta notas, no
sesiones-con-texto). El resto del código evita esa columna a propósito
(comentarios existentes en `feed.ts` y `sessions/types.ts`: "SIN note a
propósito"). La columna NO se borra ni se migra — las filas históricas
quedan tal cual, solo deja de recibir escrituras nuevas. Consecuencia:
desaparece el tope de 2000 caracteres específico de la hoja de sesión — cada
nota puede llegar a los 5000 de `notes.body`, igual que en ficha.

## Arquitectura

### `NoteComposer` (modificado, `src/components/notes/note-composer.tsx`)

Gana un prop opcional:

```typescript
onSave?: (data: {
  kind: "note" | "quote";
  body: string;
  tags: string;
  favorite: boolean;
  spoiler: boolean;
  public: boolean;
  page: string | null;      // anclaje libro, "" si sin anclar
  season: number | null;    // anclaje serie
  episode: number | null;
}) => Promise<boolean>;      // true = guardó bien, limpia el compositor
```

- **Con `onSave`:** pinta su propio botón "Guardar nota" (`type="button"`,
  no depende del `<form>` ancestro). Al pulsar, llama a `onSave` con su
  estado interno actual. Si devuelve `true`, se resetea (cuerpo vacío,
  vuelve a plegado). Si devuelve `false`, se queda tal cual (el texto no se
  pierde, el error lo pinta el padre).
- **Sin `onSave`:** comportamiento actual sin cambios — sigue dependiendo de
  un `<form>` ancestro que la envuelva y envíe sus inputs con `name=`
  (caso de `NoteForm`, ficha, intacto).
- El campo `maxBody` sigue existiendo como prop, pero session-sheet ya no
  pasa `2000` — usa el 5000 por defecto (D6).

### `SessionNotebook` (nuevo, `src/components/session/session-notebook.tsx`)

Sustituye al `<NoteComposer maxBody={2000} .../>` suelto que hoy vive en
`session-sheet.tsx`.

- Estado local: lista de notas ya guardadas en esta visita a la hoja
  (`Note[]`, mismo tipo que `lib/notes/types.ts`).
- Pinta la lista con `NoteCard` (ya existe, `showItem={false}` — misma obra,
  no hace falta título) — reutiliza favorito/borrar tal cual.
- Debajo, `<NoteComposer anchor={...} onSave={handleSave} />`.
- `handleSave(data)`: construye un `FormData` a mano con esos campos,
  llama a `addNote(itemType, itemId, {}, formData)` directamente (import,
  no `useActionState` — se invoca N veces, no una). Si `id` viene en la
  respuesta, añade una entrada a la lista local (con los datos que ya
  teníamos en `data`, `createdAt` aproximado a hoy vía `todayISO()`) y
  devuelve `true`. Si `error`, pinta el mensaje (`t("notes").errorEmpty` /
  `errorGeneric`) y devuelve `false`.
- Por cada nota de la lista, renderiza
  `<input type="hidden" name="noteIds" value={note.id} />`.
- Prop `onPendingChange?: (hasPendingText: boolean) => void` — reenvía el
  `onHasBodyChange` de `NoteComposer` (repropósito: antes cambiaba la
  etiqueta del botón "Guardar sesión", ahora además bloquea el envío si hay
  texto sin guardar en el compositor).

### `session-sheet.tsx` (modificado)

- Cambia `<NoteComposer anchor={noteAnchor} anchorHint={...} onHasBodyChange={setNoteHasBody} maxBody={2000} />`
  por `<SessionNotebook itemType={itemType} itemId={itemId} anchor={noteAnchor} anchorHint={t("noteAnchorHint")} onPendingChange={setNotePending} />`.
- Nuevo estado `notePending` (booleano): hay texto sin guardar en el
  compositor del cuaderno. El botón "Guardar sesión" se deshabilita
  mientras sea `true`, con una pista corta debajo
  ("Guarda o borra la nota en curso antes de continuar").
- `noteHasBody` (para la etiqueta "Guardar sesión (con nota)") pasa a
  derivarse de si la lista del cuaderno tiene ≥1 entrada, en vez del texto
  del compositor.
- Se retira `state.noteFailed` y toda la lógica que dependía de él
  (`setClosingPass` condicionado, el `useEffect` de cierre, el párrafo de
  error, el `disabled` del botón) — el fallo de guardar una nota ahora se ve
  en vivo dentro del cuaderno, nunca al final.

### `addSession` (modificado, `src/lib/sessions/actions.ts`)

- Se retira: lectura de `note`/`noteKind`/`noteFavorite`/`noteSpoiler`/
  `notePublic`/`noteTags`/`notePage`/`noteSeason`/`noteEpisode`, la
  validación `noteTooLong`, el insert a `notes` desde aquí, y el campo
  `note` del insert de `progress_sessions` (pasa a no incluirse — la
  columna queda `null` para las sesiones nuevas).
- `AddSessionState` pierde `error: "noteTooLong"` y el campo `noteFailed`.
- Se añade: `const noteIds = formData.getAll("noteIds").map(String).filter(Boolean);`
  y, tras insertar la sesión con éxito:
  ```typescript
  if (noteIds.length > 0) {
    await supabase
      .from("notes")
      .update({ session_id: inserted.id })
      .eq("user_id", user.id)
      .eq("pass_id", passId)
      .is("session_id", null)
      .in("id", noteIds);
  }
  ```
  Sin comprobar el resultado (D4 — best-effort, no bloquea nada).

### `getTodayFocus` (modificado, `src/lib/stats/get-today-focus.ts`)

- La consulta a `progress_sessions` deja de pedir la columna `note`
  (`select("pass_id, session_date")`).
- Se añade una cuarta consulta en paralelo:
  `supabase.from("notes").select("pass_id").in("pass_id", passIds)`
  (con el mismo guard `passIds.length` que las otras tres).
- `notesByPass` se rellena contando esas filas por `pass_id`, en vez de
  contarse dentro del bucle de `sessions.data`.
- El resto (`noteCount` en `TodayPass`, el orden, el destacado) no cambia.

## Flujo de datos

```
Usuario escribe nota → pulsa "Guardar nota"
  → SessionNotebook.handleSave construye FormData
  → addNote(itemType, itemId, {}, formData)  [pass_id resuelto del pase activo, session_id: null]
  → { id } → se añade a la lista local + <input hidden name="noteIds" value={id}>
  → (repetible N veces, en cualquier momento mientras la hoja está abierta,
     cronómetro corriendo o no)

Usuario pulsa "Guardar sesión"
  → addSession inserta progress_sessions (sin .note)
  → UPDATE notes SET session_id = <la nueva> WHERE id IN (noteIds) AND user_id=... AND pass_id=... AND session_id IS NULL
```

## Testing

- `NoteComposer`: no tiene lógica pura nueva relevante (el `onSave` es
  orquestación, no cálculo) — sin tests unitarios nuevos ahí.
- `SessionNotebook`: cubierto por e2e (ver abajo), no por unitarios — es
  orquestación de estado + llamadas a server actions, no funciones puras.
- `addSession` / `getTodayFocus`: cambios de consulta SQL, verificación
  manual + e2e, no unitarios (no hay función pura extraíble del cambio).
- E2E: extender `e2e/notas-captura.spec.ts` (ya existe, cubre el compositor
  de una nota) con un caso de 2+ notas en una misma sesión, y verificar que
  tras guardar la sesión las dos filas de `notes` quedan con el
  `session_id` correcto. Verificación manual adicional en navegador real
  (Supabase dev) del caso cronómetro: arrancar cronómetro, guardar 2 notas
  sin haber tocado aún "Guardar sesión", confirmar que ya existen en BD con
  `session_id: null`, luego guardar la sesión y confirmar el enlace.

## Fuera de alcance (YAGNI)

- Editar una nota ya guardada dentro del cuaderno (solo añadir/borrar).
- Mostrar la hora exacta de captura de cada nota (créate/timestamp real
  existe en BD vía `created_at` de `notes`, pero no se expone en la UI del
  cuaderno — ninguna vista lo pide).
- Migrar o borrar `progress_sessions.note` — columna legacy, se queda.
