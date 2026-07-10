"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

const MAX_DIMENSION = 512;

// Redimensiona y recorta (cuadrado central) a MAX_DIMENSION y devuelve un
// Blob webp — mantiene el avatar pequeño y uniforme sin subir el original.
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = MAX_DIMENSION;
  canvas.height = MAX_DIMENSION;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, MAX_DIMENSION, MAX_DIMENSION);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.85
    );
  });
}

// Sube el avatar al bucket de Storage y sincroniza un input oculto (avatarUrl)
// con la URL pública, para que el submit del formulario la persista vía la
// server action existente. Path estable {uid}/avatar.webp con upsert; un
// parámetro de cache-busting fuerza el refresco de la imagen mostrada.
export function AvatarUpload({
  userId,
  initialUrl,
}: {
  userId: string;
  initialUrl: string | null;
}) {
  const t = useTranslations("profile");
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [url, setUrl] = useState<string>(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(false);
    try {
      const webp = await toSquareWebp(file);
      const supabase = createClient();
      const path = `${userId}/avatar.webp`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, webp, { upsert: true, contentType: "image/webp" });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const busted = `${publicUrl}?v=${Date.now()}`;
      setUrl(busted);
      setPreview(busted);
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{t("avatar")}</span>
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-muted">
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
          {uploading ? t("avatarUploading") : t("avatarChoose")}
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
      {error && <p className="text-xs text-status-dropped">{t("avatarError")}</p>}
      {/* La server action updateProfile lee este campo tal cual. */}
      <input type="hidden" name="avatarUrl" value={url} />
    </div>
  );
}
