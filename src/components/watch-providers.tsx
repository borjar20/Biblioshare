import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { WatchProviders as WatchProvidersData } from "@/lib/catalog/tmdb";

export async function WatchProviders({ data }: { data: WatchProvidersData }) {
  const t = await getTranslations("item.watchProviders");

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>

      {data.flatrate.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {data.flatrate.map((provider) => (
            <a
              key={provider.id}
              href={data.tmdbLink}
              target="_blank"
              rel="noopener noreferrer"
              title={provider.name}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground hover:bg-surface-muted"
            >
              <Image
                src={provider.logoUrl}
                alt={provider.name}
                width={16}
                height={16}
                className="rounded-sm"
              />
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
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        {t("attribution")}
      </a>
    </div>
  );
}
