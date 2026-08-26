"use client";

// Grabadora inline (spec §3): tap mic → grabando desde ya (sin pantalla
// intermedia), pausa reanudable, cuenta atrás ámbar a los 45 s, corte a los
// 60 s que NO descarta (pasa a previsualización), y previsualización
// OBLIGATORIA con regrabar/publicar. Descartar con >15 s grabados pide
// confirmación inline (nunca window.confirm: bloquea el WebView).

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PauseIcon, PlayIcon, StopIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import {
  VOICE_CONFIRM_DISCARD_FROM_MS,
  VOICE_COUNTDOWN_FROM_MS,
  VOICE_MAX_DURATION_MS,
  VOICE_MIN_DURATION_MS,
} from "@/lib/voice/voice-note-limits";
import { VoiceRecorderEngine, type VoiceRecording } from "@/lib/voice/audio-recorder";
import { logVoiceNote } from "@/lib/voice/voice-note-analytics";

type Phase = "recording" | "paused" | "preview" | "denied" | "confirm-discard";

const LIVE_BARS = 24;

export function VoiceRecorder({
  onPublish,
  onCancel,
  busy = false,
}: {
  onPublish: (rec: VoiceRecording) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("social");
  const engineRef = useRef<VoiceRecorderEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("recording");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>([]);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const stoppingRef = useRef(false);
  const confirmReturnPhase = useRef<Phase>("recording");
  // Espejo del `disposed` local del efecto de montaje (abajo): `rerecord()`
  // también crea un engine de forma asíncrona, y si el componente se
  // desmonta mientras esa promesa resuelve, el `.then` de rerecord llegaría
  // tarde -- sin este guard dejaba el stream de micrófono abierto sin UI que
  // lo controle (finding de revisión final). El cleanup del efecto de
  // montaje lo pone a true; es el único que lo lee/escribe fuera de aquí.
  const disposedRef = useRef(false);

  const finishToPreview = useCallback(async () => {
    if (stoppingRef.current || !engineRef.current) return;
    stoppingRef.current = true;
    try {
      const rec = await engineRef.current.stop();
      engineRef.current = null;
      setRecording(rec);
      setPreviewUrl(URL.createObjectURL(rec.blob));
      setPhase("preview");
    } catch {
      onCancel();
    } finally {
      stoppingRef.current = false;
    }
  }, [onCancel]);

  // Arrancar al montar: el tap en el mic ya fue el gesto de inicio.
  useEffect(() => {
    let disposed = false;
    logVoiceNote("recording_started");
    VoiceRecorderEngine.create()
      .then((engine) => {
        if (disposed) {
          engine.cancel();
          return;
        }
        engineRef.current = engine;
        engine.start(({ elapsedMs: ms, amplitude }) => {
          setElapsedMs(ms);
          setLiveBars((prev) => [...prev.slice(-(LIVE_BARS - 1)), amplitude]);
          if (ms >= VOICE_MAX_DURATION_MS) void finishToPreview();
        });
        engine.onStreamEnded(() => void finishToPreview());
      })
      .catch(() => setPhase("denied"));
    return () => {
      disposed = true;
      disposedRef.current = true;
      engineRef.current?.cancel();
      engineRef.current = null;
    };
  }, [finishToPreview]);

  // Aviso al navegar/cerrar con grabación o preview sin publicar (spec §3).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function requestDiscard(after: () => void) {
    if (elapsedMs > VOICE_CONFIRM_DISCARD_FROM_MS && phase !== "confirm-discard") {
      confirmReturnPhase.current = phase;
      setPhase("confirm-discard");
      pendingDiscard.current = after;
      return;
    }
    after();
  }
  const pendingDiscard = useRef<() => void>(() => {});

  function stopPreviewAudio() {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPreviewPlaying(false);
  }

  function discardAndClose() {
    stopPreviewAudio();
    logVoiceNote("recording_discarded", { durationMs: elapsedMs });
    engineRef.current?.cancel();
    engineRef.current = null;
    onCancel();
  }

  function rerecord() {
    stopPreviewAudio();
    logVoiceNote("recording_discarded", { durationMs: recording?.durationMs ?? elapsedMs });
    setRecording(null);
    setPreviewUrl(null);
    setElapsedMs(0);
    setLiveBars([]);
    setPhase("recording");
    // Espejo del embudo del montaje: sin este evento, "regrabar" no contaba
    // como un nuevo inicio y el embudo descartes/inicios quedaba sesgado.
    logVoiceNote("recording_started");
    VoiceRecorderEngine.create()
      .then((engine) => {
        // Mismo guard que el efecto de montaje: si el componente se
        // desmontó mientras `create()` resolvía, no hay UI que controle este
        // engine -- cancelarlo cierra el stream en vez de dejarlo abierto.
        if (disposedRef.current) {
          engine.cancel();
          return;
        }
        engineRef.current = engine;
        engine.start(({ elapsedMs: ms, amplitude }) => {
          setElapsedMs(ms);
          setLiveBars((prev) => [...prev.slice(-(LIVE_BARS - 1)), amplitude]);
          if (ms >= VOICE_MAX_DURATION_MS) void finishToPreview();
        });
        engine.onStreamEnded(() => void finishToPreview());
      })
      .catch(() => setPhase("denied"));
  }

  function togglePreview() {
    if (!previewUrl) return;
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(previewUrl);
      previewAudioRef.current.onended = () => setPreviewPlaying(false);
    }
    if (previewPlaying) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
    } else {
      void previewAudioRef.current.play();
      setPreviewPlaying(true);
    }
  }

  if (phase === "denied") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
        <span>{t("voice.micDenied")}</span>
        <button type="button" onClick={onCancel} className="shrink-0 text-accent">
          {t("cancel")}
        </button>
      </div>
    );
  }

  if (phase === "confirm-discard") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
        <span>{t("voice.confirmDiscard")}</span>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={() => pendingDiscard.current()} className="text-status-dropped">
            {t("voice.discard")}
          </button>
          <button
            type="button"
            onClick={() => setPhase(recording ? "preview" : confirmReturnPhase.current)}
            className="text-accent"
          >
            {t("voice.keep")}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "preview" && recording) {
    return (
      <div
        data-testid="voice-preview"
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
      >
        <button
          type="button"
          aria-label={previewPlaying ? t("voice.pausePlayback") : t("voice.play")}
          onClick={togglePreview}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
        >
          {previewPlaying ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
        </button>
        <div className="flex h-7 min-w-0 flex-1 items-end gap-px overflow-hidden">
          {recording.peaks.map((p, i) => (
            <span key={i} className="w-full min-w-[2px] flex-1 rounded-sm bg-border" style={{ height: `${Math.max(12, p)}%` }} />
          ))}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatVoiceDuration(recording.durationMs)}
        </span>
        <button
          type="button"
          onClick={() => requestDiscard(rerecord)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("voice.rerecord")}
        </button>
        <button
          type="button"
          data-testid="voice-publish"
          disabled={busy || recording.durationMs < VOICE_MIN_DURATION_MS}
          onClick={() => onPublish(recording)}
          className="shrink-0 text-xs font-medium text-accent disabled:opacity-50"
        >
          {t("voice.publish")}
        </button>
      </div>
    );
  }

  // recording | paused
  const remaining = VOICE_MAX_DURATION_MS - elapsedMs;
  const countdown = elapsedMs >= VOICE_COUNTDOWN_FROM_MS;
  return (
    <div
      data-testid="voice-recorder"
      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
    >
      <button
        type="button"
        aria-label={t("voice.cancel")}
        onClick={() => requestDiscard(discardAndClose)}
        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
      <span className={`h-2 w-2 shrink-0 rounded-full ${phase === "paused" ? "bg-border" : "animate-pulse bg-status-dropped"}`} aria-hidden />
      <div className="flex h-7 min-w-0 flex-1 items-end gap-px overflow-hidden" aria-label={t("voice.recording")}>
        {liveBars.map((a, i) => (
          <span key={i} className="w-full min-w-[2px] flex-1 rounded-sm bg-accent/60" style={{ height: `${Math.max(10, Math.round(a * 100))}%` }} />
        ))}
      </div>
      <span className={`shrink-0 font-mono text-[10px] ${countdown ? "text-amber-500" : "text-muted-foreground"}`}>
        {countdown ? `-${formatVoiceDuration(remaining)}` : formatVoiceDuration(elapsedMs)}
      </span>
      {phase === "paused" ? (
        <button type="button" aria-label={t("voice.resume")} onClick={() => { engineRef.current?.resume(); setPhase("recording"); }} className="shrink-0 text-accent">
          <PlayIcon className="h-4 w-4" />
        </button>
      ) : (
        <button type="button" aria-label={t("voice.pause")} onClick={() => { engineRef.current?.pause(); setPhase("paused"); }} className="shrink-0 text-muted-foreground hover:text-foreground">
          <PauseIcon className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        data-testid="voice-stop"
        aria-label={t("voice.stop")}
        onClick={() => void finishToPreview()}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"
      >
        <StopIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
