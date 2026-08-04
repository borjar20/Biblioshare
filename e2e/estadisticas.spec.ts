import { test, expect } from "@playwright/test";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;

// La página de estadísticas completas (plan 05, F5, frame J) es privada y solo
// del dueño: sin sesión, el middleware/redirect la manda a /login.
test("un visitante sin sesión no entra a /estadisticas", async ({ page }) => {
  await page.goto("/estadisticas");
  await page.waitForURL(/\/login/);
  await expect(page).toHaveURL(/\/login/);
});

// El "Ver estadísticas completas ›" de la pestaña Estadísticas lleva a la J, y
// allí aparece el selector de período (plan 05, F5).
test("la pestaña Estadísticas enlaza a /estadisticas con su selector", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto(`/u/${USERNAME}?tab=estadisticas`);
  await page
    .getByRole("link", { name: /estadísticas completas/i })
    .click();

  await page.waitForURL(/\/estadisticas/);
  // El selector de período. Se busca DENTRO de su grupo: «Todo» es también el
  // primer valor del filtro de tipo, y sin acotar el nombre casa con los dos.
  await expect(
    page.getByRole("navigation", { name: "Periodo" }).getByRole("link", { name: "Todo" }),
  ).toBeVisible();
});

// El panel se reorientó de progress_sessions hacia passes (historial real): la
// tarjeta titular es "completadas por año" y "la pila" pasó a foto del momento.
test("la página muestra completadas por año", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");

  await page.goto("/estadisticas");
  // Por el título del panel, no por texto suelto: desde el armazón accesible, el
  // título también aparece en el `<caption>` de la tabla de valores exactos.
  await expect(
    page.getByRole("heading", { name: "Completadas por año" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "La pila", exact: true })).toBeVisible();
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

// Contrato del armazón de paneles (docs/design/paneles-estadisticos.md). Lo que
// se comprueba aquí no es el aspecto: es que el dato sea LEGIBLE sin mirar el
// gráfico, en la cara y en la capa. Cada panel es una región con nombre, declara
// su periodo y su unidad de un vistazo, y al pulsarlo abre los valores exactos.
test("cada panel es una región con nombre, contexto y valores exactos", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  // 1 · Región con nombre: el lector de pantalla puede saltar de panel a panel.
  const horas = page.getByRole("region", { name: "Horas por mes" });
  await expect(horas).toBeVisible();

  // 2 · En la cara: el rótulo dice periodo y unidad en cuatro palabras.
  // El panel es de un AÑO natural entero, así que lo declara: el selector de
  // arriba puede estar en «Semana» y esta tarjeta seguir enseñando doce meses.
  await expect(horas).toContainText(/2026 · año natural · min/i);

  // 3 · La tarjeta ENTERA es el control, y abre una capa con nombre propio.
  await horas.getByRole("button", { name: /ampliar horas por mes/i }).click();
  const capa = page.getByRole("dialog", { name: "Horas por mes" });
  await expect(capa).toBeVisible();

  // 4 · Los valores exactos ya NO son una tabla: los lleva el propio gráfico.
  //     Cada punto medido se nombra con su etiqueta y su valor, así que se
  //     puede recorrer con el tabulador — no solo con el ratón.
  await expect(capa.getByRole("table")).toHaveCount(0);
  const julio = capa.getByRole("img", { name: /^Julio: / });
  await expect(julio).toBeVisible();
  await julio.focus();
  await expect(julio).toBeFocused();

  // Y ahí sí aparece la frase larga de contexto, con la unidad completa.
  await expect(capa).toContainText(/Valores en minutos/i);

  // 5 · Escape cierra y el foco VUELVE al disparador, no al principio del
  //     documento: quien navega con teclado sigue donde estaba.
  await page.keyboard.press("Escape");
  await expect(capa).toBeHidden();
  await expect(
    horas.getByRole("button", { name: /ampliar horas por mes/i }),
  ).toBeFocused();

  // 6 · Un panel que ignora el selector de periodo lo dice ANTES de su cifra,
  //     sin necesidad de ampliarlo.
  await expect(page.getByRole("region", { name: "Estados", exact: true })).toContainText(
    /Ahora mismo · foto del momento/i,
  );

  // 7 · Los paneles que ya son texto (ranking) no repiten tabla ni ampliados:
  //     su lista ordenada ES el dato.
  await page
    .getByRole("region", { name: "Mejor valoradas" })
    .getByRole("button", { name: /ampliar mejor valoradas/i })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Mejor valoradas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Mejor valoradas" }).getByRole("table"),
  ).toHaveCount(0);
});

