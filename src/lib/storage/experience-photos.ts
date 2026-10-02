import "server-only";
import {createServiceRoleClient} from "@/lib/supabase/service-role";
export async function uploadExperienceImage(path:string,blob:Blob,mime:string):Promise<boolean> {
  try {const {error}=await createServiceRoleClient().storage.from("experience-photos").upload(path,blob,{contentType:mime,upsert:false,cacheControl:"0"});return !error;} catch {return false;}
}
/** Metadata deletion queues the path first. Never remove live media or evidence. */
export async function removeExperienceImage(path:string):Promise<boolean> {
  try {
    const client=createServiceRoleClient();
    const queued=await client.rpc("experience_queue_photo_cleanup",{p_path:path});
    if(queued.error) return false;
    const candidate=await client.rpc("experience_photo_cleanup_candidate",{p_path:path});
    if(candidate.error||candidate.data!==true) return false;
    const evidence=await client.rpc("moderation_photo_is_evidence",{p_path:path});
    if(evidence.error||typeof evidence.data!=="boolean") return false;
    if(!evidence.data) {
      const removed=await client.storage.from("experience-photos").remove([path]);
      if(removed.error) return false;
    }
    const ack=await client.rpc("experience_ack_photo_cleanup",{p_path:path});
    return !ack.error;
  } catch {return false;}
}
