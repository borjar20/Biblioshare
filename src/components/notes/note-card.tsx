"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Note } from "@/lib/notes/types";
import { formatPosition } from "@/lib/library/position";
import { itemHref } from "@/lib/catalog/item-href";
import { deleteNote, toggleNoteFavorite } from "@/lib/notes/actions";
import { defaultNotesQuery, notesHref } from "@/lib/notes/query";

// Dos tratamientos por `kind` (mockup): la cita es protagonista en serif, la
// nota es una tarjeta normal. Tus propias notas NUNCA se te velan: el spoiler
// es información sobre terceros y su velo llega en F2, con el progreso del
// visitante. Aquí solo se distingue.
//
// `showItem` lo enciende el cuaderno cuando la lista NO va agrupada por obra: en
// «recientes» las notas de obras distintas se mezclan y sin el título no sabes
// de qué estabas hablando. Agrupadas, el título ya lo pone la cabecera del grupo.
export function NoteCard({ note, showItem = false }: { note: Note; showItem?: boolean }) {
  const t = useTranslations("notes");
  const [pending, startTransition] = useTransition();
  const anchor = formatPosition(note.itemType, note.position);

  return (
    <article
      className={`flex flex-col gap-2 rounded-card border border-border p-4 ${
        note.kind === "quote" ? "bg-surface-muted" : "bg-surface"
      }`}
    >
      {showItem && (
        <Link
          href={itemHref(note.itemType, note.itemId)}
          className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase hover:text-accent"
        >
          {note.itemTitle ?? t("notebookUnknownWork")}
        </Link>
      )}

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
        {/* La etiqueta es un filtro: lleva al cuaderno con esa etiqueta puesta,
            desde aquí y desde la ficha. Va a un estado limpio a propósito — no
            sabe qué otros filtros hubiera, y arrastrarlos sorprendería. */}
        {note.tags.map((tag) => (
          <Link
            key={tag}
            href={notesHref(defaultNotesQuery(), { tag })}
            className="rounded-full bg-surface-3 px-2 py-0.5 hover:text-accent"
          >
            #{tag}
          </Link>
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
