"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setEpisodeWatched } from "@/lib/series/episode-actions";
import { updateStatus } from "@/lib/library/manage-actions";
import { itemHref } from "@/lib/catalog/item-href";
import { clearTimer, elapsedMs, pause, start, toMinutes, writeTimer } from "@/lib/sessions/timer";
import { hasTime, useTimerState } from "@/lib/sessions/use-timer-state";
import { ClockIcon, PencilIcon, CheckIcon } from "@/components/ui/icons";

// Las acciones de la tarjeta de hoy. Cambian por tipo, porque "una sesión" no
// significa lo mismo en cada uno:
//
//   · Libro    → cronómetro AQUÍ mismo. Empezar a leer no debería costar una
//                navegación: pulsas y el reloj corre en la propia tarjeta.
//   · Serie    → no hay cronómetro: una serie se mide en episodios (§7.14), así
//                que la acción es marcar el siguiente.
//   · Película → ni sesión ni episodios. Cuando cae en el foco es una elección
//                del SORTEO en estado «para ver» (in_progress de sistema, ver
//                decisiones.md 2026-08-12): la acción es marcarla Vista de un
//                toque, que la salda (completed) y la saca del foco.
//
// "Registrar" abre la hoja de sesión (modal, vía ruta interceptada) sin sacarte
// del inicio, igual que el del cronómetro pero sin tiempo puesto. Solo cae a la
// pestaña Registro de la ficha cuando NO hay hoja que abrir: un ítem sin pase
// activo.
//
// Es cliente por el cronómetro; los textos llegan traducidos porque `t` no
// cruza la frontera servidor→cliente.
export type TodayActionsLabels = {
  session: string;
  log: string;
  cancel: string;
  register: string;
  notes: string;
  timerLabel: string;
  nextEpisode: string | null;
  markSeen: string;
  markDone: string;
};

export function TodayActions({
  passId,
  itemType,
  itemId,
  seriesId,
  nextEpisode,
  reachedEnd,
  sessionHref,
  logHref,
  labels,
}: {
  /** null en datos huérfanos: sin pase activo no hay sesión que abrir. */
  passId: string | null;
  itemType: "book" | "movie" | "series";
  /** El id de la obra (para «Marcar Vista» de una película del foco). */
  itemId: string;
  seriesId: string;
  nextEpisode: { season: number; episode: number } | null;
  /**
   * El pase ha llegado a su última página / último episodio y SIGUE abierto.
   * Pasa cuando el auto-cierre no llegó a dispararse (la posición se puso a
   * mano desde Progreso, o el total de la obra no es el de tu edición, que es
   * el único que mira `saveSession`).
   */
  reachedEnd: boolean;
  /** La hoja de sesión: destino del cronómetro y también de "Registrar". */
  sessionHref: string | null;
  /** La pestaña Registro de la ficha: solo el respaldo de "Registrar". */
  logHref: string;
  labels: TodayActionsLabels;
}) {
  const hasTimer = itemType === "book" && passId !== null && sessionHref !== null;

  // El hook va incondicional (regla de los hooks); sin pase, readTimer devuelve
  // el reloj a cero y nadie lo mira.
  const timer = useTimerState(passId ?? "");
  const timing = hasTimer && hasTime(timer);

  // Un pase que ha llegado al final y sigue abierto se quedaba SIN SALIDA: la
  // tarjeta anunciaba el final y las dos únicas acciones eran «Sesión» y
  // «Registrar», así que la respuesta más probable —«lo he terminado»— no
  // tenía botón, y el feed de al lado ya podía estar diciendo «FINALIZADO».
  // Cuando aparece, se come el hueco de la acción por tipo: ni cronómetro
  // (un libro en su última página no necesita reloj) ni «marcar episodio»
  // (no queda ninguno). Con el cronómetro EN MARCHA no aparece: primero se
  // registra la sesión en vuelo, que es la que cerrará el pase sola.
  const canFinish = reachedEnd && passId !== null && itemType !== "movie" && !timing;

  const canTime = hasTimer && !canFinish;
  const canMark = itemType === "series" && nextEpisode !== null && !canFinish;
  // Película en el foco = elección del sorteo «para ver»: un toque la marca Vista.
  const canSeen = itemType === "movie" && passId !== null;

  // Con el cronómetro abierto, la fila es suya: si no, se verían DOS
  // "Registrar" a la vez con destinos distintos (el del reloj va a la vista de
  // sesión con el tiempo; el otro, a la pestaña Registro). Misma palabra y
  // distinto sitio es una trampa, no una opción.
  return (
    <div className="flex border-t border-border">
      {canTime && <BookTimer passId={passId} sessionHref={sessionHref} labels={labels} />}
      {canMark && (
        <MarkNextEpisode
          seriesId={seriesId}
          nextEpisode={nextEpisode}
          label={labels.nextEpisode}
        />
      )}
      {canSeen && <MarkSeen itemId={itemId} label={labels.markSeen} />}
      {canFinish && (
        <MarkDone itemType={itemType} itemId={itemId} label={labels.markDone} />
      )}

      {/* «Registrar» de respaldo: no para películas, que ya tienen su acción
          propia (Marcar Vista) — dos botones a la vez confundirían. */}
      {!timing && !canSeen && (
        <Link
          href={sessionHref ?? logHref}
          className={`flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold transition-colors hover:bg-surface-muted ${
            canTime || canMark ? "border-l border-border text-muted-foreground" : "text-[var(--acc)]"
          }`}
        >
          <PencilIcon className="h-4 w-4" />
          {labels.log}
        </Link>
      )}
    </div>
  );
}