// La cara del panel tiene que seguir diciendo su dato en TEXTO. Si al compactar
// se quedara solo el dibujo, el rediseño habría deshecho justo lo que este
// sistema arregla.
test("en la cara, el panel sigue teniendo su cifra en texto y no solo el gráfico", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  const horas = page.getByRole("region", { name: "Horas por mes" });
  // Sin abrir nada: el `<dl>` con la cifra que preside la tarjeta.
  const hero = horas.locator("dl").first();
  await expect(hero).toBeVisible();
  await expect(hero).toContainText(/\d/);
});

// La razón de ser de la capa: ampliar un panel no puede mover a sus vecinos.
// Con el `<details>` en línea, abrir la primera tarjeta empujaba a la de al lado
// y el muro se recolocaba bajo el cursor.
test("ampliar un panel no mueve a los demás", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  const vecino = page.getByRole("region", { name: "Estados", exact: true });
  // Posición respecto al DOCUMENTO, no al viewport: Playwright hace scroll para
  // pulsar, y un `boundingBox()` mediría ese scroll como si fuera un salto.
  const donde = () =>
    vecino.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top + window.scrollY),
        left: Math.round(r.left + window.scrollX),
        height: Math.round(r.height),
      };
    });

  const antes = await donde();

  await page
    .getByRole("region", { name: "Horas por mes" })
    .getByRole("button", { name: /ampliar horas por mes/i })
    .click();
  await expect(page.getByRole("dialog", { name: "Horas por mes" })).toBeVisible();

  expect(await donde()).toEqual(antes);
});

// La pestaña Estadísticas del perfil usa el MISMO armazón que /estadisticas
// (issue #423): mismo contrato y, sobre todo, los mismos números.
test("la pestaña del perfil usa el armazón de paneles", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto(`/u/${USERNAME}?tab=estadisticas`);

  const semana = page.getByRole("region", { name: "Esta semana", exact: true });
  await expect(semana).toBeVisible();
  await expect(semana).toContainText(/Últimos 7 días · ventana móvil · obras/i);

  // Se amplía igual que en el muro, y da los valores exactos por día — que
  // desde el handoff «Gráficos sin tabla mensual» los lleva el propio gráfico,
  // no una tabla debajo.
  await semana.getByRole("button", { name: /ampliar esta semana/i }).click();
  const capa = page.getByRole("dialog", { name: "Esta semana" });
  await expect(capa).toBeVisible();
  await expect(capa.getByRole("table")).toHaveCount(0);
  await expect(capa.getByRole("img").first()).toBeVisible();

  // Y la capa NO desborda a lo ancho: los globos del gráfico son `display:none`
  // en reposo y el <dialog> recorta el eje X, así que un panel de siete barras
  // no puede regalar una barra de scroll horizontal.
  const desborda = await capa.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(desborda).toBe(false);
  await page.keyboard.press("Escape");

  // El calendario NO es un panel: sigue siendo un control con estado propio y
  // no se pliega.
  await expect(page.getByRole("region", { name: "Racha", exact: true })).toBeVisible();
});

// La pestaña se fijó al MES y a todos los tipos: la pregunta ya está hecha, y
// el calendario que la acompaña es mensual. Lo único que se elige aquí es en
// qué magnitud verlo. Para cambiar la pregunta está /estadisticas.
test("la pestaña del perfil solo ofrece magnitud, no periodo ni tipo", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto(`/u/${USERNAME}?tab=estadisticas`);

  await expect(page.getByRole("navigation", { name: "Magnitud" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Periodo" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Tipo de obra" })).toHaveCount(0);

  // Y la magnitud sigue mandando sobre algo: desde que «Actividad del periodo»
  // se fue, el panel al que obedece es la semana. Un selector que no cambia
  // nada es peor que no tenerlo.
  const semana = page.getByRole("region", { name: "Esta semana", exact: true });
  await page
    .getByRole("navigation", { name: "Magnitud" })
    .getByRole("link", { name: "Tiempo" })
    .click();
  await expect(semana).toContainText(/Últimos 7 días · ventana móvil · min/i);
});

// El objetivo diario no es una medida: es una META que se fija y se edita, como
// los retos. Se mudó a Rincón con ellos, y el medidor va pegado a su editor —
// separarlos obligaría a cambiar de pestaña para entender la cifra que acabas
// de tocar.
test("el objetivo diario vive en Rincón, con los retos", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);

  await page.goto(`/u/${USERNAME}?tab=estadisticas`);
  await expect(page.getByRole("region", { name: "Objetivo de hoy" })).toHaveCount(0);

  await page.goto(`/u/${USERNAME}?tab=rincon`);
  await expect(page.getByRole("region", { name: "Objetivo de hoy" })).toBeVisible();
  // Y su editor va pegado: el formulario arranca plegado, así que lo que se ve
  // es su rótulo, no el input.
  await expect(page.getByText(/objetivo diario de lectura/i)).toBeVisible();
});

