"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  activateActivity,
  archiveActivity,
  finishActivity,
  joinActivity,
  leaveActivity,
  type ActivityDetail,
} from "@/lib/clubs/activities/core";
import { ActivityItemPool } from "./activity-item-pool";
import { ActivityItemList } from "./activity-item-list";
import { BuddyReadCheckpointEditor } from "./checkpoints/checkpoint-editor";
import { CompletionModeEditor } from "./list-challenge/completion-mode-editor";
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/social/user-avatar";

export function ActivityDetailView({
  activity,
  viewerId,
  viewerRole,
  clubSlug,
}: {
  activity: ActivityDetail;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  clubSlug: string;
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  // Los datos de la actividad derivan de la prop: cada mutación revalida
  // /club/[slug]/actividad/[id] (Fase 1) y la RSC re-ejecuta con la actividad
  // fresca. Solo el estado de UI (editar, error, pendiente) es local.
  const status = activity.status;
  const isParticipant = activity.viewerIsParticipant;
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isModerator = viewerRole === "moderator" || viewerRole === "owner";
  const isCreator = activity.createdBy === viewerId;
  const kindDefinition = getActivityKindDefinition(activity.kind);
  const DetailExtension = kindDefinition.DetailExtension;
  const accent = ACTIVITY_ACCENT[activity.kind];
  // Mismo espejo de la RLS que usa el pool: quién puede curar los ítems.
  const canCurate =
    kindDefinition.usesItemPool &&
    (kindDefinition.itemCuration === "curators" ? isCreator || isModerator : isParticipant);
  // Los moderadores entran a editar aunque no participen: ya podían quitar
  // ítems ajenos y gestionar los hitos de la lectura conjunta.
  const canEdit = canCurate || isModerator;

  // Reconcilia el subárbol profundo (pool de ítems, tableros por tipo,
  // checkpoints): esos hijos conservan estado local propio, así que en vez de
  // derivarlos hoja por hoja se repunta su onChanged a router.refresh(), que
  // re-ejecuta la RSC y les entrega props frescas (este componente ya deriva de
  // props). Coste consciente: un refresco redundante con el revalidatePath de
  // la propia action (Fase 1), a cambio de no tocar los tableros con drag.
  function refreshActivity() {
    router.refresh();
  }

  // Los botones propios del detalle (join/leave/activate/finish/archive) no
  // necesitan refresco explícito: la action revalida la ruta actual y, como
  // status/isParticipant derivan de props, la vista se recalcula sola.
  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError(t("activateError"));
      }
    });
  }

  const compact = "px-3.5 py-1.5 text-xs";
  const overflow = activity.participantCount - activity.participants.length;

  // Vista "Modificar actividad" (misma página, patrón del ClubForm de editar
  // club): aquí y solo aquí vive la curación del pool (añadir/quitar ítems).
  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="self-start font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {t("backToActivity")}
        </button>

        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[23px] leading-tight font-semibold text-foreground">
            {t("editActivity")}
          </h1>
          <p className="text-[13px] text-muted-foreground">{activity.title}</p>
        </div>

        <ActivityItemPool
          activityId={activity.id}
          items={activity.items}
          viewerId={viewerId}
          isParticipant={isParticipant}
          isCreator={isCreator}
          canModerate={isModerator}
          allowedItemTypes={kindDefinition.allowedItemTypes}
          maxItems={kindDefinition.maxItems}
          itemCuration={kindDefinition.itemCuration}
          onChanged={refreshActivity}
        />

        {/* Los hitos de la lectura conjunta también se gestionan aquí: el
            board del detalle solo los lista. */}
        {activity.kind === "buddy_read" && isModerator && (
          <BuddyReadCheckpointEditor activityId={activity.id} status={status} />
        )}

        {/* La modalidad de compleción también se cambia aquí. Espejo de la RPC
            set_activity_completion_mode: creador o moderador, en cualquier estado. */}
        {activity.kind === "list_challenge" && (isCreator || isModerator) && (
          <CompletionModeEditor
            activityId={activity.id}
            config={activity.config}
            status={status}
            onChanged={refreshActivity}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/club/${clubSlug}`}
        className="font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        {t("backToClub")}
      </Link>

      <div className="flex flex-col gap-2">
        {/* El chip identifica tipo y estado de un vistazo, con el color del
            tipo — el mismo lenguaje que las tarjetas de la lista. */}
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-chip px-2 py-0.5 font-mono text-[9px] tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-[2px] ${accent.bar}`} />
          {t(`kind_${activity.kind}`)} · {t(`status_${status}`)}
        </span>

        <h1 className="font-serif text-[23px] leading-tight font-semibold text-foreground">
          {activity.title}
        </h1>

        {activity.description && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {activity.description}
          </p>
        )}
      </div>

      {/* Quién participa: stack de avatares + unirse/salir, como en el handoff. */}
      <div className="flex items-center gap-3">
        {activity.participants.length > 0 && (
          <span className="flex" aria-hidden>
            {activity.participants.map((participant) => (
              <span
                key={participant.userId}
                className="-ml-2 rounded-full ring-2 ring-background first:ml-0"
              >
                <UserAvatar
                  name={participant.displayName || participant.username}
                  avatarUrl={participant.avatarUrl}
                  size={28}
                />
              </span>
            ))}
            {overflow > 0 && (
              <span className="-ml-2 grid h-7 w-7 place-items-center rounded-full bg-surface-muted font-mono text-[10px] text-muted-foreground ring-2 ring-background">
                +{overflow}
              </span>
            )}
          </span>
        )}

        <span className="text-xs text-muted-foreground">
          {t("participate", { count: activity.participantCount })}
        </span>

        {status === "active" && !isParticipant && (
          <Button
            type="button"
            variant="green"
            className={`ml-auto ${compact}`}
            disabled={isPending}
            onClick={() => run(() => joinActivity(activity.id))}
          >
            {t("join")}
          </Button>
        )}
        {isParticipant && (
          <Button
            type="button"
            variant="secondary"
            className={`ml-auto ${compact}`}
            disabled={isPending}
            onClick={() => run(() => leaveActivity(activity.id))}
          >
            {t("leave")}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      {/* Acciones de moderación, separadas de las de participante. */}
      {isModerator && (status === "proposed" || status === "active") && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "proposed" && (
            <Button
              type="button"
              className={compact}
              disabled={isPending}
              onClick={() => run(() => activateActivity(activity.id))}
            >
              {t("activate")}
            </Button>
          )}
          {status === "active" && (
            <Button
              type="button"
              variant="secondary"
              className={compact}
              disabled={isPending}
              onClick={() => run(() => finishActivity(activity.id))}
            >
              {t("finish")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className={compact}
            disabled={isPending}
            onClick={() => run(() => archiveActivity(activity.id))}
          >
            {t("archive")}
          </Button>
        </div>
      )}

      {/* El creador (no moderador) también puede dar por terminada su actividad. */}
      {!isModerator && isCreator && status === "active" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className={compact}
            disabled={isPending}
            onClick={() => run(() => finishActivity(activity.id))}
          >
            {t("finish")}
          </Button>
        </div>
      )}

      {/* Aviso antes de unirse (cierra Q5 y Q8 del backlog): unirse añade los
          ítems del pool a tu biblioteca como pendientes y comparte tu progreso
          con los participantes, aunque tu perfil sea privado fuera. */}
      {status === "active" && !isParticipant && activity.items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("joinDisclosure", { count: activity.items.length })}
        </p>
      )}

      {DetailExtension && (
        <DetailExtension
          activity={activity}
          viewerId={viewerId}
          isModerator={isModerator}
          onChanged={refreshActivity}
        />
      )}

      {/* La lista de ítems cierra la página: el tablero del kind es el
          protagonista y aquí abajo se opina, ítem a ítem.
          criteria_challenge (H4) no tiene pool: su reto se describe por
          criterio, no se enumera -- y sin ítems tampoco hay opiniones.
          La lista es de solo lectura; la curación vive en "Modificar actividad". */}
      {kindDefinition.usesItemPool && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("itemPool")}
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase hover:text-foreground"
              >
                {t("editActivity")}
              </button>
            )}
          </div>

          <ActivityItemList
            activity={activity}
            viewerId={viewerId}
            isParticipant={isParticipant}
            onChanged={refreshActivity}
          />

          {activity.items.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("itemPoolEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}
