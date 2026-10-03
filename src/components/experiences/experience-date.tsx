"use client";
import { useTranslations } from "next-intl";
export function ExperienceDate({startsOn,endsOn}:{startsOn:string|null;endsOn:string|null}) {
  const t=useTranslations("experiences");
  const format=(value:string)=>new Intl.DateTimeFormat("es",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));
  return <span>{startsOn ? <time dateTime={startsOn}>{format(startsOn)}</time> : endsOn ? <>{t("until")} <time dateTime={endsOn}>{format(endsOn)}</time></> : t("noDate")}{startsOn&&endsOn&&startsOn!==endsOn ? <> — <time dateTime={endsOn}>{format(endsOn)}</time></> : null}</span>;
}
