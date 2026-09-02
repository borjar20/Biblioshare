import type { ReactNode } from "react";

/**
 * Glifos propios de recurso (spec visual-first §4). Antes eran emoji del
 * sistema: 🪙 y 🪨 son Emoji 13 y salían como cuadrado vacío en Windows 10 y
 * Android < 11, y DESIGN.md veta los emojis. Trazo en `currentColor` sobre
 * 24×24, estilo de las marcas del hub (`marks/*.tsx`). El id viaja en el
 * campo `emoji` del evento (≤ 8 caracteres, reducer intacto).
 */
export const RESOURCE_ICON_IDS = [
  "gold", "wood", "stone", "wheat", "sheep", "brick", "gem", "heart", "bolt", "star",
] as const;
export type ResourceIconId = (typeof RESOURCE_ICON_IDS)[number];

export const RESOURCE_PRESETS: { id: ResourceIconId; nameKey: string }[] = RESOURCE_ICON_IDS.map(
  (id) => ({ id, nameKey: `presets.${id}` }),
);

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const GLYPHS: Record<ResourceIconId, ReactNode> = {
  gold: (
    <>
      <circle cx="12" cy="12" r="8" {...S} />
      <circle cx="12" cy="12" r="3" {...S} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={12 + 4.5 * Math.cos(a)} y1={12 + 4.5 * Math.sin(a)} x2={12 + 6.5 * Math.cos(a)} y2={12 + 6.5 * Math.sin(a)} {...S} />;
      })}
    </>
  ),
  wood: (
    <>
      <ellipse cx="7" cy="12" rx="3" ry="5" {...S} />
      <path d="M7 7h9a3 5 0 0 1 0 10H7" {...S} />
      <circle cx="7" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  stone: <path d="M6 16l2-7 6-3 5 4-1 6-5 2z" {...S} />,
  wheat: (
    <>
      <path d="M12 21V8" {...S} />
      <path d="M12 8c-3 0-4-2-4-4 2 0 4 1 4 4zM12 8c3 0 4-2 4-4-2 0-4 1-4 4z" {...S} />
      <path d="M12 13c-3 0-4-2-4-4 2 0 4 1 4 4zM12 13c3 0 4-2 4-4-2 0-4 1-4 4z" {...S} />
    </>
  ),
  sheep: (
    <>
      <path d="M6 13a4 4 0 0 1 2-7 4 4 0 0 1 8 0 4 4 0 0 1 2 7 4 4 0 0 1-3 4H9a4 4 0 0 1-3-4z" {...S} />
      <path d="M9 17v3M15 17v3" {...S} />
      <circle cx="17" cy="10" r="1" fill="currentColor" />
    </>
  ),
  brick: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="1" {...S} />
      <path d="M4 12h16M12 6v6M8 12v6M16 12v6" {...S} />
    </>
  ),
  gem: <path d="M8 4h8l4 5-8 11L4 9z M4 9h16 M8 4l4 5 4-5 M12 9v11" {...S} />,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" {...S} />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" {...S} />,
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" {...S} />,
};

function isIconId(value: string): value is ResourceIconId {
  return (RESOURCE_ICON_IDS as readonly string[]).includes(value);
}

/** Pinta el glifo de un id conocido; cualquier otro string (emoji de eventos viejos) sale como texto. */
export function ResourceGlyph({ icon, className = "h-6 w-6" }: { icon: string; className?: string }) {
  if (!isIconId(icon)) return icon ? <span className="text-[16px] leading-none">{icon}</span> : null;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {GLYPHS[icon]}
    </svg>
  );
}
