import { defineConfig } from '@playwright/test';
import ci from './playwright.ci.config';
import comparisons from './playwright.comparisons.config';

// El smoke ya ha cerrado su servidor. Este gate conserva el descubrimiento y
// las fixtures de comparaciones y arranca su propio servidor de producción,
// con las mismas guardas locales y sin reutilizar procesos ajenos.
export default defineConfig({
  ...comparisons,
  forbidOnly: ci.forbidOnly,
  reporter: ci.reporter,
  workers: 1,
  retries: 0,
  use: { ...comparisons.use, ...ci.use, serviceWorkers: 'block' },
  webServer: ci.webServer,
});
