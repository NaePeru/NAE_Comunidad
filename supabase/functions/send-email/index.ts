// ============================================================================
// NAE — send-email (Edge Function)
// Emails transaccionales vía Resend.
//
// Tipos soportados:
//   'prueba'    → email de verificación
//   'like'      → (legacy, el frontend ya no lo usa) te dieron like
//   'anuncio'   → cuando el ADMIN publica: broadcast a todos los alumnos
//   'seminario' → recordatorio automático (pg_cron, sábados 08:00 Lima)
//
// SECRETS necesarios (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY = re_...          (tu API key de Resend)
//   OWNER_EMAIL    = tu@correo.com   (email de tu cuenta Resend)
//   CRON_SECRET    = nae_cron_2026_Xk7mQ9vR4pZ2wT8L  (para llamadas programadas)
//
// ⚠️ MODO TEST: sin dominio verificado, Resend SOLO permite enviar al dueño.
// Cuando verifiques tu dominio: FROM → 'NAE <no-reply@tudominio.com>' y
// TEST_MODE = false.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

// 🎉 DOMINIO VERIFICADO (naeacademia.com en Resend) → PRODUCCIÓN ACTIVADA:
// los emails llegan a TODOS los alumnos desde no-reply@naeacademia.com.
const TEST_MODE = false;
const FROM = 'NAE <no-reply@naeacademia.com>';
const BASE_URL = 'https://www.naeacademia.com';

