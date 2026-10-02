"use server";
import type { CreateExperienceInput, ExperienceResult, SaveMomentInput, UpdateExperienceInput } from "./types";
import { experienceMutation, validRevision } from "./mutation";
import { isExperienceId, validateCreateExperience, validateUpdateExperience, validateMoment } from "./validation";
import {removeExperienceImage} from "@/lib/storage/experience-photos";
export async function createExperience(input:CreateExperienceInput):Promise<ExperienceResult<{id:string}>> {
  const value=validateCreateExperience(input);
  return experienceMutation(Boolean(value),(client)=>client.rpc("experience_create",{p_input:{...value!}}));
}
export async function updateExperience(id:string,revision:number,input:UpdateExperienceInput):Promise<ExperienceResult<{revision:number}>> {
  const value=validateUpdateExperience(input);
  return experienceMutation(isExperienceId(id)&&validRevision(revision)&&Boolean(value),(client)=>client.rpc("experience_update",{p_id:id,p_revision:revision,p_input:{...value!}}),id);
}
export async function saveMoment(id:string,revision:number,input:SaveMomentInput):Promise<ExperienceResult<{id:string;revision:number}>> {
  const value=validateMoment(input);
  return experienceMutation(isExperienceId(id)&&validRevision(revision)&&Boolean(value),(client)=>client.rpc("experience_save_moment",{p_id:id,p_revision:revision,p_input:{...value!}}),id);
}
export async function removeMoment(id:string,revision:number,moment:string):Promise<ExperienceResult<{revision:number}>> {
  return experienceMutation(isExperienceId(id)&&validRevision(revision)&&isExperienceId(moment),(client)=>client.rpc("experience_remove_moment",{p_id:id,p_revision:revision,p_moment_id:moment}),id);
}
export async function reorderMoments(id:string,revision:number,ids:string[]):Promise<ExperienceResult<{revision:number}>> {
  const valid=Array.isArray(ids)&&ids.length>0&&ids.length<=50&&ids.every(isExperienceId)&&new Set(ids).size===ids.length;
  return experienceMutation(isExperienceId(id)&&validRevision(revision)&&valid,(client)=>client.rpc("experience_reorder_moments",{p_id:id,p_revision:revision,p_ordered_ids:ids}),id);
}
export async function deleteExperience(id:string,confirmation:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation<{photos:{path:string}[]}>(isExperienceId(id)&&typeof confirmation==="string"&&confirmation.trim().length>0&&confirmation.length<=160,(client)=>client.rpc("experience_delete",{p_id:id,p_confirmation:confirmation}),id);
  if(result.ok&&result.data?.photos) await Promise.all(result.data.photos.map(photo=>removeExperienceImage(photo.path)));
  return result.ok ? {ok:true,data:null} : result;
}
