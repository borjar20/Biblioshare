import { UserAvatar } from "@/components/social/user-avatar";

// Same inline data: URI trick as CoverCard — renders directly, no network.
const PHOTO =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iNDUwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjN2MzYWVkIi8+PHJlY3QgeD0iMTgiIHk9IjE4IiB3aWR0aD0iMjY0IiBoZWlnaHQ9IjQxNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMyIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+";

export function Initials() {
  return <UserAvatar name="Marta Ruiz" avatarUrl={null} />;
}

export function WithPhoto() {
  return <UserAvatar name="Jon Etxeberria" avatarUrl={PHOTO} />;
}

export function Sizes() {
  return (
    <div className="flex items-end gap-3">
      <UserAvatar name="Ana López" avatarUrl={null} size={24} />
      <UserAvatar name="Ana López" avatarUrl={null} size={40} />
      <UserAvatar name="Ana López" avatarUrl={null} size={64} />
    </div>
  );
}
