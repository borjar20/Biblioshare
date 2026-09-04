import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";

// Enlace ESTABLE a un perfil, por id de usuario en vez de por username
// (spec 2026-09-04-enlace-estable-perfil-nfc-design.md). Existe para soportes
// físicos —una tarjeta NFC, un QR impreso— que no se pueden reescribir cuando
// el username cambia: el uuid de auth.users es lo único del usuario que no
// cambia nunca. Responde con 307 (temporal, no 308): el destino puede cambiar y
// el navegador no debe recordarlo.
//
// Cliente SIN sesión a propósito (regla #437): el par id → username es
// idéntico para un anónimo, para el dueño y para un tercero, y la vista
// `profile_identities` expone la identidad de cualquier perfil, privado
// incluido. Un perfil privado redirige igual: el stub de «solicitar seguir»
// vive en /u/<username> y es él quien decide qué enseñar.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("profile_identities")
    .select("username")
    .eq("user_id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data?.username) notFound();

  return NextResponse.redirect(new URL(`/u/${data.username}`, request.url), 307);
}
