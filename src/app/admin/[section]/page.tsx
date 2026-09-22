import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { getModerationPage } from "@/lib/moderation/queries";
import { evidenceText, isContentKind, type ContentRow, type HistoryRow, type ModerationKind, type ReportRow } from "@/lib/moderation/contracts";
import { ContentControls, ReportControls } from "../moderation-controls";

export const instant = false;
export const metadata = { title: "Moderación — Biblioshare" };

const sections = { reportes: "reports", contenido: "content", clubes: "clubs", historial: "history" } as const;
type Search = Record<string, string | string[] | undefined>;
const scalar = (value: Search[string]) => typeof value === "string" ? value : "";

function Evidence({ snapshot, label, commentId }: { snapshot: Record<string, unknown>; label: string; commentId?: string | null }) {
  return <details className="text-sm">
    <summary className="cursor-pointer font-medium underline underline-offset-4">{label}</summary>
    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 font-sans text-sm">{evidenceText(snapshot ?? {})}</pre>
    {commentId && typeof snapshot?.audio_path === "string" && <audio controls preload="none" className="mt-3 max-w-full" src={`/api/admin/voice-notes/${commentId}`} />}
  </details>;
}

export default async function ModerationPage({ params, searchParams }: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Search>;
}) {
  await connection();
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  const name = sections[section as keyof typeof sections];
  const t = await getTranslations("adminModeration");
  const search = await searchParams;
  const q = scalar(search.q).slice(0, 200);
  const rawKind = scalar(search.kind);
  const kind: ModerationKind = name === "reports" ? "report" : name === "history" ? "history" : name === "clubs" ? "club" :
    isContentKind(rawKind) && rawKind !== "club" ? rawKind : "post";
  const statuses = name === "reports" ? ["pending", "actioned", "dismissed", "all"] : ["all", "active", "removed"];
  const rawStatus = scalar(search.status);
  const status = statuses.includes(rawStatus) ? rawStatus : statuses[0];
  const rawOffset = Number(scalar(search.offset));
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 100000) : 0;
  let result;
  try { result = await getModerationPage<ContentRow | ReportRow | HistoryRow>(kind, status, q, offset); }
  catch { return <div className="mx-auto w-full max-w-5xl px-4 py-8">
    <PageHeader title={t(`sections.${name}`)} />
    <EmptyState glyph="!" title={t("loadError")} message={t("loadErrorHelp")}
      action={<Link href={`/admin/${section}`} className={buttonVariants("secondary")}>{t("retry")}</Link>} />
  </div>; }
  function pageHref(nextOffset: number) {
    return `/admin/${section}?${new URLSearchParams({ kind, status, q, offset: String(nextOffset) })}`;
  }
  const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(value));
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
    <div className="flex flex-col gap-2"><PageHeader title={t(`sections.${name}`)} /><p className="max-w-2xl text-sm text-muted-foreground">{t(`descriptions.${name}`)}</p></div>
    <form className="flex flex-wrap items-end gap-3" method="get">
      {name === "content" && <label className="flex flex-col gap-1 text-sm" htmlFor="moderation-kind">{t("type")}
        <select name="kind" id="moderation-kind" defaultValue={kind} className="rounded-lg border border-border bg-surface px-3 py-2">
          {["post", "club_post", "comment"].map((value) => <option key={value} value={value}>{t(`kinds.${value}`)}</option>)}
        </select>
      </label>}
      {name !== "history" && <label className="flex flex-col gap-1 text-sm" htmlFor="moderation-status">{t("statusLabel")}
        <select name="status" id="moderation-status" defaultValue={status} className="rounded-lg border border-border bg-surface px-3 py-2">
          {statuses.map((value) => <option key={value} value={value}>{t(`statuses.${value}`)}</option>)}
        </select>
      </label>}
      <label className="flex w-full min-w-0 flex-col gap-1 text-sm sm:w-auto sm:flex-1" htmlFor="moderation-search">{t("search")}
        <input id="moderation-search" name="q" defaultValue={q} maxLength={200} type="search" className="w-full rounded-lg border border-border bg-surface px-3 py-2" />
      </label>
      <Button type="submit" variant="secondary">{t("filter")}</Button>
    </form>
    {result.items.length === 0 ? <EmptyState variant="panel" glyph="✓" title={t("empty")} message={t("emptyHelp")} /> :
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {result.items.map((row) => <article key={row.id} className="flex flex-col gap-3 p-4 sm:p-5" data-testid="moderation-row">
          {name === "reports" ? (() => {
            const item = row as ReportRow;
            const commentId = item.comment_id ?? (typeof item.snapshot?.comment_id === "string" ? item.snapshot.comment_id : null);
            const targetKind = commentId ? "comment" : item.target_type;
            const targetId = commentId ?? item.target_id;
            const targetHref = isContentKind(targetKind) ? `/admin/${targetKind === "club" ? "clubes" : "contenido"}?${new URLSearchParams({ kind: targetKind, q: targetId })}` : null;
            return <>
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-lg font-semibold">{t.has(`reportReasons.${item.reason}`) ? t(`reportReasons.${item.reason}`) : item.reason}</h2><span className="text-sm text-muted-foreground">{t(`statuses.${item.status}`)}</span></div>
              <p className="text-xs text-muted-foreground">{date(item.created_at)}</p>
              {item.details && <p className="whitespace-pre-wrap break-words text-sm">{item.details}</p>}
              <Evidence snapshot={item.snapshot} label={t("evidence")} commentId={targetKind === "comment" ? targetId : null} />
              {item.target_deleted_at ? <p className="text-sm text-muted-foreground">{t("targetDeleted")}</p> : targetHref && <Link href={targetHref} className="text-sm font-medium underline underline-offset-4">{t("reviewContent")}</Link>}
              {item.status === "pending" && <ReportControls id={item.id} />}
              {item.reviewed_at && <p className="text-xs text-muted-foreground">{t("reviewedAt", { date: date(item.reviewed_at) })}</p>}
            </>;
          })() : name === "history" ? (() => {
            const item = row as HistoryRow;
            return <>
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-serif text-lg font-semibold">{t.has(`actions.${item.action}`) ? t(`actions.${item.action}`) : item.action}</h2><time className="text-xs text-muted-foreground">{date(item.created_at)}</time></div>
              <p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>
              <dl className="grid gap-1 break-all text-xs text-muted-foreground"><div><dt className="inline font-medium">{t("actor")}: </dt><dd className="inline">{item.actor_name ?? item.actor_id}</dd></div><div><dt className="inline font-medium">{t("target")}: </dt><dd className="inline">{t.has(`kinds.${item.kind}`) ? t(`kinds.${item.kind}`) : item.kind} · {item.target_id}</dd></div></dl>
              <Evidence snapshot={item.snapshot} label={t("evidence")} commentId={item.kind === "comment" ? item.target_id : null} />
            </>;
          })() : (() => {
            const item = row as ContentRow;
            return <>
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="min-w-0 break-words font-serif text-lg font-semibold">{(item.kind === "club" ? item.title : item.title?.slice(0, 120)) || t(`kinds.${item.kind}`)}</h2><span className="text-sm text-muted-foreground">{t(`statuses.${item.deleted_at ? "deleted" : item.removed_at || item.parent_removed ? "removed" : "active"}`)}</span></div>
              <p className="text-xs text-muted-foreground">{item.author_name ?? item.author_id ?? t("unknownAuthor")} · {date(item.created_at)}</p>
              {item.body && <p className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</p>}
              {item.parent_removed && <p className="text-sm text-status-dropped">{t("parentRemoved")}</p>}
              {item.kind === "comment" && typeof item.snapshot?.audio_path === "string" && <audio controls preload="none" className="max-w-full" src={`/api/admin/voice-notes/${item.id}`} />}
              <ContentControls item={item} />
            </>;
          })()}
        </article>)}
      </div>}
    {(offset > 0 || result.has_more) && <nav aria-label={t("pagination")} className="flex justify-between gap-3">
      {offset > 0 ? <Link href={pageHref(Math.max(0, offset - 25))} className={buttonVariants("secondary")}>{t("previous")}</Link> : <span />}
      {result.has_more && <Link href={pageHref(offset + 25)} className={buttonVariants("secondary")}>{t("next")}</Link>}
    </nav>}
  </div>;
}
