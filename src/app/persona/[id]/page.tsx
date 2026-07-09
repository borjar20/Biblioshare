import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CoverCard } from "@/components/ui/cover-card";
import { getPerson } from "@/lib/people/get-person";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return { title: person ? `${person.name} — Biblioshare` : "Biblioshare" };
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("person");
  const supabase = await createClient();

  const result = await getPerson(supabase, id);
  if (!result) notFound();

  const { person, works } = result;

  const lifeLine = [
    person.birthDate ? t("born", { date: person.birthDate }) : null,
    person.deathDate ? t("died", { date: person.deathDate }) : null,
    person.placeOfBirth,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-full border border-border bg-surface-muted">
          {person.photoUrl ? (
            <Image
              src={person.photoUrl}
              alt={person.name}
              fill
              sizes="160px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-muted-foreground">
              {initials(person.name)}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
          {lifeLine && <p className="text-sm text-muted-foreground">{lifeLine}</p>}
          {person.bio ? (
            <p className="whitespace-pre-line text-sm text-foreground">{person.bio}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noBio")}</p>
          )}
        </div>
      </div>

      {works.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t("worksTitle")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {works.map((work) => (
              <CoverCard
                key={`${work.itemType}-${work.itemId}`}
                href={work.href}
                coverUrl={work.coverUrl}
                title={work.title}
                subtitle={work.character ?? undefined}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
