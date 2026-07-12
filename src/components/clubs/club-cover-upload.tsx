"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { toSquareWebp } from "@/lib/image/to-square-webp";

const MAX_DIMENSION = 512;

// Portada de club (EPIC-05 Bloque E): reutiliza el bucket "avatars" y sus
// políticas existentes (own-folder-only), NO un bucket/prefijo nuevo -- la
// política exige que el primer segmento de la ruta sea auth.uid(), así que
// el path es {userId}/club-cover-{timestamp}.webp, no clubs/{clubId}/...
// (que además no resolvería el problema de subir portada antes de que el
// club exista, en el formulario de creación).
export function ClubCoverUpload({
  userId,
  initialUrl,
  onUploaded,
}: {
  userId: string;
  initialUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const t = useTranslations("club");
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(false);
    try {
      const webp = await toSquareWebp(file, MAX_DIMENSION);
      const supabase = createClient();
      const path = `${userId}/club-cover-${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, webp, { upsert: true, contentType: "image/webp" });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      setPreview(publicUrl);
      onUploaded(publicUrl);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{t("cover")}</span>
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- preview local/remota antes de persistir
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
        >
          {uploading ? t("coverUploading") : t("coverChoose")}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {error && <p className="text-xs text-status-dropped">{t("coverError")}</p>}
    </div>
  );
}
