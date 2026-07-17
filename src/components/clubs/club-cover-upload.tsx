"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toSquareWebp } from "@/lib/image/to-square-webp";
import { uploadClubCover } from "@/lib/clubs/club-media";

const MAX_DIMENSION = 512;

// Portada de club (EPIC-05 Bloque E). Sube vía la server action uploadClubCover
// (Storage con service-role); la subida directa desde el cliente daba RLS 403
// porque Storage no valida el JWT ES256. La ruta la deriva la action del uid de
// sesión, así que ya no hace falta el userId aquí para construirla.
export function ClubCoverUpload({
  userId: _userId,
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
      const formData = new FormData();
      formData.append("file", webp, "club-cover.webp");
      const result = await uploadClubCover(formData);
      if (result.error || !result.url) throw new Error("upload failed");
      setPreview(result.url);
      onUploaded(result.url);
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
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {error && <p className="text-xs text-status-dropped">{t("coverError")}</p>}
    </div>
  );
}
