import Image from "next/image";

// Avatar circular reutilizable para listas sociales (seguidores/solicitudes).
// Misma lógica que profile-header: los subidos a Storage van por next/image
// (remotePatterns); las URLs externas legado, por <img>.
function isSupabaseAvatar(url: string): boolean {
  return /\.supabase\.co\/storage\/v1\/object\/public\//.test(url);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 40,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-surface-muted"
      style={{ height: size, width: size }}
    >
      {avatarUrl ? (
        isSupabaseAvatar(avatarUrl) ? (
          <Image
            src={avatarUrl}
            alt={name}
            fill
            sizes={`${size}px`}
            className="object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
          {initials(name)}
        </div>
      )}
    </div>
  );
}
