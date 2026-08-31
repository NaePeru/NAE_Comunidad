// ============================================================================
// NAE — telegram-bot (Edge Function)
// ============================================================================
// Bot @asistente_nae_bot — canal de avisos de la comunidad.
//
// Webhook de Telegram (POST): procesa mensajes
//   /start   → suscribe al canal de avisos + bienvenida
//   /stop    → desuscribe
//   "cursos" → info de cursos + link
//   default  → menú de ayuda
//
// GET → diagnóstico (estado del bot)
//
// Secret del bot ya viene en el código (token de BotFather).
// ⚠️ Esta función debe tener "Verify JWT" DESACTIVADO (Telegram no manda JWT).
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_TOKEN = '8870100192:AAHstX3uJSqanFoLa45w3w8FYgzIovoxiP8';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function tg(method: string, payload: Record<string, unknown>) {
  return fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function enviar(chatId: string, texto: string) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: texto,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── GET: diagnóstico ──
  if (req.method === 'GET') {
    return json({ ok: true, bot: 'asistente_nae_bot', estado: 'activo' });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const update = await req.json();
    const msg = update?.message;
    if (!msg || !msg.chat?.id) return json({ ok: true });

    const chatId = String(msg.chat.id);
    const texto = String(msg.text ?? '').trim().toLowerCase();
    const nombre = msg.from?.first_name ?? '';
    const username = msg.from?.username ?? null;

    // ── /start → suscribir + bienvenida ──
    if (texto === '/start' || texto.startsWith('/start ')) {
      await admin.from('telegram_suscriptores').upsert(
        { chat_id: chatId, nombre, username },
        { onConflict: 'chat_id' },
      );
      await enviar(chatId,
        `👋 ¡Hola${nombre ? ' ' + nombre : ''}! Soy el asistente de <b>NAE</b> (Comunidad de Análisis de Datos).\n\n` +
        `🔔 Estás suscripto a los avisos: anuncios, seminarios de los sábados y novedades llegarán acá.\n\n` +
        `🎓 Plataforma: www.naeacademia.com\n` +
        `💬 Si sos alumno, también tenés a Alessandra dentro de la plataforma.\n\n` +
        `Escribí <b>cursos</b> para ver qué hay disponible.`
      );
      return json({ ok: true });
    }

    // ── /stop → desuscribir ──
    if (texto === '/stop' || texto === '/desuscribir' || texto === '/stop@asistente_nae_bot') {
      await admin.from('telegram_suscriptores').delete().eq('chat_id', chatId);
      await enviar(chatId, '✅ Te desuscribiste de los avisos de NAE. Podés volver con /start cuando quieras.');
      return json({ ok: true });
    }

    // ── "cursos" → info ──
    if (texto.includes('curso') || texto.includes('curso') || texto.includes('excel') || texto.includes('power')) {
      await enviar(chatId,
        `📚 <b>Cursos de NAE</b>\n\n` +
        `🎁 GRATIS para empezar:\n` +
        `  · Excel Nivel Básico\n` +
        `  · Tabla y Gráficos Dinámicos\n\n` +
        `🎓 Todos los cursos están en la plataforma:\n` +
        `www.naeacademia.com\n\n` +
        `💬 Dudas de matrícula o pagos: WhatsApp 988502354`
      );
      return json({ ok: true });
    }

    // ── "seminario" / "evento" ──
    if (texto.includes('seminario') || texto.includes('evento') || texto.includes('sabado') || texto.includes('sábado')) {
      await enviar(chatId,
        `📡 <b>Seminarios en vivo</b>\n\n` +
        `Todos los sábados — análisis de datos con IA.\n` +
        `El aviso con el link llega por acá mismo el día del evento.\n\n` +
        `Detalle de fechas: sección Eventos en www.naeacademia.com`
      );
      return json({ ok: true });
    }

    // ── default → menú ──
    await enviar(chatId,
      `Puedo ayudarte con:\n\n` +
      `<b>cursos</b> — qué hay disponible\n` +
      `<b>seminario</b> — próximos eventos\n\n` +
      `🔔 Recibís los avisos de NAE automáticamente.\n` +
      `Plataforma: www.naeacademia.com`
    );
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
