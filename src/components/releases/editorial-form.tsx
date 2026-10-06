"use client";

import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveBookAnnouncement } from "@/app/admin/novedades/actions";
import type { CulturalRelease, ReleaseDatePrecision } from "@/lib/releases/types";
import { loginHref } from "@/lib/auth/safe-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { readEditorialForm, type EditorialFormErrors } from "./editorial-form-data";
import { invokeReleaseAction, type ReleaseActionResult } from "./action-state";

export function EditorialForm({ initial, onDirtyChange }: { initial?: CulturalRelease; onDirtyChange?: (dirty: boolean) => void }) {
  const t = useTranslations("releaseAdmin");
  const r = useTranslations("releases");
  const router = useRouter();
  const prefix = useId();
  const [precision, setPrecision] = useState<ReleaseDatePrecision>(initial?.date_precision ?? "unknown");
  const [errors, setErrors] = useState<EditorialFormErrors>({});
  const [result, setResult] = useState<ReleaseActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function field(name: string, label: string, input: ReactNode, hint?: string) {
    return <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`${prefix}-${name}`} className="text-sm font-medium">{label}</label>
      {input}
      {hint && <p id={`${prefix}-${name}-hint`} className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {errors[name] && <p id={`${prefix}-${name}-error`} role="alert" className="text-xs text-status-dropped">{t(errors[name] === "required" ? "fieldRequired" : "fieldInvalid")}</p>}
    </div>;
  }
  function inputProps(name: string, hint = false) {
    return { id: `${prefix}-${name}`, name, "aria-invalid": Boolean(errors[name]),
      "aria-describedby": [hint ? `${prefix}-${name}-hint` : "", errors[name] ? `${prefix}-${name}-error` : ""].filter(Boolean).join(" ") || undefined };
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = readEditorialForm(new FormData(form), initial);
    setResult(null);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      const control = form.elements.namedItem(Object.keys(parsed.errors)[0]);
      if (control instanceof HTMLElement) {
        control.focus();
        control.scrollIntoView?.({ block: "nearest" });
      }
      return;
    }
    setErrors({});
    startTransition(async () => {
      const response = await invokeReleaseAction(() => saveBookAnnouncement(parsed.input, initial?.id, initial?.revision, initial?.updated_at));
      setResult(response);
      if (response.ok && response.id) router.push(`/admin/novedades/${response.id}`);
      else if (!response.ok && response.error === "auth") router.push(loginHref(initial ? `/admin/novedades/${initial.id}` : "/admin/novedades/nuevo"));
    });
  }

  return <form onSubmit={submit} onChange={() => onDirtyChange?.(true)} noValidate className="flex min-w-0 flex-col gap-6 rounded-card border border-border bg-surface p-5 sm:p-6">
    <p className="text-sm leading-relaxed text-muted-foreground">{t(initial ? "sourceHint" : "draftHint")}</p>
    {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-status-dropped">{t("formError")}</p>}
    <fieldset disabled={pending} className="grid min-w-0 gap-5 disabled:opacity-70 sm:grid-cols-2">
      <div className="sm:col-span-2">{field("title", t("titleField"), <Input {...inputProps("title")} defaultValue={initial?.title ?? ""} maxLength={500} required />)}</div>
      {field("author", t("author"), <Input {...inputProps("author")} defaultValue={initial?.author ?? ""} maxLength={500} />)}
      {field("publisher", t("publisher"), <Input {...inputProps("publisher")} defaultValue={initial?.publisher ?? ""} maxLength={300} />)}
      {field("isbn", t("isbn"), <Input {...inputProps("isbn", true)} defaultValue={initial?.isbn ?? ""} inputMode="numeric" maxLength={30} />, t("isbnHint"))}
      {field("modality", t("modality"), <Select {...inputProps("modality")} defaultValue={initial?.modality ?? "book"}>
        <option value="book">{r("modalities.book")}</option><option value="book_translation">{r("modalities.book_translation")}</option>
      </Select>)}
      {field("market", t("market"), <Select {...inputProps("market")} defaultValue={initial?.market ?? "ES"}>
        <option value="ES">{r("markets.ES")}</option><option value="INT">{r("markets.INT")}</option>
      </Select>)}
      {field("language", t("language"), <Input {...inputProps("language", true)} defaultValue={initial?.language ?? "es"} autoCapitalize="none" spellCheck={false} maxLength={10} required />, t("languageHint"))}
      {field("datePrecision", t("precision"), <Select {...inputProps("datePrecision")} value={precision} onChange={(event) => {
        setPrecision(event.target.value as ReleaseDatePrecision);
        setErrors((current) => { const next = { ...current }; delete next.dateValue; return next; });
      }}>
        {(["day", "month", "year", "unknown"] as const).map((value) => <option key={value} value={value}>{t(`precisions.${value}`)}</option>)}
      </Select>)}
      {precision !== "unknown" && field("dateValue", t(precision === "day" ? "dateDay" : precision === "month" ? "dateMonth" : "dateYear"),
        <Input key={precision} {...inputProps("dateValue")} type={precision === "day" ? "date" : precision === "month" ? "month" : "text"}
          defaultValue={initial?.date_precision === precision ? initial.date_value ?? "" : ""}
          inputMode={precision === "year" ? "numeric" : undefined} pattern={precision === "year" ? "[0-9]{4}" : undefined} maxLength={precision === "year" ? 4 : undefined} required />)}
      <div className="sm:col-span-2">{field("sourceName", t("sourceName"), <Input {...inputProps("sourceName")} defaultValue={initial?.source_name ?? ""} maxLength={150} required />)}</div>
      <div className="sm:col-span-2">{field("sourceUrl", t("sourceUrl"), <Input {...inputProps("sourceUrl", true)} type="url" defaultValue={initial?.source_url ?? ""} maxLength={2000} required />, t("sourceHint"))}</div>
      <div className="sm:col-span-2">{field("coverUrl", t("coverUrl"), <Input {...inputProps("coverUrl")} type="url" defaultValue={initial?.cover_url ?? ""} maxLength={2000} />)}</div>
      <div className="sm:col-span-2">{field("synopsis", t("synopsis"), <textarea {...inputProps("synopsis")} defaultValue={initial?.synopsis ?? ""} rows={4} maxLength={5000}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />)}</div>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant={initial && initial.status !== "published" ? "secondary" : "primary"} disabled={pending} aria-busy={pending} className="min-h-11">{pending ? t("saving") : initial ? t("saveChanges") : t("save")}</Button>
      {result?.ok && <p role="status" className="text-sm text-muted-foreground">{t("saved")}</p>}
      {result && !result.ok && <p role="alert" className="text-sm text-status-dropped">{r(`errors.${result.error}`)}</p>}
    </div>
    <p className="text-xs text-muted-foreground">{t("libraryHint")}</p>
  </form>;
}
