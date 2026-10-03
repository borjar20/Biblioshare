"use server";
import type {ExperienceResult} from "./types";
import {createClient} from "@/lib/supabase/server";
import {revalidateExperiences} from "@/lib/reactivity/revalidate";
import {uploadExperienceImage,removeExperienceImage} from "@/lib/storage/experience-photos";
import {isExperienceId} from "./validation";
import {experienceMutation,experienceSqlError} from "./mutation";
type Reservation={id:string;path:string};
async function validSignature(file:File):Promise<boolean> {
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(file.type==="image/png") return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
  if(file.type==="image/jpeg") return bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
  if(file.type==="image/webp") return bytes.length>=16&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP"&&["VP8 ","VP8L","VP8X"].includes(String.fromCharCode(...bytes.slice(12,16)))&&new DataView(bytes.buffer).getUint32(4,true)===bytes.length-8;
  return false;
}
export async function uploadExperiencePhoto(id:string,moment:string|null,data:FormData):Promise<ExperienceResult<{id:string;url:string}>> {
  let reserved:Reservation|null=null;
  let client:Awaited<ReturnType<typeof createClient>>|null=null;
  async function compensate() {
    if(!reserved||!client) return;
    try {await client.rpc("experience_cancel_photo",{p_photo_id:reserved.id});} catch { /* Old pending rows remain recoverable by maintenance. */ }
    await removeExperienceImage(reserved.path);
  }
  try {
    client=await createClient();const {data:{user}}=await client.auth.getUser();
    if(!user) return {ok:false,error:"unauthenticated"};
    if(!isExperienceId(id)||(moment!==null&&!isExperienceId(moment))||!(data instanceof FormData)) return {ok:false,error:"invalid"};
    const file=data.get("photo");
    if(!(file instanceof File)||file.size===0) return {ok:false,error:"unsupported_image"};
    if(file.size>2097152) return {ok:false,error:"too_large"};
    if(!await validSignature(file)) return {ok:false,error:"unsupported_image"};
    const reservation=await client.rpc("experience_reserve_photo",{p_id:id,p_moment_id:moment??undefined,p_mime:file.type});
    if(reservation.error) return {ok:false,error:experienceSqlError(reservation.error.code)};
    reserved=reservation.data as Reservation|null;
    if(!reserved?.id||!reserved.path) return {ok:false,error:"unknown"};
    if(!await uploadExperienceImage(reserved.path,file,file.type)) {await compensate();return {ok:false,error:"unknown"};}
    const finished=await client.rpc("experience_finish_photo",{p_photo_id:reserved.id});
    if(finished.error) {await compensate();return {ok:false,error:experienceSqlError(finished.error.code)};}
    revalidateExperiences(id);
    return {ok:true,data:{id:reserved.id,url:`/api/experience-photos/${reserved.id}`}};
  } catch {await compensate();return {ok:false,error:"unknown"};}
}
export async function setPhotoSharing(id:string,enabled:boolean):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(id)&&typeof enabled==="boolean",client=>client.rpc("experience_set_photo_sharing",{p_photo_id:id,p_enabled:enabled}));
  return result.ok ? {ok:true,data:null} : result;
}
export async function setCoverPhoto(id:string,photo:string|null):Promise<ExperienceResult<null>> {
  const result=await experienceMutation(isExperienceId(id)&&(photo===null||isExperienceId(photo)),client=>client.rpc("experience_set_cover",{p_id:id,p_photo_id:photo??undefined}),id);
  return result.ok ? {ok:true,data:null} : result;
}
export async function deletePhoto(id:string):Promise<ExperienceResult<null>> {
  const result=await experienceMutation<{path:string}>(isExperienceId(id),client=>client.rpc("experience_delete_photo",{p_photo_id:id}));
  if(!result.ok) return result;
  await removeExperienceImage(result.data.path);
  return {ok:true,data:null};
}
