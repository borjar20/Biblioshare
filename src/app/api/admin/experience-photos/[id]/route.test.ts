import {beforeEach,it,expect,vi} from "vitest";
const h=vi.hoisted(()=>({role:vi.fn(),rpc:vi.fn(),download:vi.fn()}));vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/roles",()=>({getCurrentUserRole:h.role}));vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:h.rpc})}));vi.mock("@/lib/supabase/service-role",()=>({createServiceRoleClient:()=>({storage:{from:()=>({download:h.download})}})}));
import {GET} from "./route";
const id="bc6e2524-c7dd-4b1e-a2b3-ea1ab4fbd020",request=()=>GET(new Request("http://localhost/api/admin/experience-photos/"+id),{params:Promise.resolve({id})});
beforeEach(()=>{vi.clearAllMocks();h.role.mockResolvedValue("admin");h.rpc.mockResolvedValue({data:{storage_path:"root/author/photo.png",mime_type:"image/png"},error:null});h.download.mockResolvedValue({data:new Blob(["photo"]),error:null});});
it("denies ordinary accounts before evidence or bytes lookup",async()=>{h.role.mockResolvedValue("user");expect((await request()).status).toBe(403);expect(h.rpc).not.toHaveBeenCalled();expect(h.download).not.toHaveBeenCalled();});
it("serves retained evidence only after the admin RPC authorizes it",async()=>{const response=await request();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("content-type")).toBe("image/png");expect(h.rpc).toHaveBeenCalledWith("admin_moderation_photo",{p_photo_id:id});expect(h.download).toHaveBeenCalledWith("root/author/photo.png");});
it("fails closed if evidence authorization fails",async()=>{h.rpc.mockResolvedValue({data:null,error:{message:"denied"}});expect((await request()).status).toBe(404);expect(h.download).not.toHaveBeenCalled();});
