import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { PersonProfile } from "@/lib/people/profile-types";
import {
  deriveLibrarySummary,
  deriveRatingBuckets,
  dominantItemType,
} from "@/lib/people/derive-person-works";
import { formatDots } from "@/lib/rating/dots";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RatingHistogram } from "@/components/detail/rating-histogram";
import { RatingDots } from "@/components/ui/rating-dots";
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

  // El histograma solo con al menos tres notas: con una o dos son barras
  // sueltas que no describen ningún gusto, y ocupan lo mismo.
  const buckets = deriveRatingBuckets(works);
  const ratedCount = buckets.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-[18px]">
      {/* `shrink-0` NO es decorativo. A ≥1600 esta card es el contenedor que
          scrollea (ver `.person-grid` en globals.css), y en un flex column los
          hijos ENCOGEN antes de provocar desbordamiento. El retrato es un
          `aspect-square` sin contenido dentro —la Image va absoluta con
          `fill`—, así que su altura mínima es 0 y era el primero en ceder: al
          desplegar la biografía con "Ver más", la cara se aplastaba. Con esto
          el retrato mantiene su cuadrado y lo que crece es el scroll. */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-xl bg-surface-muted">
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
          {/* Mismo motivo que el retrato: alturas fijas (la línea de 1px, las
              barras del histograma) que el flex column aplastaría al scrollear. */}
          <div className="h-px w-full shrink-0 bg-border" />
          <div className="flex shrink-0 flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {t("inYourLibrary")}
            </span>
            {/* La frase va en PORCENTAJE (petición del dueño): «5 de 33» obliga
                a dividir para saber si vas por la mitad o empezando. El recuento
                no se pierde —baja al pie de la barra— porque el porcentaje solo
                no dice la escala: un 33% de 3 obras y uno de 300 se leen igual y
                no son lo mismo. */}
            <p className="text-[13px] text-foreground">
              {t(SUMMARY_KEY[summary.verb], { percent: summary.percent })}
            </p>
            <ProgressBar
              current={summary.done}
              total={summary.total}
              label={t("summaryCount", { done: summary.done, total: summary.total })}
            />

            {ratedCount >= 3 && (
              // Mismo histograma que la ficha de obra y el raíl de `/post/[id]`
              // (`RatingHistogram`, presentacional puro): aquí describe TU gusto
              // sobre la obra de esta persona, no el de la comunidad.
              <div className="flex flex-col gap-1">
                <RatingHistogram
                  itemType={dominantItemType(works)}
                  distribution={buckets}
                  barsHeight="h-10"
                />
              </div>
            )}

            {userAverage != null && (
              // La media se PINTA con los mismos dots que una nota suelta, no
              // como "3,5 / 5": es la unidad de medida de toda la app y se lee
              // de un vistazo. El número se queda al lado porque los dots
              // cuantizan a media nota (7,4 y 7,0 pintan idénticos) y aquí la
              // diferencia sí importa: es un promedio, no una nota puesta.
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground">{t("yourAverage")}</span>
                <RatingDots
                  value={userAverage}
                  size="sm"
                  itemType={dominantItemType(works)}
                />
                <span className="text-[12px] text-muted-foreground">
                  {formatDots(userAverage)}
                </span>
              </div>
            )}

            {/* Con la media fuera de esta fila, puede quedarse vacía —y el
                `gap` del padre dejaría un hueco de la nada—. */}
            {(pending > 0 || inProgress > 0) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
