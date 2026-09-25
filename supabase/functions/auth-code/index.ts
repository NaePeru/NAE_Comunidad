// ============================================================================
// NAE — auth-code (Edge Function)
// Login sin contraseña: código de 6 dígitos enviado por Resend.
//
// POST { accion: 'enviar',   email, nombre }  → envía el código (10 min de vida)
// POST { accion: 'verificar', email, codigo } → valida y devuelve una
//     contraseña temporal para crear la sesión (el usuario jamás la ve)
//
// Por qué no usa el OTP de Supabase: el correo interno de Supabase está
// limitado (~2-3/hora) en el plan gratis y los códigos dejaban de llegar.
// Aquí el email sale por Resend (dominio verificado, 100/día).
//
// SECRETS (ya existen a nivel proyecto): RESEND_API_KEY, OWNER_EMAIL
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = 'NAE <no-reply@naeacademia.com>';
const VIDAIMS = 10 * 60 * 1000;      // 10 minutos
const MAX_ENVIOS_15MIN = 3;          // anti-spam por correo
const MAX_INTENTOS = 5;              // por código

// Emails bloqueados (misma regla que el registro clásico), admin exceptuado
const ADMIN_EMAILS = ['geronimo.cruzado.c@uni.edu.pe'];
const DOMINIOS_BLOQUEADOS = ['@uni.edu.pe'];

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
  if (!RESEND_API_KEY) return json({ error: 'Falta RESEND_API_KEY' }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const accion = String(body?.accion ?? '');
    const email = String(body?.email ?? '').toLowerCase().trim();
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValido) return json({ error: 'Correo no válido.' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const sha256 = async (texto: string) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // ── ACCIÓN: ENVIAR CÓDIGO ──────────────────────────────────────────────
    if (accion === 'enviar') {
      // Bloqueo silencioso de dominios (excepto admin): respondemos "ok" sin enviar
      const bloqueado = !ADMIN_EMAILS.includes(email) &&
        DOMINIOS_BLOQUEADOS.some(d => email.endsWith(d));
      if (!bloqueado) {
        // Anti-spam: máx N códigos por correo en 15 minutos
        const desde = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { count } = await admin.from('login_codes')
          .select('id', { count: 'exact', head: true })
          .eq('email', email).gte('creado_en', desde);
        if ((count ?? 0) >= MAX_ENVIOS_15MIN) {
          return json({ error: 'Pediste varios códigos seguidos. Espera unos minutos y revisa tu correo.' }, 429);
        }

        const codigo = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await sha256(codigo);

        const { error: errIns } = await admin.from('login_codes').insert({
          email,
          code_hash: codeHash,
          expires_at: new Date(Date.now() + VIDAIMS).toISOString(),
        });
        if (errIns) return json({ error: 'No se pudo generar el código.' }, 500);

        const html = `
        <div style="font-family:Arial,sans-serif;background:#0B0F19;padding:40px 20px;">
          <div style="max-width:420px;margin:0 auto;background:#111827;border:1px solid #1F2937;border-radius:14px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#F2A900,#E05C2A);padding:16px 24px;">
              <span style="font-size:18px;font-weight:800;color:#0B0F19;">◆ NAE</span>
            </div>
            <div style="padding:28px 24px;text-align:center;color:#E5E7EB;">
              <p style="font-size:15px;color:#9CA3AF;margin:0 0 14px;">Tu código de acceso es:</p>
              <div style="font-size:38px;font-weight:800;letter-spacing:10px;color:#F2A900;background:#0B0F19;border-radius:10px;padding:14px 0;margin:0 0 14px;">${codigo}</div>
              <p style="font-size:13px;color:#6B7280;margin:0;">Vence en 10 minutos. Si no lo pediste, ignora este correo.</p>
            </div>
            <div style="padding:14px 24px;background:#0D1117;color:#6B7280;font-size:12px;text-align:center;">
              Comunidad de Análisis de Datos · www.naeacademia.com
            </div>
          </div>
        </div>`;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: email, subject: `Tu código NAE: ${codigo}`, html }),
        });
        if (!res.ok) return json({ error: 'El correo no pudo enviarse. Intenta de nuevo.' }, 500);
      }
      return json({ ok: true });
    }

    // ── ACCIÓN: VERIFICAR CÓDIGO ───────────────────────────────────────────
    if (accion === 'verificar') {
      const codigo = String(body?.codigo ?? '').trim();
      if (!/^\d{6}$/.test(codigo)) return json({ error: 'El código tiene 6 dígitos.' }, 400);

      const { data: filas } = await admin.from('login_codes')
        .select('id, code_hash, expires_at, usado, intentos')
        .eq('email', email).eq('usado', false)
        .order('creado_en', { ascending: false }).limit(1);
      const reg = filas?.[0];
      if (!reg) return json({ error: 'Pide un código nuevo.' }, 400);
      if (new Date(reg.expires_at) < new Date()) return json({ error: 'El código venció. Pide uno nuevo.' }, 400);
      if (reg.intentos >= MAX_INTENTOS) return json({ error: 'Demasiados intentos. Pide un código nuevo.' }, 429);

      const hashIngresado = await sha256(codigo);
      if (hashIngresado !== reg.code_hash) {
        await admin.from('login_codes').update({ intentos: reg.intentos + 1 }).eq('id', reg.id);
        return json({ error: 'Código incorrecto.' }, 400);
      }
      await admin.from('login_codes').update({ usado: true }).eq('id', reg.id);

      // Buscar (o crear) el usuario y fijarle una contraseña aleatoria de un solo uso
      const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existente = usersList?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === email);

      const password = crypto.randomUUID().replace(/-/g, '') + 'Aa1!';
      let userId: string;

      if (existente) {
        const { error } = await admin.auth.admin.updateUserById(existente.id, { password });
        if (error) return json({ error: 'No se pudo iniciar sesión. Intenta de nuevo.' }, 500);
        userId = existente.id;
      } else {
        const nombre = String(body?.nombre ?? '').trim().split(/\s+/).slice(0, 2).join(' ') || email.split('@')[0];
        const { data: nuevo, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nombre },
        });
        const userNuevo = (nuevo as { user?: { id: string } })?.user ?? (nuevo as { id?: string });
        if (error || !userNuevo?.id) return json({ error: 'No se pudo crear tu cuenta.' }, 500);
        userId = userNuevo.id;
      }

      return json({ ok: true, password });
    }

    return json({ error: 'Acción no válida' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
