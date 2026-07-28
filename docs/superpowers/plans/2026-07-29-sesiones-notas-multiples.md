# Notas/citas múltiples y progresivas en sesión Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir varias notas/citas por sesión, capturadas de una en una y
persistidas al instante (no al guardar la sesión entera) — usable desde el
primer segundo de un cronómetro largo sin perder texto si se cierra la
pestaña.

**Architecture:** `NoteComposer` gana un modo de guardado propio (`onSave`)
que reutiliza `addNote` (ya existe, notas sueltas `session_id: null`) en vez
de depender del `<form>` de la sesión. Un nuevo `SessionNotebook` orquesta
"componer → guardar → listar → repetir" y sustituye al `NoteComposer` suelto
de `session-sheet.tsx`. Al guardar la sesión, `addSession` enlaza
(`session_id`) las notas ya guardadas por sus ids, en vez de escribir una
nota él mismo.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, next-intl,
Playwright (e2e).

## Global Constraints

- Reutilizar `addNote`/`deleteNote`/`NoteCard` tal cual existen — no
  duplicar su lógica.
- `progress_sessions.note` deja de escribirse (no se borra ni se migra la
  columna).
- Cada nota puede llegar a 5000 caracteres (`notes.body`), no al tope de
  2000 que tenía la hoja de sesión.
- Sin tests unitarios para componentes de orquestación (`NoteComposer` en
  modo `onSave`, `SessionNotebook`) ni para los cambios de consulta SQL —
  cobertura vía e2e y verificación manual, seguiendo el patrón ya
  establecido en el proyecto (ver `docs/superpowers/specs/2026-07-29-sesiones-notas-multiples-design.md`).
- Spec de referencia: `docs/superpowers/specs/2026-07-29-sesiones-notas-multiples-design.md` (decisiones D1-D6).

---

### Task 1: `addNote` devuelve el `id` de la nota creada

**Files:**
- Modify: `src/lib/notes/actions.ts:13-15` (tipo), `:76-95` (insert)

**Interfaces:**
- Produces: `AddNoteState = { error?: "empty" | "generic"; id?: string }` —
  Task 3 (`SessionNotebook`) necesita el `id` para enlazar la nota a la
  sesión al guardar.

- [ ] **Step 1: Ampliar el tipo de retorno**

En `src/lib/notes/actions.ts:13-15`:

```typescript
export type AddNoteState = {
  error?: "empty" | "generic";
  /** Id de la nota recién creada. Lo usa SessionNotebook para enlazarla a la
   *  sesión al guardar (session_id se pone después, no aquí). */
  id?: string;
};
```

- [ ] **Step 2: Pedir el id al insertar y devolverlo**

En `src/lib/notes/actions.ts:76-95`, cambiar:

```typescript
  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    item_type: itemType,
    item_id: itemId,
    pass_id: pass?.id ?? null,
    session_id: null,
    kind,
    body,
    position,
    is_favorite: isFavorite,
    is_spoiler: isSpoiler,
    is_public: isPublic,
    meta: { tags },
  });

  if (error) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateProfilePages();
  return {};
```

por:

```typescript
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
      pass_id: pass?.id ?? null,
      session_id: null,
      kind,
      body,
      position,
      is_favorite: isFavorite,
      is_spoiler: isSpoiler,
      is_public: isPublic,
      meta: { tags },
    })
    .select("id")
    .single();

  if (error || !data) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateProfilePages();
  return { id: data.id };
```

- [ ] **Step 3: Verificar que nada rompe**

