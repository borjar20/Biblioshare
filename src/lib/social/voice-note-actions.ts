"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidateInteraction } from "@/lib/reactivity/revalidate";
import { deleteVoiceNote, uploadVoiceNote } from "@/lib/storage/voice-notes";
import { sanitizePeaks } from "@/lib/voice/peaks";
import {
  VOICE_ALLOWED_TYPES,
  VOICE_MAX_BYTES,
  VOICE_MAX_DURATION_MS,
  VOICE_MAX_PER_DAY,
  VOICE_MAX_PER_THREAD,
  VOICE_MIN_DURATION_MS,
  baseMimeType,
} from "@/lib/voice/voice-note-limits";
import { getInteractionTarget } from "./interaction-target-gate";
import { notify } from "./notifications";
import { voiceCommentContext } from "./notification-context";
import type { CommentActionResult } from "./interaction-actions";

/**
 * Publica una nota de voz como comentario (spec §6): validar → subir el
 * objeto (service-role, el usuario no puede escribir en Storage) → insertar la
 * fila con el cliente del USUARIO (RLS y trigger de comentabilidad intactos).
 * Si el insert falla, el objeto recién subido se borra: cero huérfanos.
 *
 * Los frenos de §7 se miran aquí porque esta action es la única vía de
 * escritura; la UI solo atenúa el mic. El diario (20/día) cruza hilos que el
 * cliente ni ve, por eso los conteos van con service-role.
 */
export async function addVoiceComment(
  interactionTargetId: string,
  formData: FormData,
  opts?: { parentId?: string; isSpoiler?: boolean },
): Promise<CommentActionResult> {
  let orphanPath: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "invalid_audio" };
    const mime = baseMimeType(file.type);
    const ext = VOICE_ALLOWED_TYPES.get(mime);
    if (!ext) return { ok: false, error: "invalid_audio" };
    if (file.size > VOICE_MAX_BYTES) return { ok: false, error: "too_large" };

    const durationMs = Math.round(Number(formData.get("durationMs")));
    if (
      !Number.isFinite(durationMs) ||
      durationMs < VOICE_MIN_DURATION_MS ||
      durationMs > VOICE_MAX_DURATION_MS
    ) {
      return { ok: false, error: "invalid_duration" };
    }

    // Waveform: si viene corrupta se publica sin ella, no se rechaza.
    let peaks: number[] = [];
    const rawPeaks = formData.get("peaks");
    if (typeof rawPeaks === "string" && rawPeaks) {
      try {
        peaks = sanitizePeaks(JSON.parse(rawPeaks)) ?? [];
      } catch {
        peaks = [];
      }
    }

    const target = await getInteractionTarget(supabase, interactionTargetId);
    if (!target.commentable || !target.comment_notification_type) {
      return { ok: false, error: "not_commentable" };
    }

    const admin = createServiceRoleClient();
    const [threadRes, lastRes, dayRes] = await Promise.all([
      admin
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("interaction_target_id", interactionTargetId)
        .eq("author_id", user.id)
        .not("audio_path", "is", null),
      admin
        .from("comments")
        .select("author_id, audio_path")
        .eq("interaction_target_id", interactionTargetId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id)
        .not("audio_path", "is", null)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ]);
    if ((threadRes.count ?? 0) >= VOICE_MAX_PER_THREAD) {
      return { ok: false, error: "voice_thread_limit" };
    }
    if (lastRes.data && lastRes.data.author_id === user.id && lastRes.data.audio_path) {
      return { ok: false, error: "voice_consecutive" };
    }
    if ((dayRes.count ?? 0) >= VOICE_MAX_PER_DAY) {
      return { ok: false, error: "voice_daily_limit" };
    }

    // El path lo construye el servidor SIEMPRE (nada del cliente): la spec
    // pedía <comment_id>.<ext>, pero el id no existe hasta el insert y la
    // secuencia manda subir antes; un uuid fresco cumple lo mismo (no
    // adivinable, un objeto por nota).
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await uploadVoiceNote(path, file, mime);
    if ("error" in uploaded) return { ok: false, error: "upload_failed" };
    orphanPath = path;

    const { data: inserted, error } = await supabase
      .from("comments")
      .insert({
        interaction_target_id: interactionTargetId,
        author_id: user.id,
        body: "",
        parent_id: opts?.parentId ?? null,
        is_spoiler: opts?.isSpoiler ?? false,
        audio_path: path,
        audio_duration_ms: durationMs,
        audio_peaks: peaks,
      })
      .select("id, parent_id")
      .single();
    if (error) throw error;
    orphanPath = null; // la fila existe: el objeto ya no es huérfano

    // Notificaciones: mismas dos rutas que addComment (dueño del target y
    // autor del padre) con la copia de voz. SIN notifyMentions: no hay texto
    // del que parsear @menciones (spec §6, MVP sin transcripción).
    const context = voiceCommentContext(opts?.isSpoiler ?? false);
    let commentTargetId: string | null = null;
    try {
      const { data: commentTarget } = await supabase
        .from("interaction_targets")
        .select("id")
        .eq("kind", "comment")
        .eq("source_id", inserted.id)
        .maybeSingle();
      commentTargetId = commentTarget?.id ?? null;
    } catch (e) {
      console.error(e);
    }

    if (target.owner_id !== user.id) {
      try {
        await notify(supabase, {
          userId: target.owner_id,
          actorId: user.id,
          type: target.comment_notification_type,
          interactionTargetId,
          context,
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (inserted.parent_id) {
      try {
        const { data: parent } = await supabase
          .from("comments")
          .select("author_id")
          .eq("id", inserted.parent_id)
          .maybeSingle();
        if (parent && parent.author_id !== user.id && parent.author_id !== target.owner_id) {
          await notify(supabase, {
            userId: parent.author_id,
            actorId: user.id,
            type: target.comment_notification_type,
            // Deep-link al subhilo (#c-<id>), igual que addComment:190-216.
            interactionTargetId: commentTargetId ?? interactionTargetId,
            dedupeKey: `reply:${inserted.id}`,
            context,
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    revalidateInteraction();
    return { ok: true };
  } catch (e) {
    console.error("addVoiceComment failed", e);
    return { ok: false, error: "unknown" };
  } finally {
    if (orphanPath) await deleteVoiceNote(orphanPath);
  }
}
