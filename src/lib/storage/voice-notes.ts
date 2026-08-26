import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Bucket PRIVADO `voice-notes` (migración 20260878): sin URL pública ni policy
// de SELECT — el audio respeta bloqueos y privacidad exactamente igual que el
// comentario que lo contiene, porque solo se llega a él por URL firmada
// generada al renderizar el hilo. Como toda subida del proyecto, va con
// service-role: Storage no valida el token ES256 del usuario (ver
// catalog/edit-actions.ts:218-221). Este módulo NO autoriza ni valida: eso es
// responsabilidad de la server action que llama (mismo contrato que
// upload-public-image.ts).

const BUCKET = "voice-notes";

/** Caducidad de la URL firmada: 1 h (spec §6). */
export const VOICE_SIGNED_URL_TTL_SECONDS = 3600;

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
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("deleteVoiceNote failed", error);
}

/** URLs firmadas en LOTE para el render del hilo (una llamada por resumen). */
export async function signVoiceNoteUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, VOICE_SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("signVoiceNoteUrls failed", error);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}