// «Marcar terminada» del pase que ya llegó al final. Misma máquina que en la
// ficha y que en la fila de una persona (`work-status-control.tsx`): cierra por
// `updateStatus` y encadena la hoja de puntuar/reseñar EN LA FICHA con
// `?cerrar=<passId>`. Por qué en la ficha y no aquí: al completar, la obra deja
// de ser in_progress y la revalidación saca su tarjeta del foco — un modal
// incrustado en esa tarjeta se desmontaría en el acto (misma razón que MarkSeen).
function MarkDone({
  itemType,
  itemId,
  label,
}: {
  itemType: "book" | "series";
  itemId: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const outcome = await updateStatus(itemType, itemId, "completed");
          if (outcome.kind === "done" && outcome.closed && outcome.passId) {
            router.push(`${itemHref(itemType, itemId)}?cerrar=${outcome.passId}&tab=log`);
          } else if (outcome.kind === "askResume") {
            // No debería pasar (hay pase abierto), pero si la máquina pide
            // decidir continuar/reempezar, esa decisión vive en la ficha.
            router.push(itemHref(itemType, itemId));
          } else {
            router.refresh();
          }
        })
      }
      className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <CheckIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MarkNextEpisode({
  seriesId,
  nextEpisode,
  label,
}: {
  seriesId: string;
  nextEpisode: { season: number; episode: number };
  label: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        // La acción revalida "/" ella sola, así que la tarjeta se repinta con el
        // episodio siguiente ya movido. Y si era el último, cierra el pase y
        // redirige a la hoja de cierre — por eso no se toca nada aquí después.
        startTransition(async () => {
          await setEpisodeWatched(seriesId, nextEpisode.season, nextEpisode.episode, true);
        })
      }
      className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <CheckIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

// «Marcar Vista» de la película elegida por el sorteo (foco del home). La saca
// del estado de sistema «para ver» (in_progress) y la cierra como Vista con el
// mismo server action que el resto de la app. Igual que marcar Vista EN LA
// FICHA, encadena la hoja de puntuar/reseñar — pero se abre EN LA FICHA vía
// `?cerrar=<passId>`, no incrustada en el foco.
//
// Por qué en la ficha y no aquí: al completar, la película deja de ser
// in_progress, así que la revalidación saca su tarjeta del foco; un modal
// incrustado en esa tarjeta se desmontaría en el acto («salta y se pierde»). La
// ficha es un host estable y `/pelicula/[id]?cerrar=<passId>` ya abre esa misma
// hoja (validando que el passId sea el del pase activo). El pase completado
// sigue `is_active`, así que la validación pasa.
function MarkSeen({ itemId, label }: { itemId: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const outcome = await updateStatus("movie", itemId, "completed");
          if (outcome.kind === "done" && outcome.closed && outcome.passId) {
            router.push(`${itemHref("movie", itemId)}?cerrar=${outcome.passId}&tab=log`);
          } else {
            // Sin cierre no hay nada que puntuar: solo refresca para sacarla del foco.
            router.refresh();
          }
        })
      }
      className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted disabled:opacity-50"
    >
      <CheckIcon className="h-4 w-4" />
      {label}
    </button>
  );
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

