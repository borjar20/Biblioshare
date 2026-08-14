// Chapa "Requisito" de las ramas del timeline (issue #184). Antes vivía
// inline en timeline-branch.tsx, copiada del mismo bg-gold/10 text-gold que
// RoleChip y el tag "Opcional": cuando una rama era requisito Y llevaba rol,
// las dos chapas se leían como una sola ("REQUISITO PRECUELA"). La leyenda
// del mapa (graph-legend.tsx) ya reserva el gold para "opcional" y usa spine
// + trazo punteado para "requisito" — este badge sigue esa paleta en vez de
// inventar una quinta.
export function RequisiteBadge({ label }: { label: string }) {
  return (
    <span
      data-testid="requisite-badge"
      className="inline-block rounded border border-dotted border-spine bg-spine/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-spine"
    >
      {label}
    </span>
  );
}
