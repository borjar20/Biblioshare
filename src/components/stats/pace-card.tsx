import { getTranslations } from "next-intl/server";

// Ritmo (frames B/G): bignum de páginas/día. Gemelo de StreakCard pero en el
// color base. El wrapper card lo pone la pestaña.
export async function PaceCard({ pagesPerDay }: { pagesPerDay: number | null }) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("paceTitle")}
      </h3>
      <span className="font-serif text-4xl leading-none font-semibold text-foreground">
        {pagesPerDay ?? t("recordEmpty")}
      </span>
      <span className="text-sm text-muted-foreground">{t("pacePerDay")}</span>
    </div>
  );
}
