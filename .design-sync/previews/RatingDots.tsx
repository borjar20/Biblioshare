import { RatingDots } from "@/components/ui/rating-dots";

export function Default() {
  return <RatingDots value={3.5} />;
}

export function Sweep() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3, 4, 5].map((v) => (
        <div key={v} className="flex items-center gap-2">
          <span className="w-4 text-xs text-muted-foreground">{v}</span>
          <RatingDots value={v} />
        </div>
      ))}
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-col gap-3">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex items-center gap-2">
          <span className="w-6 font-mono text-xs text-muted-foreground">
            {size}
          </span>
          <RatingDots value={7} size={size} />
        </div>
      ))}
    </div>
  );
}
