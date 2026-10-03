import {serveExperienceOwnPhoto} from "@/lib/storage/experience-photo-response";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  return serveExperienceOwnPhoto((await params).id);
}
