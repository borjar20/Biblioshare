"use client";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {ActionMenu} from "@/components/ui/action-menu";
import {Field} from "@/components/ui/field";
import {RatingDots} from "@/components/ui/rating-dots";
import {SheetShell} from "@/components/saga/sheet-shell";
import {UserAvatar} from "@/components/social/user-avatar";
import {saveMomentReview,setReviewSharing,deleteMomentReview,publishReview,unpublishReview} from "@/lib/experiences/review-actions";
import type {ExperienceDetail,ExperienceMoment,ExperienceReview,ExperienceError,ExperienceResult} from "@/lib/experiences/types";
import {ExperienceRating} from "./experience-rating";
import {ReviewReport} from "./review-report";

function ReviewBody({review}:{review:ExperienceReview}) {
  const t=useTranslations("experiences"),[open,setOpen]=useState(false);
  if(!review.body) return null;
  const long=review.body.length>280;
  return <div className="space-y-1"><p className={`whitespace-pre-wrap break-words text-sm ${long&&!open?"line-clamp-4":""}`}>{review.body}</p>{long&&<button type="button" aria-expanded={open} className="min-h-11 text-xs underline underline-offset-4" onClick={()=>setOpen(v=>!v)}>{t(open?"reviews.readLess":"reviews.readMore")}</button>}</div>;
}

