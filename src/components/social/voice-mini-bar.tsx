"use client";

// Mini-barra flotante (spec §4): la reproducción sobrevive al scroll. Solo la
// PRIMERA instancia montada pinta (varias superficies con hilos pueden
// convivir en una página: club + ficha); al desmontarse la última, se detiene
// la reproducción — eso cubre «navegar a otra ruta detiene el audio» (MVP).

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import { stopPlayback, togglePlayback, usePlaybackSnapshot } from "@/lib/voice/playback-store";

// Registro reactivo de instancias montadas (orden de montaje entre
// superficies): un contador de un solo disparo no soporta desmontajes fuera
// de orden (p.ej. dos ReviewInteractions en community-panel.tsx con
// `expanded` independiente) — si la instancia "first" se desmonta antes que
// una hermana, ninguna superviviente vuelve a tomar el relevo. Con esta
// registro cada instancia se resuscribe vía useSyncExternalStore y la
// primera de la lista se recalcula en cada cambio.
let nextInstanceId = 0;
const mountedInstances: number[] = [];
const registrySubs = new Set<() => void>();

function notifyRegistry() {
  for (const cb of registrySubs) cb();
}

function registerInstance(): number {
  const id = ++nextInstanceId;
  mountedInstances.push(id);
  notifyRegistry();
  return id;
}

function unregisterInstance(id: number) {
  const idx = mountedInstances.indexOf(id);
  if (idx >= 0) mountedInstances.splice(idx, 1);
  // La última superficie con hilos que se va detiene la reproducción:
  // navegar a otra ruta no debe dejar un audio sonando sin UI (spec §4).
  if (mountedInstances.length === 0) stopPlayback();
  notifyRegistry();
}

function subscribeRegistry(cb: () => void): () => void {
  registrySubs.add(cb);
  return () => registrySubs.delete(cb);
}

export function VoiceMiniBar() {
  const t = useTranslations("social");
  const s = usePlaybackSnapshot();
  const idRef = useRef<number | null>(null);

  useEffect(() => {
    idRef.current = registerInstance();
    return () => {
      unregisterInstance(idRef.current!);
      idRef.current = null;
    };
  }, []);

  const isFirst = useSyncExternalStore(
    subscribeRegistry,
    () => idRef.current != null && mountedInstances[0] === idRef.current,
    () => false,
  );

  if (!isFirst || !s.commentId || s.chipVisible) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg lg:bottom-6">
      <button
        type="button"
        aria-label={s.playing ? t("voice.pausePlayback") : t("voice.play")}
        onClick={togglePlayback}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
      >
        {s.playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        aria-label={t("voice.backToComment")}
        onClick={() =>
          document.getElementById(`c-${s.commentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
      >
        {s.author}
      </button>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatVoiceDuration(s.positionMs)}/{formatVoiceDuration(s.durationMs)}
      </span>
      <button
        type="button"
        aria-label={t("voice.stopPlayback")}
        onClick={stopPlayback}
        className="shrink-0 px-1 text-xs text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
