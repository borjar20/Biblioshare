"use client";
import Image from "next/image";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SheetShell } from "@/components/saga/sheet-shell";
import { addGuest, findExperienceAccount, inviteParticipant, removeParticipant, setShareIdentity } from "@/lib/experiences/participant-actions";
import { EXPERIENCE_LIMITS, type ExperienceDetail, type ExperienceError, type ExperiencePerson, type ExperienceResult } from "@/lib/experiences/types";

export function ExperienceParticipants({ experience: e }: { experience: ExperienceDetail }) {
  const t = useTranslations("experiences"), router = useRouter(), fieldId = useId();
  const [adding, setAdding] = useState(false), [mode, setMode] = useState<"account" | "guest">("account"), [removing, setRemoving] = useState<ExperiencePerson | null>(null);
  const [username, setUsername] = useState(""), [guest, setGuest] = useState("");
  const [found, setFound] = useState<{ id: string; username: string; name: string } | null>(null), [error, setError] = useState<ExperienceError | null>(null), [pending, start] = useTransition();
  const own = e.participants.find(p => p.userId !== null && p.userId === e.viewerId);
  const name = (person: ExperiencePerson) => person.guestName ?? person.displayName ?? person.username ?? t("companion");
  function run(work: () => Promise<ExperienceResult<unknown>>, done?: () => void) {
    setError(null); start(async () => { const result = await work(); if (!result.ok) setError(result.error); else { done?.(); router.refresh(); } });
  }
  function close() { setAdding(false); setRemoving(null); setFound(null); setError(null); setUsername(""); setGuest(""); }

  return <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
    <h2 className="font-serif text-xl font-semibold">{t("companions")}</h2>
    <ul className="space-y-3">{e.participants.map(person => <li key={person.id} className="flex items-center gap-3">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface-muted font-serif text-lg">
        {person.avatarUrl ? <Image src={person.avatarUrl} alt="" width={40} height={40} className="h-full w-full object-cover"/> : name(person).trim().slice(0, 1).toLocaleUpperCase("es")}
      </span>
      <div className="min-w-0 flex-1 text-sm">{person.username ? <Link className="inline-flex min-h-11 max-w-full items-center font-medium underline decoration-border underline-offset-4" href={`/u/${person.username}`}><span className="truncate">{name(person)}</span></Link> : <p className="break-words font-medium">{name(person)}</p>}
        {person.invitationState !== "accepted" && <p className="text-xs text-muted-foreground">{t(`invitationStates.${person.invitationState}`)}</p>}
      </div>
      {person.userId !== e.creatorId && (e.canEdit || person.id === own?.id) && <ActionMenu label={t("personActions", { name: name(person) })} items={[{ key: "remove", label: person.id === own?.id ? t("leave") : t("removeCompanion"), danger: true, disabled: pending, onSelect: () => { setError(null); setRemoving(person); } }]}/>}
    </li>)}</ul>
    {e.canEdit && <Button className="min-h-11 w-full" variant="secondary" disabled={pending || e.participants.length >= EXPERIENCE_LIMITS.participants} onClick={() => { setError(null); setAdding(true); }}><span aria-hidden>+</span>{t("addCompanion")}</Button>}
    {e.canContribute && own && <details className="group border-t border-border">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 py-3 text-sm font-medium">{t("album.participation")}<span aria-hidden className="text-lg group-open:rotate-45">+</span></summary>
      <div className="pb-2"><label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={own.shareIdentity} disabled={pending} onChange={event => { const enabled = event.target.checked; run(() => setShareIdentity(e.id, enabled)); }} className="mt-1 h-5 w-5 shrink-0 accent-accent"/>{t("shareIdentity")}</label><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("shareIdentityHint")}</p></div>
    </details>}
    {!adding && !removing && error && <p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    {adding && <SheetShell title={t("addCompanion")} onClose={close}><div className="space-y-5">
      <fieldset disabled={pending}>
        <legend className="mb-3 text-sm font-medium">{t("companionType")}</legend>
        <div className="grid grid-cols-2 gap-3">{(["account", "guest"] as const).map(option => <label key={option} className="relative cursor-pointer">
          <input type="radio" name={`${fieldId}-mode`} value={option} checked={mode === option} onChange={() => { setMode(option); setError(null); }} aria-label={t(option)} className="peer sr-only"/>
          <span className="flex min-h-24 flex-col justify-center gap-2 rounded-xl border border-border p-3 text-sm peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"><span className="font-medium">{t(option)}</span><span aria-hidden className="text-xs leading-relaxed text-muted-foreground">{t(option === "account" ? "album.accountHint" : "album.guestModeHint")}</span></span>
        </label>)}</div>
      </fieldset>
      <div hidden={mode !== "account"} className="space-y-4">
        {e.audience === "private" && <p className="rounded-xl bg-surface-muted p-3 text-xs leading-relaxed">{t("inviteAudienceHint")}</p>}
        <form className="space-y-3" onSubmit={event => {
          event.preventDefault(); setError(null); setFound(null);
          start(async () => { const result = await findExperienceAccount(username); if (!result.ok) setError(result.error); else setFound(result.data); });
        }}><Field htmlFor={`${fieldId}-user`} label={t("accountUsername")}><Input id={`${fieldId}-user`} name="username" value={username} onChange={event => { setUsername(event.target.value); setFound(null); }} maxLength={31} required className="min-h-11 w-full" autoComplete="off" disabled={pending}/></Field><Button type="submit" variant="secondary" className="min-h-11 w-full" disabled={pending}>{t("searchAccount")}</Button></form>
        {found && <div className="rounded-xl border border-border bg-surface-muted p-4"><div className="flex items-center gap-3"><span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface font-serif text-xl">{found.name.slice(0, 1).toLocaleUpperCase("es")}</span><div className="min-w-0"><p className="break-words text-sm font-medium">{found.name}</p><p className="text-xs text-muted-foreground">@{found.username}</p></div></div><Button disabled={pending} className="mt-4 min-h-11 w-full" onClick={() => run(() => inviteParticipant(e.id, found.id), close)}>{t("inviteName", { name: found.name })}</Button></div>}
      </div>
      <form hidden={mode !== "guest"} className="space-y-3" onSubmit={event => { event.preventDefault(); run(() => addGuest(e.id, guest), close); }}>
        <Field htmlFor={`${fieldId}-guest`} label={t("guestName")} hint={t("guestHint")}><Input id={`${fieldId}-guest`} name="guest" value={guest} onChange={event => setGuest(event.target.value)} maxLength={80} required className="min-h-11 w-full" disabled={pending}/></Field><Button disabled={pending} className="min-h-11 w-full" type="submit">{t("saveGuest")}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    </div></SheetShell>}
    {removing && <SheetShell title={removing.id === own?.id ? t("leave") : t("removeCompanion")} onClose={close}><div className="space-y-4"><p className="text-sm leading-relaxed">{t("removeCompanionConfirm", { name: name(removing) })}</p>{error && <p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={() => run(() => removeParticipant(removing.id), () => { close(); if (removing.id === own?.id) router.push("/experiencias"); })}>{removing.id === own?.id ? t("leave") : t("removeCompanion")}</Button></div></SheetShell>}
  </section>;
}
