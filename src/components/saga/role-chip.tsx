import { getTranslations } from "next-intl/server";
import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaItemRole } from "@/lib/sagas/types";

// Chip de rol narrativo (issue #167). Deliberadamente sin caso por defecto: un
// rol nuevo en BD que no tenga traducción debe verse raro en dev, no caer en
// un genérico que lo esconda.
//
// El estilo replica el badge de rama de reading-timeline.tsx:100 — mismo gold
// sobre gold/10 — para no inventar una quinta etiqueta visual en la ficha. La
// fase 5 añade el glifo del mockup y NO añade color por rol: el color ya
// significa subsaga en este producto (ver role-style.ts).
export async function RoleChip({ role }: { role: SagaItemRole | null }) {
  if (role === null) return null;
  const t = await getTranslations("saga");
  return (
    <span
      data-testid="role-chip"
      className="inline-flex items-center gap-1 rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold"
    >
      <span aria-hidden>{ROLE_GLYPH[role]}</span>
      {t(`roleLabel.${role}`)}
    </span>
  );
}
