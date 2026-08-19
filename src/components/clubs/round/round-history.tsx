import { getTranslations } from "next-intl/server";
import { listRoundHistory } from "@/lib/clubs/rounds/history";

export async function RoundHistory({
  clubId,
  currentPeriodKey,
}: {
  clubId: string;
  currentPeriodKey: string;
}) {
  const [entries, t] = await Promise.all([
    listRoundHistory(clubId, currentPeriodKey),
    getTranslations("club.round"),
  ]);
  if (entries.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-2 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">
        {t("historyTitle")}
      </h3>
      <ul className="flex flex-col">
        {entries.map((e) => (
          <li
            key={e.periodKey}
            className="flex items-baseline gap-3 border-b border-border py-2 last:border-b-0"
          >
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {e.periodKey.slice(-3)}
            </span>
            {/* `prompt: null` = semana sin ronda (issue #403): la RPC
                list_club_round_weeks la trae con su hueco, no ausente. */}
            <span
              className={
                e.prompt === null
                  ? "min-w-0 text-sm text-muted-foreground italic"
                  : "min-w-0 text-sm text-foreground-soft"
              }
            >
              {e.prompt ?? t("historyEmptyWeek")}
            </span>
            {/* "0 respuestas" en una semana sin ronda leería como si hubiera
               habido ronda y nadie contestara -- se omite el recuento entero. */}
            {e.prompt !== null && (
              <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                {t("historyAnswers", { count: e.answerCount })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
