"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setEpisodeWatched } from "@/lib/series/episode-actions";
import { updateStatus } from "@/lib/library/manage-actions";
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
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
};

export function TodayActions({
  passId,
  itemType,
  itemId,
  seriesId,
  nextEpisode,
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
  /** La hoja de sesión: destino del cronómetro y también de "Registrar". */
  sessionHref: string | null;
  /** La pestaña Registro de la ficha: solo el respaldo de "Registrar". */
  logHref: string;
  labels: TodayActionsLabels;
}) {
  const canTime = itemType === "book" && passId !== null && sessionHref !== null;
  const canMark = itemType === "series" && nextEpisode !== null;
  // Película en el foco = elección del sorteo «para ver»: un toque la marca Vista.
  const canSeen = itemType === "movie" && passId !== null;

  // El hook va incondicional (regla de los hooks); sin pase, readTimer devuelve
  // el reloj a cero y nadie lo mira.
  const timer = useTimerState(passId ?? "");
  const timing = canTime && hasTime(timer);

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
// FICHA, encadena la hoja de cierre (`ClosePassSheet`) para puntuar y reseñar:
// el pase ya quedó cerrado en BD, la hoja solo añade nota/rating/visibilidad
// por encima. Al cerrarla, `router.refresh()` re-evalúa la escalera del foco y
// la película sale sola.
//
// La hoja usa el namespace `passes`, que el Inicio NO manda al cliente
// (route-messages #444): por eso `TodayCard` envuelve las acciones de una
// película en `<RouteMessages ns={["passes"]}>` — esas cadenas viajan solo
// cuando hay una peli en el foco, no en cada visita al Inicio.
function MarkSeen({ itemId, label }: { itemId: string; label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [closingPassId, setClosingPassId] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await updateStatus("movie", itemId, "completed");
            // El cierre trae el passId de la Vista recién cerrada: con él se abre
            // la hoja de puntuar. Si por lo que sea no cerró, al menos refresca
            // para sacarla del foco.
            if (outcome.kind === "done" && outcome.closed && outcome.passId) {
              setClosingPassId(outcome.passId);
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
      {closingPassId && (
        <ClosePassSheet
          passId={closingPassId}
          itemType="movie"
          itemId={itemId}
          open
          onClose={() => {
            // Guardada o saltada, la Vista ya está cerrada: refrescar saca la
            // película del foco (deja de ser in_progress).
            setClosingPassId(null);
            router.refresh();
          }}
        />
      )}
    </>
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
