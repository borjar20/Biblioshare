"use client";

// El chip de audio (spec §4): misma tarjeta de comentario, cuerpo de UNA
// línea `[▶] waveform [0:23] [1x]`. La waveform ES la barra de progreso
// (se rellena al reproducir, tap = seek) y el elemento flexible: se comprime
// a profundidad 4; play, duración y velocidad son fijos.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MicIcon, PauseIcon, PlayIcon } from "@/components/ui/icons";
import { formatVoiceDuration } from "@/lib/voice/format";
import { condensePeaks } from "@/lib/voice/peaks";
import {
  applyPlaybackRate,
  playVoiceNote,
  seekToFraction,
  setChipVisible,
  togglePlayback,
  usePlaybackSnapshot,
} from "@/lib/voice/playback-store";
import { cycleVoiceRate, useListened, useVoiceRate } from "@/lib/voice/voice-preferences";
import { logVoiceNote } from "@/lib/voice/voice-note-analytics";

const MIN_BARS = 16;

// Cada barra ocupa ~2px + 1px de hueco: barras que caben = (ancho + 1) / 3.
// Menos de 8 ya no es una waveform; por debajo, mejor pocas barras anchas.
const BAR_STRIDE_PX = 3;
const MIN_VISIBLE_BARS = 8;

export function VoiceNoteChip({
  commentId,
  author,
  audio,
}: {
  commentId: string;
  author: string;
  audio: { url: string; durationMs: number; peaks: number[] };
}) {
  const t = useTranslations("social");
  const playback = usePlaybackSnapshot();
  const rate = useVoiceRate();
  const listened = useListened(commentId);
  const ref = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLButtonElement>(null);
  // Cuántas barras CABEN de verdad en el botón de la waveform. En un hilo
  // anidado en móvil no caben las 64 persistidas: recortarlas con overflow
  // escondía la cola del audio bajo los controles (spec §4 manda comprimir).
  const [barCount, setBarCount] = useState<number | null>(null);

  useEffect(() => {
    if (!waveRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > 0) {
        setBarCount(Math.max(MIN_VISIBLE_BARS, Math.floor((width + 1) / BAR_STRIDE_PX)));
      }
    });
    observer.observe(waveRef.current);
    return () => observer.disconnect();
  }, []);

  const isActive = playback.commentId === commentId;
  const playing = isActive && playback.playing;
  const progress =
    isActive && audio.durationMs > 0 ? Math.min(1, playback.positionMs / audio.durationMs) : 0;

  // La mini-barra aparece cuando el chip ACTIVO sale del viewport.
  useEffect(() => {
    if (!isActive || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setChipVisible(commentId, entry?.isIntersecting ?? true),
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      setChipVisible(commentId, true);
    };
  }, [isActive, commentId]);

  // Sin picos persistidos (fallo del cliente al grabar): barras planas.
  const storedPeaks =
    audio.peaks.length > 0 ? audio.peaks : Array.from({ length: MIN_BARS }, () => 40);
  // Hasta la primera medida se pintan todas (overflow-hidden tapa el exceso
  // un frame); después, exactamente las que caben — la waveform entera
  // comprimida, nunca recortada.
  const peaks = barCount == null ? storedPeaks : condensePeaks(storedPeaks, barCount);

  function handlePlay() {
    if (isActive) togglePlayback();
    else playVoiceNote({ commentId, url: audio.url, durationMs: audio.durationMs, author });
  }

  function handleSeek(e: React.MouseEvent<HTMLButtonElement>) {
    if (!isActive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekToFraction((e.clientX - rect.left) / rect.width);
  }

  function handleRate() {
    const next = cycleVoiceRate();
    applyPlaybackRate(next);
    logVoiceNote("playback_rate_changed", { rate: next });
  }

  return (
    <div
      ref={ref}
      data-testid="voice-note-chip"
      className="flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-1.5"
    >
      <MicIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      <button
        type="button"
        aria-label={playing ? t("voice.pausePlayback") : t("voice.play")}
        onClick={handlePlay}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent hover:bg-accent/20"
      >
        {playing ? <PauseIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
      </button>
      <button
        ref={waveRef}
        type="button"
        aria-label={t("voice.seek")}
        onClick={handleSeek}
        className="flex h-7 min-w-[72px] flex-1 items-end gap-px overflow-hidden"
      >
        {peaks.map((p, i) => (
          <span
            key={i}
            className={`w-full min-w-[2px] flex-1 rounded-sm ${
              i / peaks.length <= progress && isActive ? "bg-accent" : "bg-border"
            }`}
            style={{ height: `${Math.max(12, p)}%` }}
          />
        ))}
      </button>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatVoiceDuration(isActive ? Math.max(0, audio.durationMs - playback.positionMs) : audio.durationMs)}
      </span>
      <button
        type="button"
        aria-label={t("voice.speed")}
        onClick={handleRate}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        {rate}x
      </button>
      {!listened && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
    </div>
  );
}