// «La pila» y «Entra y sale» eran dos tarjetas que solo se entendían juntas: la
// segunda decía si la primera sube o baja, y había que mirar a otro sitio para
// saberlo. Ahora es un panel con las tres columnas en el mismo eje, y cada una
// desglosada por tipo — un «+4» de libros no es un «+4» de películas.
test("la pila y el balance son un solo panel, desglosado por tipo", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto(`/u/${USERNAME}?tab=estadisticas`);

  await expect(page.getByRole("region", { name: "Entra y sale" })).toHaveCount(0);

  const pila = page.getByRole("region", { name: "La pila", exact: true });
  await expect(pila).toBeVisible();
  // El rótulo tiene que decir que la primera columna es una foto de AHORA: si
  // no, parecería del mes como las otras dos.
  await expect(pila).toContainText(/foto del momento/i);
  await pila.getByRole("button", { name: /ampliar la pila/i }).click();

  const capa = page.getByRole("dialog", { name: "La pila" });
  // Las tres columnas, por el nombre accesible de su barra: es el contrato del
  // handoff —el gráfico lleva sus cifras dentro y es alcanzable con el
  // tabulador—, no una tabla debajo.
  for (const columna of [/^Pendientes ahora mismo:/, /^Añadidas /, /^Terminadas /]) {
    await expect(capa.getByRole("img", { name: columna })).toHaveCount(1);
  }
  // Apilado por tipo: la leyenda nombra los tres.
  for (const tipo of ["Libros", "Películas", "Series"]) {
    await expect(capa).toContainText(tipo);
  }
});

// El muro va agrupado en secciones, no en una rejilla de doce tarjetas sueltas.
// El índice de arriba es lo que hace alcanzable «Por categoría» sin scrollear
// media pantalla.
test("el muro se agrupa en secciones con índice", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  const indice = page.getByRole("navigation", { name: "Secciones" });
  for (const nombre of ["Resumen general", "Actividad", "Hábitos", "Por categoría"]) {
    await expect(indice.getByRole("link", { name: nombre })).toBeVisible();
    await expect(page.getByRole("heading", { name: nombre, level: 2 })).toBeVisible();
  }

  // Y los paneles cuelgan de su sección: son h3, no h2 sueltos.
  await expect(
    page.getByRole("heading", { name: "Horas por mes", level: 3 }),
  ).toBeVisible();
});

// El selector de periodo ya no es solo «un año o todo»: la ventana corta es
// justo la que contesta «¿cómo voy AHORA?».
test("el periodo admite semana y mes, y se nota en el rótulo del panel", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas?periodo=semana");

  const actividad = page.getByRole("region", { name: "Actividad del periodo" });
  await expect(actividad).toContainText(/Últimos 7 días · obras/i);

  await page.goto("/estadisticas?periodo=mes");
  await expect(actividad).toContainText(/Este mes · obras/i);
});

// Obras y tiempo son dos preguntas distintas, no dos estilos: quien lee tochos
// ve poca obra y muchas horas. El conmutador cambia la MAGNITUD, y el rótulo
// tiene que decirlo — si no, la misma barra significaría dos cosas.
test("el conmutador obras/tiempo cambia la unidad del panel", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas?periodo=mes&medida=tiempo");

  const actividad = page.getByRole("region", { name: "Actividad del periodo" });
  await expect(actividad).toContainText(/Este mes · min/i);

  await page
    .getByRole("navigation", { name: "Magnitud" })
    .getByRole("link", { name: "Obras" })
    .click();
  await expect(actividad).toContainText(/Este mes · obras/i);
});

// El filtro de tipo es GLOBAL: acota todos los paneles a la vez y cada uno lo
// declara. Un panel que se filtra sin decirlo miente por omisión.
test("el filtro de tipo acota el muro y cada panel lo declara", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas?tipo=libros");

  // El filtro va en el RÓTULO, entre el periodo y la unidad, no escondido en el
  // detalle: tiene que leerse antes que la cifra que acota.
  await expect(page.getByRole("region", { name: "Estados", exact: true })).toContainText(
    /· Libros ·/,
  );
  await expect(page.getByRole("region", { name: "Valoración media" })).toContainText(
    /· Libros ·/,
  );

  // Y el panel que NO puede obedecerlo también lo dice: «Distribución por tipo»
  // es justo el que responde a esa pregunta, así que se lee entero.
  await expect(
    page.getByRole("region", { name: "Distribución por tipo" }),
  ).toContainText(/todos los tipos/i);
});

