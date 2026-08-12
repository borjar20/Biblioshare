import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Un estado vacío que parece intencionado: dice qué iría aquí y, cuando hay algo
// que hacer, ofrece hacerlo. Nunca una tarjeta grande hueca para rellenar hueco
// -- eso es justo lo que hacía que la pestaña pareciera un borrador.
//
// Sin botón cuando no hay nada que el club pueda hacer HOY para llenarlo (el
// historial se llena solo, terminando actividades).
export function ActivityEmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-8 text-center">
      <p className="font-serif text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{body}</p>
      {actionHref && actionLabel && (
        // Mismo estilo que "Proponer actividad" en la cabecera y en móvil
        // (ProposeActivityLink): la misma acción no debe verse de dos formas
        // distintas en la misma pantalla -- ahí era buttonVariants("primary")
        // y aquí era una píldora pequeña aparte.
        <Link href={actionHref} className={buttonVariants("primary", "mt-1")}>
          <span aria-hidden>+</span> {actionLabel}
        </Link>
      )}
    </div>
  );
}
