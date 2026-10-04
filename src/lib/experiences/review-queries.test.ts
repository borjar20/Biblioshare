import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
import {ratingsByRoot,mapReviews,parseExperienceFilters} from "./queries";
const root="de9eb8c7-08f5-464d-8c5b-76f5b58bfce4",moment="de9eb8c7-08f5-464d-8c5b-76f5b58bfce5",me="de9eb8c7-08f5-464d-8c5b-76f5b58bfce8";
describe("ratingsByRoot",()=>{
  it("splits experience and moment rows",()=>{
    const map=ratingsByRoot([{experience_id:root,moment_id:null,avg_rating:8.5,rating_count:2},{experience_id:root,moment_id:moment,avg_rating:9,rating_count:1}]);
    expect(map.get(root)).toEqual({rating:{avg:8.5,count:2},momentRatings:{[moment]:{avg:9,count:1}}});
  });
});
describe("mapReviews",()=>{
  it("attaches identity, authorship and own publication",()=>{
    const reviews=mapReviews([{id:"r1",moment_id:moment,author_id:me,rating:7,body:"Bien",share_with_profile:true,created_at:"2026-10-04T10:00:00Z",updated_at:"2026-10-04T10:00:00Z"}],new Map([[me,{username:"yo",display_name:"Yo",avatar_url:null}]]),new Map([["r1","p1"]]),me);
    expect(reviews[0]).toMatchObject({id:"r1",momentId:moment,authorName:"Yo",authorUsername:"yo",isAuthor:true,publicationId:"p1",rating:7});
  });
});
describe("parseExperienceFilters",()=>{
  it("reads sort and offset safely",()=>{
    expect(parseExperienceFilters({sort:"rating",offset:"20"})).toMatchObject({sort:"rating",offset:20});
    expect(parseExperienceFilters({sort:"bogus",offset:"-1"})).toMatchObject({sort:"recent",offset:0});
  });
});
