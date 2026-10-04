"use server";
import type {ExperienceResult} from "./types";
import {isReportReason} from "@/lib/social/moderation";
import {isExperienceId} from "./validation";
import {experienceMutation} from "./mutation";
export async function reportExperience(id:string,reason:string,details:string):Promise<ExperienceResult<null>> {
  const valid=isExperienceId(id)&&typeof reason==="string"&&isReportReason(reason)&&typeof details==="string"&&details.length<=2000;
  const result=await experienceMutation(valid,client=>client.rpc("experience_report",{p_id:id,p_reason:reason,p_details:details.trim()}),id);
  return result.ok?{ok:true,data:null}:result;
}
export async function reportReview(id:string,reason:string,details:string):Promise<ExperienceResult<null>> {
  const valid=isExperienceId(id)&&typeof reason==="string"&&isReportReason(reason)&&typeof details==="string"&&details.length<=2000;
  const result=await experienceMutation(valid,async client=>{
    const reported=await client.rpc("experience_report_review",{p_review_id:id,p_reason:reason,p_details:details.trim()});
    // 23505 = this reporter already has a pending report on this review: surface it as "conflict" (UI: already reported), not "invalid".
    if(reported.error?.code==="23505") return {data:null,error:{code:"PT409"}};
    return reported;
  });
  return result.ok?{ok:true,data:null}:result;
}
