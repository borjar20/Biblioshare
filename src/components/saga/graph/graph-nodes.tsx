"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { NodeProps, Node } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { NODE_BOX } from "@/lib/sagas/graph-metrics";
import type { SagaGraphNode } from "@/lib/sagas/map-types";

// Nodos custom del mapa (frames C/E): portada 78×116 (principal), medallón
// 58px (menor) y tarjeta de saga anidada. El lienzo es oscuro SIEMPRE (estética
// del mockup), así que los textos usan tonos crema fijos, no tokens del theme.

export type GraphFlowNode = Node<{ node: SagaGraphNode }, "cover" | "medallion" | "saga">;

// Handles invisibles: React Flow los exige para pintar aristas, el viewer no
// permite conectar.
function Ports() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="!h-0 !w-0 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <Handle type="source" position={Position.Bottom} className="!h-0 !w-0 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
    </>
  );
}

function StatusBadges({ node }: { node: SagaGraphNode }) {
  return (
    <>
      {node.status === "completed" && (
        <span className="absolute bottom-1 right-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-green text-[10px] text-white ring-2 ring-black/50">
          ✓
        </span>
      )}
      {node.status === "in_progress" && (
        <span className="absolute -right-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] text-white shadow">
          ◉
        </span>
      )}
    </>
  );
}

const dimmed = (node: SagaGraphNode) => (node.status === null ? "opacity-55 saturate-50" : "");

// Insignia del paso del itinerario activo (Task 3, fase 3; reubicada en la
// Task 9 — arreglo de estética). Mismo par forma/tipografía que ya existe en
// dos sitios (no se inventa un tercero): la FORMA (círculo, ring, esquina
// absoluta) es la de StatusBadges, aquí mismo; la TIPOGRAFÍA (mono, tamaño
// pequeño) es la de la "insignia de hueco" del editor de secuencia
// (sequence-row.tsx: `font-mono text-[15px] text-accent`) y de la
// numeración de pasos en la ficha (route-view.tsx, route-editor.tsx:
// `font-mono text-[11px]`). Va en la esquina superior-izquierda:
// StatusBadges ya ocupa la inferior-derecha (completado) y la
// superior-derecha (en curso).
//
// Task 9: la insignia NO se veía — sobre todo en el medallón, donde no se
// apreciaba en absoluto. La causa: se pintaba DENTRO del contenedor que
// recorta la portada/medallón (`overflow-hidden`, y en el medallón además
// `rounded-full`), con un offset negativo (`-left-1 -top-1`) que la sacaba
// de esa caja — el recorte se comía la insignia entera, y en el medallón
// el recorte CIRCULAR se comía aún más, porque la esquina de la caja
// delimitadora cae fuera del círculo. El arreglo: pintarla FUERA de ese
// contenedor, en el envoltorio exterior (que no recorta), y dimensionarla
// para cada tipo de nodo — la portada (78×116) y el medallón (58×58) son
// tamaños muy distintos y una insignia igual de grande taparía demasiado
// medallón.
function StepBadge({ step, size }: { step: number | null; size: "cover" | "medallion" }) {
  const t = useTranslations("saga");
  if (step === null) return null;
  const sizeClass =
    size === "cover"
      ? "-left-1.5 -top-1.5 h-6 w-6 text-[11px]"
      : "-left-1 -top-1 h-[18px] w-[18px] text-[9px]";
  return (
    <span
      className={`absolute z-20 grid place-items-center rounded-full bg-accent font-mono font-bold text-white shadow-md ring-2 ring-black/70 ${sizeClass}`}
      aria-label={t("routeMapStep", { step })}
    >
      {step}
    </span>
  );
}

