"use client";

import { useTranslations } from "next-intl";
import type { SagaGraphNode } from "@/lib/sagas/map-types";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";

// Estado 04 del frame D, más lo que el grafo nunca dijo de los otros dos: una
// sola tira bajo el nodo que acumula lo que sea cierto —rol, opcional,
// saltado—, en ese orden. Un nodo con rol Y opcional no acumula dos adornos, y
// un nodo sin nada que decir no pinta nada: es el caso de 359 de las 367 filas
// de producción.
//
// Ni una cadena nueva: `roleShort.*` (fase 5), `timelineOptionalTag` y
// `timelineSkippedTag` (fase 4) son las MISMAS palabras que el timeline usa
// sobre la misma obra. Dos vocabularios para el mismo estado es cómo empiezan a
// discrepar.
//
// Lo OPCIONAL no gana además trazo punteado, aunque el mockup lo pida: en este
// grafo el borde discontinuo y la atenuación ya significan «no empezado»
// (`status === null`, en graph-nodes.tsx), y ese estado sale en todos los
// mapas. Dos estados con el mismo dibujo y el más común gana la lectura. Lo
// opcional ya tiene su traducción visual, anterior a esta fase: `level:
// "menor"`, o sea medallón en vez de portada. Lo que faltaba era decirlo con
// palabras. Mismo criterio con que la fase 5 descartó la paleta de colores por
// rol: el color ya significa subsaga.
export function NodeTag({ node }: { node: SagaGraphNode }) {
  const t = useTranslations("saga");

  const partes: string[] = [];
  if (node.role !== null) partes.push(`${ROLE_GLYPH[node.role]} ${t(`roleShort.${node.role}`)}`);
  if (node.optional) partes.push(t("timelineOptionalTag"));
  if (node.skipped) partes.push(t("timelineSkippedTag"));
  if (partes.length === 0) return null;

  return (
    <span
      data-testid="graph-node-tag"
      className={`whitespace-nowrap rounded-full border border-[#b9a986]/60 bg-[#201b16]/90 px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.07em] text-[#e2d3b4] ${
        node.skipped ? "line-through opacity-70" : ""
      }`}
    >
      {partes.join(" · ")}
    </span>
  );
}
