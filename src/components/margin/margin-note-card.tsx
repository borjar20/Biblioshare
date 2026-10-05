import Link from "next/link";
import { useTranslations } from "next-intl";
import { SpoilerGate } from "@/components/social/spoiler-gate";
import { UserAvatar } from "@/components/social/user-avatar";
import type { MarginNoteView } from "@/lib/margin/types";
import { MarginOwnActions } from "./margin-own-actions";

// Marcador que sustituye a {names} para intercalar enlaces sin trocear el texto traducido.
const NAMES_MARK = "\u0001";

function FoundBy({ template, foundBy }: { template: string; foundBy: NonNullable<MarginNoteView["foundBy"]> }) {
  const [before, after] = template.split(NAMES_MARK);
  return (
    <>
      {before}
      {foundBy.map((f, i) => (
        <span key={f.encounterId}>
          {i > 0 && ", "}
          <Link href={`/margen/${f.encounterId}`} className="underline">
            {f.reader.displayName ?? f.reader.username}
          </Link>
        </span>
      ))}
      {after}
    </>
  );
}

// `hideOwnActions`: en el hilo de un encuentro `foundBy` solo trae a ESE lector,
// así que el borrado (que se lleva la nota y todos sus hilos) no puede decir la
// cifra real. Allí no se ofrece; el borrado vive en la ficha, que cuenta bien.
export function MarginNoteCard({
  note,
  showNew = false,
  hideOwnActions = false,
}: {
  note: MarginNoteView;
  showNew?: boolean;
  hideOwnActions?: boolean;
}) {
  const t = useTranslations("margin");
  const authorName = note.author.displayName ?? note.author.username;
  const where =
    note.anchor.kind === "ratio"
      ? [note.chapterLabel, t("onPage", { page: note.anchor.page })].filter(Boolean).join(" · ")
      : note.anchor.kind === "episode"
        ? t("episodeLabel", { season: note.anchor.season, episode: note.anchor.episode })
        : t("finishLabel");
  const body = <p className="whitespace-pre-line text-sm">{note.body}</p>;
  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 shadow-sm">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <UserAvatar name={authorName} avatarUrl={note.author.avatarUrl} size={24} />
        <span className="font-medium">{authorName}</span>
        <span className="text-muted-foreground">{where}</span>
        {note.audience === "person" && (
          <span className="text-xs">
            {note.encounter ? t("forYou") : t("forPerson", { name: note.recipient?.username ?? "" })}
          </span>
        )}
        {showNew && <span className="ml-auto text-xs font-semibold">{t("new")}</span>}
      </header>
      {note.isSpoiler ? <SpoilerGate>{body}</SpoilerGate> : body}
      {note.encounter && (
        <Link href={`/margen/${note.encounter.id}`} className="min-h-11 self-start py-2 text-sm underline">
          {t("reply")}
        </Link>
      )}
      {note.foundBy && (
        <p className="text-xs text-muted-foreground">
          {note.foundBy.length === 0 ? (
            t("foundByNobody")
          ) : (
            <FoundBy template={t("foundBy", { names: NAMES_MARK })} foundBy={note.foundBy} />
          )}
        </p>
      )}
      {note.foundBy && !hideOwnActions && <MarginOwnActions noteId={note.noteId} conversations={note.foundBy.length} />}
    </article>
  );
}
