import { test, expect, type Page } from "@playwright/test";

// Geometría del calendario en MÓVIL (390 px). Los dos fallos que cubre se
// reportaron mirando la app, no un test: con varias marcas el mismo día los
// glifos se derramaban por debajo de la casilla, y el chip de clase de la
// agenda («LANZAMIENTO · PELÍCULA») desbordaba la tarjeta y se metía debajo del
// separador del botón de campana.
//
// Ninguna aserción mira colores ni texto: miran RECTÁNGULOS. Es lo único que
// distingue un layout roto de uno correcto cuando el contenido es el mismo.
//
// Club DESECHABLE por ejecución (patrón de club-evento-seguimiento.spec.ts): un
// día con cuatro eventos no puede quedarse sembrado en `test-public-club`, que
// comparten otras sesiones y otros specs.

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Mes lejano y fijo: el test no depende de la fecha en que se ejecute ni se
// rompe al cruzar un fin de mes. 16:00Z = 18:00 en Europe/Madrid (CEST).
const MES = "2027-09";
const INSTANTE = "2027-09-15T16:00:00.000Z";

function adminHeaders() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}
function adminJson() {
  return { ...adminHeaders(), "Content-Type": "application/json" };
}

async function devtestId(): Promise<string> {
  const rows = (await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
      { headers: adminHeaders() },
    )
  ).json()) as { user_id: string }[];
  if (!rows[0]) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return rows[0].user_id;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function crearClub(ts: number, owner: string): Promise<{ id: string; slug: string }> {
  const slug = `e2e-calmovil-${ts}`;
  const [club] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name: `E2E Cal Móvil ${ts}`,
        visibility: "private",
        owner_id: owner,
      }),
    })
  ).json()) as { id: string }[];
  if (!club?.id) throw new Error("no se pudo crear el club desechable");

  // Insertar por REST se salta create_club(), que es quien normalmente crea
  // esta fila. Sin ella devtest no es miembro activo: la agenda no pintaría el
  // control de campana y el caso peor del chip (el que desbordaba) no se
  // llegaría a montar.
  const miembro = await fetch(`${SUPABASE_URL}/rest/v1/club_members`, {
    method: "POST",
    headers: adminJson(),
    body: JSON.stringify({ club_id: club.id, user_id: owner, role: "owner", status: "active" }),
  });
  if (!miembro.ok) throw new Error(`no se pudo añadir a devtest al club: ${await miembro.text()}`);

  return { id: club.id, slug };
}

/**
 * Evento por REST, no por la UI: aquí se prueba GEOMETRÍA, y el asistente de
 * creación no permite sembrar cuatro marcas en el mismo día sin convertir el
 * test en un guion de formulario de cien líneas.
 *
 * `starts_on` no se pasa: lo deriva la base a partir de `starts_at` y la zona.
 */
async function crearEvento(
  clubId: string,
  owner: string,
  campos: { title: string; eventType: string; medium?: string },
): Promise<string> {
  const [row] = (await (
    await fetch(`${SUPABASE_URL}/rest/v1/club_activities`, {
      method: "POST",
      headers: { ...adminJson(), Prefer: "return=representation" },
      body: JSON.stringify({
        club_id: clubId,
        kind: "evento",
        title: campos.title,
        status: "active",
        created_by: owner,
        starts_at: INSTANTE,
        event_timezone: "Europe/Madrid",
        modality: "presencial",
        event_state: "programado",
        event_type: campos.eventType,
        config: campos.medium
          ? { item: { itemType: campos.medium, itemId: "e2e-fake-item" } }
          : {},
      }),
    })
  ).json()) as { id: string }[];
  if (!row?.id) throw new Error(`no se pudo crear el evento ${campos.title}`);
  return row.id;
}

