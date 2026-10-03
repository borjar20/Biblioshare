import Image from "next/image";
import type { ReactNode } from "react";
import type { ExperiencePerson, MomentKind } from "@/lib/experiences/types";

const kindTone: Record<MomentKind, string> = {
  concert: "text-accent",
  show: "text-gold-ink",
  exhibition: "text-accent",
  museum: "text-foreground-soft",
  walk: "text-status-completed-ink",
  other: "text-accent",
};

/** Category artwork is decorative, never a substitute for a real photograph. */
export function ExperienceArtwork({ kind, className = "", compact = false }: {
  kind: MomentKind;
  className?: string;
  compact?: boolean;
}) {
  return <div aria-hidden="true" className={`relative overflow-hidden bg-surface-muted ${kindTone[kind]} ${className}`}>
    <svg viewBox="0 0 400 240" className={`h-full w-full ${compact ? "min-h-20" : "min-h-40"}`} fill="none" focusable="false" preserveAspectRatio="xMidYMid slice">
      <path d="M0 196C78 181 102 226 186 204S316 170 400 194V240H0Z" fill="currentColor" opacity=".05" />
      {kind === "concert" && <>
        <g transform="rotate(-12 158 122)"><path d="M64 61H236V92C225 92 225 112 236 112V161H64V112C75 112 75 92 64 92Z" fill="var(--surface)" stroke="currentColor" strokeWidth="2" /><path d="M191 63V158" stroke="currentColor" strokeDasharray="4 6" /><path d="M90 90H168M90 102H146" stroke="currentColor" strokeWidth="3" opacity=".5" /><path d="M90 135H99M107 135H112M120 135H124M132 135H138M146 135H151M159 135H170" stroke="currentColor" strokeWidth="12" /></g>
        <circle cx="284" cy="126" r="67" fill="currentColor" opacity=".13" /><circle cx="284" cy="126" r="52" stroke="currentColor" strokeWidth="2" /><circle cx="284" cy="126" r="35" stroke="currentColor" opacity=".45" /><circle cx="284" cy="126" r="8" fill="currentColor" /><path d="M326 37L333 53L348 56L335 66L335 83L322 73L307 78L313 62L302 50L319 49Z" fill="currentColor" opacity=".6" />
      </>}
      {kind === "show" && <>
        <path d="M59 54H341V187H59Z" fill="var(--surface)" stroke="currentColor" strokeWidth="2" /><path d="M59 54H156C150 115 134 143 59 170ZM341 54H244C250 115 266 143 341 170Z" fill="currentColor" opacity=".2" /><path d="M73 54C95 107 110 111 141 123M327 54C305 107 290 111 259 123" stroke="currentColor" strokeWidth="2" /><path d="M103 181H297M83 197H317" stroke="currentColor" strokeWidth="3" /><circle cx="200" cy="102" r="15" fill="currentColor" opacity=".65" /><path d="M200 122V161M176 139L200 124L224 139M200 161L180 178M200 161L220 178" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><path d="M194 42L200 31L206 42L219 45L210 54L211 68L200 60L189 68L190 54L181 45Z" fill="currentColor" />
      </>}
      {kind === "exhibition" && <>
        <g transform="rotate(-7 131 122)"><path d="M69 49H193V192H69Z" fill="var(--surface)" stroke="currentColor" strokeWidth="3" /><path d="M82 62H180V179H82Z" stroke="currentColor" opacity=".35" /><circle cx="122" cy="111" r="29" fill="currentColor" opacity=".23" /><path d="M94 156L125 122L163 160" stroke="currentColor" strokeWidth="5" /></g>
        <g transform="rotate(6 266 124)"><path d="M214 61H326V192H214Z" fill="var(--surface)" stroke="currentColor" strokeWidth="3" /><path d="M227 75H313V177H227Z" stroke="currentColor" opacity=".35" /><path d="M243 92C312 86 247 168 297 158" stroke="currentColor" strokeWidth="16" opacity=".35" strokeLinecap="round" /></g><path d="M74 213H139M232 213H287" stroke="currentColor" strokeWidth="3" opacity=".5" />
      </>}
      {kind === "museum" && <>
        <path d="M75 98L200 40L325 98Z" fill="currentColor" opacity=".13" stroke="currentColor" strokeWidth="2" /><path d="M84 107H316M77 183H323M67 196H333" stroke="currentColor" strokeWidth="4" /><path d="M105 116V176M151 116V176M200 116V176M249 116V176M295 116V176" stroke="currentColor" strokeWidth="13" opacity=".38" /><circle cx="200" cy="78" r="13" fill="var(--surface)" stroke="currentColor" strokeWidth="2" /><path d="M200 66V90M188 78H212" stroke="currentColor" opacity=".65" /><path d="M51 209H350" stroke="currentColor" strokeWidth="2" opacity=".4" />
      </>}
      {kind === "walk" && <>
        <path d="M49 162C107 145 147 185 192 142S271 77 345 107" stroke="currentColor" strokeWidth="3" strokeDasharray="5 8" strokeLinecap="round" /><path d="M49 180C122 144 163 224 259 155S341 142 392 120" stroke="currentColor" opacity=".13" strokeWidth="38" /><path d="M95 94L75 126H115ZM299 39L272 82H326Z" fill="currentColor" opacity=".3" /><path d="M95 125V146M299 81V103" stroke="currentColor" strokeWidth="4" /><circle cx="69" cy="156" r="8" fill="var(--surface)" stroke="currentColor" strokeWidth="3" /><path d="M333 144C333 157 314 173 314 173S295 157 295 144A19 19 0 01333 144Z" fill="var(--surface)" stroke="currentColor" strokeWidth="3" /><circle cx="314" cy="144" r="6" fill="currentColor" /><circle cx="200" cy="71" r="24" fill="currentColor" opacity=".12" />
      </>}
      {kind === "other" && <>
        <g transform="rotate(-8 153 129)"><path d="M74 61H248V186H74Z" fill="var(--surface)" stroke="currentColor" strokeWidth="2" /><path d="M91 79H232V162H91Z" fill="currentColor" opacity=".1" /><path d="M107 143L143 101L172 126L196 105L220 143" stroke="currentColor" strokeWidth="3" /><circle cx="203" cy="93" r="9" fill="currentColor" opacity=".5" /></g><circle cx="291" cy="118" r="42" fill="var(--surface)" stroke="currentColor" strokeWidth="2" /><path d="M304 100L297 127L278 139L285 112Z" fill="currentColor" opacity=".6" /><path d="M291 69V78M291 158V167M242 118H251M331 118H340" stroke="currentColor" strokeWidth="2" />
      </>}
    </svg>
  </div>;
}

