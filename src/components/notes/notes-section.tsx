import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getNotesForItem } from "@/lib/notes/get-notes";
import { compareNotes } from "@/lib/notes/sort";
import { NoteCard } from "./note-card";

// «Mis notas y citas» de UNA obra, ordenadas por posición: recorres la obra de
// principio a fin, que es de lo que trata releer. Componente propio y hermano
// de log-panel — NUNCA dentro: ese fichero ya orquesta estado, progreso,
// sesiones y diario a la vez.
//
// Las notas cuelgan del ítem, así que una relectura mezcla las suyas con las de
// la primera. No se agrupa por pase: cada tarjeta lleva su fecha y eso basta.
export async function NotesSection({
  userId,
  itemType,
  itemId,
}: {
  userId: string;
  itemType: ItemType;
  itemId: string;
}) {
  const t = await getTranslations("notes");
  const supabase = await createClient();
  const notes = await getNotesForItem(supabase, userId, itemType, itemId);
  const sorted = [...notes].sort((a, b) => compareNotes(itemType, a, b));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="label-section">
        {t("sectionTitle")}
      </h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("sectionEmpty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </section>
  );
}