`NoteForm` (`src/components/notes/note-form.tsx`) ignora el campo `id` —
sigue funcionando sin cambios. Correr `npm run typecheck` — debe pasar limpio.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notes/actions.ts
git commit -m "feat(notas): addNote devuelve el id de la nota creada"
```

---

### Task 2: `NoteComposer` gana modo de guardado propio (`onSave`)

**Files:**
- Modify: `src/components/notes/note-composer.tsx`

**Interfaces:**
- Consumes: nada nuevo de fuera.
- Produces:
  ```typescript
  export type NoteDraft = {
    kind: "note" | "quote";
    body: string;
    tags: string;       // sin normalizar — SessionNotebook normaliza igual
                         // que el servidor, ver Task 3.
    favorite: boolean;
    spoiler: boolean;
    public: boolean;
    page: string;        // "" si no aplica / sin anclar
    season: number | null;
    episode: number | null;
  };
  ```
  `onSave?: (draft: NoteDraft) => Promise<boolean>` — nuevo prop. Task 3
  (`SessionNotebook`) lo consume.

Los campos `favorite`/`spoiler`/`public`/`tags` pasan de no controlados a
controlados (useState) — necesario para poder leer su valor al pulsar
"Guardar nota" sin depender de un `<form>` que los recoja. `NoteForm`
(ficha) no cambia su forma de uso: sigue sin pasar `onSave`, y el reseteo
por `key={resetCount}` sigue funcionando igual con estado controlado que con
no controlado.

- [ ] **Step 1: Añadir el tipo `NoteDraft` y el prop `onSave`/`saveError`**

En `src/components/notes/note-composer.tsx`, tras `NoteAnchor`:

```typescript
export type NoteDraft = {
  kind: "note" | "quote";
  body: string;
  tags: string;
  favorite: boolean;
  spoiler: boolean;
  public: boolean;
  page: string;
  season: number | null;
  episode: number | null;
};
```

Ampliar la firma de `NoteComposer`:

```typescript
export function NoteComposer({
  anchor,
  anchorHint,
  defaultOpen = false,
  onHasBodyChange,
  maxBody = 5000,
  onSave,
  saveError,
}: {
  anchor: NoteAnchor;
  anchorHint?: string;
  defaultOpen?: boolean;
  onHasBodyChange?: (hasBody: boolean) => void;
  maxBody?: number;
  /** Cuando se pasa, el compositor guarda CADA nota al momento con su propio
   *  botón (no depende del <form> que lo envuelve) y se vacía para la
   *  siguiente si `onSave` devuelve `true`. Lo usa SessionNotebook: la hoja
   *  de sesión admite varias notas, no solo una — ver spec 2026-07-29. */
  onSave?: (draft: NoteDraft) => Promise<boolean>;
  /** Error de la ÚLTIMA nota que se intentó guardar en modo onSave — lo
   *  decide el padre (SessionNotebook sabe si addNote falló). */
  saveError?: string | null;
}) {
```

- [ ] **Step 2: Controlar tags/favorite/spoiler/public**

Junto a los `useState` existentes (tras la línea del `startedAtTime` — no,
ese es de otro componente; van tras `editingAnchor`):

```typescript
  const [editingAnchor, setEditingAnchor] = useState(false);
  const [tags, setTags] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [spoiler, setSpoiler] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
```

Cambiar los cuatro campos de no controlados a controlados:

```tsx
      <Field label={t("tagsLabel")} htmlFor="note-tags">
        <Input
          id="note-tags"
          name="noteTags"
          type="text"
          placeholder={t("tagsPlaceholder")}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
        <input
          type="checkbox"
          name="noteFavorite"
          checked={favorite}
          onChange={(e) => setFavorite(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        {t("favorite")}
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted-foreground">
        <input
          type="checkbox"
          name="noteSpoiler"
          checked={spoiler}
          onChange={(e) => setSpoiler(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <span>
          {t("spoilerLabel")}
          <span className="block text-[10.5px]">{t("spoilerHint")}</span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted-foreground">
        <input
          type="checkbox"
          name="notePublic"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <span>
          {t("publicLabel")}
          <span className="block text-[10.5px]">{t("publicHint")}</span>
        </span>
      </label>
```

(Los `name=` se conservan: el modo sin `onSave`, ficha, los sigue leyendo
por `FormData` nativo al enviar su propio `<form>`.)

- [ ] **Step 3: Botón "Guardar nota" + reseteo, solo en modo `onSave`**

Al final del `return`, tras el bloque `publicLabel` de arriba:

```tsx
      {onSave && (
        <>
          {saveError && <p className="text-sm text-status-dropped">{saveError}</p>}
          <Button
            type="button"
            disabled={saving || body.trim().length === 0}
            onClick={async () => {
              setSaving(true);
              const ok = await onSave({
                kind,
                body: body.trim(),
                tags,
                favorite,
                spoiler,
                public: isPublic,
                page,
                season: anchor.kind === "episode" ? anchor.season : null,
                episode: anchor.kind === "episode" ? anchor.episode : null,
              });
              setSaving(false);
              if (ok) {
                setKind("quote");
                changeBody("");
                setOverride(null);
                setEditingAnchor(false);
                setTags("");
                setFavorite(false);
                setSpoiler(false);
                setIsPublic(false);
              }
            }}
            className="self-start"
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </>
      )}
```

Añadir el import de `Button` arriba del fichero:

```typescript
import { Button } from "@/components/ui/button";
```

Nota: el compositor NO se pliega tras guardar (a propósito — capturar la
nota #2 no debe requerir reabrirlo) — solo se vacían sus campos.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Debe pasar limpio. `NoteForm` sigue compilando sin pasar `onSave`/`saveError`
(ambos opcionales).

- [ ] **Step 5: Commit**

```bash
git add src/components/notes/note-composer.tsx
git commit -m "feat(notas): NoteComposer admite guardado propio por nota (modo onSave)"
```

---

### Task 3: Nuevo componente `SessionNotebook`

**Files:**
- Create: `src/components/session/session-notebook.tsx`

**Interfaces:**
- Consumes: `NoteComposer`/`NoteDraft` (Task 2), `addNote`+`AddNoteState`
  (Task 1), `NoteCard` (existente, `src/components/notes/note-card.tsx`),
  `deleteNote` (existente, `src/lib/notes/actions.ts`), `normalizeTags`
  (existente, `src/lib/notes/tags.ts`), `Note`/`NoteKind` (existente,
  `src/lib/notes/types.ts`).
- Produces:
  ```typescript
  export function SessionNotebook(props: {
    itemType: ItemType;
    itemId: string;
    anchor: NoteAnchor;
    anchorHint?: string;
    onPendingChange?: (hasPending: boolean) => void;
  }): JSX.Element
  ```
  Renderiza, además, un `<input type="hidden" name="noteIds">` por nota
  guardada — Task 5 (`addSession`) los lee con `formData.getAll("noteIds")`.

**Nota previa:** `NoteCard` (existente) ya pinta su propio botón "Borrar"
que llama a `deleteNote` directo — pero no avisa a nadie de que lo hizo, así
que por sí solo no basta para quitar la tarjeta de la lista LOCAL de
`SessionNotebook` (se vería hasta recargar). Por eso `SessionNotebook`
envuelve cada `NoteCard` en un `SavedNoteRow` propio que lleva su propio
botón de borrar (con `onDeleted`) y le pide a `NoteCard` que oculte el suyo
(`showDelete={false}`, Step 2).

- [ ] **Step 1: Escribir el componente**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Note } from "@/lib/notes/types";
import { addNote, deleteNote } from "@/lib/notes/actions";
import { normalizeTags } from "@/lib/notes/tags";
import { NoteCard } from "@/components/notes/note-card";
import { NoteComposer, type NoteAnchor, type NoteDraft } from "@/components/notes/note-composer";

function SavedNoteRow({
  note,
  onDeleted,
}: {
  note: Note;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("notes");
  const [pending, startTransition] = useTransition();
  return (
    <div className="relative">
      <NoteCard note={note} showDelete={false} />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteNote(note.id, note.itemType, note.itemId);
            onDeleted(note.id);
          })
        }
        className="absolute top-3 right-3 text-[11px] text-status-dropped underline disabled:opacity-50"
      >
        {t("delete")}
      </button>
      <input type="hidden" name="noteIds" value={note.id} />
    </div>
  );
}

// El cuaderno de la hoja de sesión: varias notas/citas, cada una persistida
// al momento (addNote, session_id null todavía) — no al enviar el <form> de
// la sesión. Sustituye al NoteComposer suelto que antes vivía aquí (una sola
// nota, en memoria hasta el envío final). Ver spec 2026-07-29, D1-D4.
//
// `noteIds` (hidden inputs, uno por SavedNoteRow) es cómo la sesión, al
// guardarse, sabe qué notas enlazar (addSession hace el UPDATE session_id)
// — la propia lista `notes` de aquí abajo es la fuente de esos ids, no hace
// falta estado aparte.
export function SessionNotebook({
  itemType,
  itemId,
  anchor,
  anchorHint,
  onPendingChange,
}: {
  itemType: ItemType;
  itemId: string;
  anchor: NoteAnchor;
  anchorHint?: string;
  /** Reenvía onHasBodyChange de NoteComposer: hay texto sin guardar en el
   *  compositor ahora mismo. session-sheet.tsx lo usa para bloquear "Guardar
   *  sesión" y no perder ese texto en silencio. */
  onPendingChange?: (hasPending: boolean) => void;
}) {
  const t = useTranslations("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave(draft: NoteDraft): Promise<boolean> {
    setSaveError(null);
    const formData = new FormData();
    formData.set("note", draft.body);
    formData.set("noteKind", draft.kind);
    if (draft.favorite) formData.set("noteFavorite", "on");
    if (draft.spoiler) formData.set("noteSpoiler", "on");
    if (draft.public) formData.set("notePublic", "on");
    formData.set("noteTags", draft.tags);
    if (itemType === "book") formData.set("notePage", draft.page);
    if (itemType === "series" && draft.season !== null && draft.episode !== null) {
      formData.set("noteSeason", String(draft.season));
      formData.set("noteEpisode", String(draft.episode));
    }

    const result = await addNote(itemType, itemId, {}, formData);
    if (result.error || !result.id) {
      setSaveError(result.error === "empty" ? t("errorEmpty") : t("errorGeneric"));
      return false;
    }

    const position =
      itemType === "book" && draft.page
        ? { page: Number(draft.page) }
        : itemType === "series" && draft.season !== null && draft.episode !== null
          ? { season: draft.season, episode: draft.episode }
          : {};

    setNotes((prev) => [
      ...prev,
      {
        id: result.id!,
        itemType,
        itemId,
        kind: draft.kind,
        body: draft.body,
        position,
        isFavorite: draft.favorite,
        tags: normalizeTags(draft.tags),
        isSpoiler: draft.spoiler,
        isPublic: draft.public,
        createdAt: new Date().toISOString(),
        itemTitle: null,
      },
    ]);
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <SavedNoteRow
          key={note.id}
          note={note}
          onDeleted={(id) => setNotes((prev) => prev.filter((n) => n.id !== id))}
        />
      ))}

      <NoteComposer
        anchor={anchor}
        anchorHint={anchorHint}
        defaultOpen={notes.length > 0}
        onHasBodyChange={onPendingChange}
        onSave={handleSave}
        saveError={saveError}
      />
    </div>
  );
}
```

- [ ] **Step 2: `NoteCard` gana `showDelete` para no duplicar el botón**

`SavedNoteRow` (Step 1) ya trae su propio botón "Borrar" (el que sí
actualiza la lista local) — `NoteCard` necesita poder ocultar el suyo para
no pintar dos.

En `src/components/notes/note-card.tsx`, ampliar la firma:

```typescript
export function NoteCard({
  note,
  showItem = false,
  showDelete = true,
}: {
  note: Note;
  showItem?: boolean;
  showDelete?: boolean;
}) {
```

Y envolver su botón "Borrar" existente (líneas 86-93) en `{showDelete && (...)}`.

En `SavedNoteRow` (arriba), pasar `<NoteCard note={note} showDelete={false} />`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/session/session-notebook.tsx src/components/notes/note-card.tsx
git commit -m "feat(sesiones): SessionNotebook — varias notas por sesión, persistidas al momento"
```

---

### Task 4: Enchufar `SessionNotebook` en la hoja de sesión

**Files:**
- Modify: `src/components/session/session-sheet.tsx`
- Modify: `messages/es.json`

**Interfaces:**
- Consumes: `SessionNotebook` (Task 3).

- [ ] **Step 1: Sustituir el `NoteComposer` suelto**

En `src/components/session/session-sheet.tsx`, cambiar el import:

```typescript
import { SessionNotebook } from "./session-notebook";
```

Quitar `import { NoteComposer, type NoteAnchor } from "@/components/notes/note-composer";`
— pero SÍ conservar `type NoteAnchor`, sigue haciendo falta para tipar
`noteAnchor`. Cambiar a:

```typescript
import type { NoteAnchor } from "@/components/notes/note-composer";
```

Sustituir el bloque (líneas ~271-282):

```tsx
          <NoteComposer
            anchor={noteAnchor}
            anchorHint={t("noteAnchorHint")}
            onHasBodyChange={setNoteHasBody}
            maxBody={2000}
          />
```

por:

```tsx
          <SessionNotebook
            itemType={itemType}
            itemId={itemId}
            anchor={noteAnchor}
            anchorHint={t("noteAnchorHint")}
            onPendingChange={setNotePending}
          />
```

- [ ] **Step 2: `noteHasBody` pasa a derivarse de la lista, no del texto suelto**

`SessionNotebook` no expone cuántas notas lleva guardadas — más simple:
sustituir el estado `noteHasBody`/`setNoteHasBody` por un nuevo callback
`onCountChange` en `SessionNotebook` (Task 3) que se dispara cada vez que
`notes` cambia de tamaño. Volver a Task 3 y añadir:

```typescript
export function SessionNotebook({
  itemType,
  itemId,
  anchor,
  anchorHint,
  onPendingChange,
  onCountChange,
}: {
  ...
  onCountChange?: (count: number) => void;
}) {
```

Con un `useEffect`:

```typescript
  useEffect(() => {
    onCountChange?.(notes.length);
  }, [notes.length, onCountChange]);
```

(añadir `useEffect` al import de `"react"` en `session-notebook.tsx`).

En `session-sheet.tsx`, renombrar `noteHasBody`/`setNoteHasBody` a
`noteCount`/`setNoteCount` (`useState(0)`), pasar
`onCountChange={setNoteCount}` a `SessionNotebook`, y cambiar el único uso
en el footer:

```tsx
            {pending
              ? t("submitting")
              : noteCount > 0
                ? t("submitWithNote")
```

- [ ] **Step 3: Nuevo estado `notePending` + bloqueo del envío**

Junto a `const [noteCount, setNoteCount] = useState(0);`:

```typescript
  const [notePending, setNotePending] = useState(false);
```

En el footer, junto al botón:

```tsx
          {notePending && (
            <p className="mb-2.5 text-sm text-status-dropped">{t("notePendingHint")}</p>
          )}
          <Button type="submit" disabled={pending || notePending} className="w-full">
```

- [ ] **Step 4: Retirar el mecanismo `noteFailed`**

En `session-sheet.tsx`:

- Cambiar `if (state.passClosed && !state.noteFailed) setClosingPass(true);`
  por `if (state.passClosed) setClosingPass(true);`.
- Cambiar `if (!state.ok || state.passClosed || state.noteFailed) return;`
  por `if (!state.ok || state.passClosed) return;`.
- Quitar el bloque:
  ```tsx
          {state.noteFailed && (
            <p className="mb-2.5 text-sm text-status-dropped">{t("noteFailed")}</p>
          )}
  ```
- Quitar el comentario largo de líneas ~91-96 y ~317-320 que explica
  `noteFailed` (ya no aplica — el fallo de guardar una nota se ve en vivo
  dentro del cuaderno, nunca al final).

- [ ] **Step 5: Traducciones — nueva `notePendingHint`, retirar las muertas**

En `messages/es.json`, dentro de `"session"`, junto a `"noteAnchorHint"`:

```json
    "notePendingHint": "Guarda o borra la nota en curso antes de continuar.",
```

Quitar (ya no se usan tras este task):
- `"session.errors.noteTooLong"` (línea ~1358)
- `"session.noteFailed"` (línea ~1361)

- [ ] **Step 6: Typecheck + tests unitarios existentes**

```bash
npm run typecheck
npm test
```

Ambos deben pasar limpio (no hay tests unitarios de estos componentes, pero
no deben romperse los existentes de otros módulos).

- [ ] **Step 7: Commit**

```bash
git add src/components/session/session-sheet.tsx src/components/session/session-notebook.tsx messages/es.json
git commit -m "feat(sesiones): la hoja de sesión usa SessionNotebook — varias notas, sin bloqueo por fallo único"
```

---

### Task 5: `addSession` — enlazar notas en vez de escribir una

**Files:**
- Modify: `src/lib/sessions/actions.ts`
- Modify: `messages/es.json` (ya cubierto en Task 4, `errors.noteTooLong`)

**Interfaces:**
- Consumes: `formData.getAll("noteIds")` (Task 3, hidden inputs).
- Produces: `AddSessionState` sin `noteTooLong` ni `noteFailed`.

- [ ] **Step 1: Retirar la validación y el insert de nota únicos**

En `src/lib/sessions/actions.ts`, quitar el bloque (líneas ~81-94):

```typescript
  const note = String(formData.get("note") ?? "").trim();
  // progress_sessions.note tiene CHECK ...
  if ([...note].length > 2000) return { error: "noteTooLong" };
```

Quitar `note: note || null,` del insert de `progress_sessions` (línea 186)
— el objeto insertado deja de incluir la clave `note` (columna queda
`null` por defecto en la fila nueva).

Quitar el bloque completo `if (note) { ... }` (líneas ~202-266) que
insertaba en `notes` desde aquí.

- [ ] **Step 2: Leer y enlazar `noteIds`**

Tras el insert de `progress_sessions` (donde antes empezaba el bloque
`if (note) { ... }` retirado en el Step 1), añadir:

```typescript
  // Las notas de esta sesión ya se guardaron sueltas (SessionNotebook,
  // session_id null) mientras la hoja estaba abierta — aquí solo se
  // enlazan a la sesión recién creada. Best-effort a propósito (D4 de la
  // spec 2026-07-29): si falla, la sesión y las notas siguen existiendo,
  // solo queda sin poner la etiqueta de agrupación.
  const noteIds = formData.getAll("noteIds").map(String).filter(Boolean);
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

- [ ] **Step 3: Limpiar el tipo `AddSessionState`**

```typescript
export type AddSessionState = {
  error?: "invalidPosition" | "invalidDuration" | "generic";
  ok?: boolean;
  passClosed?: boolean;
};
```

(quitar `"noteTooLong"` del union y el campo `noteFailed`).

- [ ] **Step 4: Quitar el import ahora sin uso**

`normalizeTags` (`import { normalizeTags } from "@/lib/notes/tags";`, línea
17) ya no se usa en este fichero — quitar el import.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/sessions/actions.ts
git commit -m "feat(sesiones): addSession enlaza notas ya guardadas en vez de escribir una"
```

---

### Task 6: `getTodayFocus` cuenta notas, no sesiones-con-texto

**Files:**
- Modify: `src/lib/stats/get-today-focus.ts`

**Interfaces:**
- Ninguna nueva hacia fuera — `TodayPass.noteCount` mantiene su forma.

- [ ] **Step 1: Quitar `note` de la consulta de sesiones, añadir consulta de notas**

En `src/lib/stats/get-today-focus.ts`, cambiar la consulta de
`progress_sessions` (líneas 107-115):

```typescript
    passIds.length
      ? supabase
          .from("progress_sessions")
          .select("pass_id, session_date")
          .in("pass_id", passIds)
      : Promise.resolve({
          data: [] as { pass_id: string; session_date: string }[],
          error: null,
        }),
```

Añadir una cuarta consulta en paralelo (dentro del mismo `Promise.all`,
junto a `watches`):

```typescript
    passIds.length
      ? supabase.from("notes").select("pass_id").in("pass_id", passIds)
      : Promise.resolve({ data: [] as { pass_id: string | null }[], error: null }),
```

Actualizar la desestructuración:

```typescript
  const [passes, sessions, watches, notes] = await Promise.all([
    ...
  ]);
  if (passes.error) throw passes.error;
  if (sessions.error) throw sessions.error;
  if (watches.error) throw watches.error;
  if (notes.error) throw notes.error;
```

- [ ] **Step 2: Contar desde `notes`, no desde `s.note`**

Cambiar el bucle (líneas 139-143):

```typescript
  for (const s of sessions.data ?? []) {
    touch(s.pass_id, s.session_date);
  }
  for (const n of notes.data ?? []) {
    if (n.pass_id) notesByPass.set(n.pass_id, (notesByPass.get(n.pass_id) ?? 0) + 1);
  }
```

(el `touch` para días con actividad se queda igual, solo pierde la parte de
contar notas — esa se mueve a su propio bucle sobre `notes.data`).

- [ ] **Step 3: Typecheck + comprobación manual**

```bash
npm run typecheck
```

Verificación manual en Supabase dev (Task 8 la cubre con detalle): crear 2
notas sueltas de un mismo pase y confirmar que el "3 notas" de la portada
las cuenta ambas.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stats/get-today-focus.ts
git commit -m "fix(stats): contar notas reales del pase, no sesiones con progress_sessions.note"
```

---

### Task 7: Reescribir el e2e existente + añadir el caso multi-nota

**Files:**
- Modify: `e2e/notas-captura.spec.ts`

**Contexto:** los 3 tests que usan el compositor DENTRO de la hoja de sesión
asumían un único envío que guardaba sesión + nota a la vez
(`textarea[name="note"]` → clic directo en "guardar sesión y cita"). Con
`SessionNotebook`, hace falta un clic intermedio en "Guardar nota" ANTES de
guardar la sesión. Además, `deleteSessionsByNote` limpiaba la sesión de
prueba buscando por `progress_sessions.note` — esa columna ya no se
escribe (Task 5), así que ese helper deja de encontrar nada y las sesiones
de prueba quedarían huérfanas en `devtest`.

- [ ] **Step 1: Sustituir el helper de limpieza de sesión**

Cambiar `deleteSessionsByNote` (líneas 153-159) por una versión que
encuentra la sesión A TRAVÉS de la nota ya enlazada (`notes.session_id`),
en vez de por `progress_sessions.note`:

```typescript
// La nota queda enlazada a su sesión (session_id) tras guardar — se borra
// la sesión por ahí, ya no por progress_sessions.note (columna que
// SessionNotebook dejó de escribir, ver spec 2026-07-29 D6).
async function deleteSessionByLinkedNote(userId: string, body: string) {
  const noteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=eq.${encodeURIComponent(body)}&select=session_id`,
    { headers: headers() },
  );
  await assertOk(noteRes, `deleteSessionByLinkedNote: GET notes?body=${body}`);
  const [note] = (await noteRes.json()) as { session_id: string | null }[];
  if (!note?.session_id) return;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/progress_sessions?id=eq.${note.session_id}`,
    { method: "DELETE", headers: headers() },
  );
  await assertOk(res, `deleteSessionByLinkedNote: DELETE progress_sessions?id=${note.session_id}`);
}
```

Sustituir las 2 llamadas a `deleteSessionsByNote(...)` (en los tests de las
líneas ~251 y ~385) por `deleteSessionByLinkedNote(...)` — MISMO orden de
limpieza: llamar ANTES de `deleteNotesByBody` en el array de
`settleCleanup` (si se borra la nota primero, se pierde el `session_id` con
el que encontrar la sesión).

- [ ] **Step 2: Rehacer el clic de guardado en los 3 tests existentes**

En `"el anclaje de la nota sigue a la pagina..."` (línea ~239-240), cambiar:

```typescript
    await dialog.locator('textarea[name="note"]').fill(BODY);
    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
```

por:

```typescript
    await dialog.locator('textarea[name="note"]').fill(BODY);
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY)).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
```

Aplicar el MISMO cambio (fill → clic "Guardar" → esperar que aparezca en la
lista → clic "Guardar sesión y cita") en
`"la nota de una sesion se pinta UNA sola vez en Registro"` (línea ~369-370).

`"guardar la sesion con el compositor vacio no crea ninguna nota"` no
necesita cambios de interacción (el compositor se deja vacío a propósito, el
botón "Guardar nota" ni se pulsa) — pero el botón final que pulsa cambia de
nombre accesible: revisar que `/^guardar sesión$/i` (línea 339) siga
casando (sigue siendo "Guardar sesión" cuando no hay notas en la lista — sin
cambios).

- [ ] **Step 3: Nuevo test — varias notas en una sesión**

Añadir al final del fichero:

```typescript
test("varias notas en la misma sesion quedan todas enlazadas al guardar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await login(page);
  const userId = await devtestId();
  const { itemId, passId, snapshot } = await resolveBookFixture(userId);
  const BODY_A = "e2e · primera nota de la sesion";
  const BODY_B = "e2e · segunda nota de la sesion";

  try {
    await setPassPage(passId, 200);
    await page.goto(`/libro/${itemId}?tab=log`);
    await sessionLink(page, passId).click();
    await page.waitForURL(/\/sesion\//);

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="page"]').fill("220");
    await dialog.getByRole("button", { name: /añadir una nota o cita/i }).click();

    await dialog.locator('textarea[name="note"]').fill(BODY_A);
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY_A)).toBeVisible({ timeout: 10_000 });

    // Guardada la primera, el compositor se vacía pero sigue abierto — la
    // segunda no requiere reabrirlo.
    await dialog.locator('textarea[name="note"]').fill(BODY_B);
    await dialog.getByRole("button", { name: /^guardar$/i }).click();
    await expect(dialog.getByText(BODY_B)).toBeVisible({ timeout: 10_000 });

    // Las dos ya existen en BD ANTES de guardar la sesión (persistencia
    // inmediata, D1 de la spec) — es lo que este test cubre que los 3
    // anteriores no cubrían.
    expect(await countNotesByBody(userId, BODY_A)).toBe(1);
    expect(await countNotesByBody(userId, BODY_B)).toBe(1);

    await dialog.getByRole("button", { name: /guardar sesión y cita/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Y tras guardar la sesión, las dos quedan enlazadas a ELLA (mismo
    // session_id), no sueltas.
    const notesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/notes?user_id=eq.${userId}&body=in.(${encodeURIComponent(BODY_A)},${encodeURIComponent(BODY_B)})&select=session_id`,
      { headers: headers() },
    );
    await assertOk(notesRes, "check session_id enlazado");
    const rows = (await notesRes.json()) as { session_id: string | null }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].session_id).not.toBeNull();
    expect(rows[0].session_id).toBe(rows[1].session_id);
  } finally {
    await settleCleanup([
      () => deleteSessionByLinkedNote(userId, BODY_A),
      () => deleteNotesByBody(userId, BODY_A),
      () => deleteNotesByBody(userId, BODY_B),
      () => restorePass(passId, snapshot),
    ]);
  }
});
```

- [ ] **Step 4: Correr el e2e**

```bash
npm run test:e2e -- notas-captura
```

Requiere el dev server arriba (puerto 3000, ver AGENTS.md) y credenciales
`TEST_USER_*`/`SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Los 5 tests deben
pasar.