export function ExperienceKindIcon({ kind, className = "" }: { kind: MomentKind; className?: string }) {
  const paths: Record<MomentKind, ReactNode> = {
    concert: <><path d="M9 17V5l11-2v12M9 9l11-2" /><ellipse cx="6" cy="17" rx="3" ry="2" /><ellipse cx="17" cy="15" rx="3" ry="2" /></>,
    show: <><path d="M3 4h18v16H3zM3 4c1 7 3 9 6 10M21 4c-1 7-3 9-6 10M8 20h8" /><path d="M12 8v8m-3-4h6" /></>,
    exhibition: <><path d="M3 4h18v16H3zM6 7h12v10H6zM7 16l4-4 3 2 2-3 2 5" /><circle cx="9" cy="10" r="1" /></>,
    museum: <><path d="M2 9l10-6 10 6H2zM4 20h16M6 11v6m6-6v6m6-6v6M3 17h18" /></>,
    walk: <><path d="M3 19c6 0 5-7 10-7s3-7 8-7M6 4L3 9h6L6 4zm0 5v3" /><circle cx="3" cy="19" r="1" /><circle cx="21" cy="5" r="1" /></>,
    other: <><circle cx="12" cy="12" r="9" /><path d="M16 7l-2 7-6 3 2-7 6-3z" /></>,
  };
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[kind]}</svg>;
}

export function ExperiencePeople({ people, className = "", size = "sm" }: {
  people: ExperiencePerson[];
  className?: string;
  size?: "sm" | "md";
}) {
  const accepted = people.filter(person => person.invitationState === "accepted");
  if (accepted.length === 0) return null;
  const dimensions = size === "md" ? 48 : 36;
  const sizeClass = size === "md" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";
  return <div role="list" className={`flex items-center -space-x-2 ${className}`}>
    {accepted.slice(0, 4).map(person => {
      const name = person.guestName ?? person.displayName ?? person.username ?? "";
      const initials = name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? "").join("").toLocaleUpperCase("es");
      return <span role="listitem" aria-label={name || undefined} title={name || undefined} key={person.id} className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-surface bg-surface-3 font-medium text-foreground ${sizeClass}`}>
        {person.avatarUrl ? <Image src={person.avatarUrl} alt="" width={dimensions} height={dimensions} unoptimized className="h-full w-full object-cover" /> : <span aria-hidden="true">{initials || "?"}</span>}
      </span>;
    })}
    {accepted.length > 4 && <span role="listitem" className={`relative grid shrink-0 place-items-center rounded-full border-2 border-surface bg-surface-muted text-foreground ${sizeClass}`}>+{accepted.length - 4}</span>}
  </div>;
}
