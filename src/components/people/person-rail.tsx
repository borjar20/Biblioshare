import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RatingDots } from "@/components/ui/rating-dots";
import { formatDots } from "@/lib/rating/dots";
import type { ItemType } from "@/lib/catalog/types";
import { dominantItemType } from "@/lib/people/derive-person-works";
import type { PersonProfile } from "@/lib/people/profile-types";
import { ROLE_KEY } from "./role-labels";

function AverageRow({
  label,
  value,
  itemType,
}: {
  label: string;
  /** Media en la escala de guardado, 1–10. */
  value: number;
  itemType: ItemType;
}) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <RatingDots value={value} size="sm" itemType={itemType} />
      {formatDots(value)}
    </span>
  );
}

function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

/**
 * El raíl derecho: SOLO información DERIVADA de lo que ya está en el centro
 * (pendientes, sagas, colaboradores, tu actividad). Nunca contenido nuevo que
 * compita con el explorador.
 *
 * Cada card se OMITE si no tiene datos, y el raíl entero devuelve null si no
 * queda ninguna: un raíl de cuatro cajas vacías es peor que no tener raíl.
 *
 * NO lleva el botón "Añadir todas a pendientes" del mockup: no existe una acción
 * que haga eso, y un botón que no hace lo que dice es peor que un botón ausente.
 */
export async function PersonRail({ profile }: { profile: PersonProfile }) {
  const t = await getTranslations("person");

  const pending = profile.works
    .filter((w) => w.status === "planned" || w.status === "in_progress")
    .slice(0, 3);

  const lastFinished = profile.works
    .filter((w) => w.status === "completed" && w.finishedOn)
    .sort((a, b) => (b.finishedOn ?? "").localeCompare(a.finishedOn ?? ""))[0];

  const hasActivity = Boolean(
    lastFinished || profile.userAverage != null || profile.globalAverage != null
  );

  if (
    pending.length === 0 &&
    profile.sagas.length === 0 &&
    profile.collaborators.length === 0 &&
    !hasActivity
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.length > 0 && (
        <RailCard title={t("railPending", { count: pending.length })}>
          <div className="flex flex-col gap-2">
            {pending.map((work) => (
              <Link
                key={`${work.itemType}-${work.itemId}`}
                href={work.href}
                className="flex items-center gap-2"
              >
                <div className="relative h-[51px] w-[34px] shrink-0 overflow-hidden rounded bg-surface-muted">
                  {work.coverUrl && (
                    <Image src={work.coverUrl} alt="" fill sizes="34px" className="object-cover" />
                  )}
                </div>
                <span className="line-clamp-2 font-serif text-[13px] text-foreground">
                  {work.title}
                </span>
              </Link>
            ))}
          </div>
        </RailCard>
      )}

      {profile.sagas.length > 0 && (
        <RailCard title={t("railSagas")}>
          <div className="flex flex-col gap-2.5">
            {profile.sagas.map((saga) => (
              <Link key={saga.sagaId} href={saga.href} className="flex flex-col gap-1">
                <span className="font-serif text-[13px] text-foreground">{saga.name}</span>
                <span className="text-[11.5px] text-muted-foreground">
                  {t("railSagaProgress", { done: saga.completed, total: saga.total })}
                </span>
                <ProgressBar current={saga.completed} total={saga.total} />
              </Link>
            ))}
          </div>
        </RailCard>
      )}

      {profile.collaborators.length > 0 && (
        <RailCard title={t("railCollaborators")}>
          <div className="flex flex-col gap-2">
            {profile.collaborators.slice(0, 5).map((c) => (
              <Link key={c.id} href={c.href} className="flex items-center gap-2">
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-surface-muted">
                  {c.photoUrl && (
                    <Image src={c.photoUrl} alt="" fill sizes="32px" className="object-cover" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] text-foreground">{c.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {t(ROLE_KEY[c.role])} · {t("railCollaboratorWorks", { count: c.sharedCount })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </RailCard>
      )}

      {hasActivity && (
        <RailCard title={t("railActivity")}>
          <div className="flex flex-col gap-1 text-[12px] text-muted-foreground">
            {lastFinished && (
              <span>
                {t("railLastFinished")}: {lastFinished.title} · {lastFinished.finishedOn}
              </span>
            )}
            {/* Las medias van con DOTS, igual que en la card de la izquierda y
                que cualquier nota de la app; el número al lado porque el dot
                cuantiza a media nota y un promedio de 7,4 y otro de 7,0 se
                pintarían iguales. */}
            {profile.userAverage != null && (
              <AverageRow
                label={t("yourAverage")}
                value={profile.userAverage}
                itemType={dominantItemType(profile.works)}
              />
            )}
            {profile.globalAverage != null && (
              <AverageRow
                label={t("railGlobalAverage")}
                value={profile.globalAverage}
                itemType={dominantItemType(profile.works)}
              />
            )}
          </div>
        </RailCard>
      )}
    </div>
  );
}
