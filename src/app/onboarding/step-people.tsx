"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/social/user-avatar";
import { followUser } from "@/lib/social/actions";
import { requestJoinClub } from "@/lib/clubs/join-requests";
import type {
  ClubSuggestion,
  PersonSuggestion,
} from "@/lib/onboarding/get-social-suggestions";

export function StepPeople({
  profiles,
  clubs,
  nextHref,
}: {
  profiles: PersonSuggestion[];
  clubs: ClubSuggestion[];
  nextHref: string;
}) {
  const t = useTranslations("onboarding.wizard");
  const router = useRouter();
  const [done, setDone] = useState<string[]>([]);
  const [, start] = useTransition();

  function act(key: string, fn: () => Promise<void>) {
    setDone((prev) => [...prev, key]);
    start(async () => {
      await fn();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-[22px] font-semibold">
          {t("peopleTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("peopleHint")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {profiles.map((p) => {
          const key = `u:${p.userId}`;
          const name = p.displayName || p.username;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <UserAvatar name={name} avatarUrl={p.avatarUrl} size={36} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-sm font-semibold">
                  {name}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  @{p.username}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={done.includes(key)}
                onClick={() => act(key, () => followUser(p.userId))}
                className="ml-auto shrink-0"
              >
                {t("peopleFollow")}
              </Button>
            </li>
          );
        })}

        {clubs.map((c) => {
          const key = `c:${c.id}`;
          return (
            <li
              key={key}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-serif text-sm font-semibold">
                  {c.name}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {t("peopleMembers", { count: c.memberCount })}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={done.includes(key)}
                onClick={() => act(key, () => requestJoinClub(c.id))}
                className="ml-auto shrink-0"
              >
                {t("peopleJoin")}
              </Button>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        onClick={() => router.push(nextHref)}
        className="w-full justify-center"
      >
        {t("finish")}
      </Button>
    </div>
  );
}
