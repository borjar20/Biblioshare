import { getRequestConfig } from "next-intl/server";

// Single locale for now (Spanish). Wiring through next-intl from the start
// means adding more locales later is a config change, not a rewrite.
export default getRequestConfig(async () => {
  const locale = "es";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // "Ahora" ÚNICO para toda la petición, compartido por el servidor y el
    // cliente a través de NextIntlClientProvider. Lo piden las fechas
    // relativas ("hace 2 días", session-list.tsx): sin esto cada lado llama a
    // `new Date()` por su cuenta, next-intl avisa con ENVIRONMENT_FALLBACK y
    // los dos relojes pueden caer a distinto lado de una frontera ("hoy" en el
    // servidor, "ayer" en el cliente) — que es un desajuste de hidratación
    // esperando a pasar a medianoche.
    now: new Date(),
  };
});
