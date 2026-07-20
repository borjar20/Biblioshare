import { UserAvatar } from "@/components/social/user-avatar";

// Same inline data: URI trick as CoverCard — renders directly, no network.
// Square (not the 300x450 cover aspect) with a head-and-shoulders silhouette:
// circle-cropped, a flat colour block is indistinguishable from the no-photo
// state, so this has to read as an actual portrait to be worth a story.
const PHOTO =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjAiIHkyPSIxIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNhNzhiZmEiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM1YjIxYjYiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0idXJsKCNnKSIvPjxjaXJjbGUgY3g9IjEwMCIgY3k9Ijc2IiByPSIzMyIgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjg4Ii8+PHBhdGggZD0iTTM2IDIwMGMwLTM1IDI5LTYyIDY0LTYyczY0IDI3IDY0IDYyeiIgZmlsbD0iI2ZmZmZmZiIgZmlsbC1vcGFjaXR5PSIwLjg4Ii8+PC9zdmc+";

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
