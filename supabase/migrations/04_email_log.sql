-- ============================================================================
-- MIGRACIÓN 04 — Tabla email_log (auditoría + anti-spam de emails)
-- ============================================================================
-- Registra cada email enviado para:
--   1. Evitar spamear (máx 1 email por tipo/usuario cada 24h — lo chequea
--      la Edge Function send-email)
--   2. Auditar qué se envió, a quién y cuándo
--
-- Solo la Edge Function (service role) lee/escribe esta tabla. Los clientes
-- web NO tienen políticas → acceso bloqueado por RLS.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  recipient   uuid references public.profiles(id) on delete cascade,
  tipo        text not null,          -- like | prueba | digest | recordatorio
  enviado_a   text not null,          -- email real de destino
  creado_en   timestamptz not null default now()
);

-- RLS activado SIN políticas = solo service role (Edge Functions) puede tocarla
alter table public.email_log enable row level security;

create index if not exists idx_email_log_recipient on public.email_log(recipient, creado_en desc);
create index if not exists idx_email_log_tipo      on public.email_log(tipo);

-- Verificación
select 'email_log creada' as resultado;