test("calendario móvil: ni la celda ni el chip de la agenda desbordan su caja", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });

  const ts = Date.now();
  let clubId: string | null = null;

  try {
    const owner = await devtestId();
    const club = await crearClub(ts, owner);
    clubId = club.id;

    // Cuatro marcas EL MISMO DÍA: es el caso que rompía. Tres caben como
    // glifos (MAX_CHIPS) y la cuarta se convierte en el «+1», así que la fila
    // de la celda lleva tres iconos, la campana y el contador -- justo lo que
    // envolvía a dos líneas y se salía por debajo del borde.
    //
    // Y son LANZAMIENTOS de película porque su etiqueta («LANZAMIENTO ·
    // PELÍCULA») es la más ancha que produce `markLabel`: con un «ENCUENTRO»
    // el chip cabe de sobra y el test pasaría sin probar nada.
    await crearEvento(clubId, owner, {
      title: `Estreno seguido ${ts}`,
      eventType: "lanzamiento",
      medium: "movie",
    });
    await crearEvento(clubId, owner, {
      title: `Estreno dos ${ts}`,
      eventType: "lanzamiento",
      medium: "movie",
    });
    await crearEvento(clubId, owner, {
      title: `Estreno tres ${ts}`,
      eventType: "lanzamiento",
      medium: "movie",
    });
    await crearEvento(clubId, owner, {
      title: `Estreno cuatro ${ts}`,
      eventType: "lanzamiento",
      medium: "movie",
    });

    await login(page);
    await page.goto(`/club/${club.slug}/calendario?mes=${MES}`);

    // Positivos primero. Sin esto, unas aserciones de geometría sobre una
    // página vacía saldrían verdes sin haber medido nada.
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");
    // `filter({ visible: true })`: el título se pinta DOS veces en el DOM -- el
    // chip de escritorio de la celda existe siempre y solo se oculta con `lg`,
    // así que un `.first()` a secas caza esa copia oculta y espera para siempre.
    await expect(
      page.getByText(`Estreno seguido ${ts}`).filter({ visible: true }).first(),
    ).toBeVisible();
    // Mismo motivo que arriba: el contador de marcas escondidas se pinta en la
    // celda de móvil Y en la de escritorio, y solo una está visible.
    await expect(
      page.getByRole("grid").getByText("+1").filter({ visible: true }).first(),
    ).toBeVisible();

    // Seguir uno es parte del caso peor, no un extra: un evento seguido añade
    // la campana a la celda, y en la agenda es la fila que lleva a la vez el
    // chip y el control de campana de la derecha -- los dos que se pisaban.
    //
    // Se sigue por la UI, no por REST: insertar en `club_event_followers` con
    // service-role choca con un trigger que vive en el esquema `private`
    // ("permission denied for schema private"), así que ese camino solo existe
    // a través de la RPC. Comprobado ejecutándolo, no supuesto.
    // El nombre accesible se ancla ENTERO (`^...$`): el botón de la celda del
    // mes también lleva el título dentro de su nombre (el resumen `sr-only` de
    // sus marcas), así que una expresión suelta casaría con los dos.
    // La campana abre la hoja de aviso y es la ELECCIÓN la que sigue el evento.
    // Se cierra con Escape antes de seguir: si se quedara abierta, la aserción 6
    // (que mide `dialog[open]`) mediría esta hoja en vez de la del día.
    await page
      .getByRole("button", {
        name: new RegExp(`^Seguir evento y elegir aviso: Estreno seguido ${ts}$`),
      })
      .click();
    await page.getByRole("radio", { name: "1 semana antes" }).check();
    await page.keyboard.press("Escape");

    // Recarga: el estado optimista vive en el toggle, y lo que se va a medir es
    // lo que pinta el SERVIDOR (la campana de la celda sale de `followedByViewer`).
    await page.goto(`/club/${club.slug}/calendario?mes=${MES}`);
    await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^Cambiar aviso o dejar de seguir: Estreno seguido ${ts}$`),
      }),
    ).toBeVisible();

    // El rango elegido tiene que haber llegado a la BD, no quedarse en el estado
    // local del componente: se reabre la hoja DESPUÉS de recargar y se comprueba
    // qué opción viene marcada. Sin esto, la hoja podría no guardar nada y el
    // test seguiría en verde -- basta con que la campana cambie de nombre.
    await page
      .getByRole("button", {
        name: new RegExp(`^Cambiar aviso o dejar de seguir: Estreno seguido ${ts}$`),
      })
      .click();
    await expect(page.getByRole("radio", { name: "1 semana antes" })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // ── 1. La celda no derrama ──
    //
    // La casilla NO puede llevar `aspect-ratio`: un grid item con ratio calcula
    // su tamaño mínimo automático desde el ratio (transferred size suggestion) y
    // no desde su contenido, así que la altura queda clavada al ancho y los
    // glifos que envuelven se salen por debajo del borde. Se mide el rectángulo
    // de cada descendiente contra el de su celda: es la única forma de
    // distinguir "creció la fila" de "se salió el contenido", que en una captura
    // se parecen mucho.
    const derrames = await page.evaluate(() => {
      const fuera: string[] = [];
      for (const celda of document.querySelectorAll('[role="gridcell"]')) {
        // El rect se toma del elemento que de verdad DIBUJA la casilla. No es
        // paranoia: un `display:contents` devuelve un rect 0×0, así que medir a
        // ciegas contra el gridcell daría "todo desborda" en cuanto alguien
        // vuelva a envolver la celda -- un rojo que no distingue un layout roto
        // de una estructura distinta. Se comprobó ejecutándolo contra la versión
        // anterior: daba 104 derrames falsos.
        const propio = celda.getBoundingClientRect();
        const base = propio.height > 0 ? celda : celda.firstElementChild;
        if (!base) continue;
        const caja = base.getBoundingClientRect();
        if (caja.height === 0) {
          fuera.push("celda sin caja medible");
          continue;
        }
        for (const hijo of base.querySelectorAll("*")) {
          const r = hijo.getBoundingClientRect();
          // Los textos `sr-only` miden 1×1 y están fuera del flujo: no son
          // desbordes, son la versión accesible del contenido.
          if (r.width <= 1 && r.height <= 1) continue;
          if (r.bottom > caja.bottom + 0.5) {
            fuera.push(
              `${celda.textContent?.trim().slice(0, 18)} +${Math.round(r.bottom - caja.bottom)}px`,
            );
          }
        }
      }
      return fuera;
    });
    expect(
      derrames,
      "ninguna celda del mes debe derramar contenido por debajo de su casilla",
    ).toEqual([]);

    // ── 2. Todas las celdas de una semana miden lo mismo ──
    //
    // ESTA es la aserción que reproduce la captura. El síntoma no era que el
    // contenido se saliera de su propia caja: era que la casilla con marcas
    // crecía y sus seis vecinas NO, porque `aspect-ratio` les fijaba la altura e
    // ignoraba el `stretch` de la fila. Resultado: siete bordes inferiores a
    // alturas distintas, y los glifos del día cruzando la línea que dibujan sus
    // vecinas. Con `min-h` la fila entera crece a la vez, que es lo que se pidió.
    //
    // Se comprobó rompiéndolo a propósito (`git checkout HEAD~1` de
    // month-grid.tsx): sin el arreglo, esto sale en rojo con la diferencia en
    // píxeles. Sin este control, el resto de aserciones de este test pasaban
    // igual con el layout roto.
    const semanasDesiguales = await page.evaluate(() => {
      const celdas = [...document.querySelectorAll('[role="gridcell"]')];
      const rect = (c: Element) => {
        const propio = c.getBoundingClientRect();
        return propio.height > 0
          ? propio
          : (c.firstElementChild?.getBoundingClientRect() ?? propio);
      };
      const malas: string[] = [];
      for (let i = 0; i < celdas.length; i += 7) {
        const bordes = celdas.slice(i, i + 7).map((c) => rect(c).bottom);
        const diferencia = Math.max(...bordes) - Math.min(...bordes);
        // 1 px de holgura: los rects son fraccionarios y el redondeo del
        // navegador no es un layout roto.
        if (diferencia > 1) {
          malas.push(`semana ${i / 7 + 1}: ${Math.round(diferencia)}px de desfase`);
        }
      }
      return malas;
    });
    expect(
      semanasDesiguales,
      "las siete casillas de una semana deben cerrar a la misma altura",
    ).toEqual([]);

    // ── 3. Las líneas verticales de la rejilla siguen ahí ──
    //
    // `border-r ... last:border-r-0` solo dice lo que quiere decir si el
    // gridcell es hijo directo de su fila. Cuando se envolvió en un `contents`,
    // el elemento con la clase pasó a ser hijo ÚNICO de su envoltorio: los siete
    // días cumplían `:last-child` y la rejilla se quedaba sin ninguna línea
    // vertical. Se mide el borde real, no la clase.
    const bordes = await page.evaluate(() => {
      const celdas = [...document.querySelectorAll('[role="gridcell"]')];
      const lee = (i: number) =>
        parseFloat(getComputedStyle(celdas[i]).borderRightWidth) || 0;
      return { primera: lee(0), sexta: lee(5), septima: lee(6) };
    });
    expect(bordes.primera, "el lunes debe llevar su línea vertical").toBeGreaterThan(0);
    expect(bordes.sexta, "el sábado debe llevar su línea vertical").toBeGreaterThan(0);
    expect(bordes.septima, "el domingo cierra la fila: sin línea vertical").toBe(0);

    // ── 4. El chip de la agenda no se sale de su tarjeta ──
    //
    // `w-fit` es `fit-content`, y fit-content NUNCA baja de su min-content: con
    // el chip largo, el icono y la campana, el mínimo superaba el ancho que deja
    // la tarjeta a dos columnas y el sobrante se colaba debajo del separador del
    // botón de seguir. La tarjeta tiene `overflow-hidden`, así que a ojo solo se
    // ve un recorte raro; el rectángulo sí lo dice.
    const desbordesAgenda = await page.evaluate((titulo) => {
      const tarjeta = [...document.querySelectorAll("li")].find((li) =>
        li.textContent?.includes(titulo),
      );
      if (!tarjeta) return ["no se encontró la tarjeta de la agenda"];
      const caja = tarjeta.getBoundingClientRect();
      const fuera: string[] = [];
      for (const hijo of tarjeta.querySelectorAll("*")) {
        const r = hijo.getBoundingClientRect();
        if (r.width <= 1 && r.height <= 1) continue;
        if (r.right > caja.right + 0.5) {
          fuera.push(`${hijo.textContent?.trim().slice(0, 24)} +${Math.round(r.right - caja.right)}px`);
        }
      }
      return fuera;
    }, `Estreno seguido ${ts}`);
    expect(
      desbordesAgenda,
      "el chip de clase no debe salirse de la tarjeta de la agenda",
    ).toEqual([]);

    // ── 5. Y nada de lo anterior empuja la página a lo ancho ──
    const desbordeHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desbordeHorizontal, "el calendario no debe desbordar a lo ancho a 390 px").toBe(0);

    // ── 6. La hoja del día se abre CENTRADA, no pegada arriba ──
    //
    // El UA centra un <dialog> modal con `inset: 0; margin: auto`, y el
    // preflight de Tailwind v4 pone `margin: 0` a todo: sin devolver el
    // `m-auto` a mano, la hoja aparece arriba del todo. Se mide el hueco de
    // arriba contra el de abajo en vez de comprobar la clase, que es lo único
    // que distingue "centrado" de "tiene una clase que suena a centrado".
    await page
      .getByRole("grid")
      .getByRole("button", { name: new RegExp(`Estreno seguido ${ts}`) })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const huecos = await page.evaluate(() => {
      const hoja = document.querySelector("dialog[open]")!.getBoundingClientRect();
      return { arriba: hoja.top, abajo: window.innerHeight - hoja.bottom };
    });
    expect(
      Math.abs(huecos.arriba - huecos.abajo),
      `la hoja del día debe quedar centrada (arriba ${Math.round(huecos.arriba)}px, abajo ${Math.round(huecos.abajo)}px)`,
    ).toBeLessThanOrEqual(2);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // ── 7. Los controles de mes no se mueven al cambiar de mes ──
    //
    // El nombre del mes marcaba el ancho ("Mayo 2027" mide bastante menos que
    // "Septiembre 2027"), así que la flecha de siguiente y el botón «Hoy»
    // saltaban de sitio en cada pulsación: se pulsa dos veces seguidas y el
    // botón ya no está donde estaba el dedo. Se recorren los DOCE meses en vez
    // de un par: así el test no depende de acertar cuál es el nombre más largo,
    // ni de que el locale sea el de hoy.
    const siguiente = page.getByRole("button", { name: /mes siguiente/i });
    const saltos: string[] = [];
    let xReferencia: number | null = null;
    for (let i = 0; i < 12; i++) {
      const mes = (await page.getByTestId("calendar-month").textContent()) ?? "";
      const x = Math.round((await siguiente.boundingBox())!.x);
      if (xReferencia === null) xReferencia = x;
      else if (Math.abs(x - xReferencia) > 1) saltos.push(`${mes}: ${x - xReferencia}px`);
      await siguiente.click();
      await expect(page.getByTestId("calendar-month")).not.toHaveText(mes);
    }
    expect(saltos, "la flecha de mes siguiente no debe moverse al cambiar de mes").toEqual(
      [],
    );

    // ── 8. En pantallas estrechas ninguna PALABRA se parte por la mitad ──
    //
    // A dos columnas la tarjeta deja ~160 px a 360 px de ancho, y de ahí se van
    // 48 en el botón de campana. Con el relleno de antes, «LANZAMIENTO» (~62 px
    // en mono de 9 px) no cabía entera y `break-words` la cortaba: «LANZAMIEN /
    // TO». Ojo: eso NO es un desborde, así que la aserción 4 lo daba por bueno
    // -- el contenido cabía en su caja, partido.
    //
    // Se mide con un Range por palabra: si una palabra devuelve más de un
    // rectángulo de línea, ocupa dos renglones, y eso es exactamente «se partió».
    // Contar líneas del chip entero no valdría: «LANZAMIENTO · PELÍCULA» ocupa
    // dos renglones también cuando parte bien, por el espacio.
    for (const ancho of [360, 320]) {
      await page.setViewportSize({ width: ancho, height: 900 });
      await page.goto(`/club/${club.slug}/calendario?mes=${MES}`);
      await expect(page.getByTestId("calendar-month")).toHaveText("Septiembre 2027");
      await expect(page.getByTestId("agenda-chip-label").first()).toBeVisible();

      const partidas = await page.evaluate(() => {
        const malas: string[] = [];
        for (const el of document.querySelectorAll('[data-testid="agenda-chip-label"]')) {
          const nodo = el.firstChild;
          if (!nodo || nodo.nodeType !== Node.TEXT_NODE) continue;
          const texto = nodo.textContent ?? "";
          const rango = document.createRange();
          for (const m of texto.matchAll(/\S+/g)) {
            rango.setStart(nodo, m.index);
            rango.setEnd(nodo, m.index + m[0].length);
            const renglones = rango.getClientRects().length;
            if (renglones > 1) malas.push(`«${m[0]}» en ${renglones} renglones`);
          }
        }
        return malas;
      });
      expect(
        partidas,
        `a ${ancho} px ninguna palabra del chip debe partirse por la mitad`,
      ).toEqual([]);

      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desborde, `la agenda no debe desbordar a lo ancho a ${ancho} px`).toBe(0);
    }

    // ── 9. El toggle de columnas cambia la agenda Y sobrevive a la recarga ──
    //
    // Se cuentan RENGLONES, no clases: se agrupan las tarjetas por su `top`
    // redondeado. Cuatro tarjetas del mismo día en dos renglones = dos
    // columnas; en cuatro renglones = una. Comprobar la clase del <ul> pasaría
    // igual si la rejilla no llegara a aplicarse.
    const renglonesDeAgenda = () =>
      page.evaluate(() => {
        const tops = new Set<number>();
        for (const el of document.querySelectorAll('[data-testid="agenda-chip-label"]')) {
          const tarjeta = el.closest("li");
          if (tarjeta) tops.add(Math.round(tarjeta.getBoundingClientRect().top));
        }
        return tops.size;
      });

    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(`/club/${club.slug}/calendario?mes=${MES}`);
    await expect(page.getByTestId("agenda-chip-label").first()).toBeVisible();
    expect(await renglonesDeAgenda(), "por defecto la agenda va a dos columnas").toBe(2);

    await page.getByRole("button", { name: "Una columna" }).click();
    await expect
      .poll(renglonesDeAgenda, {
        message: "al elegir una columna las cuatro tarjetas quedan apiladas",
      })
      .toBe(4);

    // La recarga es lo que distingue una preferencia guardada de un `useState`.
    // Se comprueban las DOS mitades por separado: que el valor esté escrito, y
    // que el render acabe obedeciéndolo. Si solo se mirasen los renglones, un
    // fallo al guardar y un fallo al leer darían el mismo mensaje.
    await page.reload();
    await expect(page.getByTestId("agenda-chip-label").first()).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("biblioshare:agenda-columnas")),
      "la preferencia debe quedar escrita en localStorage",
    ).toBe("1");
    // `poll` y no una lectura seca: el valor guardado se aplica DESPUÉS de la
    // hidratación (el HTML del servidor no puede saberlo), así que hay un
    // fotograma a dos columnas. Es el precio documentado en agenda-columns.ts.
    await expect
      .poll(renglonesDeAgenda, {
        message: "la preferencia de columnas debe sobrevivir a la recarga",
      })
      .toBe(4);
    await expect(page.getByRole("button", { name: "Una columna" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Dos columnas" }).click();
    await expect
      .poll(renglonesDeAgenda, { message: "se puede volver a dos columnas" })
      .toBe(2);

    console.log("CALENDARIO MÓVIL OK:", club.slug);
  } finally {
    // fetch nativo, NO el fixture `request`: ese muere con el contexto del
    // navegador, así que un timeout dejaría el club y sus cuatro eventos
    // sembrados. El `on delete cascade` de club_activities y
    // club_event_followers hacia clubs se lo lleva todo.
    if (clubId) {
      await fetch(`${SUPABASE_URL}/rest/v1/clubs?id=eq.${clubId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
  }
});
