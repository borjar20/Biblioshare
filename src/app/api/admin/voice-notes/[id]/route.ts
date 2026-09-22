import { getCurrentUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { PRIVATE_AUDIO_HEADERS, serveAuthorizedVoiceNote } from "@/lib/storage/voice-note-response";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Evidence access is separate from normal playback and reauthorized per request. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const fail = (status: number) => new Response(null, { status, headers: PRIVATE_AUDIO_HEADERS });
  if (await getCurrentUserRole() !== "admin") return fail(403);
  const { id } = await params;
  if (!UUID.test(id)) return fail(404);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_moderation_audio", { p_comment_id: id });
  if (error || !data || typeof data !== "object" || Array.isArray(data) || typeof data.audio_path !== "string" || !data.audio_path) return fail(404);
  return serveAuthorizedVoiceNote(request, data.audio_path);
}
