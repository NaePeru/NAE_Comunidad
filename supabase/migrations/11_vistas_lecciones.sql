-- ============================================================================
-- MIGRACIÓN 11 — Vistas de lecciones (medición de campaña)
-- ============================================================================
-- Registra cada apertura de lección por un alumno (1 por sesión en el
-- frontend). Permite medir el efecto de la campaña de ex-alumnos:
--   · Vistas por día / por lección (ej. el video de Clasificación ABC)
--   · Correlacionar con emails enviados y registros nuevos
--
-- Seguridad: los alumnos solo INSERTAN sus propias vistas (sin update ni
-- delete → no inflable desde el cliente). Solo el admin puede leer.
--
-- Incluye además una política de lectura de email_log para el admin, que el
-- panel de campañas necesita para contar los envíos por día.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create table if not exists public.lesson_views (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  visto_en    timestamptz not null default now()
);

alter table public.lesson_views enable row level security;

-- Alumnos registran SOLO sus propias vistas
drop policy if exists "lesson_views_insert_propia" on public.lesson_views;
create policy "lesson_views_insert_propia" on public.lesson_views
  for insert with check (auth.uid() = user_id);

-- Solo el admin puede leer (panel de medición en app/campanas.html)
drop policy if exists "lesson_views_admin_lectura" on public.lesson_views;
create policy "lesson_views_admin_lectura" on public.lesson_views
  for select using (public.is_admin());

-- Lectura de email_log para el admin (conteo de oleadas enviadas por día)
drop policy if exists "email_log_admin_lectura" on public.email_log;
create policy "email_log_admin_lectura" on public.email_log
  for select using (public.is_admin());

create index if not exists idx_lesson_views_leccion on public.lesson_views(lesson_id, visto_en desc);
create index if not exists idx_lesson_views_fecha  on public.lesson_views(visto_en desc);

select 'lesson_views creada + políticas listas' as resultado;
