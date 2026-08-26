"use client";

// Publicación de una nota de voz con reintento (spec §3, errores/conexión):
// el blob vive AQUÍ, en cliente, hasta que la subida cuaja — el comentario
// «Publicando…» no es un useOptimistic (ese estado se evapora al asentarse la
// transición y el blob no puede viajar por la action de texto): es estado
// local propio. 2 reintentos automáticos silenciosos con espera creciente y
// después «No se pudo publicar · Reintentar / Descartar».

import { useCallback, useEffect, useRef, useState } from "react";
import { addVoiceComment } from "@/lib/social/voice-note-actions";
import type { VoiceRecording } from "@/lib/voice/audio-recorder";
import { logVoiceNote } from "@/lib/voice/voice-note-analytics";

export type PendingVoiceNote = {
  localId: string;
  parentId: string | null;
  status: "uploading" | "failed";
  recording: VoiceRecording;
};

const RETRY_DELAYS_MS = [800, 2500];

/** Errores que el reintento no va a arreglar: a failed directamente. */
const NO_RETRY = new Set([
  "voice_thread_limit",
  "voice_consecutive",
  "voice_daily_limit",
  "not_commentable",
  "unauthenticated",
  "invalid_audio",
  "too_large",
  "invalid_duration",
]);

export function useVoiceNoteSubmit(interactionTargetId: string) {
  const [pending, setPending] = useState<PendingVoiceNote[]>([]);
  const optsRef = useRef(new Map<string, { parentId: string | null; isSpoiler: boolean }>());
  // `attempt` se llama a sí mismo (reintento) desde dentro de su propio
  // cuerpo: un `useCallback` no puede referenciarse antes de estar declarado
  // (react-hooks/immutability), así que el setTimeout llama a través de este
  // ref -- siempre apunta a la versión más reciente, asignada tras crearla.
  const attemptRef = useRef<((note: PendingVoiceNote, retriesLeft: number) => Promise<void>) | undefined>(
    undefined,
  );

  const attempt = useCallback(
    async (note: PendingVoiceNote, retriesLeft: number) => {
      const opts = optsRef.current.get(note.localId)!;
      const fd = new FormData();
      const ext = note.recording.mimeType.includes("mp4") ? "m4a" : "webm";
      fd.set("file", new File([note.recording.blob], `nota.${ext}`, { type: note.recording.mimeType }));
      fd.set("durationMs", String(note.recording.durationMs));
      fd.set("peaks", JSON.stringify(note.recording.peaks));

      let error: string | null = null;
      try {
        const res = await addVoiceComment(interactionTargetId, fd, {
          parentId: opts.parentId ?? undefined,
          isSpoiler: opts.isSpoiler,
        });
        if (res.ok) {
          logVoiceNote("voice_note_published", { durationMs: note.recording.durationMs });
          optsRef.current.delete(note.localId);
          setPending((prev) => prev.filter((p) => p.localId !== note.localId));
          return;
        }
        error = res.error;
      } catch {
        error = "network";
      }

      if (retriesLeft > 0 && !NO_RETRY.has(error)) {
        const delay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - retriesLeft] ?? 2500;
        setTimeout(() => void attemptRef.current?.(note, retriesLeft - 1), delay);
        return;
      }
      setPending((prev) =>
        prev.map((p) => (p.localId === note.localId ? { ...p, status: "failed" } : p)),
      );
    },
    [interactionTargetId],
  );
  // Escribir el ref DURANTE el render violaría react-hooks/refs; un efecto
  // sin dependencias lo mantiene al día tras cada render, y para cuando el
  // setTimeout de arriba dispara (siempre después de un evento del usuario:
  // publish/retry) el efecto ya ha corrido.
  useEffect(() => {
    attemptRef.current = attempt;
  });

  const publish = useCallback(
    (recording: VoiceRecording, opts: { parentId: string | null; isSpoiler: boolean }) => {
      const localId = `voice-${crypto.randomUUID()}`;
      optsRef.current.set(localId, opts);
      const note: PendingVoiceNote = { localId, parentId: opts.parentId, status: "uploading", recording };
      setPending((prev) => [...prev, note]);
      void attempt(note, RETRY_DELAYS_MS.length);
    },
    [attempt],
  );

  const retry = useCallback(
    (localId: string) => {
      setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, status: "uploading" } : p)));
      const note = pending.find((p) => p.localId === localId);
      if (note) void attempt({ ...note, status: "uploading" }, 0);
    },
    [attempt, pending],
  );

  const discard = useCallback((localId: string) => {
    optsRef.current.delete(localId);
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  return { pending, publish, retry, discard };
}
