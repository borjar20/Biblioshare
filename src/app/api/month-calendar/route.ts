import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");

  if (!month || !MONTH_RE.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const calendar = await getMonthCalendar(supabase, user.id, month);
  return NextResponse.json(calendar);
}
