import { UserCard } from "@/components/social/user-card";
import type { FollowUser } from "@/lib/social/follows";

const user: FollowUser = {
  userId: "u-1",
  username: "martarl",
  displayName: "Marta Ruiz",
  avatarUrl: null,
};

export function Default() {
  return <UserCard user={user} />;
}

export function WithAction() {
  return (
    <UserCard
      user={{ ...user, userId: "u-2", username: "jonetxe", displayName: "Jon Etxeberria" }}
      action={<span className="shrink-0 text-xs font-medium text-muted-foreground">Siguiendo</span>}
    />
  );
}

export function NoDisplayName() {
  return <UserCard user={{ ...user, userId: "u-3", username: "readerx99", displayName: null }} />;
}
