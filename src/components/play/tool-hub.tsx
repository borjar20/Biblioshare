import type { ReactNode } from "react";

/**
 * Plantilla de hub por herramienta (spec §6). Magic no es especial: es la primera
 * instancia. Las secciones que aún no existen —historial (fase 7), estadísticas—
 * NO se pintan: un hueco vacío prometiendo lo que todavía no se puede hacer es peor
 * que no tener la sección. Cuando existan, llegan como props y aparecen solas.
 *
 * `modes` también es opcional: una herramienta de un solo modo simplemente no lo
 * declara y la sección no sale.
 */
export function PlayToolHub({
  title,
  modes,
  cta,
  footnote,
  history,
  stats,
}: {
  title: string;
  modes?: ReactNode;
  cta?: ReactNode;
  footnote?: string;
  history?: ReactNode;
  stats?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-serif text-[26px] font-semibold">{title}</h1>
      {modes}
      {cta}
      {history}
      {stats}
      {footnote && <p className="text-[13px] leading-relaxed text-muted-foreground">{footnote}</p>}
    </section>
  );
}
