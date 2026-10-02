import "server-only";
import {createClient} from "@/lib/supabase/server";
import {createServiceRoleClient} from "@/lib/supabase/service-role";
import {isExperienceId} from "@/lib/experiences/validation";
export const PRIVATE_PHOTO_HEADERS={"Cache-Control":"private, no-store",Vary:"Cookie, Authorization","X-Content-Type-Options":"nosniff"};
export async function serveExperiencePhoto(id:string):Promise<Response> {
  return servePermittedPhoto(id,"experience_can_read_photo");
}
export async function serveExperienceOwnPhoto(id:string):Promise<Response> {
  return servePermittedPhoto(id,"experience_can_preview_own_photo");
}
async function servePermittedPhoto(id:string,permissionRpc:"experience_can_read_photo"|"experience_can_preview_own_photo"):Promise<Response> {
  const missing=()=>new Response(null,{status:404,headers:PRIVATE_PHOTO_HEADERS});
  if(!isExperienceId(id)) return missing();
  try {
    const session=await createClient(),permission=await session.rpc(permissionRpc,{p_photo_id:id});
    if(permission.error||permission.data!==true) return missing();
    const service=createServiceRoleClient();
    const {data:photo,error}=await service.from("experience_photos").select("storage_path,mime_type,status").eq("id",id).maybeSingle();
    if(error||photo?.status!=="ready"||!["image/jpeg","image/png","image/webp"].includes(photo.mime_type)) return missing();
    return serveAuthorizedExperiencePhoto(photo.storage_path,photo.mime_type);
  } catch {return missing();}
}
export async function serveAuthorizedExperiencePhoto(path:string,mime:string):Promise<Response> {
  const missing=()=>new Response(null,{status:404,headers:PRIVATE_PHOTO_HEADERS});
  if(!["image/jpeg","image/png","image/webp"].includes(mime))return missing();
  try {
    const {data:bytes,error}=await createServiceRoleClient().storage.from("experience-photos").download(path);
    if(error||!bytes||bytes.size===0||bytes.size>2097152)return missing();
    return new Response(bytes,{headers:{...PRIVATE_PHOTO_HEADERS,"Content-Type":mime,"Content-Length":String(bytes.size)}});
  } catch {return missing();}
}