export function CoverNode({ data }: NodeProps<GraphFlowNode>) {
  const { node } = data;
  return (
    <div className="relative" style={{ width: NODE_BOX.cover.w }}>
      <Ports />
      <div
        className={`relative overflow-hidden rounded-md border-2 shadow-lg ${dimmed(node)} ${node.status === null ? "border-dashed" : ""}`}
        style={{
          width: NODE_BOX.cover.w,
          height: NODE_BOX.cover.h,
          borderColor: node.status === "in_progress" ? "var(--accent)" : SAGA_ACCENT[node.accent].cssVar,
        }}
      >
        {node.coverUrl ? (
          <Image src={node.coverUrl} alt="" fill sizes="78px" className="object-cover" />
        ) : (
          <div className="h-full w-full bg-spine/30" />
        )}
        <StatusBadges node={node} />
      </div>
      {/* Fuera del contenedor recortado (`overflow-hidden`) de arriba: la
          insignia no debe quedar recortada en la esquina (Task 9). */}
      <StepBadge step={node.step} size="cover" />
      <p className="absolute left-1/2 top-full mt-2 w-[150px] -translate-x-1/2 text-center font-serif text-sm font-medium leading-tight text-[#f0e6d4] [text-shadow:0_2px_8px_rgba(0,0,0,.8)]">
        {node.label}
      </p>
    </div>
  );
}

export function MedallionNode({ data }: NodeProps<GraphFlowNode>) {
  const { node } = data;
  return (
    <div className="relative" style={{ width: NODE_BOX.medallion.w, height: NODE_BOX.medallion.h }}>
      <Ports />
      <div
        className={`relative overflow-hidden rounded-full border-[2.5px] shadow-lg ${dimmed(node)} ${node.status === null ? "border-dashed" : ""}`}
        style={{
          width: NODE_BOX.medallion.w,
          height: NODE_BOX.medallion.h,
          borderColor: SAGA_ACCENT[node.accent].cssVar,
        }}
      >
        {node.coverUrl ? (
          <Image src={node.coverUrl} alt="" fill sizes="58px" className="object-cover" />
        ) : (
          <div className="h-full w-full bg-spine/30" />
        )}
        <StatusBadges node={node} />
      </div>
      {/* Fuera del contenedor recortado (`overflow-hidden rounded-full`) de
          arriba: en el medallón el recorte CIRCULAR se comía la insignia
          entera (Task 9) — el círculo no llega hasta la esquina de la caja. */}
      <StepBadge step={node.step} size="medallion" />
      <p className="absolute left-1/2 top-full mt-1.5 w-max max-w-[130px] -translate-x-1/2 truncate text-center font-mono text-[9.5px] tracking-wide text-[#b9a986]">
        {node.label}
      </p>
    </div>
  );
}

export function SagaNodeCard({ data }: NodeProps<GraphFlowNode>) {
  const { node } = data;
  // NextIntlClientProvider está montado globalmente (mismo patrón que
  // saga-follow-button.tsx), así que usamos la clave "count" existente en
  // vez de un literal "títulos" hardcodeado.
  const t = useTranslations("saga");
  return (
    <div className="relative w-[120px]">
      <Ports />
      <div
        className="rounded-xl border-2 bg-black/40 p-2 shadow-lg backdrop-blur-sm"
        style={{ borderColor: SAGA_ACCENT[node.accent].cssVar }}
      >
        <div className="relative mx-auto h-[52px] w-[84px]">
          {node.covers.slice(0, 3).map((url, i) => (
            <div
              key={url}
              className="absolute top-0 h-[48px] w-[32px] overflow-hidden rounded-sm border border-black/30"
              style={{ left: `${i * 26}px`, zIndex: i }}
            >
              <Image src={url} alt="" fill sizes="32px" className="object-cover" />
            </div>
          ))}
          {node.covers.length === 0 && <div className="h-full w-full rounded-sm bg-spine/30" />}
        </div>
        <p className="mt-1.5 text-center font-serif text-[13px] font-medium leading-tight text-[#f0e6d4]">
          {node.label}
        </p>
        {node.memberCount !== null && (
          <p className="text-center font-mono text-[9px] uppercase tracking-wide text-[#b9a986]">
            {t("count", { count: node.memberCount })}
          </p>
        )}
      </div>
    </div>
  );
}
