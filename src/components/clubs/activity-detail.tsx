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
import { ActivityChat } from "./activity-chat";
import { ActivityItemPool } from "./activity-item-pool";
import { BuddyReadCheckpointEditor } from "./checkpoints/checkpoint-editor";
import { CompletionModeEditor } from "./list-challenge/completion-mode-editor";
import { getActivityKindDefinition } from "@/lib/clubs/activities/kinds/registry";
import { ACTIVITY_ACCENT } from "@/lib/clubs/activities/kinds/accent";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/social/user-avatar";
import { ChevronLeftIcon } from "@/components/ui/icons";

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// `2026-07-18` → "18 jul". Se parte la cadena a mano en vez de new Date(): un
// `date` de Postgres no tiene zona horaria y pasarlo por Date lo interpreta
// como UTC, pudiendo retroceder un día según la zona del navegador (mismo
// patrón que formatDue en club-summary.tsx).
function formatStartsOn(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
}

export function ActivityDetailView({
  activity,
  viewerId,
  viewerRole,
  clubSlug,
  clubName,
}: {
  activity: ActivityDetail;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  clubSlug: string;
  clubName: string;
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

  // Vista previa para no-participantes de una actividad activa (frame B): la
  // misma cabecera y el tablero (de solo lectura por RLS), pero el chat queda
  // tras un teaser bloqueado y la única acción posible es unirse, en una
  // barra inferior fija en vez de mezclarse con la barra de acciones de
  // participantes/moderadores.
  if (status === "active" && !isParticipant && !isModerator && !isCreator) {
    return (
      <div className="flex flex-col gap-4">
        {/* Topbar del frame 4: «‹» + nombre del club, en vez de un enlace de texto. */}
        <div className="flex items-center gap-2.5">
          <Link
            href={`/club/${clubSlug}`}
            aria-label={t("backToClub")}
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Link>
          <span className="truncate font-serif text-sm font-semibold text-foreground">
            {clubName}
          </span>
        </div>

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

        {/* Quién participa: igual que en la vista de participante, sin la
            fila de acciones que solo tiene sentido dentro de la actividad. */}
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
        </div>

        {error && <p className="text-xs text-status-dropped">{error}</p>}

        {/* Los ítems de la actividad, en solo lectura: es lo que un no-participante
            necesita ver para decidir si unirse. Los tableros por tipo (reto de
            lista / tierlist / genérico) se gatean a participantes y solo enseñan
            "únete para ver", así que aquí se reintroduce la tira de portadas que
            daba la lista genérica retirada. Cada portada enlaza a su ficha. */}
        {activity.items.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
              {t("previewItems")}
            </h2>
            <div className="grid grid-cols-5 gap-2">
              {activity.items.map((item) => (
                <Link
                  key={item.id}
                  href={itemHref(item.itemType, item.itemId)}
                  title={item.itemTitle}
                  className="relative aspect-[2/3] overflow-hidden rounded-[5px] border border-border bg-surface-muted"
                >
                  {item.itemCoverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
                    <img
                      src={item.itemCoverUrl}
                      alt={item.itemTitle}
                      className="h-full w-full object-cover"
                    />
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* La estructura del tipo solo se enseña a no-participantes en la lectura
            con hitos: sus checkpoints son públicos al club (los "hitos previstos"
            del frame B, para decidir si unirse). Los demás tableros se gatean a
            participantes, así que su preview es la tira de ítems de arriba. */}
        {activity.kind === "buddy_read" && DetailExtension && (
          <DetailExtension
            activity={activity}
            viewerId={viewerId}
            isModerator={isModerator}
            onChanged={refreshActivity}
          />
        )}

        {/* Chat bloqueado: un teaser borroso en vez del ActivityChat real,
            que no participantes no pueden cargar (RLS can_view_target =
            is_activity_participant). */}
        <div className="relative overflow-hidden rounded-card border border-dashed border-border">
          <div className="pointer-events-none p-4 opacity-50 blur-[3px]" aria-hidden>
            <p className="font-mono text-[9.5px] tracking-wide text-green uppercase">
              ◎{" "}
              {activity.kind === "buddy_read"
                ? t("previewChatTeaserBuddy")
                : t("activityChat")}
            </p>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/55 px-6 text-center">
            <span aria-hidden className="text-lg">
              ◎
            </span>
            <p className="font-serif text-[15px] font-semibold text-foreground">
              {t("joinTeaserTitle")}
            </p>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              {t("joinTeaserBody")}
            </p>
          </div>
        </div>

        {/* Barra inferior fija: única acción posible para quien no participa.
            Reemplaza el join que antes vivía en la barra de acciones (Task 4
            la reserva a participantes/moderadores). */}
        <div
          className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex-1">
            {activity.startsOn && (
              <p className="font-serif text-[13px] font-semibold text-foreground">
                {t("startsOnLabel", { date: formatStartsOn(activity.startsOn) })}
              </p>
            )}
            <p className="text-[10.5px] text-muted-foreground">{t("previewLeaveHint")}</p>
          </div>
          <Button
            type="button"
            variant="primary"
            className="px-5 py-3"
            disabled={isPending}
            onClick={() => run(() => joinActivity(activity.id))}
          >
            {t("joinCta")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Topbar del frame 4: «‹» + nombre del club, en vez de un enlace de texto. */}
      <div className="flex items-center gap-2.5">
        <Link
          href={`/club/${clubSlug}`}
          aria-label={t("backToClub")}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
        <span className="truncate font-serif text-sm font-semibold text-foreground">
          {clubName}
        </span>
      </div>

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
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      {/* Barra de acciones: Unirme (no participantes de una activa) + Salir
          (participantes) + grupo ◈ MOD (Modificar/Finalizar/Archivar/+Activar)
          para moderadores. El creador no-mod conserva un Finalizar aparte
          aunque no lleve el grupo MOD. Unirme y Salir son mutuamente
          excluyentes (uno u otro según isParticipant). */}
      {(isParticipant ||
        (isModerator && (status === "proposed" || status === "active")) ||
        (!isModerator && isCreator && status === "active") ||
        (status === "active" && !isParticipant)) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {status === "active" && !isParticipant && (
            <Button
              type="button"
              variant="green"
              className="px-3.5 py-2 text-xs"
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
              className="px-3.5 py-2 text-xs"
              disabled={isPending}
              onClick={() => run(() => leaveActivity(activity.id))}
            >
              {t("leave")}
            </Button>
          )}

          {!isModerator && isCreator && status === "active" && (
            <Button
              type="button"
              variant="secondary"
              className="px-3.5 py-2 text-xs"
              disabled={isPending}
              onClick={() => run(() => finishActivity(activity.id))}
            >
              {t("finish")}
            </Button>
          )}

          {isModerator && (status === "proposed" || status === "active") && (
            <div className="ml-auto flex items-center gap-2 border-l border-border pl-3">
              <span className="font-mono text-[8.5px] tracking-wide text-foreground-faint uppercase">
                ◈ {t("modTag")}
              </span>
              {status === "proposed" && (
                <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs" disabled={isPending}
                  onClick={() => run(() => activateActivity(activity.id))}>
                  {t("activate")}
                </Button>
              )}
              <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs"
                onClick={() => setEditing(true)}>
                {t("modify")}
              </Button>
              {status === "active" && (
                <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs" disabled={isPending}
                  onClick={() => run(() => finishActivity(activity.id))}>
                  {t("finish")}
                </Button>
              )}
              <Button type="button" variant="secondary" className="px-3.5 py-2 text-xs" disabled={isPending}
                onClick={() => run(() => archiveActivity(activity.id))}>
                {t("archive")}
              </Button>
            </div>
          )}
        </div>
      )}

      {DetailExtension && (
        <DetailExtension
          activity={activity}
          viewerId={viewerId}
          isModerator={isModerator}
          onChanged={refreshActivity}
        />
      )}

      {/* Chat general de la actividad: no en buddy_read (que ya tiene sus
          chats por checkpoint) y solo visible/usable para participantes -- la
          RLS (can_view_target = is_activity_participant) lo respalda. */}
      {activity.kind !== "buddy_read" && isParticipant && (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {t("activityChat")}
          </h2>
          <ActivityChat activityId={activity.id} summary={activity.chat} viewerLoggedIn />
        </section>
      )}
    </div>
  );
}
