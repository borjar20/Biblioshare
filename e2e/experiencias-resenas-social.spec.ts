import {test,expect} from "@playwright/test";
import {EXPERIENCE_QA_PREFIX,experienceActor,deleteExperienceActor,clearExperienceFixtures,loginExperienceUser,experienceRest,setExperienceAudience} from "./support/experience-fixtures";
// Una reseña publicada en la actividad llega al feed y al perfil de quien no estuvo en el
// grupo; retirar «Compartir fuera del grupo» revoca la publicación (404 en su URL).
test.use({actionTimeout:20_000});
const title=`${EXPERIENCE_QA_PREFIX}Concierto reseñado`,body="Sonó mejor que en el disco";
test("a published review reaches outsiders and disappears when sharing is withdrawn",async({page,browser})=>{
  test.setTimeout(240_000);
  const actors=[] as Awaited<ReturnType<typeof experienceActor>>[],contexts=[] as Awaited<ReturnType<typeof browser.newContext>>[];
  try {
    actors.push(await experienceActor("Organizadora del concierto",true));actors.push(await experienceActor("Visitante del concierto",true));
    const [organizer,outsider]=actors;
    await clearExperienceFixtures(organizer.id);
    // The outsider follows the organizer, so the review post reaches their home feed.
    await experienceRest("follows",{method:"POST",body:JSON.stringify({follower_id:outsider.id,followee_id:organizer.id,status:"accepted"})});
    await loginExperienceUser(page,organizer);
    await page.goto("/experiencias/nueva?kind=concert");
    await page.getByRole("textbox",{name:"Nombre *",exact:true}).fill(title);
    await page.getByRole("button",{name:"Guardar experiencia",exact:true}).click();
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id=page.url().split("/").at(-1)!;
    const sharing=await setExperienceAudience(page,"profile");
    await sharing.press("Escape");await expect(sharing).not.toBeVisible();
    await page.getByRole("button",{name:"Lo vivimos",exact:true}).click();
    const lived=page.getByRole("dialog",{name:"¿A qué fuiste?",exact:true});
    await lived.getByRole("button",{name:"Guardar",exact:true}).click();
    await lived.getByRole("link",{name:"Reseñar ahora",exact:true}).click();
    await expect(lived).not.toBeVisible();
    await page.getByRole("button",{name:"Reseñar",exact:true}).click();
    const sheet=page.getByRole("dialog",{name:/^Tu reseña de /});
    await sheet.getByRole("button",{name:"9/10",exact:true}).click();
    await sheet.getByLabel("Qué tal fue").fill(body);
    await sheet.getByRole("button",{name:"Guardar reseña",exact:true}).click();
    await expect(sheet).not.toBeVisible();
    await expect(page.getByText(body,{exact:true})).toBeVisible();
    // Outside the group the review needs the author's public identity as well.
    await page.locator("summary",{hasText:"Tu participación"}).click();
    const identity=page.getByRole("checkbox",{name:"Mostrar mi participación en el perfil",exact:true});
    // Controlled checkboxes: they turn on once the refreshed projection agrees.
    await identity.click();await expect(identity).toBeChecked();
    const share=page.getByRole("checkbox",{name:"Compartir fuera del grupo",exact:true});
    await share.click();await expect(share).toBeChecked();
    await page.getByRole("button",{name:"Publicar en tu actividad",exact:true}).click();
    await expect(page.getByRole("button",{name:"Quitar de tu actividad",exact:true})).toBeVisible();
    const posts=await (await experienceRest(`posts?anchor_type=eq.experience&anchor_id=eq.${id}&kind=eq.experience_review&select=id`)).json() as {id:string}[];
    expect(posts).toHaveLength(1);

    const context=await browser.newContext();contexts.push(context);
    const viewer=await context.newPage();await loginExperienceUser(viewer,outsider);
    await viewer.goto("/");
    const card=viewer.getByRole("article").filter({hasText:body});
    await expect(card).toBeVisible();
    await expect(card.getByText(/^reseñó /)).toBeVisible();
    const href=await card.locator('a[href^="/post/"]').first().getAttribute("href");
    expect(href).toBe(`/post/${posts[0].id}`);
    await viewer.goto(`/u/${organizer.username}?tab=experiencias`);
    await expect(viewer.getByText(body,{exact:true})).toBeVisible();

    await share.click();await expect(share).not.toBeChecked();
    await expect(page.getByRole("button",{name:"Quitar de tu actividad",exact:true})).toHaveCount(0);
    expect(await (await experienceRest(`posts?id=eq.${posts[0].id}&select=id`)).json()).toEqual([]);
    // Ideally a 404 status, but under Partial Prerender a notFound() in the body serves the
    // shell with 200 (trap #514, see e2e/posts.spec.ts): the revocation is checked by content.
    const revoked=await viewer.goto(href!);
    expect([200,404]).toContain(revoked?.status());
    await expect(viewer.getByRole("heading",{name:/404|no encontramos|no existe|no encontrada/i}).first()).toBeVisible();
    await expect(viewer.locator("article")).toHaveCount(0);
    await expect(viewer.getByText(body,{exact:true})).toHaveCount(0);
    await viewer.goto("/");
    await expect(viewer.getByText(body,{exact:true})).toHaveCount(0);
    await viewer.goto(`/u/${organizer.username}?tab=experiencias`);
    await expect(viewer.getByRole("link",{name:new RegExp("Concierto reseñado")})).toBeVisible();
    await expect(viewer.getByText(body,{exact:true})).toHaveCount(0);
  } finally {for(const context of contexts)await context.close();for(const actor of actors){await clearExperienceFixtures(actor.id);await deleteExperienceActor(actor);}}
});
