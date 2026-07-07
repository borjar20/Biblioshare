import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { RetryButton } from "@/components/retry-button";

export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-md text-lg text-muted-foreground">
        {t("description")}
      </p>
      <div className="flex items-center gap-4">
        <RetryButton>{t("retry")}</RetryButton>
        <Link href="/" className={buttonVariants("secondary")}>
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
