import { describe, expect, it } from "vitest";
import { getProfilePet } from "./get-profile-pet";

const appearance = { pet_name: "Nube", pet_class: "wizard", pet_stage: "acorn" };

describe("getProfilePet", () => {
  it("projects only appearance, without private activity or mood", async () => {
    expect(await getProfilePet({ rpc: async (name, args) => {
      expect(name).toBe("get_profile_pet");
      expect(args).toEqual({ p_user_id: "owner" });
      return { data: [{ ...appearance, mood: "sad", last_level: 15 }], error: null };
    } }, "owner")).toEqual({ name: "Nube", petClass: "wizard", stage: "acorn" });
  });

  it.each([[], null, {}, [appearance, appearance], [{ ...appearance, pet_class: "../" }],
    [{ ...appearance, pet_stage: "unknown" }], [{ ...appearance, pet_name: "" }]])(
    "omits absent or invalid optional appearance: %j", async (data) => {
      expect(await getProfilePet({ rpc: async () => ({ data, error: null }) }, "owner")).toBeNull();
    },
  );
  it("contains RPC and transport failures", async () => {
    expect(await getProfilePet({ rpc: async () => ({ data: [appearance], error: {} }) }, "owner")).toBeNull();
    expect(await getProfilePet({ rpc: async () => { throw new Error("offline"); } }, "owner")).toBeNull();
  });
});
