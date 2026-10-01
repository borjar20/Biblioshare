import { defineConfig } from "@playwright/test";
import localPet from "./playwright.pet-local.config";

// Reuses the local-only credential checks and production server. No remote seed.
export default defineConfig({
  ...localPet,
  testMatch: ["mascota-tienda.spec.ts", "mascota-tienda-concurrencia.spec.ts"],
});
