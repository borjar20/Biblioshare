"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ActivityDetail } from "@/lib/clubs/activities/core";
import { spawnLinkedActivity } from "@/lib/clubs/activities/core";

// Frame 15: en el detalle de un reto por lista, la cadena de actividades nacidas de él y —cuando
// el reto está finalizado y aún no hay tierlist enlazada— la oferta de cerrarlo con una tierlist
// de los mismos ítems. La lista de hijas la ve todo el club; «Crear» solo curador/mod.
export function LinkedActivities({
  activity,
  isCurator,
  clubSlug,
}: {
  activity: ActivityDetail;
  isCurator: boolean;
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const hasTierlist = activity.linkedChildren.some((c) => c.kind === "tierlist");
  const offerTierlist =
    isCurator && activity.status === "finished" && !hasTierlist;

  if (activity.linkedChildren.length === 0 && !offerTierlist) return null;

  function createTierlist() {
    setError(false);
    startTransition(async () => {
      try {
        const childId = await spawnLinkedActivity({
          parentActivityId: activity.id,
          kind: "tierlist",
          title: `${t("kind_tierlist")} · ${activity.title}`,
        });
        router.push(`/club/${clubSlug}/actividad/${childId}`);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      {offerTierlist && (
        <div className="flex items-center gap-3 rounded-card border border-gold/40 bg-gold/[0.08] px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gold/15 text-gold">◆</span>
          <div className="flex-1">
            <div className="font-serif text-sm font-semibold">{t("closeWithTierlist")}</div>
            <div className="text-[11.5px] text-muted-foreground">{t("closeWithTierlistHint")}</div>
          </div>
          <button
            type="button"
            onClick={createTierlist}
            disabled={pending}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-60"
          >
            {t("create")}
          </button>
        </div>
      )}

      {activity.linkedChildren.length > 0 && (
        <>
          <h3 className="label-section">
            {t("linkedActivities")}
          </h3>
          <div className="flex flex-col gap-2">
            {activity.linkedChildren.map((child) => (
              <div key={child.id} className="flex flex-col gap-1">
                <Link
                  href={`/club/${clubSlug}/actividad/${child.id}`}
                  className="flex items-center gap-3 rounded-card border border-border px-4 py-3"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent/15 text-accent">
                    {child.kind === "tierlist" ? "◆" : "◈"}
                  </span>
                  <span className="flex-1">
                    <span className="block font-serif text-sm font-semibold">{child.title}</span>
                    <span className="block font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                      {t(`kind_${child.kind}`)} · {t(`status_${child.status}`)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">↗</span>
                </Link>
                {child.fromItem && child.fromItem.itemTitle && (
                  <p className="pl-4 font-mono text-[10px] text-faint">
                    {t("bornFromItem", { title: child.fromItem.itemTitle })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-xs text-status-dropped">{t("proposeError")}</p>}
    </section>
  );
}
