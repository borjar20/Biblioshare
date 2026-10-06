import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAdminReleases } from "@/lib/releases/queries";
import { isReleaseId } from "@/components/releases/action-state";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { BookIcon } from "@/components/ui/icons";
import { EditorialEditor } from "@/components/releases/editorial-editor";
import { ReleaseRetry } from "@/components/releases/release-retry";

export default async function EditBookAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isReleaseId(id)) notFound();
  const t = await getTranslations("releaseAdmin");
  const result = await Promise.allSettled([getAdminReleases()]);
  const row = result[0].status === "fulfilled" ? result[0].value.find((release) => release.id === id) : undefined;
  if (result[0].status === "fulfilled" && !row) notFound();
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
    <PageHeader title={t("edit")} backHref="/admin/novedades" backLabel={t("back")} />
    {row ? <EditorialEditor key={`${row.id}:${row.updated_at}`} release={row} /> : <EmptyState variant="panel" glyph={<BookIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />}
  </div>;
}
