"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type WebSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Mutaciones de suscripción push (E5.D4). Sin política UPDATE en la tabla
// (ver migración) — re-suscribirse es delete+insert a nivel de aplicación,
// no un upsert de Postgres.

export async function subscribeToPush(subscription: WebSubscriptionJson): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("channel", "web")
    .filter("credentials->>endpoint", "eq", subscription.endpoint);

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    channel: "web",
    credentials: subscription,
  });
  if (error) throw error;
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("channel", "web")
    .filter("credentials->>endpoint", "eq", endpoint);
  if (error) throw error;
}
