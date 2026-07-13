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

export function MediaAccent() {
  return (
    <div className="flex flex-col gap-2">
      <RatingDots value={4} fillClassName="bg-type-book" />
      <RatingDots value={3} fillClassName="bg-type-movie" />
      <RatingDots value={5} fillClassName="bg-type-series" />
    </div>
  );
}
