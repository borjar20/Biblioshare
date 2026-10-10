import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Deliberately no global QA seed/sweep or server launcher. The caller owns a
// freshly built production server and the exact guarded disposable fixtures.
export default defineConfig({
  ...base,
  testMatch: ['entre-nosotros.spec.ts', 'entre-nosotros-motion.spec.ts'],
  globalSetup: undefined,
  webServer: undefined,
  timeout: 180_000,
  workers: 1,
  retries: 0,
  use: { ...base.use, trace: 'retain-on-failure' },
});
