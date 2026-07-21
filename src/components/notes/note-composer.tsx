"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export type NoteAnchor =
  | { kind: "page"; page: number | null }
  | { kind: "episode"; season: number; episode: number }
  | { kind: "none" };

// El compositor de notas y citas. NO renderiza <form>: dentro de la hoja de
// sesión iría anidado dentro del <form> de la sesión, y un form dentro de otro
// es HTML ilegal — el navegador lo desmonta y pierdes campos sin avisar. Pinta
// campos sueltos y cada montaje decide quién envía, igual que ya hacen
// BookProgressField y SeriesEpisodeGrid dentro de la misma hoja.
export function NoteComposer({
  anchor,
  anchorHint,
  defaultOpen = false,
  onHasBodyChange,
}: {
  /** Anclaje sugerido. En la hoja de sesión lo manda el campo VIVO. */
  anchor: NoteAnchor;
  /** Texto bajo el anclaje: de dónde ha salido. Ya traducido. */
  anchorHint?: string;
  /** Plegado por defecto en la hoja (la hoja ya mide 848px de scroll). */
  defaultOpen?: boolean;
  /** Avisa al padre de si hay texto, para que el footer cambie de rótulo. */
  onHasBodyChange?: (hasBody: boolean) => void;
}) {
  const t = useTranslations("notes");
  const [open, setOpen] = useState(defaultOpen);
  const [kind, setKind] = useState<"note" | "quote">("quote");
  const [body, setBody] = useState("");
  // El anclaje NO se copia a estado: se deriva. `override` es null mientras el
  // usuario no toque el campo, y entonces manda la prop —que en la hoja de
  // sesión sigue en vivo al stepper de página—. En cuanto lo edita, manda su
  // valor. Copiar la prop a un useState la congelaría en el montaje: el
  // compositor se monta con la hoja y no se vuelve a montar, así que la nota
  // se anclaría a la página GUARDADA en vez de a la que acabas de marcar.
  const [override, setOverride] = useState<string | null>(null);
  const page =
    override ?? (anchor.kind === "page" && anchor.page !== null ? String(anchor.page) : "");
  const [editingAnchor, setEditingAnchor] = useState(false);

  function changeBody(next: string) {
    setBody(next);
    onHasBodyChange?.(next.trim().length > 0);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-start rounded-full border border-border px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-surface-muted"
      >
        ✎ {t("composerToggle")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
        {t("composerTitle")}
      </span>

      {/* Segmento cita/nota. El input radio va oculto pero presente: es él
          quien viaja en el FormData como `noteKind`. */}
      <div className="flex gap-1 self-start rounded-[9px] bg-surface-muted p-1">
        {(["quote", "note"] as const).map((k) => (
          <label
            key={k}
            className="cursor-pointer rounded-[6px] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground has-[:checked]:bg-surface has-[:checked]:text-foreground has-[:checked]:shadow-card"
          >
            <input
              type="radio"
              name="noteKind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="sr-only"
            />
            {k === "quote" ? t("kindQuote") : t("kindNote")}
          </label>
        ))}
      </div>

      {/* La cita se escribe en serif itálica y la nota en la tipografía normal:
          la forma dice de qué tipo es antes de leer el segmento. */}
      <textarea
        name="note"
        rows={3}
        maxLength={2000}
        value={body}
        onChange={(e) => changeBody(e.target.value)}
        placeholder={kind === "quote" ? t("quotePlaceholder") : t("notePlaceholder")}
        aria-label={t("bodyLabel")}
        className={`rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${
          kind === "quote" ? "font-serif text-[15px] italic" : ""
        }`}
      />

      {/* Anclaje. En serie no es editable a mano: sale de los episodios que
          acabas de marcar y se manda en hidden — pedir "temporada y episodio"
          por teclado aquí sería una tercera forma de decir lo mismo. */}
      {anchor.kind === "episode" ? (
        <>
          <p className="text-[11.5px] text-muted-foreground">
            {t("anchorLabel")}:{" "}
            <b className="text-foreground">
              {t("anchorEpisode", { season: anchor.season, episode: anchor.episode })}
            </b>
            {anchorHint && <span className="block text-[10.5px]">{anchorHint}</span>}
          </p>
          <input type="hidden" name="noteSeason" value={anchor.season} />
          <input type="hidden" name="noteEpisode" value={anchor.episode} />
        </>
      ) : anchor.kind === "page" ? (
        editingAnchor ? (
          <Field label={t("anchorLabel")} htmlFor="note-page">
            <Input
              id="note-page"
              name="notePage"
              type="number"
              min={0}
              inputMode="numeric"
              value={page}
              onChange={(e) => setOverride(e.target.value)}
            />
          </Field>
        ) : (
          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span>
              {t("anchorLabel")}:{" "}
              <b className="text-foreground">
                {page ? t("anchorPage", { page: Number(page) }) : t("anchorNone")}
              </b>
              {anchorHint && <span className="block text-[10.5px]">{anchorHint}</span>}
            </span>
            <button
              type="button"
              onClick={() => setEditingAnchor(true)}
              className="text-accent underline"
            >
              {t("anchorEdit")}
            </button>
            <input type="hidden" name="notePage" value={page} />
          </p>
        )
      ) : null}

      <Field label={t("tagsLabel")} htmlFor="note-tags">
        <Input
          id="note-tags"
          name="noteTags"
          type="text"
          placeholder={t("tagsPlaceholder")}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-muted-foreground">
        <input type="checkbox" name="noteFavorite" className="h-4 w-4 rounded border-border accent-accent" />
        {t("favorite")}
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted-foreground">
        <input type="checkbox" name="noteSpoiler" className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
        <span>
          {t("spoilerLabel")}
          <span className="block text-[10.5px]">{t("spoilerHint")}</span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted-foreground">
        <input type="checkbox" name="notePublic" className="mt-0.5 h-4 w-4 rounded border-border accent-accent" />
        <span>
          {t("publicLabel")}
          <span className="block text-[10.5px]">{t("publicHint")}</span>
        </span>
      </label>
    </div>
  );
}
