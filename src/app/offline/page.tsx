import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { OfflineIcon } from "@/components/ui/icons";
import { RetryButton } from "@/components/retry-button";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <EmptyState
      glyph={<OfflineIcon className="h-7 w-7" />}
      title={t("title")}
      message={t("description")}
      action={<RetryButton>{t("retry")}</RetryButton>}
      secondary={
        <Link
          href="/"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {t("backHome")}
        </Link>
      }
    />
  );
}
