"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createMarginNote, type MarginError } from "@/lib/margin/actions";
import { searchMyFollowers } from "@/lib/margin/follower-search";
import { unlockPageHint } from "@/lib/margin/threshold";
import { MARGIN_BODY_MAX, MARGIN_CHAPTER_MAX, type MarginPerson } from "@/lib/margin/types";

type Props = {
  itemType: ItemType;
  itemId: string;
  defaultPage?: number;
  pages?: number | null;
  defaultEpisode?: { season: number; episode: number };
  onDone?: () => void;
};

// Formulario para dejar una nota en el margen. NO es dueño de ninguna hoja:
// lo montan la hoja de sesión, el panel de episodios y la ficha (MarginSection)
// dentro de su propio contenedor. Tampoco se anida en el <form> de la sesión:
// el llamante lo pinta fuera (MarginNoteSheet), porque un <form> dentro de otro
// no es HTML válido.
export function MarginNoteComposer({ itemType, itemId, defaultPage, pages, defaultEpisode, onDone }: Props) {
  const t = useTranslations("margin");
  const uid = useId();
  const [page, setPage] = useState<string>(defaultPage ? String(defaultPage) : "");
  const [chapter, setChapter] = useState("");
  const [body, setBody] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [recipient, setRecipient] = useState<MarginPerson | null>(null);
  const [personMode, setPersonMode] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarginPerson[]>([]);
  const [error, setError] = useState<MarginError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  // Las búsquedas pueden resolver desordenadas: solo vale la última lanzada.
  const searchSeq = useRef(0);

  const pageNumber = page === "" ? null : Number(page);
  const hint =
    itemType === "book" && pageNumber && pages ? unlockPageHint(pageNumber / pages, pages) : null;

  async function onSearch(value: string) {
    setRecipient(null);
    setQuery(value);
    const seq = ++searchSeq.current;
    const found = value.trim().length >= 2 ? await searchMyFollowers(value) : [];
    if (seq === searchSeq.current) setResults(found);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (itemType === "book" && chapter.trim() === "") return setError("invalidChapter");
    if (body.trim() === "") return setError("invalidBody");
    setError(null);
    start(async () => {
      const result = await createMarginNote({
        itemType,
        itemId,
        page: itemType === "book" ? pageNumber : null,
        season: defaultEpisode?.season ?? null,
        episode: defaultEpisode?.episode ?? null,
        chapterLabel: itemType === "book" ? chapter : null,
        body,
        isSpoiler: spoiler,
        recipientId: personMode ? (recipient?.id ?? null) : null,
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {itemType === "book" && (
        <>
          <Field label={t("page")} htmlFor={`${uid}-page`}>
            <Input
              id={`${uid}-page`}
              inputMode="numeric"
              value={page}
              onChange={(e) => setPage(e.target.value.replace(/\D/g, ""))}
              className="min-h-11"
            />
          </Field>
          <Field label={t("chapter")} htmlFor={`${uid}-chapter`} hint={t("chapterHint")}>
            <Input
              id={`${uid}-chapter`}
              value={chapter}
              maxLength={MARGIN_CHAPTER_MAX}
              onChange={(e) => setChapter(e.target.value)}
              className="min-h-11"
            />
          </Field>
        </>
      )}

      <Field label={t("body")} htmlFor={`${uid}-body`}>
        <textarea
          id={`${uid}-body`}
          value={body}
          maxLength={MARGIN_BODY_MAX}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-24 w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>

      {(hint || !defaultEpisode) && (
        <p className="text-xs text-muted-foreground">
          {hint ? t("opensAround", { page: hint }) : t("opensAtFinish")}
        </p>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">{t("audience")}</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${uid}-audience`}
            checked={!personMode}
            onChange={() => setPersonMode(false)}
            className="h-4 w-4 accent-accent"
          />
          {t("audienceFollowers")}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${uid}-audience`}
            checked={personMode}
            onChange={() => setPersonMode(true)}
            className="h-4 w-4 accent-accent"
          />
          {t("audiencePerson")}
        </label>
        {personMode && (
          <div className="flex flex-col gap-1">
            <Input
              aria-label={t("searchFollower")}
              placeholder={t("searchFollower")}
              value={recipient ? recipient.username : query}
              onChange={(e) => void onSearch(e.target.value)}
              className="min-h-11"
            />
            {!recipient && results.length > 0 && (
              <ul className="overflow-hidden rounded-md border border-border bg-surface">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="min-h-11 w-full px-3 text-left text-sm hover:bg-surface-muted"
                      onClick={() => setRecipient(p)}
                    >
                      {p.displayName ?? p.username}{" "}
                      <span className="text-muted-foreground">@{p.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </fieldset>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={spoiler}
          onChange={(e) => setSpoiler(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        {t("spoiler")}
      </label>

      {error && (
        <p role="alert" className="text-sm text-status-dropped">
          {t(`errors.${error}`)}
        </p>
      )}
      {saved && !onDone && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("saved")}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || saved || (personMode && !recipient)}
        className="min-h-11 self-start"
      >
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
