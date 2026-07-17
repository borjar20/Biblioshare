import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Sube un blob a un bucket público con service-role y devuelve su URL pública
// con cache-bust. Centraliza el patrón que compartían avatar-upload,
// club-cover-upload y uploadCover. NO autoriza ni valida: eso es
// responsabilidad de la server action que llama (ver service-role.ts).
export async function uploadPublicImage(
  bucket: string,
  path: string,
  blob: Blob,
  contentType: string
): Promise<{ url: string } | { error: true }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { upsert: true, contentType });
  if (error) return { error: true };

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: `${publicUrl}?v=${Date.now()}` };
}
