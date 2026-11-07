"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import type { DroppedReason } from "@/lib/passes/types";
import { closePass, type ClosePassState } from "@/lib/passes/actions";
import { useMentionAutocomplete } from "@/components/social/use-mention-autocomplete";
import { DroppedReasonFields } from "@/components/detail/dropped-reason-fields";
import { ReviewSpoilerField } from "@/components/detail/review-spoiler-field";
import { JointCompanionsPicker } from "@/components/detail/joint-companions-picker";
import {
  createJointViewing,
  loadMutualFollows,
  type JointActionError,
} from "@/lib/social/joint-viewing-actions";
import type { JointPerson } from "@/lib/social/joint-viewings";
import materials from "@/components/stage/materials.module.css";
import { StageMascot, type Speech } from "@/components/stage/stage-mascot";
import { MiniShelf } from "@/components/stage/mini-shelf";
import { loadClosingContext, type ClosingContext } from "@/lib/passes/load-closing-context";
import { recapLine, FAREWELL_VARIANTS, DROPPED_VARIANTS } from "@/lib/ritual/closing-lines";
import { InkDateStamp } from "./ink-date-stamp";
import { WaxSeal } from "./wax-seal";
import { ClosingObject } from "./closing-object";

const initialState: ClosePassState = {};

const WEEKDAY = new Intl.DateTimeFormat("es", { weekday: "long" });

// Variante de despedida estable por pase y pura en el render. No vale
// `passId.length`: los ids son UUID y miden siempre 36 (saldría siempre la 0).
function variantOf(passId: string, n: number): number {
  let sum = 0;
  for (let i = 0; i < passId.length; i++) sum += passId.charCodeAt(i);
  return sum % n;
}

