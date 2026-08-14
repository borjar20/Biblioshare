import { createClient } from "@/lib/supabase/server";
import { listCollections } from "@/lib/library/collections";
import { CollectionsBrowser } from "./collections-browser";

// Capa de DATOS de la pestaña `Colecciones` (frame A) y nada más: trae las
// tarjetas y se las pasa enteras a `CollectionsBrowser`, que es quien busca,
// ordena y pinta en el cliente. El estado vacío también vive allí (antes lo
// cubría el tile «Nueva colección», que ahora es un botón de la cabecera).
export async function CollectionsGrid({ userId }: { userId: string }) {
  const supabase = await createClient();
  const cards = await listCollections(supabase, userId);

  return <CollectionsBrowser cards={cards} />;
}
