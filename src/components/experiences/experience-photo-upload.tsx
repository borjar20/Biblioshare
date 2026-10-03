"use client";
import Image from "next/image";
import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SheetShell } from "@/components/saga/sheet-shell";
import { uploadExperiencePhoto } from "@/lib/experiences/photo-actions";
import { EXPERIENCE_LIMITS, type ExperienceMoment, type ExperienceError } from "@/lib/experiences/types";

export function ExperiencePhotoUpload({ experienceId, moments }: { experienceId: string; moments: ExperienceMoment[] }) {
  const t = useTranslations("experiences"), router = useRouter(), prefix = useId();
  const [open, setOpen] = useState(false), [pending, start] = useTransition(), [error, setError] = useState<ExperienceError | null>(null);
  const [preview, setPreview] = useState<string | null>(null), [filename, setFilename] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function close() { setOpen(false); setPreview(null); setFilename(""); setError(null); }

  return <>
    <Button variant="secondary" className="min-h-11" onClick={() => { setOpen(true); setError(null); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path d="M3 6h5l2-2h4l2 2h5v14H3z"/><circle cx="12" cy="13" r="4"/></svg>{t("addPhoto")}</Button>
    {open && <SheetShell title={t("addPhoto")} onClose={close}>
      <form className="space-y-5" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget), moment = String(data.get("moment") ?? "") || null;
        setError(null); start(async () => { const result = await uploadExperiencePhoto(experienceId, moment, data); if (!result.ok) setError(result.error); else { close(); router.refresh(); } });
      }}>
        <fieldset disabled={pending} className="space-y-4">
          <Field label={t("image")} htmlFor={`${prefix}-photo`} hint={t("album.photoFormat")}>
            <div className="relative">
              <input id={`${prefix}-photo`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="peer sr-only" onChange={event => {
                const file = event.currentTarget.files?.[0]; setError(null);
                if (!file) { setPreview(null); setFilename(""); return; }
                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("unsupported_image"); setPreview(null); setFilename(""); return; }
                if (file.size > EXPERIENCE_LIMITS.photoBytes) { setError("too_large"); setPreview(null); setFilename(""); return; }
                setPreview(URL.createObjectURL(file)); setFilename(file.name);
              }}/>
              <label htmlFor={`${prefix}-photo`} className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-border bg-surface-muted text-center peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                {preview ? <Image src={preview} alt={t("album.photoPreview")} unoptimized width={640} height={420} className="max-h-72 w-full object-contain"/> : <><svg aria-hidden="true" className="h-9 w-9 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h18v16H3zM4 17l5-6 4 4 3-3 5 5"/><circle cx="16" cy="8" r="1.5"/></svg><span className="px-4 text-sm font-medium">{t("album.choosePhoto")}</span></>}
              </label>
            </div>
            {filename && <p className="break-words text-xs text-muted-foreground">{filename}</p>}
          </Field>
          {moments.length > 1 && <details className="group border-y border-border">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium">{t("album.photoAssociation")}<span aria-hidden className="text-lg group-open:rotate-45">+</span></summary>
            <div className="pb-4"><Field label={t("photoMoment")} htmlFor={`${prefix}-moment`}><Select id={`${prefix}-moment`} name="moment" defaultValue="" className="min-h-11 w-full"><option value="">{t("generalGallery")}</option>{moments.map(moment => <option key={moment.id} value={moment.id}>{moment.title}</option>)}</Select></Field></div>
          </details>}
        </fieldset>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("album.photoPrivacy")}</p>
        {error && <p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
        <Button type="submit" className="min-h-12 w-full" disabled={pending || !preview}>{pending ? t("saving") : t("uploadPhoto")}</Button>
      </form>
    </SheetShell>}
  </>;
}
