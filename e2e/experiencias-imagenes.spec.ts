import {test,expect} from "@playwright/test";
import {clearExperienceFixtures,experienceActor,deleteExperienceActor,experienceRest,experienceClientRest,loginExperienceUser,EXPERIENCE_QA_PREFIX,setExperienceAudience} from "./support/experience-fixtures";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=","base64");
async function upload(page:import("@playwright/test").Page) {
  await page.getByRole("button",{name:"Añadir foto",exact:true}).click();
  const sheet=page.getByRole("dialog",{name:"Añadir foto",exact:true});
  await sheet.getByLabel("Imagen",{exact:true}).setInputFiles({name:"recuerdo.png",mimeType:"image/png",buffer:png});
  await expect(sheet.getByRole("img",{name:"Vista previa de la foto elegida",exact:true})).toBeVisible();
  await sheet.getByRole("button",{name:"Subir foto",exact:true}).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test("photo URL honors consent, audience and blocks on every request",async({page,browser},testInfo)=>{
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[],contexts=[] as Awaited<ReturnType<typeof browser.newContext>>[];
  try {
    actors.push(await experienceActor("Organizador de fotos",true));actors.push(await experienceActor("Visitante de fotos",true));
    await clearExperienceFixtures(actors[0].id);await loginExperienceUser(page,actors[0]);
    await page.goto("/experiencias/nueva");await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Fotos con permiso`);
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;await upload(page);
    await expect.poll(()=>page.getByRole("img",{name:`Foto de ${EXPERIENCE_QA_PREFIX}Fotos con permiso`,exact:true}).evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
    await page.setViewportSize({width:1280,height:900});
    await page.locator("#experience-photos").scrollIntoViewIfNeeded();
    const galleryScreenshot=testInfo.outputPath("galeria-foto-unica-final.png");
    await page.screenshot({path:galleryScreenshot});
    await testInfo.attach("Galería con una foto",{path:galleryScreenshot,contentType:"image/png"});
    const photos=await (await experienceRest(`experience_photos?experience_id=eq.${id}&select=id,status,storage_path`)).json();
    expect(photos).toHaveLength(1);expect(photos[0].status).toBe("ready");
    const url=`/api/experience-photos/${photos[0].id}`,anon=await browser.newContext();contexts.push(anon);
    expect((await anon.request.get(`http://localhost:3000${url}`)).status()).toBe(404);
    const sharing=await setExperienceAudience(page,"profile");
    await sharing.press("Escape");
    expect((await anon.request.get(`http://localhost:3000${url}`)).status()).toBe(404);
    await expect(page.getByLabel("Mostrar esta foto en el perfil",{exact:true})).not.toBeVisible();
    await page.getByRole("button",{name:"Abrir foto completa",exact:true}).click();
    const photoSheet=page.getByRole("dialog",{name:"Abrir foto completa",exact:true});
    await photoSheet.getByLabel("Mostrar esta foto en el perfil",{exact:true}).click();
    await expect(photoSheet.getByLabel("Mostrar esta foto en el perfil",{exact:true})).toBeChecked();
    await expect.poll(async()=> (await anon.request.get(`http://localhost:3000${url}`)).status()).toBe(200);
    const response=await anon.request.get(`http://localhost:3000${url}`);expect(response.headers()["cache-control"]).toBe("private, no-store");expect(response.headers()["content-type"]).toBe("image/png");expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await (await experienceClientRest(`experience_photos?experience_id=eq.${id}&select=author_id,storage_path`)).json()).toEqual([]);
    const projection=await (await experienceClientRest(`rpc/get_experience_visible_photos?p_id=${id}`)).json();expect(projection[0].authorId).toBeNull();expect(JSON.stringify(projection)).not.toContain("storage_path");
    const visitor=await browser.newContext();contexts.push(visitor);await loginExperienceUser(await visitor.newPage(),actors[1]);
    expect((await visitor.request.get(`http://localhost:3000${url}`)).status()).toBe(200);
    await experienceRest("user_blocks",{method:"POST",body:JSON.stringify({blocker_id:actors[0].id,blocked_id:actors[1].id})});
    expect((await visitor.request.get(`http://localhost:3000${url}`)).status()).toBe(404);
    await photoSheet.getByRole("button",{name:"Acciones de la foto",exact:true}).click();await photoSheet.getByRole("menuitem",{name:"Usar como portada",exact:true}).click();
    await expect(photoSheet.getByText("Portada",{exact:true})).toBeVisible();
    await photoSheet.press("Escape");
    const privateSharing=await setExperienceAudience(page,"private");await privateSharing.press("Escape");
    expect((await anon.request.get(`http://localhost:3000${url}`)).status()).toBe(404);
    await page.getByRole("button",{name:"Acciones de la experiencia",exact:true}).click();await page.getByRole("menuitem",{name:"Eliminar experiencia",exact:true}).click();
    await page.getByLabel("Nombre de la experiencia",{exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Fotos con permiso`);await page.getByRole("dialog").getByRole("button",{name:"Eliminar experiencia",exact:true}).click();await expect(page).toHaveURL("/experiencias");
    expect((await page.request.get(url)).status()).toBe(404);
  } finally {for(const context of contexts)await context.close();for(const actor of actors){await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}}
});

test("departed author deletes own photo without reopening the private group",async({page,browser})=>{
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[],contexts=[] as Awaited<ReturnType<typeof browser.newContext>>[];
  try {
    actors.push(await experienceActor("Organizador"));actors.push(await experienceActor("Autor saliente"));
    await clearExperienceFixtures(actors[0].id);
    await loginExperienceUser(page,actors[0]);await page.goto("/experiencias/nueva");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(`${EXPERIENCE_QA_PREFIX}Foto que puedo retirar`);
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    await page.getByRole("button",{name:"Añadir acompañante",exact:true}).click();await page.getByLabel("Usuario de Biblioshare",{exact:true}).fill(actors[1].username);await page.getByRole("button",{name:"Buscar cuenta",exact:true}).click();await page.getByRole("button",{name:"Invitar a Autor saliente",exact:true}).click();
    const context=await browser.newContext();contexts.push(context);const member=await context.newPage();await loginExperienceUser(member,actors[1]);await member.goto("/experiencias");await member.getByRole("button",{name:"Aceptar invitación",exact:true}).click();await expect(member.getByRole("button",{name:"Aceptar invitación",exact:true})).not.toBeVisible();await member.goto(`/experiencia/${id}`);await upload(member);
    await upload(member);
    const photos=await (await experienceRest(`experience_photos?experience_id=eq.${id}&select=id,storage_path`)).json();expect(photos).toHaveLength(2);
    await member.getByRole("button",{name:"Acciones de Autor saliente",exact:true}).click();await member.getByRole("menuitem",{name:"Salir de la experiencia",exact:true}).click();await member.getByRole("dialog").getByRole("button",{name:"Salir de la experiencia",exact:true}).click();await expect(member).toHaveURL("/experiencias");
    expect((await member.request.get(`/experiencia/${id}`)).status()).toBe(404);expect((await member.request.get(`/api/experience-photos/${photos[0].id}`)).status()).toBe(404);
    await expect(member.getByRole("heading",{name:"Fotos fuera de un grupo",exact:true})).not.toBeVisible();
    await member.locator("summary").filter({hasText:"Revisar mis fotos"}).click();
    await expect(member.getByRole("heading",{name:"Fotos fuera de un grupo",exact:true})).toBeVisible();
    const ownPreview=member.locator(`img[src="/api/experience-photos/${photos[0].id}/own"]`);
    await expect(ownPreview).toBeVisible();await expect.poll(()=>ownPreview.evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
    expect((await member.request.get(`/api/experience-photos/${photos[0].id}/own`)).status()).toBe(200);
    expect((await page.request.get(`/api/experience-photos/${photos[0].id}/own`)).status()).toBe(404);
    await ownPreview.locator("..").getByRole("button",{name:"Acciones de la foto",exact:true}).click();await member.getByRole("menuitem",{name:"Eliminar foto",exact:true}).click();
    await expect(member.getByRole("dialog").locator(`img[src="/api/experience-photos/${photos[0].id}/own"]`)).toBeVisible();
    await member.getByRole("dialog").getByRole("button",{name:"Eliminar foto",exact:true}).click();
    await expect(member.getByRole("dialog")).not.toBeVisible();
    await expect(ownPreview).not.toBeVisible();expect(await (await experienceRest(`experience_photos?id=eq.${photos[1].id}&select=id`)).json()).toHaveLength(1);
    await member.getByRole("button",{name:"Acciones de la foto",exact:true}).click();await member.getByRole("menuitem",{name:"Eliminar foto",exact:true}).click();await member.getByRole("dialog").getByRole("button",{name:"Eliminar foto",exact:true}).click();
    await expect(member.getByRole("heading",{name:"Fotos fuera de un grupo",exact:true})).not.toBeVisible();
    expect(await (await experienceRest(`experience_photos?id=eq.${photos[0].id}&select=id`)).json()).toEqual([]);
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const parts=photos[0].storage_path.split("/");
    const stored=await fetch(`${url}/storage/v1/object/list/experience-photos`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({prefix:parts.slice(0,2).join("/"),search:parts[2],limit:1}),signal:AbortSignal.timeout(10000)});expect(stored.ok).toBe(true);expect(await stored.json()).toEqual([]);
  } finally {for(const context of contexts)await context.close();for(const actor of actors){await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}}
});
