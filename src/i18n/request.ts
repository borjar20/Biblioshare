import { getRequestConfig } from "next-intl/server";

// Single locale for now (Spanish). Wiring through next-intl from the start
// means adding more locales later is a config change, not a rewrite.
export default getRequestConfig(async () => {
  const locale = "es";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
