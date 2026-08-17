// ============================================================================
// NAE — chat-ai (Edge Function) [RESPALDO del código desplegado en Supabase]
// ============================================================================
// Asistente "Alessandra": recibe los messages (con system prompt del frontend)
// y los envía a OpenAI. La API key vive SOLO en el secret OPENAI_API_KEY.
//
// Secret necesario: OPENAI_API_KEY
// Nota: la autenticación la hace el gateway de Supabase (verify JWT activado).
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Falta OPENAI_API_KEY en Secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return new Response(
        JSON.stringify({ error: data.error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reply = data.choices?.[0]?.message?.content || "No pude procesar eso.";

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
