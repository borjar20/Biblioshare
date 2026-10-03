import {test,expect} from "@playwright/test";
import {experienceActor,deleteExperienceActor,experienceRest,clearExperienceFixtures,loginExperienceUser,EXPERIENCE_QA_PREFIX} from "./support/experience-fixtures";
for(const direction of ["creator","companion"] as const) test(`withdrawal stays reachable after ${direction} blocks`,async({page})=>{
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[];
  try {
    actors.push(await experienceActor("Organizador de retirada",true));actors.push(await experienceActor("Acompañante que retira",true));
    await clearExperienceFixtures(actors[0].id);
    const root=crypto.randomUUID(),person=crypto.randomUUID(),title=`${EXPERIENCE_QA_PREFIX}Consentimiento ${direction}`;
    await experienceRest("experiences",{method:"POST",body:JSON.stringify({id:root,creator_id:actors[0].id,title,audience:"profile"})});
    await experienceRest("experience_participants",{method:"POST",body:JSON.stringify([{id:crypto.randomUUID(),experience_id:root,user_id:actors[0].id,invitation_state:"accepted",share_identity:false},{id:person,experience_id:root,user_id:actors[1].id,invitation_state:"accepted",share_identity:true}])});
    await experienceRest("user_blocks",{method:"POST",body:JSON.stringify({blocker_id:actors[direction==="creator"?0:1].id,blocked_id:actors[direction==="creator"?1:0].id})});
    await loginExperienceUser(page,actors[1]);expect((await page.goto(`/experiencia/${root}`))?.status()).toBe(404);
    await page.goto("/experiencias");await expect(page.getByRole("heading",{name:"Participaciones sin acceso",exact:true})).not.toBeVisible();
    await page.locator("summary").filter({hasText:"Revisar mis participaciones"}).click();
    await expect(page.getByRole("heading",{name:"Participaciones sin acceso",exact:true})).toBeVisible();await expect(page.getByText(title,{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Retirar mi participación pública",exact:true}).click();await expect(page.getByRole("button",{name:"Retirar mi participación pública",exact:true})).not.toBeVisible();
    const rows=await (await experienceRest(`experience_participants?id=eq.${person}&select=share_identity`)).json();expect(rows).toEqual([{share_identity:false}]);
    await page.getByRole("button",{name:"Salir de la experiencia",exact:true}).click();await page.getByRole("dialog").getByRole("button",{name:"Salir de la experiencia",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Participaciones sin acceso",exact:true})).not.toBeVisible();expect(await (await experienceRest(`experience_participants?id=eq.${person}&select=id`)).json()).toEqual([]);
    expect((await page.request.get(`/experiencia/${root}`)).status()).toBe(404);
  } finally {for(const actor of actors){await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}}
});