- [ ] **Step 5: Commit**

```bash
git add e2e/notas-captura.spec.ts
git commit -m "test(e2e): notas-captura sigue el flujo de guardado por nota + caso multi-nota"
```

---

### Task 8: Sincronizar documentación

**Files:**
- Modify: `docs/requirements/data-model.md`
- Modify: `docs/requirements/decisiones.md`

**Interfaces:** ninguna — solo documentación.

- [ ] **Step 1: Actualizar `data-model.md`**

En la entrada de `progress_sessions` (línea ~139-141), añadir una frase
sobre la columna `note`:

```
- **`progress_sessions`** — sesiones de lectura/visionado. `position` es el punto
  ALCANZADO. `started_at` (añadido en plan 05) permite saber la franja horaria real;
  `created_at` es cuándo se registró, que no es lo mismo. `note` (texto, legacy) ya
  no se escribe desde 2026-07-29 — las notas de sesión viven en `notes`
  (varias por sesión, enlazadas por `session_id`); la columna se queda con
  las filas históricas, sin migrar.
```

Verificar (grep) si la entrada de `notes` (línea ~144-154) menciona "una
nota por sesión" en algún sitio — si lo hace, corregir a "varias, una fila
por nota".

- [ ] **Step 2: Añadir entrada a `decisiones.md` (append-only, al final)**