function ReviewSheet({moment:m,review,onClose}:{moment:ExperienceMoment;review?:ExperienceReview;onClose:()=>void}) {
  const t=useTranslations("experiences"),router=useRouter(),id=useId();
  const [rating,setRating]=useState<number|null>(review?.rating??null),[body,setBody]=useState(review?.body??"");
  const [error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition(),[confirmDelete,setConfirmDelete]=useState(false);
  const done=(result:ExperienceResult<unknown>)=>{if(!result.ok) setError(result.error);else {onClose();router.refresh();}};
  // Vaciar una reseña existente la borra (y su publicación) en SQL: pasa por la misma confirmación que «Borrar».
  if(confirmDelete&&review) return <SheetShell title={t("reviews.delete")} onClose={onClose}><p className="mb-4 text-sm">{t("reviews.deleteConfirm",{name:m.title})}</p>{error&&<p role="alert" className="mb-4 text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={()=>{setError(null);start(async()=>done(await deleteMomentReview(review.id)));}}>{t("reviews.delete")}</Button></SheetShell>;
  return <SheetShell title={t("reviews.sheetTitle",{name:m.title})} onClose={onClose}>
    <form className="space-y-5" onSubmit={event=>{event.preventDefault();setError(null);if(review&&rating===null&&!body.trim()){setConfirmDelete(true);return;}start(async()=>done(await saveMomentReview(m.id,{rating,body:body.trim()||null})));}}>
      <fieldset disabled={pending} className="space-y-5">
        {/* RatingDots no acepta aria-*: el grupo de fuera le pone nombre. */}
        <div role="group" aria-labelledby={`${id}-rating`}><p id={`${id}-rating`} className="mb-2 text-sm font-medium">{t("reviews.rating")}</p><RatingDots value={rating} onChange={setRating} size="lg" disabled={pending}/></div>
        <Field label={t("reviews.body")} htmlFor={`${id}-body`} hint={t("reviews.bodyHint")}><textarea id={`${id}-body`} value={body} onChange={event=>setBody(event.target.value)} maxLength={4000} rows={5} className="w-full rounded-lg border border-border bg-surface p-3"/></Field>
      </fieldset>
      {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
      <Button type="submit" disabled={pending||(rating===null&&!body.trim()&&!review)} className="min-h-12 w-full">{pending?t("saving"):t("reviews.save")}</Button>
    </form>
  </SheetShell>;
}

function OwnReviewControls({experience:e,review}:{experience:ExperienceDetail;review:ExperienceReview}) {
  const t=useTranslations("experiences"),router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  const run=(work:()=>Promise<ExperienceResult<unknown>>)=>{setError(null);start(async()=>{const r=await work();if(!r.ok) setError(r.error);else router.refresh();});};
  const canPublish=review.shareWithProfile&&e.audience==="profile";
  return <div className="space-y-2">
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={review.shareWithProfile} disabled={pending} onChange={event=>run(()=>setReviewSharing(review.id,event.target.checked))}/>{t("reviews.share")}</label>
    <p className="text-xs text-muted-foreground">{t("reviews.shareHint")}</p>
    {review.shareWithProfile&&(canPublish
      ? review.publicationId
        ? <div className="flex flex-wrap items-center gap-2 text-xs"><span>{t("reviews.published")}</span><Button variant="ghost" className="min-h-11" disabled={pending} onClick={()=>run(()=>unpublishReview(review.id))}>{t("reviews.unpublish")}</Button></div>
        : <Button variant="secondary" className="min-h-11" disabled={pending} onClick={()=>run(()=>publishReview(review.id))}>{t("reviews.publish")}</Button>
      : <p className="text-xs text-muted-foreground">{t("reviews.publishNeedsProfile")}</p>)}
    {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
  </div>;
}

export function MomentReviews({experience:e,moment:m}:{experience:ExperienceDetail;moment:ExperienceMoment}) {
  const t=useTranslations("experiences"),router=useRouter();
  const [editing,setEditing]=useState(false),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  const reviews=e.reviews.filter(r=>r.momentId===m.id),own=reviews.find(r=>r.isAuthor),others=reviews.filter(r=>!r.isAuthor);
  const me=e.participants.find(p=>p.userId===e.viewerId&&p.invitationState==="accepted");
  const attended=Boolean(me&&e.attendance.some(a=>a.momentId===m.id&&a.participantId===me.id&&a.state==="attended"));
  const authorName=(r:ExperienceReview)=>r.authorName??r.authorUsername??t("companion");
  return <section aria-label={t("reviews.title")} className="space-y-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">{t("reviews.title")}</h4><ExperienceRating rating={e.momentRatings[m.id]??null}/></div>
    {e.canContribute&&me&&(e.state!=="lived"
      ? <p className="text-xs text-muted-foreground">{t("reviews.needLived")}</p>
      : !attended
        ? <p className="text-xs text-muted-foreground">{t("reviews.needAttendance",{name:m.title})}</p>
        : own
          ? <article className="space-y-2 rounded-cover bg-surface-muted p-3"><div className="flex items-center justify-between gap-2">{own.rating!==null?<RatingDots value={own.rating} size="sm"/>:<span/>}<ActionMenu label={t("reviews.actions",{name:m.title})} items={[{key:"edit",label:t("reviews.edit"),onSelect:()=>setEditing(true)},{key:"delete",label:t("reviews.delete"),danger:true,onSelect:()=>{setDeleteError(null);setDeleting(true);}}]}/></div><ReviewBody review={own}/><OwnReviewControls experience={e} review={own}/></article>
          : <Button variant="secondary" className="min-h-11" onClick={()=>setEditing(true)}>{t("reviews.write")}</Button>)}
    {others.length>0&&<ul className="space-y-3">{others.map(r=><li key={r.id} className="space-y-1.5"><div className="flex items-center gap-2"><UserAvatar name={authorName(r)} avatarUrl={r.authorAvatarUrl} size={24}/><span className="min-w-0 truncate text-sm font-medium">{authorName(r)}</span>{r.rating!==null&&<RatingDots value={r.rating} size="sm"/>}{e.viewerId&&<span className="ml-auto"><ReviewReport id={r.id}/></span>}</div><ReviewBody review={r}/></li>)}</ul>}
    {!own&&!others.length&&e.state==="lived"&&<p className="text-xs text-muted-foreground">{t("reviews.empty")}</p>}
    {editing&&<ReviewSheet moment={m} review={own} onClose={()=>setEditing(false)}/>}
    {deleting&&own&&<SheetShell title={t("reviews.delete")} onClose={()=>setDeleting(false)}><p className="mb-4 text-sm">{t("reviews.deleteConfirm",{name:m.title})}</p>{deleteError&&<p role="alert" className="mb-4 text-sm text-status-dropped">{t(`errors.${deleteError}`)}</p>}<Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={()=>{setDeleteError(null);start(async()=>{const r=await deleteMomentReview(own.id);if(r.ok){setDeleting(false);router.refresh();}else setDeleteError(r.error);});}}>{t("reviews.delete")}</Button></SheetShell>}
  </section>;
}
