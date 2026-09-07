// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { AdventureSection } from "./adventure-section";

// `getTranslations` devuelve la clave: el test afirma sobre la clave, no sobre la copia.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/pet/adventure/get-state", () => ({ getAdventureStateFor: vi.fn() }));
// AdventurePanel arrastra las acciones (server-only) a nivel de módulo.
vi.mock("@/lib/pet/adventure/actions", () => ({ startAdventure: vi.fn(), resolveAdventure: vi.fn(), replayAdventure: vi.fn() }));
vi.mock("@/lib/pet/training/actions", () => ({ startBattle: vi.fn(), resolveBattle: vi.fn(), replayTrainingBattle: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); });

it("si falta la migración de aventuras, la sección se degrada en vez de tirar la página", async () => {
  const { getAdventureStateFor } = await import("@/lib/pet/adventure/get-state");
  vi.mocked(getAdventureStateFor).mockRejectedValue(
    Object.assign(new Error('relation "public.get_pet_adventure_days" does not exist'), { code: "42883" }),
  );
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});

  const element = await AdventureSection({ viewerId: "11111111-2222-3333-4444-555555555555" });
  const html = renderToStaticMarkup(element);

  expect(html).toContain("unavailable");
  expect(html).toContain('role="status"');
  expect(html).toContain("title");
  expect(errors).toHaveBeenCalled();
});
