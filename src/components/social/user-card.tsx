import type { ReactNode } from "react";
import Link from "next/link";
import type { FollowUser } from "@/lib/social/follows";
import { UserAvatar } from "./user-avatar";

// Fila de usuario para listas sociales (seguidores/seguidos) y solicitudes.
// `action` es un slot opcional a la derecha (p. ej. aceptar/rechazar).
export function UserCard({
  user,
  action,
}: {
  user: FollowUser;
  action?: ReactNode;
}) {
  const name = user.displayName || user.username;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <Link
        href={`/u/${user.username}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <UserAvatar name={name} avatarUrl={user.avatarUrl} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            @{user.username}
          </span>
        </div>
      </Link>
      {action}
    </div>
  );
}
