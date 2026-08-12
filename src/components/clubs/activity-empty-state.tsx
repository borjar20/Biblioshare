import Link from "next/link";

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
        <Link
          href={actionHref}
          className="mt-1 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[11px] tracking-wide text-accent uppercase"
        >
          <span aria-hidden>+</span> {actionLabel}
        </Link>
      )}
    </div>
  );
}
