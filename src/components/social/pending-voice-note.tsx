"use client";

// La fila «Publicando…» / «No se pudo publicar · Reintentar / Descartar» de
// una nota de voz en vuelo (spec §3). Waveform atenuada con los picos que ya
// tenemos; no es un reproductor.

import { useTranslations } from "next-intl";
import { formatVoiceDuration } from "@/lib/voice/format";
import type { PendingVoiceNote } from "./use-voice-note-submit";

export function PendingVoiceNoteRow({
  note,
  onRetry,
  onDiscard,
}: {
  note: PendingVoiceNote;
  onRetry: (localId: string) => void;
  onDiscard: (localId: string) => void;
}) {
  const t = useTranslations("social");
  return (
    <div
      data-testid="voice-pending"
      className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-2.5 py-1.5 opacity-80"
    >
      <div className="flex h-6 min-w-0 flex-1 items-end gap-px overflow-hidden">
        {note.recording.peaks.map((p, i) => (
          <span key={i} className="w-full min-w-[2px] flex-1 rounded-sm bg-border" style={{ height: `${Math.max(12, p)}%` }} />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        {formatVoiceDuration(note.recording.durationMs)}
      </span>
      {note.status === "uploading" ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">{t("voice.publishing")}</span>
      ) : (
        <span className="flex shrink-0 items-center gap-2 text-[11px]">
          <span className="text-status-dropped">{t("voice.uploadFailed")}</span>
          <button type="button" onClick={() => onRetry(note.localId)} className="font-medium text-accent">
            {t("voice.retry")}
          </button>
          <button type="button" onClick={() => onDiscard(note.localId)} className="text-muted-foreground">
            {t("voice.discard")}
          </button>
        </span>
      )}
    </div>
  );
}