// Email base con branding NAE (contenido central parametrizable)
function emailNAE(titulo: string, cuerpo: string, ctaUrl: string, ctaTexto: string, subtitulo = ''): string {
  return `
  <div style="font-family:Arial,sans-serif;background:#0B0F19;padding:40px 20px;">
    <div style="max-width:480px;margin:0 auto;background:#111827;border:1px solid #1F2937;border-radius:14px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#F2A900,#E05C2A);padding:16px 24px;">
        <span style="font-size:18px;font-weight:800;color:#0B0F19;">◆ NAE</span>
        ${subtitulo ? `<span style="float:right;font-size:13px;color:#0B0F19;font-weight:700;">${subtitulo}</span>` : ''}
      </div>
      <div style="padding:24px;color:#E5E7EB;">
        <p style="font-size:22px;margin:0 0 12px;">${titulo}</p>
        ${cuerpo}
        <a href="${ctaUrl}" style="display:inline-block;background:#F2A900;color:#0B0F19;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:8px;">${ctaTexto}</a>
      </div>
      <div style="padding:14px 24px;background:#0D1117;color:#6B7280;font-size:12px;">
        Comunidad de Análisis de Datos · Recibiste este email porque participás en NAE
      </div>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  // CORS: sin esto los navegadores reciben "Failed to fetch" (falta del rewrite)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  // Respuesta al preflight CORS de los navegadores
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!RESEND_API_KEY) return json({ error: 'Falta secret RESEND_API_KEY' }, 500);
    if (!OWNER_EMAIL) return json({ error: 'Falta secret OWNER_EMAIL' }, 500);

    // ── 0. Autenticación: usuario con sesión O llamada del sistema (cron) ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const esLlamadaSistema = CRON_SECRET !== '' && authHeader.replace('Bearer ', '') === CRON_SECRET;

    let userId: string | null = null;
    if (!esLlamadaSistema) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      );
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!user) return json({ error: 'No autenticado' }, 401);
      userId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const tipo = body?.tipo;
    if (!tipo) return json({ error: 'Falta tipo' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Envía un email a un destinatario vía Resend. Devuelve true/false.
    const enviarResend = async (to: string, subject: string, html: string, fromOverride?: string): Promise<boolean> => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromOverride ?? FROM, to, subject, html }),
      });
      return res.ok;
    };

    // Registra en email_log (para auditoría/dedup).
    const logEmail = async (recipient: string, t: string, enviadoA: string) => {
      await admin.from('email_log').insert({ recipient, tipo: t, enviado_a: enviadoA });
    };

    // ── Helper broadcast: en test → 1 al dueño; en producción → todos ──
    // ── Difusión paralela por TELEGRAM (bot @asistente_nae_bot) ──
    // Además del email, los suscriptores del bot reciben el aviso instantáneo.
    const difundirTelegram = async (texto: string) => {
      try {
        const { data: suscriptores } = await admin
          .from('telegram_suscriptores').select('chat_id').limit(2000);
        const TG_TOKEN = '8870100192:AAHstX3uJSqanFoLa45w3w8FYgzIovoxiP8';
        let enviados = 0;
        for (const s of (suscriptores ?? [])) {
          const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: s.chat_id,
              text: texto,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          });
          if (r.ok) enviados++;
        }
        return enviados;
      } catch (e) {
        return 0; // Telegram es un canal extra: si falla, el email ya salió
      }
    };

    const broadcast = async (t: string, subjectProd: string, htmlProd: (correo?: string) => string, resumenTest: string) => {
      const { count: totalAlumnos } = await admin
        .from('profiles').select('id', { count: 'exact', head: true }).eq('activo', true);

      if (TEST_MODE) {
        const ok = await enviarResend(
          OWNER_EMAIL,
          `[TEST — iría a ${totalAlumnos ?? 0} alumnos] ${subjectProd}`,
          htmlProd(),
        );
        if (!ok) return json({ error: 'Resend rechazó el envío (test)' }, 500);
        await logEmail(userId ?? '00000000-0000-0000-0000-000000000000', t, OWNER_EMAIL);
        return json({ ok: true, test: true, enviados: 0, alcanzaria_a: totalAlumnos ?? 0, nota: resumenTest });
      }

      const { data: activos } = await admin.from('profiles').select('id').eq('activo', true).limit(1000);
      const ids = (activos ?? []).map((p: { id: string }) => p.id);
      const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const emailById = new Map(usersList?.users?.map((u: { id: string; email?: string }) => [u.id, u.email]) ?? []);

      let enviados = 0;
      for (const id of ids) {
        const destino = emailById.get(id);
        if (!destino) continue;
        if (await enviarResend(destino, subjectProd, htmlProd(destino))) {
          enviados++;
          await logEmail(id, t, destino);
        }
      }
      return json({ ok: true, enviados, test: false });
    };
    // ═══════════════ TIPO: CAMPAÑA (invitación a ex-alumnos, solo admin) ═══════════════
    if (tipo === 'campana') {
      if (esLlamadaSistema) return json({ error: 'Requiere sesión de admin' }, 403);
      const { data: perfilLlamador } = await admin
        .from('profiles').select('rol').eq('id', userId).single();
      if (perfilLlamador?.rol !== 'admin') return json({ error: 'Solo el administrador' }, 403);

      const leads = Array.isArray(body?.leads) ? body.leads : [];
      const asunto = String(body?.asunto ?? 'NAE');
      const mensaje = String(body?.mensaje ?? '');
      if (leads.length === 0) return json({ error: 'Sin destinatarios' }, 400);

      // ── Límite diario: protege la reputación del dominio (oleadas) ──
      const LIMITE_DIARIO = 100;
      const inicioHoy = new Date();
      inicioHoy.setUTCHours(0, 0, 0, 0);
      const { count: enviadosHoy } = await admin
        .from('email_log').select('id', { count: 'exact', head: true })
        .eq('tipo', 'campana').gte('creado_en', inicioHoy.toISOString());
      const cupo = Math.max(0, LIMITE_DIARIO - (enviadosHoy ?? 0));
      if (cupo === 0) {
        return json({ ok: false, error: 'Límite diario alcanzado (100). Continuá mañana — así cuidamos la reputación del dominio.' });
      }

      const lote = leads.slice(0, cupo);
      const FROM_CAMPAIGN = 'Geronimo - NAE <geronimo@naeacademia.com>';
      const titleCase = (s: string) =>
        (s || '').toLocaleLowerCase('es-PE').replace(/(^|\s)\S/g, c => c.toUpperCase());

      let enviados = 0;
      const resultados: { email: string; ok: boolean }[] = [];
      for (const l of lote) {
        const email = String(l.email ?? '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          resultados.push({ email, ok: false });
          continue;
        }
        // Personalización: [nombre] = primer nombre, [nombre_completo], [curso]
        const palabras = String(l.nombre ?? '').trim().split(/\s+/);
        const primerNombre = titleCase(palabras[0] ?? '');
        const nombreCorto = titleCase(palabras.slice(0, 2).join(' '));
        const texto = mensaje
          .replaceAll('[nombre]', primerNombre)
          .replaceAll('[nombre_completo]', nombreCorto)
          .replaceAll('[curso]', titleCase(String(l.curso ?? '')));

        const ok = await enviarResend(
          email,
          asunto,
          emailNAE(
            'Una invitación de tu profe 📊',
            `<p style="font-size:15px;color:#E5E7EB;line-height:1.7;margin:0;white-space:pre-line;">${texto}</p>`,
            `${BASE_URL}`, 'Unirme a NAE — es gratis →'),
          FROM_CAMPAIGN,
        );
        if (ok) {
          enviados++;
          await logEmail(userId ?? '00000000-0000-0000-0000-000000000000', 'campana', email);
        }
        resultados.push({ email, ok });
      }

      return json({
        ok: true,
        enviados,
        fallidos: resultados.filter(r => !r.ok).length,
        procesados: lote.length,
        cupo_restante: cupo - enviados,
        limite_diario: LIMITE_DIARIO,
        resultados,
      });
    }

    // ═══════════════ TIPO: SEMINARIO (recordatorio sábado) ═══════════════
    if (tipo === 'seminario') {
      if (!esLlamadaSistema) return json({ error: 'Solo el sistema puede disparar este email' }, 403);

      // Fecha de HOY en Lima (los eventos se agendan en hora local)
      const hoyLima = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD

      const { data: eventos } = await admin
        .from('events')
        .select('titulo, hora, link, tipo')
        .eq('fecha', hoyLima)
        .limit(1);

      if (!eventos || eventos.length === 0) {
        return json({ skipped: true, motivo: 'sin-evento-hoy', fecha: hoyLima });
      }
      const ev = eventos[0];
      const horaStr = ev.hora ? String(ev.hora).substring(0, 5) : 'por confirmar';

      return await broadcast(
        'seminario',
        `📡 HOY a las ${horaStr}: ${ev.titulo}`,
        () => emailNAE(
          '📡 ¡Hoy es el seminario!',
          `<p style="font-size:16px;color:#9CA3AF;line-height:1.6;margin:0 0 8px;">
             <strong style="color:#fff;">${ev.titulo}</strong><br>
             🕐 Hoy a las <strong style="color:#F2A900;">${horaStr}</strong> (hora Perú)
           </p>
           <p style="font-size:14px;color:#9CA3AF;">Nos vemos en línea. Si no podés asistir, quedará grabado.</p>`,
          ev.link ? ev.link : `${BASE_URL}/app/eventos.html`,
          ev.link ? 'Unirme al seminario →' : 'Ver detalles →',
          'Seminario',
        ),
        `Seminario de hoy: ${ev.titulo} ${horaStr}`,
      );
    }

    // ═══════════════ TIPO: ANUNCIO (admin publicó) ═══════════════
    if (tipo === 'anuncio') {
      if (esLlamadaSistema) return json({ error: 'Este email requiere sesión de admin' }, 403);
      const contenido = String(body?.contenido ?? '').slice(0, 200);

      // Difusión paralela por Telegram (no bloquea el email)
      const tgEnviados = await difundirTelegram(
        `📢 <b>Nueva publicación en NAE</b>\n\n"${contenido}"\n\n` +
        `👉 www.naeacademia.com`
      );

      const emailRes = await broadcast(
        'anuncio',
        '📢 Nueva publicación en NAE',
        () => emailNAE(
          '📢 Nueva publicación en la comunidad',
          `<p style="font-size:15px;color:#9CA3AF;line-height:1.6;margin:0;">"${contenido}..."</p>`,
          `${BASE_URL}/app/comunidad.html`,
          'Leer en la comunidad →',
          'Anuncio',
        ),
        `Anuncio: ${contenido.slice(0, 60)}...`,
      );
      // Adjuntar el conteo de Telegram a la respuesta del email
      const emailBody = await new Response(emailRes.body, emailRes).json().catch(() => ({}));
      return json({ ...emailBody, telegram_enviados: tgEnviados });
    }

    // ═══════════════ TIPO: PRUEBA ═══════════════
    if (tipo === 'prueba') {
      const ok = await enviarResend(
        OWNER_EMAIL,
        'NAE — Email de prueba ✅',
        emailNAE('¡Funciona! 🎉', '<p style="color:#9CA3AF;font-size:14px;margin:0;">Este es un email de prueba del sistema de notificaciones de NAE.</p>', BASE_URL, 'Ir a la comunidad →'),
      );
      if (!ok) return json({ error: 'Resend rechazó el envío' }, 500);
      return json({ ok: true, to: OWNER_EMAIL, test: TEST_MODE });
    }

    // ═══════════════ TIPO: LIKE (legacy — el frontend ya no lo dispara) ═════
    if (tipo === 'like') {
      const recipientId = body?.recipient_user_id;
      if (!recipientId) return json({ error: 'Falta recipient_user_id' }, 400);
      if (recipientId === userId) return json({ skipped: true, motivo: 'auto' });
      const { data: target } = await admin.auth.admin.getUserById(recipientId);
      const emailDestino = target?.user?.email;
      if (!emailDestino) return json({ skipped: true, motivo: 'sin-email' });
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: ya } = await admin
        .from('email_log').select('id')
        .eq('recipient', recipientId).eq('tipo', 'like').gte('creado_en', desde).limit(1);
      if (ya && ya.length > 0) return json({ skipped: true, motivo: 'dedup-24h' });
      const to = TEST_MODE ? OWNER_EMAIL : emailDestino;
      const ok = await enviarResend(
        to,
        TEST_MODE ? `[TEST → ${emailDestino}] Recibiste un like en NAE 👍` : 'Recibiste un like en NAE 👍',
        emailNAE('👍 ¡Alguien le dio like a tu publicación!',
          '<p style="font-size:15px;color:#9CA3AF;line-height:1.6;margin:0 0 8px;">Tu aporte le sirvió a la comunidad. Entrá a ver quién fue.</p>',
          `${BASE_URL}/app/comunidad.html`, 'Ver la comunidad →'),
      );
      if (!ok) return json({ error: 'Resend rechazó el envío' }, 500);
      await logEmail(recipientId, 'like', to);
      return json({ ok: true, to, test: TEST_MODE });
    }

    return json({ error: 'Tipo no soportado' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
