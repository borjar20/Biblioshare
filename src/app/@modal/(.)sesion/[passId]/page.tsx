import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { loadSessionContext } from "@/lib/sessions/load-context";
import { SessionModal } from "@/components/session/session-modal";
import { SessionForm } from "@/app/sesion/[passId]/session-form";

function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export default async function SessionModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;
  const t = await getTranslations("session");
  const tDetail = await getTranslations("detail");

  const ctx = await loadSessionContext(passId);
  const accent = MEDIA_ACCENT[ctx.itemType];

  return (
    <SessionModal>
      <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-5">
        <h1 className="text-xl font-semibold tracking-tight">
          {ctx.itemType === "book" ? t("titleBook") : t("titleSeries")}
        </h1>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          <div className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-surface-muted">
            {ctx.coverUrl && (
              <Image src={ctx.coverUrl} alt={ctx.title} fill sizes="40px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[14.5px] font-semibold text-foreground">
              {ctx.title}
            </p>
            {ctx.author && (
              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{ctx.author}</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-1 font-mono text-[9px] font-medium tracking-wider uppercase ${accent.bgSoft} ${accent.text}`}
          >
            {tDetail(`mediaLabel.${ctx.itemType}`)}
          </span>
        </div>

        <div className="mt-4">
          <SessionForm
            passId={ctx.passId}
            itemType={ctx.itemType}
            itemId={ctx.itemId}
            position={ctx.position}
            status={ctx.status}
            total={ctx.total}
            seriesEpisodes={ctx.seriesEpisodes}
            initialMinutes={parseMinutes(minutos)}
          />
        </div>
      </div>
    </SessionModal>
  );
}
