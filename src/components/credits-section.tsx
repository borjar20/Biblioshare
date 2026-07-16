import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { personHref } from "@/lib/catalog/item-href";
import type { Credit, ItemCredits } from "@/lib/people/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// `.credits .p` del frame 5 / `.desk-cast .p` del 12: avatar circular con las
// iniciales en serif sobre un degradado de superficies — el hueco tiene la
// misma dignidad que la foto, no es un "sin imagen" gris.
function PersonAvatar({ person }: { person: Credit }) {
  return (
    <Link
      href={personHref(person.id)}
      className="group flex w-16 shrink-0 flex-col items-center text-center lg:w-auto"
    >
      <div className="relative h-14 w-14 overflow-hidden rounded-full border border-border bg-gradient-to-br from-surface-3 to-surface-muted lg:h-[74px] lg:w-[74px]">
        {person.photoUrl ? (
          <Image
            src={person.photoUrl}
            alt={person.name}
            fill
            sizes="74px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center font-serif text-lg font-semibold text-muted-foreground lg:text-2xl">
            {initials(person.name)}
          </div>
        )}
      </div>
      <span className="mt-1.5 line-clamp-2 text-[10.5px] leading-[1.2] font-semibold text-foreground lg:mt-[9px] lg:text-[13px] lg:leading-[1.25]">
        {person.name}
      </span>
      {person.character && (
        <span className="line-clamp-1 text-[9.5px] text-muted-foreground lg:text-[11px]">
          {person.character}
        </span>
      )}
    </Link>
  );
}

// "Reparto y equipo" (frames 5 y 12): equipo como líneas rol → persona,
// reparto como avatares — tira con scroll en móvil (`.credits`), rejilla de 6
// a lo ancho en PC (`.desk-cast`).
export async function CreditsSection({ credits }: { credits: ItemCredits }) {
  const t = await getTranslations("item");
  if (credits.cast.length === 0 && credits.crew.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 lg:gap-[15px]">
      <h2 className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        {t("creditsTitle")}
      </h2>

      {credits.crew.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {credits.crew.map((person) => (
            <li
              key={`${person.id}-${person.role}`}
              className="text-muted-foreground"
            >
              <span>{t(`roles.${person.role}`)}: </span>
              <Link
                href={personHref(person.id)}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {person.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {credits.cast.length > 0 && (
        <div className="flex gap-3.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-6 lg:gap-[18px] lg:overflow-visible lg:pb-0">
          {credits.cast.map((person) => (
            <PersonAvatar key={person.id} person={person} />
          ))}
        </div>
      )}
    </section>
  );
}
