"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClub, updateClub, type Club } from "@/lib/clubs/clubs";
import { ClubCoverUpload } from "./club-cover-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

type Props =
  | { userId: string; mode: "create"; onCreated: (club: Club) => void; onCancel: () => void }
  | { userId: string; mode: "edit"; club: Club; onUpdated: () => void; onCancel: () => void };

// Formulario de crear/editar club (EPIC-05 Bloque E) -- mismo patrón
// expandir-en-línea que EditProfileForm, no una ruta dedicada. El slug solo
// se pide (y es editable en el input) en modo "create": es fijo tras crear
// (ver design spec), así que "edit" no lo muestra.
export function ClubForm(props: Props) {
  const t = useTranslations("club");
  const isEdit = props.mode === "edit";
  const [name, setName] = useState(isEdit ? props.club.name : "");
  const [slug, setSlug] = useState(isEdit ? props.club.slug : "");
  const [description, setDescription] = useState(
    isEdit ? (props.club.description ?? "") : "",
  );
  const [visibility, setVisibility] = useState<"public" | "private">(
    isEdit ? props.club.visibility : "public",
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(
    isEdit ? props.club.coverUrl : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        if (props.mode === "create") {
          const club = await createClub({
            name,
            slug,
            description,
            visibility,
            coverUrl: coverUrl ?? undefined,
          });
          props.onCreated(club);
        } else {
          await updateClub(props.club.id, { name, description, visibility, coverUrl: coverUrl ?? undefined });
          props.onUpdated();
        }
      } catch {
        setError(t("formError"));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4 text-sm">
      <Field label={t("name")} htmlFor="club-form-name">
        <Input id="club-form-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      {!isEdit && (
        <Field label={t("slug")} htmlFor="club-form-slug">
          <Input
            id="club-form-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
            required
          />
        </Field>
      )}
      <Field label={t("description")} htmlFor="club-form-description">
        <textarea
          id="club-form-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>
      <ClubCoverUpload userId={props.userId} initialUrl={coverUrl} onUploaded={setCoverUrl} />
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={visibility === "private"}
          onChange={(e) => setVisibility(e.target.checked ? "private" : "public")}
        />
        {t("visibilityPrivate")}
      </label>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("formSubmitting") : isEdit ? t("formSaveEdit") : t("formSaveCreate")}
        </Button>
        <Button type="button" variant="ghost" onClick={props.onCancel}>
          {t("formCancel")}
        </Button>
      </div>
    </form>
  );
}
