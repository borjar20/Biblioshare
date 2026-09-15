import { createClient } from "@/lib/supabase/server";
import { PRIVATE_AUDIO_HEADERS, serveAuthorizedVoiceNote } from "@/lib/storage/voice-note-response";


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Never redirect to a signed storage URL: authorization must run on every GET. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fail = (status: number) => new Response(null, { status, headers: PRIVATE_AUDIO_HEADERS });
  if (!UUID.test(id)) return fail(404);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return fail(401);

  // Session client only: comments and their parent must both survive RLS.
  // There is intentionally no global-admin bypass on this ordinary audio URL.
  const { data: comment, error } = await supabase.from("comments")
    .select("audio_path, interaction_target_id").eq("id", id).maybeSingle();
  if (error || !comment?.audio_path) return fail(404);
  const { data: target, error: targetError } = await supabase.from("interaction_targets")
    .select("id").eq("id", comment.interaction_target_id).maybeSingle();
  if (targetError || !target) return fail(404);

  return serveAuthorizedVoiceNote(request, comment.audio_path);
}
