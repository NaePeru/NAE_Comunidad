-- ============================================================================
-- MIGRACIÓN 09 — Suscriptores de Telegram (canal de avisos)
-- ============================================================================
-- Guarda el chat_id de cada persona que inicia el bot @asistente_nae_bot.
-- Cuando el admin publica en la comunidad, además del email llega un mensaje
-- de Telegram a todos los suscriptores (90% tasa de lectura vs 25% email).
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create table if not exists public.telegram_suscriptores (
  id          uuid primary key default gen_random_uuid(),
  chat_id     text unique not null,
  nombre      text,
  username    text,
  user_id     uuid references public.profiles(id) on delete set null, -- Fase 2: vinculación
  creado_en   timestamptz not null default now()
);

alter table public.telegram_suscriptores enable row level security;

-- Solo el sistema (service role / Edge Functions) gestiona esta tabla.
-- Los alumnos NO acceden directamente.

create index if not exists idx_telegram_chat on public.telegram_suscriptores(chat_id);

select 'telegram_suscriptores creada' as resultado;