// El cronómetro de la tarjeta. Es EL MISMO reloj que el de la vista de sesión:
// misma librería y misma clave, así que arrancarlo aquí y abrir la vista de
// sesión no pierde un segundo, y sobrevive a recargar (el estado guarda el
// INSTANTE de arranque, no un contador corriendo).
function BookTimer({
  passId,
  sessionHref,
  labels,
}: {
  passId: string;
  sessionHref: string;
  labels: TodayActionsLabels;
}) {
  const router = useRouter();
  const state = useTimerState(passId);
  const running = state.startedAt !== null;
  // `now` solo fuerza el repintado una vez por segundo; el tiempo SIEMPRE sale
  // de la fórmula pura elapsedMs(state, now), nunca de sumar ticks. Leerlo en
  // el inicializador (y no en el cuerpo) mantiene puro el render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!hasTime(state)) {
    return (
      <button
        type="button"
        onClick={() => {
          const clickedAt = Date.now();
          setNow(clickedAt);
          writeTimer(passId, start(state, clickedAt));
        }}
        className="flex flex-1 items-center justify-center gap-[7px] p-[11px] text-[12.5px] font-semibold text-[var(--acc)] transition-colors hover:bg-surface-muted"
      >
        <ClockIcon className="h-4 w-4" />
        {labels.session}
      </button>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 p-3">
      <div className="flex items-center justify-center gap-2">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-[var(--acc)]" : "bg-foreground-faint"}`}
        />
        <p
          className="font-mono text-2xl leading-none font-medium tabular-nums text-foreground"
          aria-label={labels.timerLabel}
        >
          {formatClock(elapsedMs(state, now))}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => clearTimer(passId)}
          className="flex-1 rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
        >
          {labels.cancel}
        </button>
        {/* Sin clearTimer ni ?minutos=: navegación pura. El reloj compartido
            (misma clave de localStorage que la hoja de sesión, ver timer.ts)
            sigue corriendo al llegar — BookProgressField lo detecta y abre
            ya en pestaña Cronómetro. */}
        <Link
          href={sessionHref}
          className="flex flex-1 items-center justify-center rounded-[8px] border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
        >
          {labels.notes}
        </Link>
        <button
          type="button"
          onClick={() => {
            // Se para, se llevan el número Y la hora de inicio a la vista de
            // sesión, y se limpia: el reloj ya hizo su trabajo. Si no se
            // limpiara, al volver a la portada seguiría contando una sesión que
            // ya has registrado. `firstStartedAt` (la hora real de inicio para
            // "Cuándo lees") SOLO vive en localStorage, así que hay que
            // reenviarla por la URL ANTES de borrarla — si no, la hoja abriría
            // sin ella y la sesión se guardaría con started_at = null.
            const stoppedAt = Date.now();
            const paused = pause(state, stoppedAt);
            const minutes = toMinutes(elapsedMs(paused, stoppedAt));
            const firstStartedAt = paused.firstStartedAt ?? null;
            clearTimer(passId);
            const params = new URLSearchParams();
            // Menos de medio minuto redondea a 0, y "0 minutos" no es un dato:
            // se va sin el parámetro y el campo queda vacío, como cualquier
            // sesión que se abre a mano.
            if (minutes > 0) params.set("minutos", String(minutes));
            if (firstStartedAt != null) {
              params.set("inicio", new Date(firstStartedAt).toISOString());
            }
            const qs = params.toString();
            router.push(qs ? `${sessionHref}?${qs}` : sessionHref);
          }}
          className="flex-[2] rounded-[8px] bg-[var(--acc)] px-3 py-1.5 text-[12px] font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          {labels.register}
        </button>
      </div>
    </div>
  );
}
