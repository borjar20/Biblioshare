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
import { ActivityLayout } from "./activity-layout";
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

  // Los participantes se pintan en su sitio del mockup en móvil, y además
  // viajan al rail en PC (`railExtra`). Una sola definición para las dos.
  const participantsBlock = (
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
  );

  // ¿Monta tablero (DetailExtension)? Solo entonces existe el rail derecho
  // que en PC ya reenvía `participantsBlock` (vía railExtra/ActivityLayout).
  // Es la MISMA condición que decide unas líneas más abajo si se monta el
  // DetailExtension dentro de `structureSection` -- deliberadamente extraída
  // a una sola constante y reutilizada en ambos sitios (y en la vista previa
  // de no-participantes, que comparte structureSection) para que no puedan
  // divergir: si un sitio dice "hay rail" y el otro "no", el bloque de
  // participantes se duplica o desaparece según la actividad.
  const hasBoard = (isParticipant || activity.kind === "buddy_read") && Boolean(DetailExtension);

  // La "estructura" que ve cada quién, compartida por la vista principal y la
  // previa. El PARTICIPANTE ve el tablero completo (rejilla con su progreso,
  // tierlist, hitos con "Tu progreso"). El NO-PARTICIPANTE —un miembro suelto,
  // o un mod/creador que no se ha unido— no puede cargar ese tablero (se gatea a
  // participante y solo diría "únete para ver"), así que ve las portadas de los
  // ítems en solo lectura para saber de qué va, enlazadas a su ficha. La lectura
  // con hitos SÍ expone sus checkpoints a todo el club, así que además monta su
  // tablero (los "hitos previstos" del frame B).
  const structureSection = (
    <>
      {!isParticipant && activity.items.length > 0 && (
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

      {hasBoard && DetailExtension && (
        <DetailExtension
          activity={activity}
          viewerId={viewerId}
          isModerator={isModerator}
          onChanged={refreshActivity}
          clubSlug={clubSlug}
          Layout={ActivityLayout}
          railExtra={participantsBlock}
        />
      )}
    </>
  );

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
        {/* Topbar: en móvil «‹ nombre del club» (frame 4); en PC «‹ Actividades»,
            pegado bajo el topbar global. Un SOLO <Link> con dos textos por
            breakpoint -- se desdobla texto, nunca el control (spec, decisión 1). */}
        <div className="-mx-4 flex items-center gap-2.5 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:sticky lg:top-[var(--topbar-h)] lg:z-10 lg:-mx-8 lg:px-8">
          <Link
            href={`/club/${clubSlug}?tab=actividades`}
            className="flex min-w-0 items-center gap-2.5 text-foreground"
          >
            <span
              aria-hidden
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface transition-colors hover:bg-surface-muted"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </span>
            <span className="truncate font-serif text-sm font-semibold lg:hidden">
              {clubName}
            </span>
            <span className="hidden text-[13px] text-muted-foreground lg:inline">
              {t("backToActivities")}
            </span>
          </Link>
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
            fila de acciones que solo tiene sentido dentro de la actividad.
            Se oculta en PC solo si monta tablero (hasBoard): esta rama es de
            no-participantes, así que solo ocurre con buddy_read (lectura con
            hitos abierta a todo el club) -- ahí el rail ya lo repite. */}
        <div className={hasBoard ? "lg:hidden" : undefined}>{participantsBlock}</div>

        {error && <p className="text-xs text-status-dropped">{error}</p>}

        {structureSection}

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
      {/* Topbar: en móvil «‹ nombre del club» (frame 4); en PC «‹ Actividades»,
          pegado bajo el topbar global. Un SOLO <Link> con dos textos por
          breakpoint -- se desdobla texto, nunca el control (spec, decisión 1). */}
      <div className="-mx-4 flex items-center gap-2.5 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:sticky lg:top-[var(--topbar-h)] lg:z-10 lg:-mx-8 lg:px-8">
        <Link
          href={`/club/${clubSlug}?tab=actividades`}
          className="flex min-w-0 items-center gap-2.5 text-foreground"
        >
          <span
            aria-hidden
            className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] border border-border bg-surface transition-colors hover:bg-surface-muted"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </span>
          <span className="truncate font-serif text-sm font-semibold lg:hidden">
            {clubName}
          </span>
          <span className="hidden text-[13px] text-muted-foreground lg:inline">
            {t("backToActivities")}
          </span>
        </Link>
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

      {/* Quién participa: stack de avatares + unirse/salir, como en el handoff.
          En PC se oculta si hay tablero (hasBoard): ese caso ya lo repite el
          rail derecho vía railExtra/ActivityLayout ("hidden lg:block"), y sin
          esta condición "1 participa" saldría duplicado a 1280px. No basta
          `lg:hidden` a secas: un moderador o creador que NO participa en un
          reto de lista llega aquí sin tablero (no hay rail), y necesita ver
          el bloque también en PC -- de ahí que la condición sea `hasBoard`,
          no una simplificación fija. */}
      <div className={hasBoard ? "lg:hidden" : undefined}>{participantsBlock}</div>

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

      {structureSection}

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
