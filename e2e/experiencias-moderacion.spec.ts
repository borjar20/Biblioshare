import {test,expect} from "@playwright/test";
import {writeFileSync} from "node:fs";
import {experienceActor,deleteExperienceActor,clearExperienceFixtures,experienceRest,experienceClientRest,loginExperienceUser,EXPERIENCE_QA_PREFIX,setExperienceAudience} from "./support/experience-fixtures";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=","base64");
test.use({actionTimeout:20_000});

// Private audit rows intentionally require the companion DEV cleanup SQL.
// The emitted identifiers contain no credentials and scope cleanup to this run.
test("admin withdraws and restores the root, preserving independent removal and photo evidence",async({page,browser})=>{
  test.setTimeout(300_000);
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[],contexts=[] as Awaited<ReturnType<typeof browser.newContext>>[];
  let root="",post="",photo="",path="";
  async function select(kind:"experience"|"post",id:string){await page.goto(`/admin/contenido?kind=${kind}&q=${id}`);await expect(page.getByTestId("moderation-row")).toHaveCount(1);}
  async function act(action:"Retirar"|"Restaurar"|"Eliminar definitivamente") {
    await page.getByRole("button",{name:"Acciones de moderación",exact:true}).click();await page.getByRole("menuitem",{name:action,exact:true}).click();
    const form=page.getByRole("form",{name:action,exact:true});await form.getByLabel("Motivo de la decisión").fill(`${EXPERIENCE_QA_PREFIX}moderación`);
    if(action==="Eliminar definitivamente"){await form.getByLabel(/Escribe/).fill("ELIMINAR");await form.getByRole("checkbox").check();}
    await form.getByRole("button",{name:action,exact:true}).click();await expect(form).toHaveCount(0);
  }
  try {
    actors.push(await experienceActor("Organizador moderación",true));actors.push(await experienceActor("Visitante moderación",true));actors.push(await experienceActor("Admin experiencias",true));
    await clearExperienceFixtures(actors[0].id);
    await experienceRest(`profiles?user_id=eq.${actors[2].id}`,{method:"PATCH",body:JSON.stringify({role:"admin"})});
    const ownerContext=await browser.newContext(),visitorContext=await browser.newContext();contexts.push(ownerContext,visitorContext);
    const owner=await ownerContext.newPage(),visitor=await visitorContext.newPage();await loginExperienceUser(owner,actors[0]);
    await owner.goto("/experiencias/nueva");await owner.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Recuerdo moderado`);
    await owner.getByRole("button",{name:"Guardar experiencia",exact:true}).click();await expect(owner).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);root=owner.url().split("/").at(-1)!;
    const sharing=await setExperienceAudience(owner,"profile");await sharing.press("Escape");
    await owner.getByRole("button",{name:"Añadir foto",exact:true}).click();await owner.getByLabel("Imagen",{exact:true}).setInputFiles({name:"foto.png",mimeType:"image/png",buffer:png});await owner.getByRole("button",{name:"Subir foto",exact:true}).click();await expect(owner.getByRole("dialog")).not.toBeVisible();
    const [row]=await (await experienceRest(`experience_photos?experience_id=eq.${root}&select=id,storage_path`)).json();photo=row.id;path=row.storage_path;
    await owner.getByRole("button",{name:"Compartir el recuerdo",exact:true}).click();await owner.getByRole("dialog",{name:"Compartir el recuerdo",exact:true}).getByRole("button",{name:"Compartir en el feed",exact:true}).click();
    await expect(owner.getByRole("dialog")).not.toBeVisible();
    await owner.getByRole("button",{name:"Compartir el recuerdo",exact:true}).click();await expect(owner.getByRole("link",{name:"Ver publicación",exact:true})).toBeVisible();
    await owner.getByRole("dialog",{name:"Compartir el recuerdo",exact:true}).press("Escape");
    post=(await (await experienceRest(`posts?anchor_type=eq.experience&anchor_id=eq.${root}&select=id`)).json())[0].id;
    await loginExperienceUser(visitor,actors[1]);await visitor.goto(`/experiencia/${root}`);await visitor.getByRole("button",{name:"Reportar experiencia",exact:true}).click();
    await visitor.getByRole("dialog").getByRole("button",{name:"Enviar reporte",exact:true}).click();await expect(visitor.getByRole("dialog")).not.toBeVisible();
    expect(await (await experienceClientRest(`content_reports?target_id=eq.${root}&select=snapshot`,actors[1])).json()).toEqual([]);
    expect((await visitor.request.get(`/api/admin/experience-photos/${photo}`)).status()).toBe(403);
    await loginExperienceUser(page,actors[2]);await select("post",post);await act("Retirar");await select("experience",root);await act("Retirar");
    expect((await owner.request.get(`/experiencia/${root}`)).status()).toBe(404);expect((await owner.request.get(`/api/experience-photos/${photo}`)).status()).toBe(404);
    expect((await page.request.get(`/api/admin/experience-photos/${photo}`)).status()).toBe(200);
    await select("experience",root);await act("Restaurar");
    expect((await owner.request.get(`/experiencia/${root}`)).status()).toBe(200);expect(await (await experienceClientRest(`posts?id=eq.${post}&select=id`,actors[0])).json()).toEqual([]);
    await select("experience",root);await act("Eliminar definitivamente");await expect(page.getByTestId("moderation-row")).toHaveCount(0);
    expect((await owner.request.get(`/api/experience-photos/${photo}`)).status()).toBe(404);
    expect((await page.request.get(`/api/admin/experience-photos/${photo}`)).status()).toBe(200);
    await page.goto(`/admin/historial?q=${root}`);await page.locator("details").filter({has:page.locator(`img[src='/api/admin/experience-photos/${photo}']`)}).first().locator("summary").click();
    const evidence=page.getByRole("img",{name:"Imagen de evidencia",exact:true}).first();await expect(evidence).toBeVisible();
    await expect.poll(()=>evidence.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
  } finally {
    writeFileSync(".superpowers/experience-moderation-cleanup.json",JSON.stringify({root,post,photo,path,actors:actors.map(a=>a.id)}));
    for(const context of contexts)await context.close();
    // Restore surviving fixtures before ordinary cleanup if a test stopped early.
    if(actors[2]) {
      const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const auth=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:key,"Content-Type":"application/json"},body:JSON.stringify({email:actors[2].email,password:actors[2].password})});
      if(auth.ok){const token=(await auth.json()).access_token;for(const [kind,id] of [["experience",root],["post",post]])if(id)await fetch(`${url}/rest/v1/rpc/admin_moderate_content`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({p_kind:kind,p_id:id,p_action:"restore",p_reason:`${EXPERIENCE_QA_PREFIX}cleanup`,p_confirmation:""})});}
    }
    for(const actor of actors){await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}
  }
});
