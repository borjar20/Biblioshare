import { getTranslations } from "next-intl/server";
import { formatDots } from "@/lib/rating/dots";
import type { Passage } from "@/lib/sagas/passage";

// Nota media bajo «La terminaste». Espera la misma promesa que «Tu paso»
// dentro de su propio <Suspense>: sin pases o sin notas no pinta nada.
export async function YourAverage({ passage }: { passage: Promise<Passage | null> }) {
  const p = await passage;
  if (!p || p.countedAverage === null) return null;
  const rating = formatDots(p.countedAverage);
  if (rating === null) return null;
  const t = await getTranslations("saga");
  return <p className="mt-2 text-sm font-semibold">{t("nextUpYourAverage", { rating })}</p>;
}
