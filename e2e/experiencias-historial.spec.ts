import {test,expect} from "@playwright/test";
import {experienceActor,deleteExperienceActor,experienceRest,clearExperienceFixtures,loginExperienceUser,EXPERIENCE_QA_PREFIX} from "./support/experience-fixtures";
test("companion search includes older memories and survives empty filters",async({page})=>{
  const actor=await experienceActor("Historial completo");
  try {
    await clearExperienceFixtures(actor.id);
    const roots=Array.from({length:23},(_,i)=>({id:crypto.randomUUID(),creator_id:actor.id,title:`${EXPERIENCE_QA_PREFIX}Historial ${i}`,created_at:new Date(Date.now()-i*60000).toISOString()}));
    await experienceRest("experiences",{method:"POST",body:JSON.stringify(roots)});
    await experienceRest("experience_moments",{method:"POST",body:JSON.stringify(roots.map(r=>({experience_id:r.id,title:r.title,kind:"walk",position:0})))});
    const ana=crypto.randomUUID(),luis=crypto.randomUUID();
    await experienceRest("experience_participants",{method:"POST",body:JSON.stringify(roots.map(r=>({experience_id:r.id,user_id:actor.id,invitation_state:"accepted"})))});
    await experienceRest("experience_participants",{method:"POST",body:JSON.stringify([{id:ana,experience_id:roots[22].id,guest_name:"Ana del museo",invitation_state:"accepted"},{id:luis,experience_id:roots[0].id,guest_name:"Luis del paseo",invitation_state:"accepted"}])});
    await loginExperienceUser(page,actor);await page.goto("/experiencias");
    await expect(page.getByRole("combobox",{name:"Acompañantes",exact:true})).not.toBeVisible();
    await page.getByRole("button",{name:"Tipo y acompañantes",exact:true}).click();
    const selector=page.getByLabel("Acompañantes",{exact:true});
    await expect(selector.locator(`option[value="${ana}"]`)).toHaveText("Ana del museo");
    await selector.selectOption(ana);await expect(page.getByRole("heading",{name:roots[22].title,exact:true})).toBeVisible();
    await selector.selectOption(luis);await expect(page.getByRole("heading",{name:roots[0].title,exact:true})).toBeVisible();
    await page.getByLabel("Tipo",{exact:true}).selectOption("exhibition");
    await expect(page.getByText("No hay experiencias con estos filtros",{exact:true})).toBeVisible();
    await expect(selector).toHaveValue(luis);await expect(selector.locator(`option[value="${ana}"]`)).toHaveText("Ana del museo");
    await selector.selectOption(ana);await expect(selector).toHaveValue(ana);
  } finally {await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}
});
