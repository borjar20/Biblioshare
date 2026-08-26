"use client";

// Mini-barra flotante (spec §4): la reproducción sobrevive al scroll. Solo la
// PRIMERA instancia montada pinta (varias superficies con hilos pueden
// convivir en una página: club + ficha); al desmontarse la última, se detiene
// la reproducción — eso cubre «navegar a otra ruta detiene el audio» (MVP).

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import { stopPlayback, togglePlayback, usePlaybackSnapshot } from "@/lib/voice/playback-store";

let instances = 0;

export function VoiceMiniBar() {
  const t = useTranslations("social");
  const s = usePlaybackSnapshot();
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    instances += 1;
    // "¿soy la primera instancia montada?" solo se sabe tras registrar el
    // mount actual (orden de montaje entre superficies), no es derivable de
    // props/estado ni subscribable como el resto de los stores de voice/ —
    // mismo patrón justificado que theme-toggle.tsx / barcode-scanner.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFirst(instances === 1);
    return () => {
      instances -= 1;
      if (instances === 0) stopPlayback();
    };
  }, []);

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
