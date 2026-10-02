// La geometría y las fixtures viven en una sola suite. Este punto de entrada
// la recoge en CI, contra build/start y Supabase local, sin duplicar casos.
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  throw new Error("#765 requiere Supabase local desechable");
}
for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) throw new Error(`Missing local ${key}`);
}

import "../menciones-desplegable-movil.spec";
