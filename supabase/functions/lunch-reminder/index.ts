// Edge Function: envia push para alunos sem QR lido nem justificativa hoje.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async () => {
  // Trava de segurança: só envia entre 12:20 e 12:59 (Brasília)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < 12 * 60 + 20 || mins >= 13 * 60) {
    return Response.json({ skipped: "fora da janela" });
  }

  const { data, error } = await supabase.rpc("pending_lunch_reminders");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const payload = JSON.stringify({
    title: "Você ainda não almoçou 🍽️",
    body: "Toque aqui e conte o motivo (marmita, iFood, a caminho...).",
    url: "/carteirinha.html?justificar=1",
  });

  let sent = 0, removed = 0;
  await Promise.all((data ?? []).map(async (r: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        payload,
        { TTL: 120, urgency: "high" },
      );
      sent++;
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", r.endpoint);
        removed++;
      }
    }
  }));

  return Response.json({ pending: data?.length ?? 0, sent, removed });
});
