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
import { RouteMessages } from "@/components/route-messages";
import { posterFor, type T } from "@/lib/wrap-ups/view-models";
import { HomeWrapUp } from "./home-wrap-up";
import { buttonVariants } from "@/components/ui/button";

const COVER_HEIGHT = 104;
const THUMB = 48;

export function WrapUpCoverSkeleton() {
  return <div aria-hidden className="home-wrap-skeleton" />;
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
  let all: OwnWrapUp[];
  try {
    all = await getOwnWrapUps();
  } catch (e) {
    // Un fallo aquí (tabla o grant ausente) no debe tumbar la home entera.
    console.error("HomeWrapUpCover: no se pudieron leer los wrap-ups", e instanceof Error ? e.message : "error");
    return null;
  }
  if (all.length === 0) return null;
  const latest = (list: OwnWrapUp[]) => list.reduce((a, w) => (w.payload.periodEnd > a.payload.periodEnd ? w : a));
  const unseenFulls = all.filter((w) => w.payload.intensity === "full" && w.seenAt === null);
  const unseenFull = unseenFulls.length > 0 ? latest(unseenFulls) : null;
  const wrap = unseenFull ?? latest(all);
  const t = await getTranslations("wrapUps.entry");
  const label = t("label", { kind: wrap.kind });
  const href = `/wrap/${wrap.kind}`;

  const desktopCover = (
    <div className="mb-3" style={{ height: COVER_HEIGHT }}>
      <Link
        href={href}
        data-unseen={unseenFull ? "true" : "false"}
        className="group flex h-full items-center gap-3 rounded-card border border-border border-l-4 border-l-accent bg-surface px-3 py-2 transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <span className="shrink-0 rounded-xl bg-surface-muted p-1">
          <NarratorThumb variant={wrap.payload.narrator} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-serif text-lg font-semibold leading-5 text-foreground">{label}</span>
            {unseenFull && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold leading-4 text-accent-ink">
                {t("unseen")}
              </span>
            )}
          </span>
          <span className="text-[12.5px] leading-4 text-muted-foreground">{periodLabel(wrap.payload)}</span>
          <span className={buttonVariants("secondary", "pointer-events-none gap-1.5 bg-surface-muted px-2.5 py-1 text-[12.5px]")}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 3.5v17L20 12Z" />
            </svg>
            {t("view")}
          </span>
        </span>
      </Link>
    </div>
  );
  const panel = await getTranslations("homePanels");
  const strings = await getTranslations();
  const models = (wrap.payload.stories ?? []).map((story) => posterFor(story, wrap.payload, strings as unknown as T));
  return <RouteMessages ns={["wrapUps.ui", "wrapUps.stories.cover"]}><HomeWrapUp wrapUp={wrap} models={models} desktopCover={desktopCover} openLabel={panel("openWrap")} summary={<><span className="home-preview-name">{panel("wrap")}</span><span className="home-wrap-preview-body"><NarratorThumb variant={wrap.payload.narrator} /><span>{unseenFull && <span className="text-xs text-accent-ink">{panel("new")}</span>}<span className="home-preview-meta">{periodLabel(wrap.payload)}</span></span></span></>} /></RouteMessages>;
}
