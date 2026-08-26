import { restoreQaSeed } from "./support/qa-seed";
import { sweepDisposableData } from "./support/sweep-disposable";

// Playwright ejecuta esto UNA vez, antes de toda la suite. Si falla, la suite
// no arranca — y eso es lo que se quiere: correr sobre una semilla desviada es
// lo que produjo la #215.
export default async function globalSetup() {
  await restoreQaSeed();
  // El barrido va DESPUÉS de la semilla y no lanza nunca (#800): la semilla es
  // corrección —sin ella los tests mienten— y el barrido es higiene. Tumbar la
  // suite porque una fila desechable se resistió sería cambiar un problema de
  // limpieza por uno peor.
  await sweepDisposableData();
}
