"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Note } from "@/lib/notes/types";
import { itemHref } from "@/lib/catalog/item-href";

// Memorizar (frames C/H): enseña UNA nota o cita del usuario y deja cambiarla
// con "Otra nota". La cita en serif, su meta (obra · página · tipo) en mono.
// "Exportar tarjeta" (solo en citas, P10) abre el PNG de /api/og. "Repasar
// todas" aún no existe, así que el recuento va como texto, no como enlace muerto.
export function MemorizeCard({ notes }: { notes: Note[] }) {
  const t = useTranslations("notes");
  const [index, setIndex] = useState(() =>
    notes.length > 0 ? Math.floor(Math.random() * notes.length) : 0,
  );

  if (notes.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  const note = notes[index];

  function another() {
    if (notes.length < 2) return;
    setIndex((prev) => {
      let next = prev;
      while (next === prev) next = Math.floor(Math.random() * notes.length);
      return next;
    });
  }

  const meta = [
    note.itemTitle?.toUpperCase(),
    note.page != null ? `p. ${note.page}` : null,
    note.kind === "quote" ? t("kindQuote") : t("kindNote"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("title")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("countLink", { count: notes.length })}
        </span>
      </div>

      <Link
        href={itemHref(note.itemType, note.itemId)}
        className="group flex flex-col gap-2"
      >
        <p className="font-serif text-[17px] leading-snug text-foreground group-hover:text-accent">
          {note.kind === "quote" ? `«${note.body}»` : note.body}
        </p>
        <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
          {meta}
        </p>
      </Link>

      {(notes.length > 1 || note.kind === "quote") && (
        <div className="flex flex-wrap gap-2">
          {notes.length > 1 && (
            <button
              type="button"
              onClick={another}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
            >
              {t("anotherNote")}
            </button>
          )}
          {/* Exportar solo la cita (P10): la tarjeta PNG de /api/og. */}
          {note.kind === "quote" && (
            <a
              href={`/api/og/nota/${note.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
            >
              {t("exportCard")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
