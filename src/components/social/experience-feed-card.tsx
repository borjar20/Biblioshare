"use client";
import Link from "next/link";
import {useTranslations} from "next-intl";
import type {ExperienceFeedEvent} from "@/lib/social/feed";
import {ExperienceCard} from "@/components/experiences/experience-card";
import {TimeAgo} from "@/components/ui/time-ago";
import {UserAvatar} from "./user-avatar";
import {PostSummary} from "./post-summary";
import {PostDeleteError,PostDeleteMenu,useDeletePost} from "./post-delete-menu";
import {MentionText} from "./mention-text";
export function ExperienceFeedCard({event:e,hideActor=false,showInteractions=true,knownUsernames}:{event:ExperienceFeedEvent;viewerLoggedIn:boolean;hideActor?:boolean;showInteractions?:boolean;knownUsernames:string[]}) {
  const t=useTranslations("experiences"),{deleted,error,pending,requestDelete}=useDeletePost(e.postId);
  if(deleted)return null;
  return <article className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-card"><div className="flex flex-wrap items-center gap-2.5">{!hideActor&&<><UserAvatar name={e.actorDisplayName||e.actorUsername} avatarUrl={e.actorAvatarUrl} size={28}/><Link href={`/u/${e.actorUsername}`} className="min-w-0 flex-1 break-words text-sm font-semibold hover:underline">{e.actorDisplayName||e.actorUsername}</Link></>}<span className="text-xs text-muted-foreground">{t("sharedMemory")}</span><TimeAgo iso={e.eventDate} className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground"/>{e.viewerCanDelete&&e.postId&&<PostDeleteMenu pending={pending} onDelete={requestDelete}/>}</div><ExperienceCard experience={e.experience} variant="feed"/>{e.body&&<p className="whitespace-pre-wrap text-sm"><MentionText text={e.body} knownUsernames={knownUsernames}/></p>}{showInteractions&&e.postId&&<PostSummary postId={e.postId} reactionCount={e.reactionCount} commentCount={e.commentCount}/>} {error&&<PostDeleteError/>}</article>;
}
