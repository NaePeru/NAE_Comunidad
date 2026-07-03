// ============================================================================
// PROYECTO Z — Cliente de Supabase (única configuración central)
// ============================================================================
// ⚠️  IMPORTANTE: Reemplaza los valores de abajo con los de TU proyecto.
//     Supabase Dashboard → Project Settings → API
//       - URL:     "Project URL"
//       - ANON KEY:"Project API keys" → "anon public"
//
// La "anon key" es PÚBLICA por diseño (está protegida por RLS, no es secreta).
// NUNCA pongas la "service_role key" aquí — esa solo va en el servidor.
// ============================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── TU CONFIGURACIÓN DE SUPABASE ──────────────────────────────────────────
const SUPABASE_URL = 'https://dlpsvbrctccnmvkbcsfp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscHN2YnJjdGNjbm12a2Jjc2ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwNTMsImV4cCI6MjA5ODM0MjA1M30.sMjCrC0wDEks9YBcoxHK4xf1ODCKD6SRJqwRjdea9pU';
// ────────────────────────────────────────────────────────────────────────────

// Validación rápida para evitar errores silenciosos
if (SUPABASE_URL.includes('TU-PROYECTO') || SUPABASE_ANON_KEY.includes('TU-ANON-KEY')) {
  console.warn(
    '%c⚠️ PROYECTO Z: Falta configurar Supabase',
    'color:#F2A900;font-size:14px;font-weight:bold'
  );
  console.warn('Edita assets/js/supabase-client.js con tu URL y anon key reales.');
}

// Cliente singleton (una sola instancia para toda la app)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 2 }, // limita para no saturar con 500 usuarios
  },
});

// Flag para saber si la configuración es válida
export const supabaseConfigured =
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');
