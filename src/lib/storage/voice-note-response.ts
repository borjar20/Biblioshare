import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const PRIVATE_AUDIO_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

/** Call only with a path resolved from an authorized database row or admin RPC. */
export async function serveAuthorizedVoiceNote(request: Request, path: string) {
  const fail = (status: number) => new Response(null, { status, headers: PRIVATE_AUDIO_HEADERS });
  // The path comes exclusively from the authorized row, never from request input.
  const { data: audio, error: downloadError } = await createServiceRoleClient().storage
    .from("voice-notes").download(path);
  if (downloadError || !audio) return fail(404);
  const headers = new Headers({ ...PRIVATE_AUDIO_HEADERS, "Content-Type": audio.type || "application/octet-stream", "Accept-Ranges": "bytes" });
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = match?.[1] ? Number(match[1]) : Math.max(0, audio.size - Number(match?.[2]));
    const end = match?.[1] && match[2] ? Math.min(Number(match[2]), audio.size - 1) : audio.size - 1;
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= audio.size) {
      headers.set("Content-Range", `bytes */${audio.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${audio.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(audio.slice(start, end + 1), { status: 206, headers });
  }
  headers.set("Content-Length", String(audio.size));
  return new Response(audio, { headers });
}
