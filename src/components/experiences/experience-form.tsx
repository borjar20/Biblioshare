"use client";
import { PlaceCombobox } from "./place-combobox";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { createExperience, updateExperience } from "@/lib/experiences/actions";
import type { ExperienceDetail, ExperienceError, CreateExperienceInput, UpdateExperienceInput, MomentKind, ExperienceState } from "@/lib/experiences/types";
import { ExperienceArtwork } from "./experience-artwork";
import { ExperienceKindPicker } from "./experience-kind-picker";

type ExperienceFormProps = { experience?: ExperienceDetail; initialKind?: MomentKind };

export function ExperienceForm(props: ExperienceFormProps) {
  const { bfcacheId } = useRouter();
  // A fresh category link starts a new capture; browser back/forward keeps its draft.
  const draftKey = props.experience
    ? `edit:${props.experience.id}:${props.experience.revision}`
    : `new:${bfcacheId}:${props.initialKind ?? "other"}`;
  return <ExperienceFormDraft key={draftKey} {...props}/>;
}

function ExperienceFormDraft({ experience, initialKind = "other" }: ExperienceFormProps) {
  const t = useTranslations("experiences"), router = useRouter(), prefix = useId();
  const [title, setTitle] = useState(experience?.title ?? "");
  const [kind, setKind] = useState<MomentKind>(experience?.moments[0]?.kind ?? initialKind);
  const [state, setState] = useState<ExperienceState>(experience?.state ?? "planned");
  const [error, setError] = useState<ExperienceError | null>(null), [pending, startTransition] = useTransition();
  const field = (name: string) => `${prefix}-${name}`;

  return <form onSubmit={event => {
    event.preventDefault(); setError(null);
    const data = new FormData(event.currentTarget), value = (key: string) => String(data.get(key) ?? "");
    startTransition(async () => {
      const fields = { title, state, startsOn: value("startsOn") || null, endsOn: value("endsOn") || null };
      const result = experience
        ? await updateExperience(experience.id, experience.revision, { ...fields, shape: value("shape"), audience: value("audience") } as UpdateExperienceInput)
        : await createExperience({ ...fields, kind, placeLabel: value("placeLabel") || null, ...(value("placeToken") ? { placeToken: value("placeToken") } : {}) } as CreateExperienceInput);
      if (!result.ok) { setError(result.error); return; }
      const id = experience?.id ?? ("id" in result.data ? result.data.id : "");
      router.push(`/experiencia/${id}`);
    });
  }} className={experience ? "space-y-5" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] lg:gap-10"}>
    <fieldset disabled={pending} className="min-w-0 space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-7">
      {!experience && <ExperienceKindPicker value={kind} onChange={setKind} legend={t("album.chooseKind")}/>}
      <Field label={t("name")} htmlFor={field("title")} required>
        <Input id={field("title")} name="title" value={title} onChange={event => setTitle(event.target.value)} placeholder={t("album.namePlaceholder")} maxLength={160} required className="min-h-12 w-full font-serif text-lg"/>
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("state")}</legend>
        <div className="flex flex-wrap gap-2">{(["planned", "lived", ...(experience ? ["cancelled"] : [])] as ExperienceState[]).map(option => <label key={option} className="relative cursor-pointer">
          <input type="radio" name="state" value={option} checked={state === option} onChange={() => setState(option)} className="peer sr-only"/>
          <span className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-surface peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">{t(`states.${option}`)}</span>
        </label>)}</div>
      </fieldset>
      <details className="group border-y border-border">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-medium">
          {t(experience ? "album.configuration" : "album.dateAndPlace")}<span aria-hidden className="text-lg group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-4 pb-5 pt-2">
          {experience ? <>
            <Field label={t("shape")} htmlFor={field("shape")}><Select id={field("shape")} name="shape" defaultValue={experience.shape} className="min-h-11 w-full"><option value="single" disabled={experience.moments.length > 1}>{t("single")}</option><option value="trip">{t("trip")}</option></Select></Field>
            <Field label={t("audience")} htmlFor={field("audience")} hint={t("audienceHint")}><Select id={field("audience")} name="audience" defaultValue={experience.audience} className="min-h-11 w-full">{(["private", "participants", "profile"] as const).map(audience => <option key={audience} value={audience}>{t(audience)}</option>)}</Select></Field>
          </> : <Field label={t("place")} htmlFor={field("place")}><PlaceCombobox id={field("place")}/></Field>}
          <div className="grid gap-4 sm:grid-cols-2"><Field label={t("startsOn")} htmlFor={field("startsOn")}><Input type="date" id={field("startsOn")} name="startsOn" defaultValue={experience?.startsOn ?? ""} className="min-h-11 w-full"/></Field><Field label={t("endsOn")} htmlFor={field("endsOn")}><Input type="date" id={field("endsOn")} name="endsOn" defaultValue={experience?.endsOn ?? ""} className="min-h-11 w-full"/></Field></div>
        </div>
      </details>
      {!experience && <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">{t("album.capturePrivate")}</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-status-dropped"><p>{t(`errors.${error}`)}</p>{error === "conflict" && <Button type="button" variant="secondary" className="min-h-11" onClick={() => router.refresh()}>{t("refresh")}</Button>}</div>}
      <div className="flex flex-wrap items-center gap-2"><Button disabled={pending} className="min-h-12 flex-1 sm:flex-none" type="submit">{pending ? t("saving") : experience ? t("saveChanges") : t("save")}</Button><Link href={experience ? `/experiencia/${experience.id}` : "/experiencias"} className={buttonVariants("ghost", "min-h-11")}>{t("cancel")}</Link></div>
    </fieldset>
    {!experience && <aside aria-hidden="true" className="hidden min-w-0 self-start lg:block">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface p-3 shadow-cover">
        <ExperienceArtwork kind={kind} className="aspect-[4/3] w-full rounded-xl"/>
        <div className="space-y-3 px-3 pb-4 pt-5"><p className="text-sm text-muted-foreground">{t(`kinds.${kind}`)}</p><p className="break-words font-serif text-3xl font-semibold leading-tight">{title || t("album.previewUntitled")}</p><span className="inline-flex rounded-full bg-surface-muted px-3 py-1 text-xs">{t(`states.${state}`)}</span></div>
      </div>
    </aside>}
  </form>;
}
