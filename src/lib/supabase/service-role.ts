import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Cliente con service_role — bypassa RLS por completo. Reservado a
// operaciones de sistema que deben actuar sobre cualquier usuario sin estar
// acotadas al que autenticó la request actual (p. ej. entregar push al
// destinatario de una notificación, no a quien la disparó). Nunca importar
// desde código alcanzable por el cliente ni usar para nada que un usuario
// autenticado pueda pedir directamente.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
