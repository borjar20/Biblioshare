import { TierlistFields } from "@/components/clubs/tierlist/tierlist-fields";
import { TierlistBoard } from "@/components/clubs/tierlist/tierlist-board";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H2 -- tierlist de club: cada participante coloca el pool en tiers y ve las
// tierlists de los demás. Cierra el Bloque H.
//
// itemCuration "curators": el pool ES el enunciado de la tierlist -- si crece a mitad, las
// tierlists ya hechas quedan incompletas. Mismo razonamiento que list_challenge (H3), y espejo
// de la política RLS "club_activity_items insert participant or curator", que este bloque
// reescribió para incluir también tierlist.
export const tierlistKind: ActivityKindDefinition = {
  kind: "tierlist",
  allowedItemTypes: "all",
  maxItems: null,
  itemCuration: "curators",
  usesItemPool: true,
  ConfigFields: TierlistFields,
  DetailExtension: TierlistBoard,
};