// Hoja de cierre de pase: se abre justo después de que el padre marque el
// ítem como leído/visto (StatusSegments → updateStatus). Para ese momento el
// pase YA quedó cerrado en BD (updateStatus le puso finished_on): esta hoja
// solo añade fecha exacta, nota, reseña y visibilidad por encima. "Ahora no"
// no llama a closePass — no hay nada que guardar todavía — el pase se queda
// cerrado sin nota y se puede completar luego desde el diario (updatePass).
//
// Es el ritual de cierre (spec 2026-11-07): la mascota en su balda dice el
// recuento, la obra se cierra en un objeto (última página, entrada, disco) con
// sello de fecha, dedicatoria y lacre, y al guardar se despide antes de cerrar.
//
// Diálogo modal nativo (<dialog> + showModal()): atrapa el foco y cierra con
// Escape sin código propio. El evento nativo "close" (se dispara tanto al
// pulsar Escape como al llamar dialog.close() nosotros mismos) es la única
// vía por la que avisamos al padre — así "Ahora no", el clic fuera y un
// guardado con éxito acaban todos en el mismo sitio.
export function ClosePassSheet({
  passId,
  itemType,
  itemId,
  status,
  open,
  onClose,
}: {
  passId: string;
  itemType: ItemType;
  itemId: string;
  status: MediaStatus;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("passes");
  const tr = useTranslations("ritual.closing");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const [reviewIsSpoiler, setReviewIsSpoiler] = useState(false);
  const [reason, setReason] = useState<DroppedReason | "">("");
  const [reasonNote, setReasonNote] = useState("");
  const mention = useMentionAutocomplete({
    value: review,
    onChange: setReview,
    scope: { scope: "profile" },
  });
  const [state, formAction, pending] = useActionState(
    closePass.bind(null, passId, itemType, itemId),
    initialState
  );
  // Visionado conjunto (#1220): «¿Con quién la viste?» en el mismo gesto de
  // terminar. Solo al completar (un abandono no se comparte). La lista de
  // seguidos mutuos se carga al abrir; la etiqueta se envía tras guardar.
  const canShare = status === "completed";
  const [mutuals, setMutuals] = useState<JointPerson[] | null>(null);
  const [companions, setCompanions] = useState<Set<string>>(new Set());
  const [jointError, setJointError] = useState<JointActionError | null>(null);
  const [sharing, startSharing] = useTransition();
  // El ritual: recuento y mascota se cargan al abrir; la despedida
  // (`farewell`) es la frase y el cierre del objeto antes de cerrar la hoja.
  // `openedAt` fija «hoy» al abrir (fecha por defecto del sello y día de la
  // película). `openings` es la `key` del objeto: el sello de fecha no está
  // controlado, así que cada apertura lo remonta y vuelve a empezar en hoy.
  const [ctx, setCtx] = useState<ClosingContext | null>(null);
  const [farewell, setFarewell] = useState(false);
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [openings, setOpenings] = useState(0);

  // Al reabrir la hoja no queremos arrastrar la nota que hubiera quedado
  // marcada de una vez anterior. Ajuste de estado durante el render (mismo
  // patrón que EditionStrip, ver src/components/detail/edition-strip.tsx)
  // en vez de un useEffect, que aquí dispararía react-hooks/set-state-in-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRating(null);
      setReason("");
      setReasonNote("");
      setCompanions(new Set());
      setJointError(null);
      setCtx(null);
      setFarewell(false);
      setOpenedAt(new Date());
      setOpenings((n) => n + 1);
    }
  }

  useEffect(() => {
    if (!open || !canShare) return;
    let cancelled = false;
    loadMutualFollows().then((people) => {
      if (!cancelled) setMutuals(people);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canShare]);

  // Sin recuento (fallo de red, sin sesión…) el cierre sigue: la mascota dice
  // la frase genérica. Mismo patrón de cancelación que loadMutualFollows.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadClosingContext(passId)
      .then((c) => {
        if (!cancelled) setCtx(c);
      })
      .catch(() => {
        if (!cancelled) setCtx({ recap: null, pet: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, passId]);

  function toggleCompanion(userId: string) {
    setCompanions((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  // showModal()/close() son llamadas imperativas al DOM, no setState: no
  // chocan con react-hooks/set-state-in-effect. Solo sincronizan el
  // <dialog> nativo con la prop `open`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Tras un envío sin error la hoja se despide (`farewell`) y después se
  // cierra llamando a dialog.close(): eso dispara el evento nativo "close"
  // (onClose={onClose} más abajo), que es quien de verdad avisa al padre. Solo
  // se aplaza ese close(): lo demás del éxito (el visionado conjunto incluido)
  // ocurre igual y en el mismo momento que antes.
  //
  // "¿Ha habido envío ya?" se resuelve comparando la referencia con
  // `initialState`: useActionState devuelve LA MISMA hasta que una acción
  // resuelve. Antes esto era un `useRef` que se marcaba en la primera pasada
  // del efecto, y StrictMode lo rompía: en desarrollo React invoca los efectos
  // dos veces y el ref sobrevive entre ambas, así que la segunda pasada creía
  // que ya se había enviado y cerraba la hoja nada más abrirse (el auto-cierre
  // al terminar un libro no llegaba a verse). El guard de abajo es idempotente,
  // que es justo lo que la doble invocación exige.
  //
  // Con acompañantes marcados, antes de cerrar se crea el visionado conjunto
  // (el pase ya está guardado). Si eso falla la hoja se queda abierta con el
  // error: el cierre no se pierde, solo la etiqueta.
  const invitees = canShare ? [...companions] : [];
  const inviteesKey = invitees.join(",");
  // Sin acompañantes, la despedida empieza en cuanto llega la respuesta: ajuste
  // de estado en el render (patrón de session-sheet.tsx), porque un setState
  // síncrono en el efecto dispararía react-hooks/set-state-in-effect. Con
  // acompañantes empieza el efecto de abajo, tras crear el visionado conjunto.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state !== initialState && !state.error && inviteesKey === "") setFarewell(true);
  }
  useEffect(() => {
    if (state === initialState) return;
    if (state.error) return;
    const ids = inviteesKey ? inviteesKey.split(",") : [];
    if (ids.length === 0) return;
    startSharing(async () => {
      const result = await createJointViewing(passId, itemType, itemId, ids);
      if (result.ok) setFarewell(true);
      else setJointError(result.error);
    });
    // Solo al resolver el envío: la selección no debe relanzar la etiqueta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // La espera de la despedida: 1,6 s para la frase y el cierre del objeto; con
  // movimiento reducido, un instante. matchMedia se lee aquí, nunca en el
  // render. Si la hoja ya se cerró por otra vía (Escape, clic fuera) no se
  // vuelve a cerrar: el padre recibe un único aviso.
  useEffect(() => {
    if (!farewell) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
    }, reduced ? 120 : 1600);
    return () => window.clearTimeout(id);
  }, [farewell]);

  const today = openedAt.toISOString().slice(0, 10);
  const dropped = status === "dropped";
  const line = recapLine(itemType, ctx?.recap ?? null, openedAt, { weekday: (d) => WEEKDAY.format(d) });
  const droppedLine = tr(`dropped.${variantOf(passId, DROPPED_VARIANTS)}`);
  const speech: Speech = farewell
    ? {
        text: dropped ? droppedLine : tr(`farewell.${variantOf(passId, FAREWELL_VARIANTS)}`),
        mood: dropped ? "sad" : "joy",
      }
    : ctx
      ? { text: dropped ? droppedLine : tr(line.key, line.values), mood: "idle" }
      : null;
  // Durante la despedida no se puede volver a guardar ni saltar: ya está hecho.
  const busy = pending || sharing || farewell;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="close-pass-title"
      className={`m-auto w-[min(460px,94vw)] rounded-card border-0 p-0 shadow-card backdrop:bg-scrim ${materials.ritualScope}`}
      onClick={(event) => {
        // Clic en el propio <dialog> (fuera del contenido) = clic en el
        // fondo: mismo gesto de cierre que Escape.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <form key={passId} action={formAction} className="flex flex-col">
        <div className="border-b border-border px-5 py-4">
          <h2
            id="close-pass-title"
            className="font-serif text-lg font-semibold"
          >
            {t("closeTitle")}
          </h2>
        </div>

        {/* La balda con la mascota: dice el recuento al abrir y se despide al
            guardar, mientras el lomo cae a la balda (no al abandonar). */}
        <div className="relative px-5 pt-[92px]">
          <MiniShelf
            spines={[{ color: "#b5652f", h: 70 }, { color: "#2f6f73", h: 62 }]}
            landing={farewell && !dropped ? { color: "#8e3b2b" } : null}
          >
            <StageMascot pet={ctx?.pet ?? null} speech={speech} entered={ctx !== null} size="sm" />
          </MiniShelf>
        </div>

        {/* El objeto en que se cierra la obra: el sello lleva `finishedOn`, el
            lacre la nota (`rating`, su input oculto vive en WaxSeal) y el
            papel la reseña (`review`). Abandonar: sin lacre ni nota. */}
        <div className="px-5 py-4">
          <ClosingObject
            key={openings}
            itemType={itemType}
            variant={dropped ? "dropped" : "completed"}
            closing={farewell}
            stamp={<InkDateStamp name="finishedOn" defaultValue={today} max={today} label={tr("dateStamp")} />}
            seal={<WaxSeal value={rating} onChange={setRating} itemType={itemType} />}
          >
            <div className="relative">
              <textarea
                name="review"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                onInput={mention.onInput}
                onKeyDown={mention.onKeyDown}
                placeholder={tr(
                  itemType === "book" ? "dedicationBook" : itemType === "movie" ? "dedicationMovie" : "dedicationSeries"
                )}
                aria-label={t("review")}
                rows={4}
                className={materials.dedication}
              />
              {mention.dropdown}
            </div>
          </ClosingObject>
        </div>

        <div className="flex flex-col gap-3 px-5">
          <ReviewSpoilerField review={review} checked={reviewIsSpoiler} onChange={setReviewIsSpoiler} />

          {/* Solo si hay a quién etiquetar: sin seguidos mutuos el bloque sería
              ruido en cada cierre, y mientras carga no se reserva hueco. */}
          {canShare && mutuals && mutuals.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="label-section">{t(`jointSheet.title.${itemType}`)}</span>
              <JointCompanionsPicker
                people={mutuals}
                selected={companions}
                onToggle={toggleCompanion}
              />
              {companions.size > 0 && (
                <p className="text-xs text-muted-foreground">{t("jointSheet.closeHint")}</p>
              )}
              {jointError && (
                <p className="text-xs text-status-dropped">{t(`jointSheet.errors.${jointError}`)}</p>
              )}
            </div>
          )}

          {dropped && (
            <DroppedReasonFields
              reason={reason}
              onReasonChange={setReason}
              note={reasonNote}
              onNoteChange={setReasonNote}
            />
          )}

          {/* Visibilidad como chapa de latón: brilla con la casilla marcada
              (`:has(input:checked)`). Pública por defecto, como siempre. */}
          <label
            className={`${materials.brass} inline-flex w-fit items-center gap-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#e0a94a]`}
          >
            <input
              type="checkbox"
              name="isPublic"
              defaultChecked
              aria-label={t("isPublic")}
              className="sr-only"
            />
            {tr("public")}
          </label>

          {state.error && (
            <p className="text-sm text-status-dropped">
              {t(`errors.${state.error}`)}
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2.5 border-t border-border px-5 py-4">
          <button
            type="button"
            disabled={busy}
            className={`${materials.wood} flex-1`}
            onClick={() => dialogRef.current?.close()}
          >
            {t("skip")}
          </button>
          <button type="submit" disabled={busy} className={`${materials.leather} flex-1`}>
            {pending || sharing ? t("submitting") : t("submit")}
          </button>
        </div>

        {farewell && <p role="status" className="sr-only">{tr("farewellSr")}</p>}
      </form>
    </dialog>
  );
}
