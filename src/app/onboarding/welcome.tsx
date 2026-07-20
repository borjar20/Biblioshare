import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { finishOnboarding } from "@/lib/onboarding/actions";

export async function Welcome({
  name,
  addedCount,
}: {
  name: string;
  addedCount: number;
}) {
  const t = await getTranslations("onboarding.wizard");

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="font-serif text-[26px] font-semibold">
        {t("welcomeTitle", { name })}
      </h1>
      {/* Si saltó el paso 2 NO se le regaña: texto neutro (spec §4.4). */}
      <p className="text-sm text-muted-foreground">
        {addedCount > 0
          ? t("welcomeWithTitles", { count: addedCount })
          : t("welcomeNeutral")}
      </p>
      <form action={finishOnboarding}>
        <Button type="submit" className="mt-2 px-7 py-3.5">
          {t("enter")}
        </Button>
      </form>
    </div>
  );
}
