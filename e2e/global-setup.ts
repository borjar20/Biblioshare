import { restoreQaSeed } from "./support/qa-seed";

// Playwright ejecuta esto UNA vez, antes de toda la suite. Si falla, la suite
// no arranca — y eso es lo que se quiere: correr sobre una semilla desviada es
// lo que produjo la #215.
export default async function globalSetup() {
  await restoreQaSeed();
}
