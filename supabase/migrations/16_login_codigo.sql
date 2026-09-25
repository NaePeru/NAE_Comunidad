-- ============================================================================
-- PROYECTO Z — Migración 16: Login por código de 6 dígitos (sin contraseña)
-- ============================================================================
-- El alumno ingresa nombre + correo → recibe un código por email (vía Resend,
-- NO por el correo interno de Supabase que tiene límites en el plan gratis)
-- → escribe el código → entra directo. Nunca crea ni recuerda contraseñas.
--
-- Esta tabla solo la toca la Edge Function auth-code (service role).
-- Los códigos se guardan hasheados (sha256) y vencen a los 10 minutos.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create table if not exists public.login_codes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code_hash  text not null,                      -- sha256 hex del código
  expires_at timestamptz not null,               -- now() + 10 minutos
  usado      boolean not null default false,
  intentos   int not null default 0,             -- máx 5 intentos por código
  creado_en  timestamptz not null default now()
);

-- Solo la Edge Function (service role) puede leer/escribir
alter table public.login_codes enable row level security;

create index if not exists idx_login_codes_email  on public.login_codes(email, creado_en desc);
create index if not exists idx_login_codes_expira on public.login_codes(expires_at);

-- Limpieza automática: cada hora borra códigos viejos (pg_cron ya instalado)
do $$
begin
  perform cron.unschedule('limpiar-login-codes');
exception when others then null;
end $$;
select cron.schedule(
  'limpiar-login-codes',
  '0 * * * *',
  $$delete from public.login_codes where expires_at < now() - interval '1 day'$$
);

-- Verificación
select 'Migracion 16 OK: tabla login_codes lista' as resultado;
