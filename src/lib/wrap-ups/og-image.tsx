// Imagen 9:16 para compartir un wrap-up (spec 2026-10-06 §5). La pintan dos
// rutas: la del dueño (/api/og/wrap-up/[kind]) y la del resumen publicado
// (/api/og/wrap-up/share/[id]). Solo lee el ShareSummary, que es lo único del
// wrap-up que sale del dueño: cifras, portadas, narradora y ardilla.
//
// Espejo del póster pixel (src/components/wrap-ups/poster.module.css) en Satori:
// campo plano por paleta, tinta, placas de papel con sombra en escalera, cifra
// gigante en Tiny5 y portadas como cartas. Todo el texto va sobre papel o sobre
// tinta, nunca sobre el campo (contraste: ver la cabecera de poster.module.css).
// Satori no resuelve CSS vars: los colores son copia de src/app/globals.css
// (tema claro), como THEMES en src/app/api/og/nota/[id]/route.tsx.
import { ImageResponse } from "next/og";
import { createTranslator } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import messages from "../../../messages/es.json";
import type { Sprite, WrapUpFonts } from "./og-assets";
import type { ItemRef, Palette, ShareSummary, WrapUpPayload } from "./types";
import { periodLabel, posterFor, type T } from "./view-models";

export const WRAP_UP_IMAGE_SIZE = { width: 1080, height: 1920 } as const;

const INK = "#1c1714";
const PAPER = "#fffdf8";
/** globals.css :root (tema claro): --type-book, --type-movie, --type-series y --accent. */
export const FIELD: Record<Palette, string> = {
  book: "#a15a34",
  movie: "#3f6b6e",
  series: "#7a5676",
  mixed: "#b0542f",
};
// El póster de la app mide ~430 px de ancho; la imagen, 1080: todo ×2,5.
const STEP = `0 0 0 8px ${INK}, 16px 16px 0 8px ${INK}`;
const STEP_SM = `0 0 0 5px ${INK}, 10px 10px 0 5px ${INK}`;
// Trama de píxeles del póster: damero de tinta al 7 %, 10 px por celda.
const CHECKER = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="${INK}" fill-opacity="0.07"/><rect x="10" y="10" width="10" height="10" fill="${INK}" fill-opacity="0.07"/></svg>`,
)}")`;

export const COVER_CARD = { width: 200, height: 300 } as const;

export type WrapUpImageAssets = {
  fonts: WrapUpFonts;
  narrator: Sprite;
  pet: Sprite | null;
  /** Una por `summary.covers` (mismo orden); `null` = carta con el título. */
  covers: (string | null)[];
};

const t = createTranslator({ locale: "es", messages }) as unknown as T;

/** Texto de la imagen: el de la story de cierre (mismas reglas de cifra y ceros honestos). */
export function wrapUpImageCopy(summary: ShareSummary) {
  const payload: WrapUpPayload = {
    v: 1, kind: summary.kind, periodStart: summary.periodStart, periodEnd: summary.periodEnd,
    intensity: "full", narrator: summary.narrator, palette: summary.palette, pet: summary.pet,
    stories: [{ id: "closing" }], share: summary,
  };
  const model = posterFor({ id: "closing" }, payload, t);
  return {
    period: periodLabel(summary),
    title: t("wrapUps.stories.cover.title", { kind: summary.kind }),
    figure: model.figure ?? null,
    lines: model.lines,
    narratorLine: model.narratorLine,
  };
}

function Glyph({ type, size, color }: { type: ItemType; size: number; color: string }) {
  if (type === "book") return <div style={{ display: "flex", width: size, height: size, borderRadius: size, background: color }} />;
  if (type === "movie") return <div style={{ display: "flex", width: size, height: size, background: color }} />;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10">
      <polygon points="5,0 10,10 0,10" fill={color} />
    </svg>
  );
}

const ellipsis = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

function CoverCard({ item, src, index }: { item: ItemRef; src: string | null; index: number }) {
  const transform = index % 2 === 0 ? "rotate(-3deg)" : "rotate(2deg) translateY(16px)";
  return (
    <div style={{ display: "flex", flexShrink: 0, width: COVER_CARD.width, height: COVER_CARD.height, background: PAPER, boxShadow: STEP_SM, transform }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Satori, no el DOM
        <img src={src} width={COVER_CARD.width} height={COVER_CARD.height} alt="" />
      ) : (
        // Carta pixel: banda del color del tipo con su glifo (decorativo) y el título
        // en tinta sobre papel — el texto no va sobre el color del tipo (contraste).
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
          <div style={{ display: "flex", flexShrink: 0, height: 76, padding: "0 18px", alignItems: "center", background: FIELD[item.type], borderBottom: `5px solid ${INK}` }}>
            <Glyph type={item.type} size={34} color={PAPER} />
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "flex-end", padding: 18, fontFamily: "Geist", fontWeight: 700, fontSize: 26, lineHeight: 1.2, color: INK, wordBreak: "break-word" }}>
            {ellipsis(item.title, 48)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Marca de Biblioshare: los tres glifos de tipo y el nombre, sobre tinta. */
function Mark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 22px", background: INK }}>
      <Glyph type="book" size={22} color={FIELD.book} />
      <Glyph type="movie" size={22} color={FIELD.movie} />
      <Glyph type="series" size={24} color={FIELD.series} />
      <div style={{ display: "flex", marginLeft: 8, fontFamily: "Tiny5", fontSize: 40, lineHeight: 1, color: PAPER }}>Biblioshare</div>
    </div>
  );
}

