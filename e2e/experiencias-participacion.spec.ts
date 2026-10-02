import {test,expect} from "@playwright/test";
import {clearExperienceFixtures,experienceOwner,experienceActor,deleteExperienceActor,experienceRest,experienceClientRest,loginExperienceUser,EXPERIENCE_QA_PREFIX} from "./support/experience-fixtures";
test("three people accept, confirm their own moments, and lose access when removed",async({page,browser})=>{
  const owner=await experienceOwner(),actors=[] as Awaited<ReturnType<typeof experienceActor>>[];
  const contexts=[] as Awaited<ReturnType<typeof browser.newContext>>[];
  try {
    await clearExperienceFixtures(owner);
    for(const name of ["Ana del museo","Luis del paseo"]) actors.push(await experienceActor(name));
    await loginExperienceUser(page);
    await page.goto("/experiencias/nueva");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Escapada compartida`);
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    await page.getByRole("link",{name:"Editar experiencia",exact:true}).click();
    await page.getByRole("button",{name:"Añadir momento",exact:true}).click();
    await page.getByRole("textbox",{name:"Nombre del momento *",exact:true}).fill("Museo de la escapada");
    await page.getByRole("button",{name:"Guardar momento",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Museo de la escapada",exact:true})).toBeVisible();
    await page.goto(`/experiencia/${id}`);
    for(const actor of actors) {
      await page.getByRole("button",{name:"Añadir acompañante",exact:true}).click();
      await page.getByLabel("Usuario de Biblioshare",{exact:true}).fill(actor.username);
      await page.getByRole("button",{name:"Buscar cuenta",exact:true}).click();
      await page.getByRole("button",{name:`Invitar a ${actor.name}`,exact:true}).click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
    const notices=await (await experienceRest(`notifications?target_type=eq.experience&target_id=eq.${id}&type=eq.experience_invited&select=user_id,context`)).json();
    expect(notices).toHaveLength(2);
    expect(notices.every((n:{context:unknown})=>n.context===null)).toBe(true);
    const members=[] as import("@playwright/test").Page[];
    for(const actor of actors) {
      const context=await browser.newContext();contexts.push(context);
      const member=await context.newPage();members.push(member);
      await loginExperienceUser(member,actor);await member.goto("/experiencias");
      await expect(member.getByRole("heading",{name:"Invitaciones",exact:true})).toBeVisible();
      const denied=await member.goto(`/experiencia/${id}`);expect(denied?.status()).toBe(404);
      await member.goto("/experiencias");await member.getByRole("button",{name:"Aceptar invitación",exact:true}).click();
      await expect(member.getByRole("button",{name:"Aceptar invitación",exact:true})).not.toBeVisible();
      await member.goto(`/experiencia/${id}`);
    }
    await members[0].getByLabel("Tu presencia en Museo de la escapada",{exact:true}).selectOption("skipped");
    await members[0].getByRole("button",{name:`Elegir ${EXPERIENCE_QA_PREFIX}Escapada compartida como favorito`,exact:true}).click();
    await page.goto(`/experiencia/${id}/editar`);await page.getByLabel("Estado",{exact:true}).selectOption("lived");
    await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(page).toHaveURL(`/experiencia/${id}`);
    const rows=await (await experienceRest(`experience_moment_participants?experience_id=eq.${id}&select=attendance_state,experience_participants!inner(user_id)`)).json() as {attendance_state:string;experience_participants:{user_id:string}}[];
    expect(rows.filter(r=>r.experience_participants.user_id===actors[1].id).every(r=>r.attendance_state==="planned")).toBe(true);
    expect(rows.filter(r=>r.experience_participants.user_id===actors[0].id).map(r=>r.attendance_state)).toContain("skipped");
    await expect(page.getByText(actors[0].name,{exact:true}).first()).toBeVisible();
    await page.getByRole("button",{name:`Acciones de ${actors[0].name}`,exact:true}).click();
    await page.getByRole("menuitem",{name:"Quitar acompañante",exact:true}).click();
    await page.getByRole("dialog").getByRole("button",{name:"Quitar acompañante",exact:true}).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect((await members[0].goto(`/experiencia/${id}`))?.status()).toBe(404);
  } finally {
    for(const context of contexts) await context.close();
    await clearExperienceFixtures(owner);
    for(const actor of actors) await deleteExperienceActor(actor);
  }
});
test("direct REST joins expose only consented people with visible profiles",async()=>{
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[];
  const root=crypto.randomUUID(),moment=crypto.randomUUID(),guest=crypto.randomUUID();
  try {
    actors.push(await experienceActor("Organizador público",true));
    actors.push(await experienceActor("Acompañante privado",false));
    actors.push(await experienceActor("Acompañante público",true));
    await experienceRest("experiences",{method:"POST",body:JSON.stringify({id:root,creator_id:actors[0].id,title:`${EXPERIENCE_QA_PREFIX}Permisos REST`,audience:"profile"})});
    await experienceRest("experience_moments",{method:"POST",body:JSON.stringify({id:moment,experience_id:root,title:"Museo",kind:"museum",position:0})});
    const people=actors.map((a,index)=>({id:crypto.randomUUID(),experience_id:root,user_id:a.id,guest_name:null,invitation_state:"accepted",share_identity:index>0}));
    await experienceRest("experience_participants",{method:"POST",body:JSON.stringify([...people,{id:guest,experience_id:root,user_id:null,guest_name:"Etiqueta secreta",invitation_state:"accepted",share_identity:false}])});
    await experienceRest("experience_moment_participants",{method:"POST",body:JSON.stringify(people.map(p=>({experience_id:root,moment_id:moment,participant_id:p.id,attendance_state:"attended"})))});
    await experienceRest("experience_favorites",{method:"POST",body:JSON.stringify(actors.slice(1).map(a=>({experience_id:root,moment_id:moment,user_id:a.id})))});
    const own=await (await experienceClientRest(`experience_participants?experience_id=eq.${root}&select=user_id,guest_name`,actors[1])).json();
    expect(own).toHaveLength(4);
    const publicPeople=await (await experienceClientRest(`experience_participants?experience_id=eq.${root}&select=user_id,guest_name,experience_moment_participants(attendance_state)`)).json();
    expect(publicPeople).toEqual([{user_id:actors[2].id,guest_name:null,experience_moment_participants:[{attendance_state:"attended"}]}]);
    const favorites=await (await experienceClientRest(`experience_favorites?experience_id=eq.${root}&select=user_id`)).json();
    expect(favorites).toEqual([{user_id:actors[2].id}]);
    await experienceRest(`experience_participants?id=eq.${people[2].id}`,{method:"PATCH",body:JSON.stringify({share_identity:false})});
    expect(await (await experienceClientRest(`experience_favorites?experience_id=eq.${root}&select=user_id`)).json()).toEqual([]);
  } finally {
    await experienceRest(`experiences?id=eq.${root}`,{method:"DELETE"});
    for(const actor of actors) await deleteExperienceActor(actor);
  }
});
