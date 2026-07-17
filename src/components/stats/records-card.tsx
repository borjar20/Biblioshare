import { getTranslations } from "next-intl/server";
import type { Records } from "@/lib/stats/get-records";

const MONTH_LABELS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function RecRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-medium text-foreground">{v}</span>
    </div>
  );
}

// Récords (frames B/G). La mejor racha viene de fuera (getStreaks, que la
// pestaña ya trae) para no consultar dos veces.
export async function RecordsCard({
  records,
  bestStreakDays,
}: {
  records: Records;
  bestStreakDays: number;
}) {
  const t = await getTranslations("stats");
  const dash = t("recordEmpty");

  const monthValue = records.mostActiveMonth
    ? `${MONTH_LABELS[Number(records.mostActiveMonth.month.slice(5, 7)) - 1]} · ${t(
        "recordWorks",
        { count: records.mostActiveMonth.count },
      )}`
    : dash;

  const fastestValue = records.fastestBook
    ? `${records.fastestBook.title} · ${t("recordDays", { count: records.fastestBook.days })}`
    : dash;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("recordsTitle")}
      </h3>
      <div className="flex flex-col">
        <RecRow k={t("recordMonth")} v={monthValue} />
        <RecRow k={t("recordFastest")} v={fastestValue} />
        <RecRow
          k={t("recordStreak")}
          v={bestStreakDays > 0 ? t("recordDays", { count: bestStreakDays }) : dash}
        />
        <RecRow k={t("recordRereads")} v={t("recordPasses", { count: records.rereads })} />
      </div>
    </div>
  );
}
