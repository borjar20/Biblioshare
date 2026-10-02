import {beforeEach,expect,it,vi} from "vitest";
const h=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:h.rpc})}));
import {getExperienceCompanions,getExperienceOwnMemberships} from "./queries";
beforeEach(()=>vi.clearAllMocks());
it("reads the complete companion list beyond the REST row cap independently of result filters",async()=>{
  const range=vi.fn().mockResolvedValueOnce({data:Array.from({length:1000},(_,i)=>({id:String(i),user_id:null,guest_name:`Guest ${i}`})),error:null}).mockResolvedValueOnce({data:[{id:"older",user_id:"ana",display_name:"Ana"}],error:null});
  const order=vi.fn();order.mockReturnValue({order,range});h.rpc.mockReturnValue({order});
  const people=await getExperienceCompanions();expect(people).toHaveLength(1001);expect(people.at(-1)?.userId).toBe("ana");expect(range.mock.calls).toEqual([[0,999],[1000,1999]]);expect(h.rpc).toHaveBeenCalledWith("get_experience_companions");
});
it("own withdrawn membership summary exposes only its defined management fields",async()=>{
  const order=vi.fn();order.mockReturnValue({order,range:async()=>({data:[{participant_id:"p",experience_id:"root",title:"Remembered title",created_at:"2026-10-02",share_identity:true}],error:null})});h.rpc.mockReturnValue({order});
  expect(await getExperienceOwnMemberships()).toEqual([{participantId:"p",experienceId:"root",title:"Remembered title",createdAt:"2026-10-02",shareIdentity:true}]);
});
it("fails closed when the independent companion lookup fails",async()=>{const order=vi.fn();order.mockReturnValue({order,range:async()=>({data:null,error:new Error("denied")})});h.rpc.mockReturnValue({order});await expect(getExperienceCompanions()).rejects.toThrow("denied");});
