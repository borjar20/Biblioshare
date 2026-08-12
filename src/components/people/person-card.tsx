import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { PersonProfile } from "@/lib/people/profile-types";
import { deriveLibrarySummary } from "@/lib/people/derive-person-works";
import { ProgressBar } from "@/components/ui/progress-bar";
import { BioClamp } from "./bio-clamp";
import { ROLE_KEY } from "./role-labels";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const SUMMARY_KEY = {
  watched: "summaryWatched",
  read: "summaryRead",
  mixed: "summaryMixed",
} as const;

// Columna izquierda: el CONTEXTO de la persona. Card única, sticky a ≥1600.
//
// El retrato es CUADRADO a ancho completo, no el círculo de la ficha vieja: con
// 308px de columna, un círculo desperdicia las cuatro esquinas y encoge la cara.
//
// NO hay botón "Seguir a esta persona" pese a que el mockup lo pinta: no existe
// tabla `person_follows` (hay `follows` usuario→usuario y `saga_follows`), y un
// botón sin backend es peor que un botón ausente. Ver la issue del cierre.
export async function PersonCard({
  profile,
  loggedIn,
}: {
  profile: PersonProfile;
  loggedIn: boolean;
}) {
  const t = await getTranslations("person");
  const { person, works, roleCounts, userAverage } = profile;
  const summary = deriveLibrarySummary(works);

  const meta = [
    person.birthDate ? t("born", { date: person.birthDate }) : null,
    person.deathDate ? t("died", { date: person.deathDate }) : null,
    person.placeOfBirth,
  ].filter(Boolean) as string[];

  const pending = works.filter((w) => w.status === "planned").length;
  const inProgress = works.filter((w) => w.status === "in_progress").length;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-surface-muted">
        {person.photoUrl ? (
          <Image
            src={person.photoUrl}
            alt={person.name}
            fill
            sizes="(max-width: 1000px) 100vw, 308px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl font-semibold text-muted-foreground">
            {initials(person.name)}
          </div>
        )}
      </div>

      <h1 className="font-serif text-2xl font-semibold leading-tight text-foreground">
        {person.name}
      </h1>

      {roleCounts.length > 0 && (
        // Ordenados por VOLUMEN de obras (deriveRoleCounts ya los da así): quien
        // actúa más de lo que dirige lee "Reparto · Dirección", en ese orden.
        <div className="flex flex-wrap gap-1.5">
          {roleCounts.map(({ role }) => (
            <span
              key={role}
              className="rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {t(ROLE_KEY[role])}
            </span>
          ))}
        </div>
      )}

      {meta.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[12.5px] text-muted-foreground">
          {meta.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}

      {person.bio ? (
        <BioClamp text={person.bio} moreLabel={t("bioMore")} lessLabel={t("bioLess")} />
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("noBio")}</p>
      )}

      {loggedIn && summary.visible && (
        <>
          <div className="h-px w-full bg-border" />
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("inYourLibrary")}
            </span>
            <p className="text-[13px] text-foreground">
              {t(SUMMARY_KEY[summary.verb], { done: summary.done, total: summary.total })}
            </p>
            <ProgressBar current={summary.done} total={summary.total} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              {userAverage != null && (
                <span>
                  {t("yourAverage")}: {userAverage.toFixed(1)}
                </span>
              )}
              {pending > 0 && (
                <span>
                  {t("pending")}: {pending}
                </span>
              )}
              {inProgress > 0 && (
                <span>
                  {t("inProgress")}: {inProgress}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
