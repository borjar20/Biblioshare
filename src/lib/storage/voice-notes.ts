import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

// Bucket PRIVADO `voice-notes` (migración 20260878): sin URL pública ni policy
// de SELECT — el audio respeta bloqueos y privacidad exactamente igual que el
// comentario que lo contiene: la entrega pasa por /api/voice-notes/[id], que
// comprueba sesión y RLS en cada petición, incluso al reutilizar la URL.
// Como toda subida del proyecto, va con
// service-role: Storage no valida el token ES256 del usuario (ver
// catalog/edit-actions.ts:218-221). Este módulo NO autoriza ni valida: eso es
// responsabilidad de la server action que llama (mismo contrato que
// upload-public-image.ts).

const BUCKET = "voice-notes";

export async function uploadVoiceNote(
  path: string,
  blob: Blob,
  contentType: string,
): Promise<{ ok: true } | { error: true }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: false, // el path lleva un uuid recién generado; un choque es un bug
  });
  if (error) {
    console.error("uploadVoiceNote failed", error);
    return { error: true };
  }
  return { ok: true };
}

/** Falla en silencio (log): un objeto huérfano no debe romper un borrado. */
export async function deleteVoiceNote(path: string): Promise<void> {
  const supabase = createServiceRoleClient();
  // Authors can delete reported comments; the report snapshot must retain audio.
  // Fail closed if evidence lookup is unavailable, including during rollout.
  const { data: isEvidence, error: evidenceError } = await supabase.rpc("moderation_audio_is_evidence", { p_path: path });
  if (evidenceError || isEvidence !== false) {
    if (evidenceError) console.error("deleteVoiceNote evidence check failed", evidenceError);
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("deleteVoiceNote failed", error);
}

/** Nombre conservado para los consumidores; ya no emite credenciales de Storage. */
export async function signVoiceNoteUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("comments")
    .select("id, audio_path")
    .in("audio_path", paths);
  if (error) {
    console.error("signVoiceNoteUrls failed", error);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.audio_path) out.set(row.audio_path, `/api/voice-notes/${row.id}`);
  }
  return out;
}
