import { RatingDots } from "@/components/ui/rating-dots";

// Una reseña de la comunidad (`.review` del frame 2, `.desk-review` del 9).
//
// Van SEPARADAS POR UNA LÍNEA, no en tarjetas: son una conversación seguida,
// y encajonar cada una hacía que la pestaña pareciera una lista de objetos
// sueltos. La primera no lleva línea.
export function ReviewRow({
  initials,
  author,
  dateLabel,
  rating,
  text,
  chip,
  children,
}: {
  initials: string;
  author: string;
  dateLabel: string;
  rating: number | null;
  text: string;
  /** Etiqueta a la izquierda de la fecha: la edición leída, o el episodio. */
  chip?: React.ReactNode;
  /** Reacciones y comentarios (`.rx` del frame). */
  children?: React.ReactNode;
}) {
  return (
    <article className="border-t border-border py-[15px] first:border-t-0 first:pt-0 lg:py-5">
      <div className="mb-[7px] flex items-center gap-2.5 lg:mb-2.5 lg:gap-3">
        {/* `.av` del frame: degradado oro→acento con las iniciales en blanco.
            Es el único sitio donde el oro y el acento se tocan, y funciona
            porque no compite con ninguna nota al lado. */}
        <span
          aria-hidden
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold to-accent text-[13px] font-semibold text-white lg:h-[42px] lg:w-[42px] lg:text-base"
        >
          {initials}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold text-foreground lg:text-[15px]">
            {author}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground lg:text-[11px]">
            {dateLabel}
          </span>
        </div>
        {rating !== null && (
          <div className="ml-auto shrink-0">
            <RatingDots value={rating} size="sm" />
          </div>
        )}
      </div>

      {chip && <div className="mb-1.5">{chip}</div>}

      {/* `.tx`: prosa, no metadato — en --foreground-soft (el #584f43 del
          handoff), no en el gris de las etiquetas. */}
      <p className="text-[13.5px] leading-[1.6] text-foreground-soft lg:text-[15px] lg:leading-[1.65]">
        {text}
      </p>

      {children}
    </article>
  );
}
