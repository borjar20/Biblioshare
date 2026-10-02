import {getCurrentUserRole} from "@/lib/auth/roles";
import {createClient} from "@/lib/supabase/server";
import {isExperienceId} from "@/lib/experiences/validation";
import {PRIVATE_PHOTO_HEADERS,serveAuthorizedExperiencePhoto} from "@/lib/storage/experience-photo-response";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const fail=(status:number)=>new Response(null,{status,headers:PRIVATE_PHOTO_HEADERS});
  if(await getCurrentUserRole()!=="admin")return fail(403);
  const {id}=await params;if(!isExperienceId(id))return fail(404);
  try {
    const client=await createClient(),{data,error}=await client.rpc("admin_moderation_photo",{p_photo_id:id});
    if(error||!data||typeof data!=="object"||Array.isArray(data)||typeof data.storage_path!=="string"||typeof data.mime_type!=="string")return fail(404);
    return serveAuthorizedExperiencePhoto(data.storage_path,data.mime_type);
  } catch {return fail(404);}
}
