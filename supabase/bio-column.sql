-- ============================================================================
-- PROYECTO Z — Agregar columna bio a profiles
-- ============================================================================
alter table public.profiles add column if not exists bio text;
comment on column public.profiles.bio is 'Biografía del usuario';
