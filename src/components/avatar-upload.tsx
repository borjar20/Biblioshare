"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toSquareWebp } from "@/lib/image/to-square-webp";
import { uploadAvatar } from "@/lib/profile/actions";

const MAX_DIMENSION = 512;

// Sube el avatar vía la server action uploadAvatar (que escribe en Storage con
// service-role) y sincroniza un input oculto (avatarUrl) con la URL pública,
// para que el submit del formulario la persista vía updateProfile. La subida
// directa desde el cliente daba RLS 403 porque Storage no valida el JWT ES256.
export function AvatarUpload({
  userId: _userId,
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
      const webp = await toSquareWebp(file, MAX_DIMENSION);
      const formData = new FormData();
      formData.append("file", webp, "avatar.webp");
      const result = await uploadAvatar(formData);
      if (result.error || !result.url) throw new Error("upload failed");
      setUrl(result.url);
      setPreview(result.url);
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
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {error && <p className="text-xs text-status-dropped">{t("avatarError")}</p>}
      {/* La server action updateProfile lee este campo tal cual. */}
      <input type="hidden" name="avatarUrl" value={url} />
    </div>
  );
}
