"use client";
import Link from "next/link";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {ActionMenu} from "@/components/ui/action-menu";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {SheetShell} from "@/components/saga/sheet-shell";
import {addGuest,findExperienceAccount,inviteParticipant,removeParticipant,setShareIdentity} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceError,ExperiencePerson,ExperienceResult} from "@/lib/experiences/types";
export function ExperienceParticipants({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter(),fieldId=useId();
  const [adding,setAdding]=useState(false),[mode,setMode]=useState("account"),[removing,setRemoving]=useState<ExperiencePerson|null>(null);
  const [found,setFound]=useState<{id:string;username:string;name:string}|null>(null),[error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  const own=e.participants.find(p=>p.userId!==null&&p.userId===e.viewerId);
  const name=(p:ExperiencePerson)=>p.guestName??p.displayName??p.username??t("companion");
  function run(work:()=>Promise<ExperienceResult<unknown>>,done?:()=>void) {setError(null);start(async()=>{const result=await work();if(!result.ok) setError(result.error);else {done?.();router.refresh();}});}
  const close=()=>{setAdding(false);setRemoving(null);setFound(null);setError(null);};
  return <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
    <h2 className="font-serif text-lg font-semibold">{t("companions")}</h2>
    <ul className="space-y-3">{e.participants.map(p=><li key={p.id} className="flex items-center justify-between gap-2"><div className="min-w-0 text-sm">{p.username ? <Link className="underline decoration-border underline-offset-4" href={`/u/${p.username}`}>{name(p)}</Link> : <span>{name(p)}</span>}{p.invitationState!=="accepted"&&<p className="mt-1 text-xs text-muted-foreground">{t(`invitationStates.${p.invitationState}`)}</p>}</div>{p.userId!==e.creatorId&&(e.canEdit||p.id===own?.id)&&<ActionMenu label={t("personActions",{name:name(p)})} items={[{key:"remove",label:p.id===own?.id ? t("leave") : t("removeCompanion"),danger:true,onSelect:()=>{setError(null);setRemoving(p);}}]}/>}</li>)}</ul>
    {e.canEdit&&<Button className="min-h-11 w-full" variant="secondary" onClick={()=>{setError(null);setAdding(true);}}>{t("addCompanion")}</Button>}
    {e.canContribute&&own&&<div className="border-t border-border pt-4"><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={own.shareIdentity} disabled={pending} onChange={event=>run(()=>setShareIdentity(e.id,event.target.checked))} className="h-5 w-5 accent-accent"/>{t("shareIdentity")}</label><p className="mt-2 text-xs text-muted-foreground">{t("shareIdentityHint")}</p></div>}
    {!adding&&!removing&&error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    {adding&&<SheetShell title={t("addCompanion")} onClose={close}><div className="space-y-4">
      <Field htmlFor={`${fieldId}-mode`} label={t("companionType")}><Select id={`${fieldId}-mode`} value={mode} onChange={event=>{setMode(event.target.value);setFound(null);setError(null);}} className="min-h-11 w-full"><option value="account">{t("account")}</option><option value="guest">{t("guest")}</option></Select></Field>
      {mode==="account" ? <>
        {e.audience==="private"&&<p className="rounded-xl bg-surface-muted p-3 text-sm">{t("inviteAudienceHint")}</p>}
        <form className="space-y-3" onSubmit={event=>{event.preventDefault();const username=String(new FormData(event.currentTarget).get("username")??"");setError(null);setFound(null);start(async()=>{const result=await findExperienceAccount(username);if(!result.ok) setError(result.error);else setFound(result.data);});}}><Field htmlFor={`${fieldId}-user`} label={t("accountUsername")}><Input id={`${fieldId}-user`} name="username" maxLength={31} required className="min-h-11 w-full" autoComplete="off" onChange={()=>setFound(null)}/></Field><Button type="submit" variant="secondary" className="min-h-11" disabled={pending}>{t("searchAccount")}</Button></form>
        {found&&<div className="rounded-xl border border-border p-4"><p className="text-sm font-medium">{found.name}</p><p className="text-xs text-muted-foreground">@{found.username}</p><Button disabled={pending} className="mt-3 min-h-11 w-full" onClick={()=>run(()=>inviteParticipant(e.id,found.id),close)}>{t("inviteName",{name:found.name})}</Button></div>}
      </> : <form className="space-y-3" onSubmit={event=>{event.preventDefault();const guest=String(new FormData(event.currentTarget).get("guest")??"");run(()=>addGuest(e.id,guest),close);}}><Field htmlFor={`${fieldId}-guest`} label={t("guestName")} hint={t("guestHint")}><Input id={`${fieldId}-guest`} name="guest" maxLength={80} required className="min-h-11 w-full"/></Field><Button disabled={pending} className="min-h-11 w-full" type="submit">{t("saveGuest")}</Button></form>}
      {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    </div></SheetShell>}
    {removing&&<SheetShell title={removing.id===own?.id ? t("leave") : t("removeCompanion")} onClose={close}><div className="space-y-4"><p className="text-sm">{t("removeCompanionConfirm",{name:name(removing)})}</p>{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={()=>run(()=>removeParticipant(removing.id),()=>{close();if(removing.id===own?.id) router.push("/experiencias");})}>{removing.id===own?.id ? t("leave") : t("removeCompanion")}</Button></div></SheetShell>}
  </section>;
}
