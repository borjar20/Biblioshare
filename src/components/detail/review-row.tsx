import Image from "next/image";
import Link from "next/link";
import { RatingDots } from "@/components/ui/rating-dots";
import { MentionText } from "@/components/social/mention-text";

// Los avatares subidos a Storage van por next/image (remotePatterns); las URLs
// externas legado, por <img>. Mismo criterio que user-avatar/profile-header.
function isSupabaseAvatar(url: string): boolean {
  return /\.supabase\.co\/storage\/v1\/object\/public\//.test(url);
}

// Una reseña de la comunidad (`.review` del frame 2, `.desk-review` del 9).
//
// Van SEPARADAS POR UNA LÍNEA, no en tarjetas: son una conversación seguida,
// y encajonar cada una hacía que la pestaña pareciera una lista de objetos
// sueltos. La primera no lleva línea.
export function ReviewRow({
  initials,
  author,
  username,
  avatarUrl,
  dateLabel,
  rating,
  text,
  knownUsernames,
  chip,
  children,
}: {
  initials: string;
  author: string;
  /** Username del autor: enlaza a /u/:username. null = sin enlace (perfil sin username). */
  username: string | null;
  /** Avatar del autor; null = degradado con iniciales. */
  avatarUrl: string | null;
  dateLabel: string;
  rating: number | null;
  text: string;
  /** Usernames @mencionados en `text` que existen de verdad — ver MentionText. */
  knownUsernames: string[];
  /** Etiqueta a la izquierda de la fecha: la edición leída, o el episodio. */
  chip?: React.ReactNode;
  /** Reacciones y comentarios (`.rx` del frame). */
  children?: React.ReactNode;
}) {
  const avatar = (
    <span className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-gold to-accent text-[13px] font-semibold text-white lg:h-[42px] lg:w-[42px] lg:text-base">
      {avatarUrl ? (
        isSupabaseAvatar(avatarUrl) ? (
          <Image src={avatarUrl} alt={author} fill sizes="42px" className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={author} className="h-full w-full object-cover" />
        )
      ) : (
        // `.av` del frame: degradado oro→acento con las iniciales en blanco.
        // Es el único sitio donde el oro y el acento se tocan, y funciona
        // porque no compite con ninguna nota al lado.
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );

  const identity = (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-semibold text-foreground lg:text-[15px]">
        {author}
      </span>
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground lg:text-[11px]">
        {dateLabel}
      </span>
    </div>
  );

  return (
    <article className="border-t border-border py-[15px] first:border-t-0 first:pt-0 lg:py-5">
      <div className="mb-[7px] flex items-center gap-2.5 lg:mb-2.5 lg:gap-3">
        {/* Avatar + nombre enlazan al perfil del autor (`/u/:username`). Sin
            username no hay adónde ir: se renderiza el mismo bloque sin enlace. */}
        {username ? (
          <Link
            href={`/u/${username}`}
            className="flex min-w-0 items-center gap-2.5 rounded-sm hover:opacity-90 lg:gap-3"
          >
            {avatar}
            {identity}
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5 lg:gap-3">
            {avatar}
            {identity}
          </div>
        )}
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
        <MentionText text={text} knownUsernames={knownUsernames} />
      </p>

      {children}
    </article>
  );
}
