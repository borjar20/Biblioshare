import { describe, expect, it, vi, beforeEach } from "vitest";

// Los cuatro wrappers de servidor degradan si su lectura falla: un bloque
// secundario roto no debe tumbar el perfil entero (#1580).
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/profile/hero", () => ({ getProfileHero: vi.fn() }));
vi.mock("@/lib/profile/figures", async (orig) => ({ ...(await orig<object>()), getProfileRating: vi.fn() }));
vi.mock("@/lib/profile/now", () => ({ getProfileNow: vi.fn() }));
vi.mock("@/lib/profile/year", () => ({ getProfileYear: vi.fn() }));
vi.mock("@/components/pet/profile-pet", () => ({ ProfilePet: async () => "PET" }));

import { getProfileHero } from "@/lib/profile/hero";
import { getProfileRating } from "@/lib/profile/figures";
import { getProfileNow } from "@/lib/profile/now";
import { getProfileYear } from "@/lib/profile/year";
import { ProfileHero } from "./profile-hero";
import { ProfileFigures } from "./profile-figures-server";
import { ProfileNow } from "./profile-now-server";
import { ProfileYear } from "./profile-year-server";

describe("wrappers de servidor del perfil", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("ProfileHero: portada vacía si falla la lectura", async () => {
    vi.mocked(getProfileHero).mockRejectedValue(new Error("boom"));
    const el = await ProfileHero({ userId: "u", name: "Ana" });
    expect(el.props.model).toEqual({ fan: [], mosaic: [] });
  });

  it("ProfileFigures: sin nota media si falla la lectura", async () => {
    vi.mocked(getProfileRating).mockRejectedValue(new Error("boom"));
    const el = await ProfileFigures({ userId: "u", stats: { book: 1, movie: 2, series: 3 } as never });
    expect(el.props.rating).toEqual({ average: null, count: 0 });
  });

  it("ProfileNow: sin ítems pero conservando la mascota", async () => {
    vi.mocked(getProfileNow).mockRejectedValue(new Error("boom"));
    const el = await ProfileNow({ userId: "u" });
    expect(el.props.items).toEqual([]);
    expect(el.props.pet).toBe("PET");
  });

  it("ProfileYear: sin datos si falla la lectura", async () => {
    vi.mocked(getProfileYear).mockRejectedValue(new Error("boom"));
    const el = await ProfileYear({ userId: "u", isOwner: false });
    expect(el.props.data).toBeNull();
  });
});
