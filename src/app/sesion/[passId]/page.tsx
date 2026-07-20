import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { loadSessionContext } from "@/lib/sessions/load-context";
import { SessionForm } from "@/app/sesion/[passId]/session-form";

export const metadata: Metadata = {
  title: "Guardar sesión — Biblioshare",
};

// Un parámetro de URL es texto de fuera: se acepta solo si es un entero de
// minutos con sentido. Se topa a 24 h para que un valor absurdo no llegue al
// formulario.
function parseMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ passId: string }>;
  // `minutos`: lo trae el cronómetro de la tarjeta de hoy (plan 01 T5) cuando
  // pulsas "Registrar" — llegas con el tiempo ya escrito en vez de tener que
  // acordarte de él.
  searchParams: Promise<{ minutos?: string }>;
}) {
  const { passId } = await params;
  const { minutos } = await searchParams;
  const t = await getTranslations("session");
  const tDetail = await getTranslations("detail");

  const ctx = await loadSessionContext(passId);
  const accent = MEDIA_ACCENT[ctx.itemType];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">
        {ctx.itemType === "book" ? t("titleBook") : t("titleSeries")}
      </h1>

      {/* Tarjeta de contexto del ítem (mockup "Paper - Registrar sesión",
          pantallas 1-3): recuerda qué estás registrando sin tener que volver
          atrás — el gesto se repite tanto que no puede obligar a pensar. */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
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

      <SessionForm
        passId={ctx.passId}
        itemType={ctx.itemType}
        itemId={ctx.itemId}
        position={ctx.position}
        status={ctx.status}
        total={ctx.total}
        seriesEpisodes={ctx.seriesEpisodes}
        initialMinutes={parseMinutes(minutos)}
        mode="page"
      />
    </div>
  );
}
