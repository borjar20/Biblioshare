import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getNoteById } from "@/lib/notes/get-notes";

export const size = { width: 1080, height: 1080 };
export const contentType = "image/png";

// Satori no resuelve las CSS vars de globals.css: espejo manual de los dos temas.
const THEMES = {
  light: {
    bg: "#f3ece1",
    card: "#fffdf8",
    fg: "#2c2620",
    muted: "#877e70",
    accent: "#b0542f",
    gold: "#c98a2b",
    border: "#e2d7c4",
  },
  dark: {
    bg: "#1f1a16",
    card: "#2a231d",
    fg: "#f0e8db",
    muted: "#a99e8c",
    accent: "#cf7a4f",
    gold: "#e0a94a",
    border: "#3d342b",
  },
} as const;

// El cuerpo largo pide letra más pequeña: sin auto-fit en Satori, se escalona.
function quoteFontSize(length: number): number {
  if (length <= 120) return 58;
  if (length <= 240) return 46;
  if (length <= 400) return 36;
  return 30;
}

// Exportar la cita (F6, P10): tarjeta de Memorizar como PNG — cita, obra, página
// y marca. Privada: la RLS de `notes` (y el getUser) garantizan que solo el
// dueño exporta la suya. `?theme=dark` para el reverso oscuro.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const note = await getNoteById(supabase, id);
  if (!note) return new Response("No encontrada", { status: 404 });

  const themeParam = new URL(req.url).searchParams.get("theme");
  const c = themeParam === "dark" ? THEMES.dark : THEMES.light;

  const meta = [note.itemTitle?.toUpperCase(), note.page != null ? `p. ${note.page}` : null]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 64,
          background: c.bg,
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 72,
            borderRadius: 40,
            border: `2px solid ${c.border}`,
            background: c.card,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 16, height: 16, borderRadius: 16, background: c.accent }} />
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 2, color: c.muted }}>
              Biblioshare
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", fontSize: 120, lineHeight: 1, color: c.gold }}>“</div>
            <div
              style={{
                display: "flex",
                fontSize: quoteFontSize(note.body.length),
                lineHeight: 1.4,
                fontWeight: 500,
                color: c.fg,
              }}
            >
              {note.body}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", width: 80, height: 3, background: c.accent }} />
            <div
              style={{
                display: "flex",
                fontSize: 26,
                letterSpacing: 3,
                color: c.muted,
              }}
            >
              {meta}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
