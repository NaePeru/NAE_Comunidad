// ============================================================================
// NAE — bot-matricula (Edge Function) [FASE 3: Alessandra matricula]
// ============================================================================
// Flujo de la especificación:
//   1. Alessandra conversa y recoge: nombre + DNI + código cursop
//   2. El frontend detecta el bloque [[MATRICULAR:{...}]] y llama ESTA función
//   3. Esta función: guarda/actualiza t_alumnos (upsert por DNI)
//                     + llama al RPC bot_crear_matricula (sistema)
//   4. El RPC crea: t_matricula 'pendiente' + t_pago 'pendiente'
//   5. La secretaría confirma el pago en el panel → el TRIGGER confirma todo.
//
// ⚠️ Regla de la spec: el bot NUNCA escribe t_matricula directamente.
//    Solo pasa por el RPC (security definer). Aquí no hay UPDATE a t_matricula.
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

  try {
    // ── 1. Validar sesión del alumno (cualquier miembro autenticado) ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'No autenticado' }, 401);

    const body = await req.json();
    const dni = String(body?.dni ?? '').trim();
    const nombres = String(body?.nombres ?? '').trim();
    const cursop = String(body?.cursop ?? '').trim();
    const mail = String(body?.mail ?? user.email ?? '').trim() || null;
    const telefono = String(body?.telefono ?? '').trim() || null;

    // ── 2. Validaciones ──
    if (!/^\d{8}$/.test(dni)) return json({ error: 'DNI inválido (debe tener 8 dígitos)' }, 400);
    if (nombres.length < 3) return json({ error: 'Falta el nombre completo' }, 400);
    if (!cursop) return json({ error: 'Falta el código del curso programado (cursop)' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // El cursop debe existir y estar vigente (sin fecha_fin o fecha_fin futura)
    const { data: cp } = await admin
      .from('t_cursop')
      .select('cursop, fecha_fin, t_cursos(nombre, costo)')
      .eq('cursop', cursop)
      .maybeSingle();
    if (!cp) return json({ error: 'Ese código de curso programado no existe' }, 404);
    if (cp.fecha_fin && cp.fecha_fin < new Date().toISOString().slice(0, 10)) {
      return json({ error: 'Ese curso ya finalizó' }, 400);
    }

    // ── 3. Guardar/actualizar al alumno (upsert por DNI) ──
    const { error: eAlu } = await admin
      .from('t_alumnos')
      .upsert({ dni, nombres, mail, telefono }, { onConflict: 'dni' });
    if (eAlu) return json({ error: 'No se pudo registrar al alumno: ' + eAlu.message }, 500);

    // ── 4. Crear matrícula+pago pendiente VÍA RPC (regla de la spec) ──
    const { data: matId, error: eRpc } = await admin.rpc('bot_crear_matricula', {
      p_dni: dni,
      p_cursop: cursop,
      p_monto: cp.t_cursos?.costo ?? 50,
      p_pasarela: 'chat',
    });
    if (eRpc) {
      if (String(eRpc.message).includes('duplicate')) {
        return json({ ok: true, aviso: 'Ya estaba matriculado en este curso' });
      }
      return json({ error: 'El sistema no pudo matricular: ' + eRpc.message }, 500);
    }

    return json({
      ok: true,
      matricula_id: matId,
      curso: cp.t_cursos?.nombre ?? cursop,
      monto: cp.t_cursos?.costo ?? 50,
      mensaje: 'Matrícula registrada como PENDIENTE DE PAGO',
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
