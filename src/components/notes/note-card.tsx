"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import type { Note } from "@/lib/notes/types";
import { formatPosition } from "@/lib/library/position";
import { deleteNote, toggleNoteFavorite } from "@/lib/notes/actions";

// Dos tratamientos por `kind` (mockup): la cita es protagonista en serif, la
// nota es una tarjeta normal. Tus propias notas NUNCA se te velan: el spoiler
// es información sobre terceros y su velo llega en F2, con el progreso del
// visitante. Aquí solo se distingue.
export function NoteCard({ note }: { note: Note }) {
  const t = useTranslations("notes");
  const [pending, startTransition] = useTransition();
  const anchor = formatPosition(note.itemType, note.position);

  return (
    <article
      className={`flex flex-col gap-2 rounded-card border border-border p-4 ${
        note.kind === "quote" ? "bg-surface-muted" : "bg-surface"
      }`}
    >
      <p
        className={
          note.kind === "quote"
            ? "font-serif text-[16px] leading-snug italic text-foreground"
            : "text-sm text-foreground"
        }
      >
        {note.body}
      </p>

      <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
        {anchor && <span className="text-accent">{anchor}</span>}
        <span>{note.createdAt.slice(0, 10)}</span>
        {note.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-surface-3 px-2 py-0.5">
            #{tag}
          </span>
        ))}
        {note.isSpoiler && (
          <span className="rounded-full border border-border px-2 py-0.5">{t("spoilerBadge")}</span>
        )}
        {note.isPublic && (
          <span className="rounded-full border border-border px-2 py-0.5">{t("publicBadge")}</span>
        )}
      </div>

      <div className="flex gap-3 text-[11.5px]">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              toggleNoteFavorite(note.id, !note.isFavorite, note.itemType, note.itemId),
            )
          }
          className="text-muted-foreground underline disabled:opacity-50"
        >
          {note.isFavorite ? t("favoriteOn") : t("favoriteOff")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => deleteNote(note.id, note.itemType, note.itemId))}
          className="text-status-dropped underline disabled:opacity-50"
        >
          {t("delete")}
        </button>
      </div>
    </article>
  );
}
