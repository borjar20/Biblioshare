import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { EditorialForm } from "@/components/releases/editorial-form";

export default async function NewBookAnnouncementPage() {
  const t = await getTranslations("releaseAdmin");
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <PageHeader title={t("new")} backHref="/admin/novedades" backLabel={t("back")} />
    <EditorialForm />
  </div>;
}
