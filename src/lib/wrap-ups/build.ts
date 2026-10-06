// Compone el wrap-up de un usuario y una ventana (spec 2026-10-06 §4). Lo usan
// el cron (service role) y «Actualizar» (service role tras verificar sesión).
import { loadAnnual, loadOwnPet } from "./load/annual";
import { loadCore, type WrapUpClient } from "./load/core";
import { loadMoments } from "./load/moments";
import { hasAnyActivity, intensityFor, narratorFor, paletteFor, selectStories } from "./select-stories";
import { shareSummary } from "./share-summary";
import type { WrapUpInputs, WrapUpPayload } from "./types";
import type { WrapUpWindow } from "./windows";

export type Loaders = { core: typeof loadCore; moments: typeof loadMoments; annual: typeof loadAnnual; pet: typeof loadOwnPet };
const DEFAULT: Loaders = { core: loadCore, moments: loadMoments, annual: loadAnnual, pet: loadOwnPet };

export async function buildWrapUp(client: WrapUpClient, userId: string, w: WrapUpWindow, loaders: Loaders = DEFAULT): Promise<WrapUpPayload | null> {
  const core = await loaders.core(client, userId, w);
  const [moments, pet, annual] = await Promise.all([
    loaders.moments(client, userId, w, core.finished),
    loaders.pet(client, userId),
    w.kind === "year" ? loaders.annual(client, userId, w, core.finished) : Promise.resolve(null),
  ]);
  const inputs: WrapUpInputs = { ...core, ...moments, annual, pet };
  if (!hasAnyActivity(inputs)) return null;

  const intensity = intensityFor(w.kind, inputs);
  const base = {
    v: 1 as const, kind: w.kind, periodStart: w.start, periodEnd: w.end,
    intensity, narrator: narratorFor(w.kind, intensity, inputs), palette: paletteFor(inputs.time),
    pet, stories: selectStories(w, inputs),
  };
  return { ...base, share: shareSummary(base, inputs) };
}
