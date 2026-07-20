import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Cabecera común de los pasos: "Paso N de M" en mono + enlace Saltar. El total
// es 2 o 3 según se pinte el paso de gente (D2), así que llega por prop.
export async function Stepper({
  current,
  total,
  skipHref,
}: {
  current: number;
  total: number;
  skipHref: string;
}) {
  const t = await getTranslations("onboarding.wizard");

  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
        {t("step", { current, total })}
      </span>
      <Link
        href={skipHref}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {t("skip")}
      </Link>
    </div>
  );
}
