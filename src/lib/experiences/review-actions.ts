"use server";
import {notify} from "@/lib/social/notifications";
import type {ExperienceResult,SaveReviewInput} from "./types";
import {experienceMutation} from "./mutation";
import {isExperienceId,validateReview} from "./validation";
type Saved={id:string|null;experienceId:string;created:boolean;notifyUserIds:string[]};
export async function saveMomentReview(momentId:string,input:SaveReviewInput):Promise<ExperienceResult<{id:string|null}>> {
  const value=validateReview(input);
  const result=await experienceMutation<Saved>(isExperienceId(momentId)&&value!==null,async client=>{
    // SQL accepts null for rating/body (at least one is required); the generated types declare them non-null, hence the casts.
    const saved=await client.rpc("experience_save_moment_review",{p_moment_id:momentId,p_rating:value!.rating as number,p_body:value!.body as string});
    const data=saved.data as Saved|null;
    if(!saved.error&&data?.created&&data.id) {
      const {data:{user}}=await client.auth.getUser();
      // Sent concurrently (up to 29 recipients). Dedupe is per (review, recipient): the index on dedupe_key is global. The review text never travels: the notice only names the memory.
      await Promise.all(data.notifyUserIds.map(userId=>notify(client,{userId,actorId:user!.id,type:"experience_reviewed",targetType:"experience",targetId:data.experienceId,dedupeKey:`experience_reviewed:${data.id}:${userId}`,context:undefined})));
    }
    return saved;
  });
  return result.ok?{ok:true,data:{id:result.data.id}}:result;
}
export async function setReviewSharing(reviewId:string,enabled:boolean):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(reviewId)&&typeof enabled==="boolean",client=>client.rpc("experience_set_review_sharing",{p_review_id:reviewId,p_enabled:enabled}));
  return result.ok?{ok:true,data:null}:result;
}
export async function deleteMomentReview(reviewId:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(reviewId),client=>client.rpc("experience_delete_moment_review",{p_review_id:reviewId}));
  return result.ok?{ok:true,data:null}:result;
}
export async function publishReview(reviewId:string):Promise<ExperienceResult<{id:string}>> {
  const result=await experienceMutation<{id:string;experienceId:string}>(isExperienceId(reviewId),client=>client.rpc("experience_publish_review",{p_review_id:reviewId}));
  return result.ok?{ok:true,data:{id:result.data.id}}:result;
}
export async function unpublishReview(reviewId:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(reviewId),client=>client.rpc("experience_unpublish_review",{p_review_id:reviewId}));
  return result.ok?{ok:true,data:null}:result;
}
