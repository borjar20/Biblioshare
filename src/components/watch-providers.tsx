import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { WatchProviders as WatchProvidersData } from "@/lib/catalog/tmdb";

// "Dónde verla" (frames 5 y 12): chips `.pv` con el logo de la plataforma en
// un cuadradito y el nombre en semibold — más grandes en PC (`.desk-prov`).
// La atribución a JustWatch/TMDB se queda: es condición de uso del dato.
export async function WatchProviders({ data }: { data: WatchProvidersData }) {
  const t = await getTranslations("item.watchProviders");

  return (
    <div className="flex flex-col gap-2.5 lg:gap-[15px]">
      <h2 className="label-section">
        {t("title")}
      </h2>

      {data.flatrate.length > 0 ? (
        <div className="flex flex-wrap gap-[9px] lg:gap-3">
          {data.flatrate.map((provider) => (
            <a
              key={provider.id}
              href={data.tmdbLink}
              target="_blank"
              rel="noopener noreferrer"
              title={provider.name}
              className="inline-flex items-center gap-[7px] rounded-[9px] border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted lg:gap-[9px] lg:rounded-[10px] lg:px-4 lg:py-[11px] lg:text-sm"
            >
              <span className="relative h-[22px] w-[22px] overflow-hidden rounded-[6px] lg:h-7 lg:w-7 lg:rounded-[7px]">
                <Image
                  src={provider.logoUrl}
                  alt=""
                  fill
                  sizes="28px"
                  className="object-cover"
                />
              </span>
              {provider.name}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("none")}</p>
      )}

      <a
        href={data.tmdbLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {t("attribution")}
      </a>
    </div>
  );
}
