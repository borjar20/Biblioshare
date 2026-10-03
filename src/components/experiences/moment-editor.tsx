"use client";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SheetShell } from "@/components/saga/sheet-shell";
import { saveMoment, removeMoment, reorderMoments } from "@/lib/experiences/actions";
import type { ExperienceDetail, ExperienceMoment, ExperienceError, MomentKind } from "@/lib/experiences/types";
import { ExperienceDate } from "./experience-date";
import { ExperienceKindIcon } from "./experience-artwork";
import { ExperienceKindPicker } from "./experience-kind-picker";

function MomentSheet({ experience: e, moment, onClose }: { experience: ExperienceDetail; moment?: ExperienceMoment; onClose: () => void }) {
  const t = useTranslations("experiences"), router = useRouter(), prefix = useId();
  const [kind, setKind] = useState<MomentKind>(moment?.kind ?? "other");
  const [error, setError] = useState<ExperienceError | null>(null), [pending, start] = useTransition();
  return <SheetShell title={moment ? t("editMoment") : t("addMoment")} onClose={onClose}>
    <form className="space-y-5" onSubmit={event => {
      event.preventDefault(); setError(null);
      const data = new FormData(event.currentTarget), value = (name: string) => String(data.get(name) ?? "");
      start(async () => {
        const result = await saveMoment(e.id, e.revision, { ...(moment ? { id: moment.id } : {}), title: value("title"), kind, placeLabel: value("placeLabel") || null, startsOn: value("startsOn") || null, endsOn: value("endsOn") || null });
        if (!result.ok) setError(result.error); else { onClose(); router.refresh(); }
      });
    }}>
      <fieldset disabled={pending} className="space-y-5">
        <ExperienceKindPicker value={kind} onChange={setKind} legend={t("momentKind")}/>
        <Field label={t("momentName")} htmlFor={`${prefix}-title`} required><Input id={`${prefix}-title`} name="title" defaultValue={moment?.title} placeholder={t("album.namePlaceholder")} maxLength={160} required className="min-h-12 w-full font-serif text-lg"/></Field>
        <details className="group border-y border-border">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-sm font-medium">{t("album.dateAndPlace")}<span aria-hidden className="text-lg group-open:rotate-45">+</span></summary>
          <div className="space-y-4 pb-5 pt-2">
            <Field label={t("place")} htmlFor={`${prefix}-place`}><Input id={`${prefix}-place`} name="placeLabel" defaultValue={moment?.placeLabel ?? ""} maxLength={240} className="min-h-11 w-full"/></Field>
            <div className="grid gap-3 sm:grid-cols-2"><Field label={t("startsOn")} htmlFor={`${prefix}-start`}><Input type="date" id={`${prefix}-start`} name="startsOn" defaultValue={moment?.startsOn ?? ""} className="min-h-11 w-full"/></Field><Field label={t("endsOn")} htmlFor={`${prefix}-end`}><Input type="date" id={`${prefix}-end`} name="endsOn" defaultValue={moment?.endsOn ?? ""} className="min-h-11 w-full"/></Field></div>
          </div>
        </details>
      </fieldset>
      {error && <div role="alert" className="space-y-2 text-sm text-status-dropped"><p>{t(`errors.${error}`)}</p>{error === "conflict" && <Button type="button" variant="secondary" className="min-h-11" onClick={() => router.refresh()}>{t("refresh")}</Button>}</div>}
      <Button type="submit" disabled={pending} className="min-h-12 w-full">{pending ? t("saving") : t("saveMoment")}</Button>
    </form>
  </SheetShell>;
}

/** Place beside each moment in the album; it never renders a second itinerary. */
export function MomentActions({ experience: e, moment, index }: { experience: ExperienceDetail; moment: ExperienceMoment; index: number }) {
  const t = useTranslations("experiences"), router = useRouter();
  const [editing, setEditing] = useState(false), [removing, setRemoving] = useState(false);
  const [error, setError] = useState<ExperienceError | null>(null), [pending, start] = useTransition();
  function move(offset: number) {
    const ids = e.moments.map(m => m.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    setError(null); start(async () => { const result = await reorderMoments(e.id, e.revision, ids); if (!result.ok) setError(result.error); else router.refresh(); });
  }
  if (!e.canEdit) return null;
  return <>
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" className="min-h-11 px-3" disabled={pending} onClick={() => { setError(null); setEditing(true); }}>{t("editMoment")}</Button>
      <ActionMenu label={t("momentActions", { name: moment.title })} items={[
        { key: "up", label: t("moveUp", { name: moment.title }), disabled: pending || index === 0, onSelect: () => move(-1) },
        { key: "down", label: t("moveDown", { name: moment.title }), disabled: pending || index === e.moments.length - 1, onSelect: () => move(1) },
        { key: "remove", label: t("removeMoment"), danger: true, disabled: pending || e.moments.length === 1, onSelect: () => { setError(null); setRemoving(true); } },
      ]}/>
    </div>
    {error && !removing && <p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    {editing && <MomentSheet experience={e} moment={moment} onClose={() => setEditing(false)}/>}
    {removing && <SheetShell title={t("removeMoment")} onClose={() => { setRemoving(false); setError(null); }}>
      <p className="mb-4 text-sm leading-relaxed">{t("removeMomentConfirm", { name: moment.title })}</p>
      {error && <p role="alert" className="mb-3 text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
      <Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={() => {
        setError(null); start(async () => { const result = await removeMoment(e.id, e.revision, moment.id); if (!result.ok) setError(result.error); else { setRemoving(false); router.refresh(); } });
      }}>{t("removeMoment")}</Button>
    </SheetShell>}
  </>;
}

export function MomentEditor({ experience: e, variant = "editor" }: { experience: ExperienceDetail; variant?: "editor" | "inline" }) {
  const t = useTranslations("experiences"), [adding, setAdding] = useState(false);
  if (!e.canEdit) return null;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4">
      {variant === "editor" && <h2 className="font-serif text-xl font-semibold">{t("moments")}</h2>}
      <Button type="button" variant="secondary" className="min-h-11" disabled={e.moments.length >= 50} onClick={() => setAdding(true)}><span aria-hidden>+</span>{t("addMoment")}</Button>
    </div>
    {variant === "editor" && <ol className="space-y-3">{e.moments.map((moment, index) => <li key={moment.id} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3"><span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-muted"><ExperienceKindIcon kind={moment.kind} className="h-6 w-6"/></span><div className="min-w-0 flex-1"><h3 className="break-words font-serif text-lg font-semibold">{moment.title}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`kinds.${moment.kind}`)}{moment.placeLabel ? ` · ${moment.placeLabel}` : ""}</p><p className="mt-1 text-xs text-muted-foreground"><ExperienceDate startsOn={moment.startsOn} endsOn={moment.endsOn}/></p></div></div>
      <div className="mt-2 flex justify-end"><MomentActions experience={e} moment={moment} index={index}/></div>
    </li>)}</ol>}
    {adding && <MomentSheet experience={e} onClose={() => setAdding(false)}/>}
  </section>;
}
