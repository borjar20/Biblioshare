import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAdminReleases } from "@/lib/releases/queries";
import { formatReleaseDate } from "@/lib/releases/precision";
import { releaseReviewDate } from "@/components/releases/release-view";
import { ReleaseRetry } from "@/components/releases/release-retry";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { BookIcon } from "@/components/ui/icons";

export default async function AdminReleasesPage() {
  await connection();
  const t = await getTranslations("releaseAdmin");
  const r = await getTranslations("releases");
  const result = await Promise.allSettled([getAdminReleases()]);
  const rows = result[0].status === "fulfilled" ? result[0].value : [];
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
    <PageHeader title={t("title")} action={<Link href="/admin/novedades/nuevo" className={buttonVariants("primary")}>{t("new")}</Link>} />
    <p className="-mt-3 text-sm text-muted-foreground">{t("intro")}</p>
    <Link href="/novedades?tipo=book" className="self-start text-sm text-muted-foreground underline">{t("publicCalendar")}</Link>
    {result[0].status === "rejected" ? <EmptyState variant="panel" glyph={<BookIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
      : rows.length === 0 ? <EmptyState variant="panel" glyph={<BookIcon className="h-5 w-5" />} title={t("emptyTitle")} message={t("emptyBody")}
        action={<Link href="/admin/novedades/nuevo" className={buttonVariants("secondary")}>{t("new")}</Link>} />
        : <ul className="grid min-w-0 gap-4 md:grid-cols-2">{rows.map((row) => {
          const date = releaseReviewDate(row.checked_at);
          return <li key={row.id} className="min-w-0 rounded-card border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-surface-muted px-2 py-1">{t(`status.${row.status}`)}</span><span>{r(`markets.${row.market}`)}</span></div>
            <h2 className="mt-3 break-words font-serif text-xl font-semibold"><Link href={`/admin/novedades/${row.id}`} className="hover:underline">{row.title}</Link></h2>
            <p className="mt-2 text-sm text-muted-foreground">{row.author}</p>
            <p className="mt-2 text-sm">{row.date_precision === "unknown" ? r("unknownDate") : formatReleaseDate(row)}</p>
            <p className="mt-2 text-xs text-muted-foreground">{date ? r("reviewed", { date }) : r("notReviewed")}</p>
            <Link href={`/admin/novedades/${row.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm underline">{t("edit")}</Link>
          </li>;
        })}</ul>}
  </div>;
}
