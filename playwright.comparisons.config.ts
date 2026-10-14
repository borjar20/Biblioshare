import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Deliberately no global QA seed/sweep or server launcher. The caller owns a
// freshly built production server and the exact guarded disposable fixtures.
export default defineConfig({
  ...base,
  testMatch: ['entre-nosotros.spec.ts', 'entre-nosotros-atlas.spec.ts'],
  // Discovery is owned here; neither present nor future general exclusions apply.
  testIgnore: [],
  globalSetup: undefined,
  webServer: undefined,
  timeout: 180_000,
  workers: 1,
  retries: 0,
  // Asset/action interception is the gate contract. Offline/SW behavior is outside it.
  use: { ...base.use, serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: ['entre-nosotros-atlas.spec.ts'], use: { ...devices['Pixel 7'] } },
  ],
});
