import { ROLE_GLYPH } from "@/lib/sagas/role-style";
import type { SagaItemRole } from "@/lib/sagas/types";
import type { TimelineLabels } from "./timeline-labels";

// Cinta de rol sobre la portada (mockup, `.rib`). Va DENTRO del `<span
// className="relative …">` que envuelve cada portada, que ya es `relative` y
// `overflow-hidden` en las cuatro formas de fila.
//
// Por qué la cinta y no solo el chip: hasta la fase 5 la fila `entry` —la de una
// obra con hueco— no decía el rol en NINGÚN sitio (RoleChip solo se montaba en
// ramas, ventanas y puentes), y en producción la mayoría de las 8 obras con rol
// tienen hueco fijo. El rol curado era, en la práctica, invisible. Además la
// cinta no le roba ancho a un título que ya se trunca.
//
// Etiqueta CORTA a propósito (`roleShort`): la portada de una fila `entry` mide
// 44 px y «Novela corta» no cabe. Recortar por código daría «Novela cor…».
export function RoleRibbon({ role, labels }: { role: SagaItemRole | null; labels: TimelineLabels }) {
  if (role === null) return null;
  return (
    <span
      data-testid="role-ribbon"
      className="absolute inset-x-0 bottom-0 truncate bg-foreground/75 px-1 py-[1px] text-center font-mono text-[7.5px] uppercase tracking-wide text-background"
    >
      <span aria-hidden>{ROLE_GLYPH[role]} </span>
      {labels.roleShort(role)}
    </span>
  );
}
