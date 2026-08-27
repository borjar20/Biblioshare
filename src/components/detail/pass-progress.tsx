import { useTranslations } from "next-intl";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { passPercent } from "@/lib/library/progress";
import type { ItemType } from "@/lib/catalog/types";

// La barra de progreso del pase (.prg del frame 3): track grueso con relleno
// degradado, el cursor como PIN de gota en la posición actual, los extremos en
// mono y el aviso verde del cierre automático.
//
// Es del PASE, no de la obra: el cursor va de 0 al total aunque sea una
// relectura, y por eso los extremos dicen "este pase".
//
// Solo se pinta con total conocido: sin él no hay porcentaje que enseñar ni
// cierre automático que avisar (y el aviso sería mentira).
export function PassProgress({
  itemType,
  page,
  total,
}: {
  itemType: ItemType;
  /** Cursor actual del pase. */
  page: number;
  /** Páginas de la edición del pase, o de la obra si no hay edición. */
  total: number;
}) {
  const t = useTranslations("detail.log.progress");
  const accent = MEDIA_ACCENT[itemType];
  const percent = passPercent(page, total);

  return (
    <div className="flex flex-col">
      <div className="relative h-3 rounded-full border border-border bg-surface-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-status-in-progress/55 to-status-in-progress"
          style={{ width: `${percent}%` }}
        />
        {/* El pin: un cuadrado con tres esquinas redondeadas girado 45°, que
            es como se dibuja una gota sin SVG (igual que .prg .cur .pin). */}
        <div
          className="absolute top-[-9px] -translate-x-1/2"
          style={{ left: `${percent}%` }}
        >
          <div
            className={`h-3.5 w-3.5 rotate-[-45deg] rounded-tl-full rounded-tr-full rounded-br-full border-2 border-white shadow-[0_3px_8px_-2px_rgba(60,35,15,0.5)] ${accent.bg}`}
          />
        </div>
      </div>

      <div className="mt-[15px] flex justify-between gap-2 font-mono text-[9.5px] text-muted-foreground">
        <span>{t("start")}</span>
        <span>
          <b className={`font-semibold ${accent.text}`}>
            {t("current", { page })}
          </b>{" "}
          {t("currentRest", { percent })}
        </span>
        <span>{t("total", { total })}</span>
      </div>

      {/* El aviso del cierre automático: verde, porque anuncia algo bueno que
          va a pasar solo (applyTransition cierra el pase al llegar al final). */}
      <div className="mt-3 flex items-start gap-2 rounded-[9px] border border-status-completed/30 bg-status-completed/10 px-2.5 py-2.5 text-[11px] leading-relaxed text-foreground-soft">
        <span aria-hidden className="shrink-0">
          🏁
        </span>
        <span>{t("closeHint", { total })}</span>
      </div>
    </div>
  );
}
