import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getProfileByUsername } from "@/lib/profile/get-profile-by-username";
import { getLibraryStats } from "@/lib/library/get-library-stats";

export const alt = "Perfil de Biblioshare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const profile = await getProfileByUsername(supabase, username);

  const name = profile?.displayName || profile?.username || username;
  const stats = profile ? await getLibraryStats(supabase, profile.userId) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 24,
          padding: 80,
          background: "#2c002b",
          color: "#ffe9fc",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, opacity: 0.7 }}>
          Biblioshare
        </div>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 600 }}>
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 36, opacity: 0.8 }}>
          @{profile?.username ?? username}
        </div>
        {stats && (
          <div style={{ display: "flex", gap: 32, fontSize: 32, marginTop: 16 }}>
            <div style={{ display: "flex" }}>{stats.book} libros</div>
            <div style={{ display: "flex" }}>{stats.movie} películas</div>
            <div style={{ display: "flex" }}>{stats.series} series</div>
          </div>
        )}
      </div>
    ),
    size
  );
}
