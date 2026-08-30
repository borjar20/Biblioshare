import type { ReactNode } from "react";

/**
 * Plantilla de hub por herramienta (spec §6). Magic no es especial: es la primera
 * instancia. Las secciones que aún no existen —historial (fase 7), estadísticas—
 * NO se pintan: un hueco vacío prometiendo lo que todavía no se puede hacer es peor
 * que no tener la sección. Cuando existan, llegan como props y aparecen solas.
 *
 * `modes` también es opcional: una herramienta de un solo modo simplemente no lo
 * declara y la sección no sale.
 *
 * `aside` es la columna lateral de escritorio (revisión UX 2026-08-30): en móvil se
 * apila debajo y en `lg` se tiende a la derecha. Lleva lo que acompaña a la elección
 * —la mesa habitual, cómo funciona— y es donde el historial encajará sin recolocar
 * nada. Sin `aside`, la plantilla queda a una columna como antes.
 */
export function PlayToolHub({
  title,
  modes,
  cta,
  footnote,
  history,
  stats,
  aside,
}: {
  title: string;
  modes?: ReactNode;
  cta?: ReactNode;
  footnote?: string;
  history?: ReactNode;
  stats?: ReactNode;
  aside?: ReactNode;
}) {
  const main = (
    <section className="flex flex-col gap-6">
      <h1 className="font-serif text-[26px] font-semibold">{title}</h1>
      {modes}
      {cta}
      {history}
      {stats}
      {footnote && <p className="text-[13px] leading-relaxed text-muted-foreground">{footnote}</p>}
    </section>
  );

  if (!aside) return main;

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
      {main}
      <aside className="flex flex-col gap-4">{aside}</aside>
    </div>
  );
}
