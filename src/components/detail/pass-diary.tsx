"use client";
import { ReviewContent } from "./review-content";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Pass, DroppedReason } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import {
  updatePass,
  deletePass,
  type ClosePassState,
} from "@/lib/passes/actions";
import { formatEdition } from "@/lib/editions/edition-label";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { RatingDots } from "@/components/ui/rating-dots";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { useMentionAutocomplete } from "@/components/social/use-mention-autocomplete";
import { DroppedReasonFields } from "@/components/detail/dropped-reason-fields";
import { ReviewSpoilerField } from "@/components/detail/review-spoiler-field";
import { JointViewingSheet } from "@/components/detail/joint-viewing-sheet";
import { UserAvatar } from "@/components/social/user-avatar";
import { loadJointViewingsForPasses } from "@/lib/social/joint-viewing-actions";
import type { PassJointViewing } from "@/lib/social/joint-viewings";

const initialState: ClosePassState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Diferencia entre dos notas 1-10 en la escala que se ENSEÑA (la de 5 dots,
// donde un dot = 2 puntos), con signo siempre visible ("+1", "-0,5"…) —
// locale es-ES, coma decimal. Se llamaba starsDelta y su etiqueta acababa en
// "★"; la app ya no tiene estrellas (ver rating-dots.tsx), así que el delta va
// sin unidad: el número está en la misma escala que el "4,5" de al lado.
function ratingDelta(current: number, previous: number): string {
  const diff = (current - previous) / 2;
  return diff.toLocaleString("es-ES", {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
}

// Diario de pases: cada tarjeta es un pase (una lectura/visionado), con el
// delta contra el pase ANTERIOR EN EL TIEMPO — que es el SIGUIENTE elemento
// del array, porque getPasses los da del más reciente al más antiguo (misma
// lógica que el viejo panel de diario, ahora jubilado).
export function PassDiary({
  itemType,
  itemId,
  passes,
  editions,
  activeOnly = false,
}: {
  itemType: ItemType;
  itemId: string;
  passes: Pass[];
  editions: Edition[];
  activeOnly?: boolean;
}) {
  const t = useTranslations("passes");

  // Con quién está compartido cada pase terminado (#1220), en UNA llamada por
  // diario. Se recarga al cerrar la hoja de un pase, por si invitó o se salió.
  const completedKey = passes
    .filter((p) => p.status === "completed" && (!activeOnly || p.isActive))
    .map((p) => p.id)
    .join(",");
  const [jointByPass, setJointByPass] = useState<Record<string, PassJointViewing>>({});
  const reloadJoint = useCallback(() => {
    if (!completedKey) return;
    loadJointViewingsForPasses(completedKey.split(",")).then(setJointByPass);
  }, [completedKey]);
  useEffect(() => {
    if (!completedKey) return;
    let cancelled = false;
    loadJointViewingsForPasses(completedKey.split(",")).then((map) => {
      if (!cancelled) setJointByPass(map);
    });
    return () => {
      cancelled = true;
    };
  }, [completedKey]);

  return (
    <div className="flex flex-col">
      {passes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {passes.map((pass, i) => {
            if (activeOnly && !pass.isActive) return null;
            // Los pases vienen del más reciente al más antiguo: el n-ésimo
            // pase cronológico es al revés del índice del array.
            const n = passes.length - i;
            const previous = passes[i + 1];
            // El pase anterior puede seguir abierto (sin terminar); en ese
            // caso no hay un pase "cerrado" real contra el que comparar.
            const hasDelta =
              pass.rating != null &&
              previous?.rating != null &&
              previous.finishedOn != null;
            const diff = hasDelta ? pass.rating! - previous!.rating! : 0;
            const edition = pass.editionId
              ? (editions.find((e) => e.id === pass.editionId) ?? null)
              : null;

            const showDelta = hasDelta && diff !== 0;

            return (
              <li key={pass.id}>
                <PassCard
                  pass={pass}
                  n={n}
                  itemType={itemType}
                  itemId={itemId}
                  editionLabel={
                    edition ? formatEdition(edition, itemType) : null
                  }
                  deltaLabel={
                    showDelta
                      ? t(diff > 0 ? "delta" : "deltaDown", {
                          delta: ratingDelta(pass.rating!, previous!.rating!),
                        })
                      : null
                  }
                  deltaUp={showDelta ? diff > 0 : null}
                  // Los pases viejos se atenúan (`opacity:.8` del frame): el
                  // de arriba es el que cuenta ahora.
                  isOld={i > 0}
                  joint={jointByPass[pass.id] ?? null}
                  onJointChanged={reloadJoint}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PassCard({
  pass,
  n,
  itemType,
  itemId,
  editionLabel,
  deltaLabel,
  deltaUp,
  isOld,
  joint,
  onJointChanged,
}: {
  pass: Pass;
  n: number;
  itemType: ItemType;
  itemId: string;
  editionLabel: string | null;
  deltaLabel: string | null;
  /** true = subió, false = bajó, null = sin delta que mostrar. */
  deltaUp: boolean | null;
  /** No es el pase más reciente: se atenúa (`opacity:.8` del frame). */
  isOld: boolean;
  /** Visionado conjunto del pase (#1220), o null si no está compartido. */
  joint: PassJointViewing | null;
  onJointChanged: () => void;
}) {
  const t = useTranslations("passes");
  const format = useFormatter();
  const accent = MEDIA_ACCENT[itemType];
  const [editing, setEditing] = useState(false);
  const [jointOpen, setJointOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [rating, setRating] = useState<number | null>(pass.rating);
  const [review, setReview] = useState(pass.review ?? "");
  const [reviewIsSpoiler, setReviewIsSpoiler] = useState(pass.reviewIsSpoiler);
  const [reason, setReason] = useState<DroppedReason | "">(pass.droppedReason ?? "");
  const [reasonNote, setReasonNote] = useState(pass.droppedReasonNote ?? "");
  const mention = useMentionAutocomplete({
    value: review,
    onChange: setReview,
    scope: { scope: "profile" },
  });
  const [state, formAction, pending] = useActionState(
    updatePass.bind(null, pass.id, itemType, itemId),
    initialState,
  );

  // Cerrar el formulario tras un guardado sin error: ajuste de estado
  // durante el render (mismo patrón que EditionStrip/ClosePassSheet), no un
  // useEffect, que aquí dispararía react-hooks/set-state-in-effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (!state.error) setEditing(false);
  }

  const dateLabel = pass.finishedOn
    ? format.dateTime(new Date(pass.finishedOn), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : pass.status === "completed" ? t("unknownDate") : t("open");

  // Solo los pases YA cerrados se editan aquí: el editable de un pase
  // abierto es la nota (panel Progreso, ratePass), no esta tarjeta — este
  // formulario comparte updatePass con closePass y ese siempre escribe
  // finished_on, así que abrirlo en un pase abierto lo cerraría de tapadillo.
  const canEdit = pass.status === "completed" || pass.status === "dropped";

  // `.diary-entry` del frame: sobre --surface-muted (el --surface-2 del
  // handoff), radio 10 y 13 de padding.
  return (
    <div
      data-testid="diary-entry"
      // Los pases viejos se atenúan atenuando el PAPEL, no la tinta:
      // `opacity-80` sobre la tarjeta entera bajaba su texto a 3,23:1 en claro
      // y 3,89:1 en oscuro (medido), por debajo del 4,5:1 de WCAG 1.4.3.
      // Rebajar el relleno da la misma jerarquía y SUBE el contraste.
      className={`flex flex-col rounded-[10px] border border-border p-[13px] text-xs ${
        pass.isActive ? "border-x-0 border-b-0 rounded-none px-0" : isOld ? "bg-surface-muted/50" : "bg-surface-muted"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">
          {t(`nth.${itemType}`, { n })} <span className="font-normal text-muted-foreground">· {dateLabel}</span>
        </h3>
        <div className="flex items-center gap-1.5">
          {!pass.isActive && <RatingDots value={pass.rating} size="sm" itemType={itemType} />}
          {deltaLabel && (
            <span
              className={`font-mono text-[10px] ${
                deltaUp ? "text-status-completed-ink" : "text-status-dropped-ink"
              }`}
            >
              {deltaLabel}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] empty:hidden">
        {editionLabel && (
          <span
            className={`rounded-chip px-1.5 py-0.5 tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
          >
            {editionLabel}
          </span>
        )}
        {/* Motivo de abandono (§7 del diseño: "¿por qué dejé esto?" al mirar
            el historial). Mismo patrón de chip que editionLabel, con los
            colores de --status-dropped — un pase `completed` con datos
            residuales de un dropped anterior nunca entra aquí porque el
            gate exige status === "dropped", no solo droppedReason presente. */}
        {pass.status === "dropped" && pass.droppedReason && (
          <span className="rounded-chip bg-status-dropped/10 px-1.5 py-0.5 tracking-wide uppercase text-status-dropped">
            {t(`droppedReason.options.${pass.droppedReason}`)}
          </span>
        )}
      </div>

      {pass.review && (
        <p className="my-3 max-w-[65ch] [overflow-wrap:anywhere] font-serif text-base leading-relaxed text-foreground">
          <ReviewContent text={pass.review} />
        </p>
      )}

      {/* Nota libre de "otro": misma prosa que la reseña, no truncada — es la
          respuesta a la pregunta que motivó la feature. */}
      {pass.status === "dropped" &&
        pass.droppedReason === "otro" &&
        pass.droppedReasonNote && (
          <p className="mt-1 max-w-[70ch] text-[12.5px] leading-[1.55] text-foreground-soft">
            {pass.droppedReasonNote}
          </p>
        )}

      {/* Visionado conjunto (#1220), a la vista y no tras el «···»: sobre un
          pase terminado, un botón para decir con quién; si ya está compartido,
          los avatares de quien está (sin los que dijeron «No fui yo»). */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {pass.status === "completed" && (
          <JointChip
            itemType={itemType}
            joint={joint}
            onOpen={() => setJointOpen(true)}
          />
        )}

        {/* Editar se queda en línea (es neutro y es lo que se hace a diario);
            borrar se va detrás del «···» (F3-012). Antes los dos eran el mismo
            text-link gris, uno al lado del otro, y el de la derecha borraba el
            pase con sus sesiones SIN preguntar. La confirmación va aquí y no en
            `deletePass` porque la Server Action también la llaman flujos que ya
            preguntaron antes. */}
        <div className="ml-auto flex items-center gap-3">
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-muted-foreground underline hover:text-foreground"
            >
              {editing ? t("cancelEdit") : t("edit")}
            </button>
          )}
          <div className="ml-auto">
            <ActionMenu
              label={t("actionsLabel")}
              triggerClassName="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              items={[
                {
                  key: "delete",
                  label: t("delete"),
                  danger: true,
                  disabled: isDeleting,
                  onSelect: () => {
                    if (!window.confirm(t("deleteConfirm"))) return;
                    startDeleteTransition(() =>
                      deletePass(pass.id, itemType, itemId),
                    );
                  },
                },
              ]}
            />
          </div>
        </div>
      </div>

      {pass.status === "completed" && (
        <JointViewingSheet
          passId={pass.id}
          itemType={itemType}
          itemId={itemId}
          open={jointOpen}
          onClose={() => {
            setJointOpen(false);
            onJointChanged();
          }}
        />
      )}

      {canEdit && editing && (
        <form
          action={formAction}
          className="flex flex-col gap-2 border-t border-border pt-2"
        >
          <label className="flex flex-col gap-1">
            <span className="label-section">
              {t("finishedOn")}
            </span>
            <input
              type="date"
              name="finishedOn"
              defaultValue={pass.finishedOn ?? ""}
              max={today()}
              className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="label-section">
              {t("rating")}
            </span>
            <RatingDots value={rating} onChange={setRating} size="sm" itemType={itemType} />
            <input type="hidden" name="rating" value={rating ?? ""} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="label-section">
              {t("review")}
            </span>
            <div className="relative">
              <textarea
                name="review"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                onInput={mention.onInput}
                onKeyDown={mention.onKeyDown}
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {mention.dropdown}
            </div>
          </label>

          <ReviewSpoilerField review={review} checked={reviewIsSpoiler} onChange={setReviewIsSpoiler} size="sm" />

          {pass.status === "dropped" && (
            <DroppedReasonFields
              reason={reason}
              onReasonChange={setReason}
              note={reasonNote}
              onNoteChange={setReasonNote}
              size="sm"
            />
          )}

          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("isPublic")}</span>
            <input
              type="checkbox"
              name="isPublic"
              defaultChecked={pass.isPublic}
            />
          </label>

          {state.error && (
            <p className="text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}

          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </div>
  );
}

function JointChip({
  itemType,
  joint,
  onOpen,
}: {
  itemType: ItemType;
  joint: PassJointViewing | null;
  onOpen: () => void;
}) {
  const t = useTranslations("passes");
  const others = (joint?.others ?? []).filter((m) => m.status !== "declined");
  const names = others.map((m) => m.displayName || m.username);

  if (others.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-fit items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
      >
        <span aria-hidden>＋</span>
        {t(`jointAction.${itemType}`)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-fit max-w-full items-center gap-2 rounded-full border border-border bg-surface px-1.5 py-1 pr-2.5 text-[11px] text-foreground-soft transition-colors hover:border-accent"
    >
      <span className="flex shrink-0 -space-x-1.5">
        {others.slice(0, 3).map((m) => (
          <span key={m.userId} className="rounded-full ring-2 ring-surface">
            <UserAvatar name={m.displayName || m.username} avatarUrl={m.avatarUrl} size={18} />
          </span>
        ))}
      </span>
      <span className="truncate">
        {t("jointWith", {
          names: new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(
            names.length > 3
              ? [...names.slice(0, 2), t("jointMore", { count: names.length - 2 })]
              : names,
          ),
        })}
      </span>
      {others.some((m) => m.status === "invited") && (
        <span className="shrink-0 font-mono text-[9.5px] tracking-wide uppercase text-muted-foreground">
          {t("jointPending")}
        </span>
      )}
    </button>
  );
}
