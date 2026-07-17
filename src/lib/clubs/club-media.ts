"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadPublicImage } from "@/lib/storage/upload-public-image";

// El cliente ya comprime a WebP 512px (club-cover-upload.tsx); aquí solo se
// acepta WebP con un tamaño holgado. El accept del <input> no es defensa.
const MAX_COVER_BYTES = 1 * 1024 * 1024; // 1 MB
const ALLOWED_COVER_TYPES = new Set(["image/webp"]);

export type UploadClubCoverState = { url?: string; error?: "generic" };

// Sube la portada de club a Storage con service-role (Storage no valida el token
// ES256 del usuario). La ruta lleva el uid de la SESIÓN como prefijo (no del
// cliente): replica la garantía "carpeta propia" y funciona antes de que el club
// exista (formulario de creación), igual que el diseño original del bucket.
export async function uploadClubCover(formData: FormData): Promise<UploadClubCoverState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "generic" };
  if (!ALLOWED_COVER_TYPES.has(file.type)) return { error: "generic" };
  if (file.size > MAX_COVER_BYTES) return { error: "generic" };

  const path = `${user.id}/club-cover-${Date.now()}.webp`;
  const result = await uploadPublicImage("avatars", path, file, "image/webp");
  if ("error" in result) return { error: "generic" };
  return { url: result.url };
}
