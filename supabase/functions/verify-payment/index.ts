// ============================================================================
// NAE — verify-payment (Edge Function) [RESPALDO del código desplegado]
// ============================================================================
// Verificación automática de vouchers de pago (Yape/Plin) con IA:
//   1. Calcula hash SHA-256 de la imagen → bloquea vouchers reutilizados
//   2. Lee el voucher con GPT-4o vision (monto, destinatario, N° operación)
//   3. Valida: monto S/49-50.99 + nombre del admin + operación no repetida
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
    const montoValido = (monto >= 49 && monto <= 50.99);

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
      }
    }

    // === 7. Responder ===
    let motivoRechazo = "";
    if (operacionYaUsada) {
      motivoRechazo = "Este número de operación ya fue utilizado.";
    } else if (!montoValido) {
      motivoRechazo = `Monto detectado: S/ ${monto}. Debe ser S/50.`;
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
