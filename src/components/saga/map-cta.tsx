import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { scaleNodes } from "@/lib/sagas/derive-timeline";
import type { SagaGraph } from "@/lib/sagas/map-types";

// CTA al mapa completo (frame B) con mini-preview SVG generado de las
// coordenadas REALES del grafo.
export async function MapCta({ graph, href }: { graph: SagaGraph; href: string }) {
  const t = await getTranslations("saga");
  const scaled = scaleNodes(graph.nodes, 66, 48, 5);
  const posById = new Map(graph.nodes.map((n, i) => [n.id, scaled[i]]));

  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 shadow-sm"
    >
      <span className="relative h-12 w-[66px] shrink-0 overflow-hidden rounded-lg bg-[#241f1a]">
        <svg viewBox="0 0 66 48" className="absolute inset-0 h-full w-full">
          {graph.edges.slice(0, 10).map((e) => {
            const a = posById.get(e.source);
            const b = posById.get(e.target);
            if (!a || !b) return null;
            return (
              <line
                key={e.id}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={SAGA_ACCENT[e.accent].cssVar}
                strokeWidth="1.4"
                strokeDasharray={e.type === "principal" ? undefined : "2 2"}
              />
            );
          })}
          {scaled.map((p, i) => (
            <circle key={graph.nodes[i].id} cx={p.x} cy={p.y} r={graph.nodes[i].level === "principal" ? 2.6 : 2} fill="#e6d5b0" />
          ))}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-sm font-semibold text-foreground">{t("mapCtaTitle")}</span>
        <span className="block text-[11px] text-muted-foreground">{t("mapCtaDesc")}</span>
      </span>
      <span className="text-xl text-accent">⤢</span>
    </Link>
  );
}
