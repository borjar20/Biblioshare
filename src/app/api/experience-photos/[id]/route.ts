import {serveExperiencePhoto} from "@/lib/storage/experience-photo-response";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  return serveExperiencePhoto((await params).id);
}