// La pestaña del perfil ya no tiene rail. El rail no repartía por importancia
// sino por ancho: la racha y el ritmo cabían en 340 px, así que salían ANTES
// que la semana. El orden del DOM es ahora el del esquema, que es el que lee un
// lector de pantalla y el que se ve en móvil — y que la multicolumna respeta,
// porque fluye por columnas sin reordenar nada.
test("la pestaña del perfil no tiene rail: el orden es el del esquema", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/u/${USERNAME}?tab=estadisticas`);

  const semana = page.getByRole("region", { name: "Esta semana", exact: true });
  const racha = page.getByRole("region", { name: "Racha", exact: true });
  await expect(semana).toBeVisible();
  await expect(racha).toBeVisible();

  // `compareDocumentPosition`: DOCUMENT_POSITION_FOLLOWING = la racha va
  // DESPUÉS de la semana en el DOM, que es el orden que lee un lector de
  // pantalla y el que se ve en móvil.
  const ordenCorrecto = await semana.evaluate((a, b) => {
    if (!b) return false;
    return !!(a.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, await racha.elementHandle());
  expect(ordenCorrecto).toBe(true);

  // Y la pestaña NO desborda a lo ancho: la multicolumna reparte sin sacar nada
  // del contenedor.
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(desborda).toBe(false);
});

// Handoff «Gráficos sin tabla mensual»: los gráficos que llevan sus cifras
// dentro pierden la tabla que las repetía fila a fila. La prueba es doble a
// propósito — que la tabla NO esté, y que el dato SÍ siga estando —, porque
// solo la primera mitad sería un permiso para perder información.
test("los gráficos con cifras dentro sustituyen a su tabla, sin perder el dato", async ({
  page,
}) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  // Anillo: el total sale del centro y el valor de cada categoría se lee en la
  // leyenda, con su cuota. Es lo que permitió retirarle la tabla.
  const tipo = page.getByRole("region", { name: "Distribución por tipo" });
  await expect(tipo).toContainText(/Libros\s*\d+\s*\(\d+%\)/);
  await tipo.getByRole("button", { name: /ampliar distribución por tipo/i }).click();
  const capaTipo = page.getByRole("dialog", { name: "Distribución por tipo" });
  await expect(capaTipo.getByRole("table")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Mosaico del año: 365 filas no eran una tabla legible. En su lugar, rótulos
  // de mes sobre la rejilla y la cifra escrita sobre los días más movidos.
  const calendario = page.getByRole("region", { name: "Calendario anual" });
  await expect(calendario).toContainText("Ene");
  await expect(calendario).toContainText("Dic");
  await calendario.getByRole("button", { name: /ampliar calendario anual/i }).click();
  const capaCal = page.getByRole("dialog", { name: "Calendario anual" });
  await expect(capaCal.getByRole("table")).toHaveCount(0);
  // Pero cualquier día con actividad sigue siendo consultable con teclado.
  await expect(capaCal.getByRole("img", { name: /de julio: / }).first()).toBeVisible();
});

// Los gráficos de la CARA no pueden ser focalizables: el disparador del modal
// la cubre entera con `absolute inset-0`, así que el teclado enfocaría algo
// tapado y el ratón no lo alcanzaría nunca.
test("solo el gráfico de la capa es consultable punto a punto", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  const horas = page.getByRole("region", { name: "Horas por mes" });
  // En la cara no hay ni un punto consultable…
  await expect(horas.getByRole("img", { name: /^Julio: / })).toHaveCount(0);

  // …y en la capa sí.
  await horas.getByRole("button", { name: /ampliar horas por mes/i }).click();
  await expect(
    page.getByRole("dialog", { name: "Horas por mes" }).getByRole("img", { name: /^Julio: / }),
  ).toBeVisible();
});

// El índice de secciones marca DÓNDE ESTÁS, no solo a dónde se puede ir: con
// siete secciones largas, siete enlaces del mismo color son atajos, no un mapa.
test("el índice de secciones marca la sección activa", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");

  await login(page);
  await page.goto("/estadisticas");

  const indice = page.getByRole("navigation", { name: "Secciones" });
  // Arriba del todo, la primera.
  await expect(indice.getByRole("link", { name: "Resumen general" })).toHaveAttribute(
    "aria-current",
    "location",
  );

  // Al saltar a otra, el resaltado la sigue.
  await indice.getByRole("link", { name: "Por categoría" }).click();
  await expect(indice.getByRole("link", { name: "Por categoría" })).toHaveAttribute(
    "aria-current",
    "location",
  );
});