```markdown
## 2026-07-29 — Notas/citas múltiples y progresivas por sesión

Una sesión puede llevar varias notas/citas, capturadas de una en una y
guardadas al instante (no en el envío final del formulario de sesión) —
motivado por el cronómetro: una sesión de horas no debía perder texto ya
escrito si se cerraba la pestaña antes de guardar. Se reutiliza `addNote`
(la misma pieza de "Memorizar" en ficha, notas sueltas con `session_id`
null) invocada directamente desde el cliente, sin pasar por el `<form>` de
la sesión. Al guardar la sesión, `addSession` enlaza (`session_id`) las
notas ya guardadas por id — no las escribe él.

Efecto colateral: `progress_sessions.note` (columna legacy, una nota, tope
2000 caracteres) deja de escribirse. Único lector real localizado:
`getTodayFocus` (el "N notas" de la portada), que pasa a contar filas de
`notes` por pase en vez de sesiones con `.note` no vacío — más correcto
(cuenta notas, no sesiones-con-texto). La columna no se borra ni se migra.

Ver spec: `docs/superpowers/specs/2026-07-29-sesiones-notas-multiples-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/requirements/data-model.md docs/requirements/decisiones.md
git commit -m "docs(sesiones): sincroniza data-model y decisiones con notas múltiples"
```

---

### Task 9: Abrir issue por las traducciones muertas descubiertas

**Files:** ninguno — se abre en GitHub, no en el repo.

**Contexto:** durante Task 4 se descubrió que `session.note`,
`session.noteHint`, `session.noteKindNote`, `session.noteKindQuote`,
`session.noteFavorite`, `session.noteKindLabel` (en `messages/es.json`) NO
tienen ningún `t(...)` que las use en `src/` — quedaron huérfanas de una
versión anterior a que `NoteComposer` se consolidara (issue #109). No es
parte de este cambio (ya estaban muertas antes) — se abre issue aparte por
la regla de "todo lo pendiente vive como issue" (AGENTS.md).

- [ ] **Step 1: Abrir la issue**

```bash
gh issue create \
  --title "Claves de traducción muertas en session.* (es.json)" \
  --body "Descubierto al implementar notas múltiples por sesión (2026-07-29, ver docs/superpowers/specs/2026-07-29-sesiones-notas-multiples-design.md).

