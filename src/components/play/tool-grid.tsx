import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { playTools } from "@/lib/play/tools";
import type { ToolId } from "@/lib/play/core/types";
import { toolViews } from "./tool-views";
import { RandomTableMark } from "./marks/random-table-mark";
import { ClockTableMark } from "./marks/clock-table-mark";

/**
 * Rejilla de herramientas del hub. Sale ENTERA de los dos registros: el de dominio
 * pone la clave de i18n y la ruta, el de UI pone la marca. Por eso añadir una
 * herramienta nueva no toca este fichero.
 *
 * La tarjeta de «más herramientas» va atenuada y SIN enlace: enseña la forma del
 * sitio sin prometer un destino que no existe.
 */
export async function ToolGrid() {
  const t = await getTranslations("play");
  const ids = Object.keys(playTools) as ToolId[];

  return (
    <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {ids.map((id) => {
        const { i18nKey } = playTools[id];
        const { Illustration, hubRoute } = toolViews[id];
        return (
          <li key={id}>
            <Link
              href={hubRoute}
              className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
            >
              <Illustration className="h-16 w-16" />
              <span className="text-center font-serif text-[15px] font-semibold">
                {t(`tools.${i18nKey}.name`)}
              </span>
            </Link>
          </li>
        );
      })}

      {/* El Aleatorio vive FUERA del registro de herramientas a propósito (spec
          randomizer §2): es un acompañante sin partida — no ocupa el slot activo
          ni aparece en guardadas. Por eso su tarjeta es estática y no sale del map. */}
      <li>
        <Link
          href="/partidas/aleatorio"
          className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <RandomTableMark className="h-16 w-16" />
          <span className="text-center font-serif text-[15px] font-semibold">
            {t("tools.random.name")}
          </span>
        </Link>
      </li>

      {/* El Reloj, como el Aleatorio, vive FUERA del registro (acompañante sin
          partida): tarjeta estática. */}
      <li>
        <Link
          href="/partidas/reloj"
          className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <ClockTableMark className="h-16 w-16" />
          <span className="text-center font-serif text-[15px] font-semibold">
            {t("tools.clock.name")}
          </span>
        </Link>
      </li>

      <li>
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border p-4 opacity-55">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {t("soon")}
          </span>
          <span className="text-center font-serif text-[14px] font-semibold">{t("soonTool")}</span>
          <span className="text-center text-[11px] text-muted-foreground">{t("soonToolDetail")}</span>
        </div>
      </li>
    </ul>
  );
}
