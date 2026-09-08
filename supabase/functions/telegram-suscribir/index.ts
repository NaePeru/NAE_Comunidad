// ============================================================================
// NAE — telegram-suscribir (Edge Function)
// ============================================================================
// Guarda un suscriptor de Telegram cuando envía /start al bot.
// La llama n8n (nodo Guardar suscriptor) con un POST simple — sin apikey,
// sin políticas: inserta con permisos de servidor, no puede ser bloqueado
// por RLS.
//
//   POST { "chat_id": "8395411681", "nombre": "Geronimo", "username": "..." }
//   → { "ok": true }
//
// ⚠️ IMPORTANTE: en la configuración de la función, "Verify JWT" debe estar
//    DESACTIVADO (n8n no manda token de Supabase).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { chat_id, nombre, username } = await req.json();
    const id = String(chat_id ?? '').trim();

    // Validación mínima anti-basura: los chat_id de Telegram son numéricos
    if (!/^-?\d{1,15}$/.test(id)) return json({ error: 'chat_id inválido' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const { error } = await admin.from('telegram_suscriptores').upsert(
      {
        chat_id: id,
        nombre: String(nombre ?? '').slice(0, 64) || null,
        username: String(username ?? '').slice(0, 32) || null,
      },
      { onConflict: 'chat_id' },
    );
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
