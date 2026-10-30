import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfileHero, type HeroModel } from "@/lib/profile/hero";
import { coverKey } from "@/lib/profile/types";
import { CoverTile } from "./cover-tile";
import { HeroFanLabel } from "./hero-fan-label";

// Spec §3 y §4.1: mosaico de sus últimas terminadas al fondo (decorativo) y
// abanico de sus destacados delante (enlaces). Sin mosaico, degradado de acento.
export async function ProfileHero({ userId, name }: { userId: string; name: string }) {
  const model = await getProfileHero(await createClient(), userId);
  return <HeroView model={model} name={name} />;
}

export function HeroView({ model, name }: { model: HeroModel; name: string }) {
  const hasMosaic = model.mosaic.length > 0;
  const n = model.fan.length;
  return (
    <section
      data-testid="profile-hero"
      data-mosaic={hasMosaic ? "on" : "off"}
      className="relative h-[200px] overflow-hidden lg:h-[250px]"
    >
      {hasMosaic ? (
        <div
          data-testid="profile-hero-mosaic"
          aria-hidden="true"
          className="absolute inset-0 grid grid-cols-7 gap-0.5 opacity-55 lg:grid-cols-[repeat(14,minmax(0,1fr))]"
        >
          {[...model.mosaic, ...model.mosaic].slice(0, 42).map((c, i) => (
            <CoverTile
              key={`${coverKey(c)}:${i}`}
              cover={c}
              decorative
              sizes="90px"
              className={`rounded-none shadow-none ${i >= 21 ? "max-lg:hidden" : ""}`}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,var(--accent),transparent_65%)] opacity-60" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      {n > 0 && (
        <HeroFanLabel name={name}>
          <ul className="absolute right-[-18px] top-11 flex lg:right-[60px] lg:top-9">
            {model.fan.map((c, i) => {
              const mid = (n - 1) / 2;
              return (
                <li
                  key={coverKey(c)}
                  className={`-ml-4 first:ml-0 ${i >= 4 ? "max-lg:hidden" : ""}`}
                  style={{ transform: `rotate(${(i - mid) * 5}deg) translateY(${Math.abs(i - mid) * 6}px)` }}
                >
                  <Link href={c.href} aria-label={c.title} className="block w-[70px] transition-transform motion-safe:hover:-translate-y-1 lg:w-[92px]">
                    <CoverTile cover={c} sizes="(max-width: 1024px) 70px, 92px" className="shadow-[0_10px_24px_rgba(0,0,0,.55)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </HeroFanLabel>
      )}
    </section>
  );
}
