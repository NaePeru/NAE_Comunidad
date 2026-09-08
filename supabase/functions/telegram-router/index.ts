// ============================================================================
// NAE — telegram-router (Edge Function) — ACTIVA EN PRODUCCIÓN
// ============================================================================
// Recepcionista de Telegram. El webhook del bot apunta AQUÍ (no a n8n).
//
//   /start  → guarda suscriptor (service role) + saluda directo
//   /stop   → desuscribe
//   resto   → reenvía el update INTACTO a n8n (asistente de cursos con IA)
//
// Por qué existe: el guardado vía nodo HTTP de n8n + política RLS nunca
// funcionó de forma estable; aquí el guardado usa permisos de servidor y no
// depende de ningún nodo de n8n. Verify JWT: OFF.
//
// Webhook actual del bot (mantener apuntando aquí):
//   https://dlpsvbrctccnmvkbcsfp.supabase.co/functions/v1/telegram-router
// Si algún día n8n "roba" el webhook al reactivar un workflow, restaurarlo:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d "url=https://dlpsvbrctccnmvkbcsfp.supabase.co/functions/v1/telegram-router" \
//     -d 'allowed_updates=["message"]'
// ============================================================================

const TG = 'https://api.telegram.org/bot8870100192:AAHstX3uJSqanFoLa45w3w8FYgzIovoxiP8';
const N8N = 'https://ceps2026.app.n8n.cloud/webhook/d1d329a3-5f7e-45de-8913-db4b7203f142';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', ...cors } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return json({ ok: true, router: 'telegram-router', estado: 'activo' });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const raw = await req.text();

  try {
    const update = JSON.parse(raw);
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const texto = String(msg?.text ?? '').trim().toLowerCase();

    // /start → guardar suscriptor + saludar (permisos de servidor, directo)
    if (chatId && (texto === '/start' || texto.startsWith('/start '))) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
      );
      const nombre = msg.from?.first_name ?? '';
      await admin.from('telegram_suscriptores').upsert(
        { chat_id: String(chatId), nombre, username: msg.from?.username ?? null },
        { onConflict: 'chat_id' },
      );
      await fetch(`${TG}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `¡Hola${nombre ? ' ' + nombre : ''}! Soy el Asistente NAE.\n\n` +
            `Ya estás suscrito a los avisos de la comunidad: anuncios y novedades llegarán aquí.\n\n` +
            `Pregúntame por los cursos de Excel, Power BI, SQL e IA.\n` +
            `Plataforma: www.naeacademia.com`,
        }),
      });
      return json({ ok: true, accion: 'suscripto' });
    }

    // /stop → desuscribir
    if (chatId && (texto === '/stop' || texto.startsWith('/stop@'))) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
      );
      await admin.from('telegram_suscriptores').delete().eq('chat_id', String(chatId));
      await fetch(`${TG}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: 'Te desuscribiste de los avisos de NAE. Vuelve con /start cuando quieras.' }),
      });
      return json({ ok: true, accion: 'desuscripto' });
    }

    // Cualquier otro mensaje → pasarlo intacto a n8n (tu asistente de cursos)
    await fetch(N8N, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw });
    return json({ ok: true, accion: 'reenviado' });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