export function wrapUpImage(summary: ShareSummary, assets: WrapUpImageAssets, init?: { headers?: Record<string, string> }): ImageResponse {
  const copy = wrapUpImageCopy(summary);
  const covers = summary.covers.slice(0, 4);
  // Cifra larga («1.234 h»): un escalón menos para que no se salga de la placa.
  const figureSize = copy.figure && copy.figure.value.length > 4 ? 240 : 300;
  // Satori no alinea bien por `baseline` dos tamaños de Tiny5: se alinean las cajas
  // abajo y cada una baja lo que mide su descendente (~19 % del cuerpo en Tiny5).
  const descent = (size: number) => -Math.round(size * 0.19);
  // Ningún bloque encoge: si algo no cabe, se nota en el test visual en vez de aplastar placas.
  const block = { display: "flex", flexShrink: 0 } as const;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex", flexDirection: "column", width: "100%", height: "100%",
          padding: "72px 72px 64px", gap: 36, color: INK, fontFamily: "Geist",
          backgroundColor: FIELD[summary.palette], backgroundImage: CHECKER, backgroundRepeat: "repeat", backgroundSize: "20px 20px",
        }}
      >
        <div style={{ ...block, alignSelf: "flex-start", padding: "16px 26px 14px", background: INK, color: PAPER, fontFamily: "Tiny5", fontSize: 46, lineHeight: 1.1 }}>
          {copy.period}
        </div>

        {/* Cuerpo centrado en el alto libre, como .body del póster. */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 36 }}>
          {/* El título y, a su lado, la ardilla propia (como en la portada del reproductor). */}
          <div style={{ ...block, alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
            <div style={{ ...block, padding: "22px 36px 28px", background: PAPER, boxShadow: STEP, fontWeight: 700, fontSize: 112, lineHeight: 1, letterSpacing: -3 }}>
              {copy.title}
            </div>
            {assets.pet && (
              // eslint-disable-next-line @next/next/no-img-element -- Satori, no el DOM
              <img src={assets.pet.src} width={assets.pet.width} height={assets.pet.height} alt="" style={{ flexShrink: 0 }} />
            )}
          </div>

          {copy.figure && (
            <div style={{ ...block, alignSelf: "flex-start", alignItems: "flex-end", gap: 28, padding: "28px 40px 46px", background: PAPER, boxShadow: STEP, fontFamily: "Tiny5", lineHeight: 1 }}>
              <div style={{ display: "flex", fontSize: figureSize, marginBottom: descent(figureSize) }}>{copy.figure.value}</div>
              <div style={{ display: "flex", fontSize: 72, marginBottom: descent(72) }}>{copy.figure.unit}</div>
            </div>
          )}

          {copy.lines.length > 0 && (
            <div style={{ ...block, flexDirection: "column", alignSelf: "flex-start", gap: 10, padding: "24px 32px", background: PAPER, boxShadow: STEP, fontWeight: 600, fontSize: 42, lineHeight: 1.3 }}>
              {copy.lines.map((l, i) => <div key={i} style={{ display: "flex" }}>{l}</div>)}
            </div>
          )}

          {covers.length > 0 && (
            <div style={{ ...block, justifyContent: "center", gap: 40, padding: "8px 0 24px" }}>
              {covers.map((c, i) => <CoverCard key={`${c.type}-${c.id}`} item={c} src={assets.covers[i] ?? null} index={i} />)}
            </div>
          )}
        </div>

        <div style={{ ...block, alignItems: "center", gap: 36 }}>
          <div style={{ ...block, padding: 16, background: PAPER, boxShadow: STEP_SM }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori, no el DOM */}
            <img src={assets.narrator.src} width={assets.narrator.width} height={assets.narrator.height} alt="" />
          </div>
          <div style={{ display: "flex", flex: 1, padding: "24px 30px", background: PAPER, boxShadow: STEP_SM, fontWeight: 600, fontSize: 42, lineHeight: 1.3 }}>
            {copy.narratorLine}
          </div>
        </div>

        <div style={{ ...block, justifyContent: "flex-end" }}>
          <Mark />
        </div>
      </div>
    ),
    {
      ...WRAP_UP_IMAGE_SIZE,
      fonts: [
        { name: "Tiny5", data: assets.fonts.pixel, weight: 400, style: "normal" },
        { name: "Geist", data: assets.fonts.semibold, weight: 600, style: "normal" },
        { name: "Geist", data: assets.fonts.bold, weight: 700, style: "normal" },
      ],
      headers: init?.headers,
    },
  );
}
