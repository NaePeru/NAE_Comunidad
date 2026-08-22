-- ============================================================================
-- MIGRACIÓN 07 — Lista de leads para campañas de invitación
-- ============================================================================
-- Almacena los ~800 ex-alumnos importados desde el Excel del docente.
-- El módulo app/campanas.html (solo admin) envía invitaciones personalizadas
-- en oleadas controladas (límite diario) para cuidar la reputación del dominio.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create table if not exists public.leads_campana (
  id          uuid primary key default gen_random_uuid(),
  nombre      text,
  curso       text,
  telefono    text,
  email       text not null,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','enviado','error')),
  enviado_en  timestamptz,
  creado_en   timestamptz not null default now(),
  unique (email)
);

-- RLS: solo el admin puede ver/gestionar la lista de leads
alter table public.leads_campana enable row level security;

drop policy if exists "leads_admin_all" on public.leads_campana;
create policy "leads_admin_all" on public.leads_campana
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists idx_leads_estado on public.leads_campana(estado);

select 'leads_campana creada' as resultado;
