import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { acornEntry, sheetEntry } from "./manifest";
import type { ProfilePet } from "./get-profile-pet";

/** Existing PixelLab art, first idle frame; never derive a path from raw RPC data. */
export async function getProfilePetImage(pet: ProfilePet) {
  const entry = pet.stage === "acorn" ? acornEntry() : sheetEntry(pet.stage, pet.petClass);
  const file = pet.stage === "acorn" ? "acorn.png" : `${pet.stage}/${pet.petClass}.png`;
  try {
    const data = await readFile(join(process.cwd(), "public/pet/sheets", file));
    return { src: `data:image/png;base64,${data.toString("base64")}`, entry };
  } catch {
    return null;
  }
}
