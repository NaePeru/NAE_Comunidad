-- ============================================================================
-- MIGRACIÓN 06 — Cursos en vivo programados + Matrículas
-- ============================================================================
-- Permite programar cursos virtuales en vivo (con fechas y horarios) y que
-- los alumnos se matriculen. El chatbot lee esta tabla para informar los
-- próximos cursos.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- 1. CURSOS PROGRAMADOS (lo que el admin agenda)
create table if not exists public.cursos_programados (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  fecha_inicio  date not null,
  fecha_fin     date,
  horario       text,                -- ej: 'Lunes y Miércoles 7-9pm'
  modalidad     text default 'Zoom',
  link_sesion   text,                -- link de la reunión
  cupos         integer,             -- NULL = ilimitado
  precio        integer default 50,  -- soles
  estado        text not null default 'programado'
                check (estado in ('programado','en_curso','finalizado','cancelado')),
  creado_en     timestamptz not null default now()
);

-- 2. MATRÍCULAS (qué alumno se inscribió en qué curso programado)
create table if not exists public.matriculas (
  id            uuid primary key default gen_random_uuid(),
  curso_prog_id uuid not null references public.cursos_programados(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  estado        text not null default 'activa',
  creado_en     timestamptz not null default now(),
  unique (curso_prog_id, user_id)
);

-- Índices
create index if not exists idx_cursos_prog_fecha   on public.cursos_programados(fecha_inicio);
create index if not exists idx_cursos_prog_estado  on public.cursos_programados(estado);
create index if not exists idx_matriculas_curso    on public.matriculas(curso_prog_id);
create index if not exists idx_matriculas_user     on public.matriculas(user_id);

-- 3. RLS — todos los autenticados ven; solo el admin programa
alter table public.cursos_programados enable row level security;

drop policy if exists "cursos_prog_select_auth" on public.cursos_programados;
create policy "cursos_prog_select_auth" on public.cursos_programados
  for select using (auth.uid() is not null);

drop policy if exists "cursos_prog_admin_all" on public.cursos_programados;
create policy "cursos_prog_admin_all" on public.cursos_programados
  for all using (public.is_admin()) with check (public.is_admin());

-- Matrículas: el alumno ve/crea las suyas; el admin ve todo
alter table public.matriculas enable row level security;

drop policy if exists "matriculas_select_own_or_admin" on public.matriculas;
create policy "matriculas_select_own_or_admin" on public.matriculas
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "matriculas_insert_own" on public.matriculas;
create policy "matriculas_insert_own" on public.matriculas
  for insert with check (user_id = auth.uid());

drop policy if exists "matriculas_delete_own_or_admin" on public.matriculas;
create policy "matriculas_delete_own_or_admin" on public.matriculas
  for delete using (user_id = auth.uid() or public.is_admin());

-- Verificación
select 'cursos_programados + matriculas creadas' as resultado;
