// Portada de la home hacia el wrap-up (spec 2026-10-06 §5, «Puntos de entrada»).
// Servidor, sin `use cache`: depende de la sesión (regla #437).
//
// Altura FIJA (COVER_HEIGHT) y compartida con `WrapUpCoverSkeleton`: el fallback
// del <Suspense> de la home reserva exactamente este alto para no repetir el CLS
// de #284. Si no hay ningún wrap-up el componente devuelve null y el hueco se
// cierra; ocurre solo a quien aún no tiene crónicas.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getOwnWrapUps, type OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { periodLabel } from "@/lib/wrap-ups/view-models";
import { narratorSheet } from "@/lib/wrap-ups/narrator";
import { pixelFont } from "./pixel-font";

const COVER_HEIGHT = 68;
const THUMB = 48;
// Los tres colores de tipo, en cónico: el anillo de «sin ver».
const RING = "conic-gradient(var(--type-book), var(--type-movie), var(--type-series), var(--type-book))";
const PIXEL_FACE = "var(--font-pixel), ui-monospace, monospace";

export function WrapUpCoverSkeleton() {
  return <div aria-hidden className="mb-3" style={{ height: COVER_HEIGHT }} />;
}

/** Primer fotograma de la tira de la narradora, a THUMB px, sin suavizar. */
function NarratorThumb({ variant }: { variant: OwnWrapUp["payload"]["narrator"] }) {
  const { src, frames } = narratorSheet(variant);
  return (
    <span
      aria-hidden
      className="block shrink-0"
      style={{
        width: THUMB,
        height: THUMB,
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${frames * 100}% 100%`,
        backgroundPosition: "0 0",
        imageRendering: "pixelated",
      }}
    />
  );
}

export async function HomeWrapUpCover() {
  const all = await getOwnWrapUps();
  if (all.length === 0) return null;
  const unseenFull = all.find((w) => w.payload.intensity === "full" && w.seenAt === null);
  const wrap = unseenFull ?? all.reduce((latest, w) => (w.payload.periodEnd > latest.payload.periodEnd ? w : latest));
  const t = await getTranslations("wrapUps.entry");
  const label = t("label", { kind: wrap.kind });
  const href = `/wrap/${wrap.kind}`;

  if (!unseenFull) {
    return (
      <div className="mb-3 flex items-center" style={{ height: COVER_HEIGHT }}>
        <Link
          href={href}
          data-unseen="false"
          className="text-[12.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {label}
          <span className="sr-only"> · {periodLabel(wrap.payload)}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={`${pixelFont.variable} mb-3`} style={{ height: COVER_HEIGHT }}>
      <Link href={href} data-unseen="true" className="block h-full rounded-card p-[3px]" style={{ backgroundImage: RING }}>
        <span className="flex h-full items-center gap-3 rounded-[10px] bg-surface px-3">
          <NarratorThumb variant={wrap.payload.narrator} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] leading-tight text-foreground" style={{ fontFamily: PIXEL_FACE }}>
              {label}
            </span>
            <span className="truncate text-[12px] text-muted-foreground">{periodLabel(wrap.payload)}</span>
          </span>
          <span
            className="shrink-0 bg-foreground px-2 py-1 text-[12px] leading-none text-background"
            style={{ fontFamily: PIXEL_FACE }}
          >
            {t("unseen")}
          </span>
        </span>
      </Link>
    </div>
  );
}
