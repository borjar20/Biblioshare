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