Estas claves bajo `\"session\"` en \`messages/es.json\` no tienen ningún \`t(...)\` que las use en \`src/\` (grep confirmado):
- \`note\`
- \`noteHint\`
- \`noteKindNote\`
- \`noteKindQuote\`
- \`noteFavorite\`
- \`noteKindLabel\`

Parecen resto de una versión de la hoja de sesión anterior a que \`NoteComposer\` se consolidara (issue #109 menciona esa consolidación). No estaban en uso ya antes de este cambio — no es una regresión de la feature de notas múltiples, es deuda preexistente descubierta de refilón.

Repro: \`grep -rn 't(\"note\"' src/\` (namespace session) no encuentra nada; ídem para las otras 5 claves.

Acota: no afecta a runtime (next-intl no falla por claves sin usar), es limpieza de mantenimiento."
```

- [ ] **Step 2: No hay commit — la issue es el entregable de este task.**

---

## Verificación final

- [ ] `npm run typecheck` limpio
- [ ] `npm test` limpio (suite unitaria completa, sin regresiones)
- [ ] `npm run lint` limpio
- [ ] `npm run test:e2e -- notas-captura` — 5/5 tests en verde
- [ ] QA manual en navegador (Supabase dev): cronómetro arrancado, 2 notas
      guardadas ANTES de tocar "Guardar sesión", confirmar en BD que ya
      existen con `session_id: null`; guardar la sesión; confirmar el
      enlace. Borrar una nota desde el cuaderno a medio componer y
      confirmar que desaparece de la lista y de BD. Cerrar la hoja con
      texto sin guardar en el compositor y confirmar que "Guardar sesión"
      queda bloqueado con la pista visible.
