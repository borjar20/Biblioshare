import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { MiniMap } from "@/lib/sagas/mini-map";

// Acceso al mapa (plan fase 2, decisión 4): tarjeta-enlace con una vista previa
// del grafo. El SVG es decorativo; el nombre accesible del enlace es el título.
export async function AtlasTeaser({ href, map }: { href: string; map: MiniMap }) {
  const t = await getTranslations("saga");

  return (
    <Link
      href={href}
      data-testid="atlas-teaser"
      className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-3 transition-colors hover:bg-surface-muted"
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${map.width} ${map.height}`}
        className="h-[80px] w-[160px] shrink-0"
      >
        {map.lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeDasharray={l.dashed ? "3 3" : undefined}
          />
        ))}
        {map.points.map((p) => (
          <circle
            key={p.id}
            cx={p.cx}
            cy={p.cy}
            r={p.done ? 4 : 3}
            fill={SAGA_ACCENT[p.accent].cssVar}
            opacity={p.done ? 1 : 0.55}
          />
        ))}
      </svg>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-serif text-base leading-tight font-semibold">{t("atlasTitle")}</span>
        <span className="text-xs text-muted-foreground">{t("atlasSubtitle")}</span>
        <span className="font-mono text-[11px] text-accent">{t("atlasOpen")} →</span>
      </span>
    </Link>
  );
}
