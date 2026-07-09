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

function PersonAvatar({ person }: { person: Credit }) {
  return (
    <Link
      href={personHref(person.id)}
      className="group flex flex-col items-center gap-1 text-center"
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-full border border-border bg-surface-muted">
        {person.photoUrl ? (
          <Image
            src={person.photoUrl}
            alt={person.name}
            fill
            sizes="64px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-medium text-muted-foreground">
            {initials(person.name)}
          </div>
        )}
      </div>
      <span className="line-clamp-1 text-xs font-medium text-foreground">
        {person.name}
      </span>
      {person.character && (
        <span className="line-clamp-1 text-[11px] text-muted-foreground">
          {person.character}
        </span>
      )}
    </Link>
  );
}

export async function CreditsSection({ credits }: { credits: ItemCredits }) {
  const t = await getTranslations("item");
  if (credits.cast.length === 0 && credits.crew.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">
        {t("creditsTitle")}
      </h2>

      {credits.crew.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {credits.crew.map((person) => (
            <li key={`${person.id}-${person.role}`} className="text-muted-foreground">
              <span>{t(`roles.${person.role}`)}: </span>
              <Link
                href={personHref(person.id)}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {person.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {credits.cast.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {credits.cast.map((person) => (
            <PersonAvatar key={person.id} person={person} />
          ))}
        </div>
      )}
    </section>
  );
}
