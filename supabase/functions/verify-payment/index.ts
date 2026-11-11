// ============================================================================
// NAE — verify-payment (Edge Function) [RESPALDO del código desplegado]
// ============================================================================
// Verificación automática de vouchers de pago (Yape/Plin) con IA:
//   1. Calcula hash SHA-256 de la imagen → bloquea vouchers reutilizados
//   2. Lee el voucher con GPT-4o vision (monto, destinatario, N° operación)
//   3. Valida: monto S/79-80.99 + nombre del admin + operación no repetida
//   4. Si aprueba: registra en payment_logs y desbloquea el curso (course_access)
//
// Secret necesario: OPENAI_API_KEY
// Tablas usadas: payment_logs (con columna voucher_hash), course_access
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { voucherUrl, courseId } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // === 1. Calcular huella digital (hash) ===
    const imageResponse = await fetch(voucherUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", imageBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const voucherHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // === 2. Anti-Fraude por Hash ===
    const { data: existingHash } = await supabaseAdmin
      .from('payment_logs')
      .select('id')
      .eq('voucher_hash', voucherHash)
      .limit(1);

    if (existingHash && existingHash.length > 0) {
      return new Response(
        JSON.stringify({ aprobado: false, ya_usado: true, motivo: "Este comprobante ya fue utilizado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === 3. Leer con IA ===
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Falta OPENAI_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `Eres un verificador de pagos de Yape/Plin. Analiza la imagen y extrae:
            1. monto: El monto (solo número, ej: 50)
            2. destinatario: El nombre de QUIEN RECIBE el dinero
            3. numero_operacion: El número de operación o código de transacción (suele ser largo, ej: 12345678901)
            4. fecha: La fecha del voucher (formato YYYY-MM-DD)
            5. hora: La hora
            6. metodo: yape, plin u otro
            Responde SOLO en JSON:
            {"monto": 50, "destinatario": "Nombre", "numero_operacion": "123456", "fecha": "2024-01-15", "hora": "14:30", "metodo": "yape"}`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analiza este comprobante de pago." },
              { type: "image_url", image_url: { url: voucherUrl } }
            ]
          }
        ],
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      const clean = content.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { monto: null, destinatario: null, numero_operacion: null, fecha: null, metodo: "desconocido" };
    }

    // === 4. Validar reglas ===
    const nombreDest = (parsed.destinatario || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const contieneNombreAdmin = ['geronimo', 'gerónimo', 'cruzado'].some(p => nombreDest.includes(p.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    const monto = parseFloat(parsed.monto) || 0;
    // Precio esperado: TODOS los cursos de la comunidad S/60 (regla del negocio 04/11).
    const PRECIOS: Record<string, number> = {};
    const PRECIO_DEFAULT = 60;
    let esperado = PRECIO_DEFAULT;
    try {
      const cursos = await admin.from('courses').select('slug').eq('id', body?.courseId ?? '').single();
      if (cursos.data?.slug && PRECIOS[cursos.data.slug] !== undefined) esperado = PRECIOS[cursos.data.slug];
    } catch { /* curso no mapeado: precio default */ }
    const montoValido = (monto >= esperado - 1 && monto <= esperado + 0.99);

    // === 5. Anti-Fraude por Número de Operación ===
    const numOp = (parsed.numero_operacion || '').toString().trim();
    let operacionYaUsada = false;

    if (numOp && numOp.length >= 4) {
      const { data: existingOp } = await supabaseAdmin
        .from('payment_logs')
        .select('id')
        .eq('numero_operacion', numOp)
        .limit(1);

      if (existingOp && existingOp.length > 0) {
        operacionYaUsada = true;
      }
    }

    const aprobado = montoValido && contieneNombreAdmin && !operacionYaUsada;

    // === 6. Si está aprobado, registrar y dar acceso ===
    if (aprobado) {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader ? authHeader.replace("Bearer ", "") : "";
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);

      if (user) {
        await supabaseAdmin.from('payment_logs').insert({
          user_id: user.id,
          course_id: courseId,
          voucher_url: voucherUrl,
          voucher_hash: voucherHash,
          numero_operacion: numOp,
          fecha_operacion: parsed.fecha,
          monto_detectado: monto,
          estado: 'aprobado'
        });

        await supabaseAdmin.from('course_access').insert({
          user_id: user.id,
          course_id: courseId
        });

        // === MATRICULA OFICIAL EN SECRETARIA (t_alumnos + t_matricula + t_pago) ===
        try {
          const dni = String(body?.dni || '').trim();
          if (/^\d{8}$/.test(dni)) {
            const telefono = String(body?.telefono || '').trim() || null;
            const { data: perfil } = await supabaseAdmin.from('profiles')
              .select('nombre').eq('id', user.id).single();
            const nombres = perfil?.nombre || user.email?.split('@')[0] || 'Alumno comunidad';
            const correo = user.email || null;

            // alumno (crear o actualizar datos de contacto)
            const { data: alumnoExistente } = await supabaseAdmin.from('t_alumnos')
              .select('dni').eq('dni', dni).limit(1);
            if (alumnoExistente && alumnoExistente.length > 0) {
              await supabaseAdmin.from('t_alumnos')
                .update({ nombres, mail: correo, telefono }).eq('dni', dni);
            } else {
              await supabaseAdmin.from('t_alumnos')
                .insert({ dni, nombres, mail: correo, telefono });
            }

            // mapear curso comunidad -> curso secretaria (codcurso_web) -> grupo vigente
            const { data: cursoCom } = await supabaseAdmin.from('courses')
              .select('codcurso_web').eq('id', courseId).single();
            if (cursoCom?.codcurso_web) {
              const { data: grupo } = await supabaseAdmin.from('t_cursop')
                .select('cursop').eq('codcurso', cursoCom.codcurso_web)
                .order('fecha_inicio', { ascending: false }).limit(1);
              if (grupo && grupo.length > 0) {
                const cursop = grupo[0].cursop;
                const { data: matExistente } = await supabaseAdmin.from('t_matricula')
                  .select('id').eq('cursop', cursop).eq('dni', dni).limit(1);
                let matriculaId = matExistente?.[0]?.id;
                if (!matriculaId) {
                  const { data: mat } = await supabaseAdmin.from('t_matricula')
                    .insert({ cursop, dni }).select('id');
                  matriculaId = mat?.[0]?.id;
                }
                if (matriculaId) {
                  await supabaseAdmin.from('t_pago').insert({
                    matricula_id: matriculaId,
                    monto: monto,
                    fecha_pago: new Date().toISOString().slice(0, 10),
                    pasarela: parsed.metodo || 'yape',
                    estado: 'pagado'
                  });
                  // el trigger de negocio confirma la matricula solo
                }
              }
            }
          }
        } catch (errMat) {
          console.error('Matricula automatica fallo (no bloquea el acceso):', errMat);
        }

        // === CORREO DE BIENVENIDA (Brevo directo, no depende de send-email) ===
        try {
          const BREVO_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
          if (BREVO_KEY) {
            const { data: cursoInfo } = await supabaseAdmin.from('courses')
              .select('titulo').eq('id', courseId).single();
            const nombreCurso = cursoInfo?.titulo || 'tu curso';
            const primerNombre = (perfil?.nombre || user.email?.split('@')[0] || 'alumno').split(' ')[0];
            const htmlBienvenida = `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;background:#FFFFFF;color:#1F2937;font-size:15px;line-height:1.8">
              <div style="border-bottom:2px solid #0F2A43;padding-bottom:10px;margin-bottom:16px">
                <span style="font-size:16px;font-weight:bold;color:#0F2A43;letter-spacing:1px;">&#9670; NAE Academia</span>
                <span style="float:right;font-size:13px;color:#5B6470;font-weight:700;">Matr&iacute;cula confirmada</span>
              </div>
              <p>&#161;Hola, <b>${primerNombre}</b>! Tu matr&iacute;cula en <b style="color:#0F2A43;">${nombreCurso}</b> queda confirmada &#127881;</p>
              <p><b>Tu acceso ya est&aacute; activo:</b></p>
              <p>&#128205; Entra a <a href="https://comunidad.naeacademia.com" style="color:#E05C2A;font-weight:bold;">comunidad.naeacademia.com</a> con este mismo correo (${user.email}) — el curso ya aparece desbloqueado en tu cuenta.</p>
              <p>&#128226; Grupo del curso en WhatsApp (novedades, material y el enlace de cada clase):<br>
              <a href="https://chat.whatsapp.com/GUKPpi04VSkKaei5kYYkBX" style="color:#E05C2A;font-weight:bold;">&gt;&gt; &Uacute;nete al grupo del curso</a></p>
              <p>&#128197; Inicio: <b>martes 24 de noviembre, 7:10 p.m.</b> (hora Per&uacute;) — clases en vivo por Zoom, y todas quedan grabadas en la comunidad para repasar cuando quieras.</p>
              <p>Nos vemos en clase.</p>
              <div style="margin-top:18px;padding-top:12px;border-top:1px solid #E3E1D6;font-size:13px;color:#0F2A43;">
                <b>GER&Oacute;NIMO CRUZADO</b><br>
                Analista de datos &middot; NAE Academia
              </div>
            </div>`;
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${BREVO_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Geronimo Cruzado <informes@naeacademia.com>',
                to: user.email,
                subject: `Matrícula confirmada: ${nombreCurso} — inicio martes 24/11, 7:10 p.m.`,
                html: htmlBienvenida,
                reply_to: 'geronimo.cruzado.c@uni.edu.pe',
              }),
            });
          }
        } catch (errMail) {
          console.error('Correo de bienvenida fallo (no bloquea):', errMail);
        }
      }
    }

    // === 7. Responder ===
    let motivoRechazo = "";
    if (operacionYaUsada) {
      motivoRechazo = "Este número de operación ya fue utilizado.";
    } else if (!montoValido) {
      motivoRechazo = `Monto detectado: S/ ${monto}. Debe ser S/${esperado}.`;
    } else if (!contieneNombreAdmin) {
      motivoRechazo = "El destinatario no coincide.";
    }

    return new Response(
      JSON.stringify({
        aprobado,
        motivo: motivoRechazo,
        monto: parsed.monto,
        destinatario: parsed.destinatario,
        numero_operacion: numOp,
        fecha: parsed.fecha,
        ya_usado: operacionYaUsada
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
