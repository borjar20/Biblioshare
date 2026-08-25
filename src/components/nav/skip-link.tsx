import { getTranslations } from "next-intl/server";

// Primer elemento enfocable de CUALQUIER ruta: quien navega con teclado o lector
// de pantalla salta la cabecera entera en vez de re-tabularla en cada navegación
// (issue #816, hallazgo F4-023 de la auditoría). Apunta al `<main id="contenido">`
// que pinta AppShell, así que vale para las 17 rutas de una vez.
//
// Invisible con el ratón (`sr-only`) y visible en cuanto recibe foco
// (`focus:not-sr-only`). El anillo de foco no se declara aquí: lo pone la regla
// global `:focus-visible` de globals.css. `focus:fixed` —y no `absolute`— porque
// no hay ancestro posicionado y con la página desplazada el enlace se pintaría
// fuera de la pantalla.
export async function SkipLink() {
  const t = await getTranslations("nav");

  return (
    <a
      href="#contenido"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md"
    >
      {t("skipToContent")}
    </a>
  );
}
