-- ============================================================================
-- PROYECTO Z — Cursos: orden correcto + lecciones de ejemplo
-- ============================================================================
-- ORDEN FINAL:
--   GRATIS: 1) Excel Básico  2) Tablas Dinámicas
--   PAGOS:  3) Excel Intermedio  4) Excel Avanzado  5) Excel BI
--           6) Power BI Transformación  7) Power BI Visualizaciones  8) Power BI DAX
--
-- EJECUTAR EN: SQL Editor → Run
-- ============================================================================

-- 1. Actualizar cursos existentes: Excel Básico pasa a GRATIS y orden 1
update public.courses set requiere_pago = false, orden = 1
  where slug = 'excel-basico';

update public.courses set requiere_pago = false, orden = 2
  where slug = 'tablas-dinamicas';

update public.courses set orden = 3 where slug = 'excel-intermedio';
update public.courses set orden = 4 where slug = 'excel-avanzado';
update public.courses set orden = 5 where slug = 'excel-bi';
update public.courses set orden = 6 where slug = 'power-bi-transformacion';
update public.courses set orden = 7 where slug = 'power-bi-visualizacion';
update public.courses set orden = 8 where slug = 'power-bi-dax';


-- 2. Agregar módulos (necesitamos una tabla de módulos)
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  titulo      text not null,
  descripcion text,
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_modules_course on public.modules(course_id);

alter table public.modules enable row level security;
drop policy if exists "modules_select_access" on public.modules;
create policy "modules_select_access" on public.modules
  for select using (
    public.is_admin() or exists (
      select 1 from public.courses c
      where c.id = modules.course_id
        and (c.requiere_pago = false or public.has_active_membership())
    )
  );
drop policy if exists "modules_admin_all" on public.modules;
create policy "modules_admin_all" on public.modules
  for all using (public.is_admin()) with check (public.is_admin());


-- 3. Agregar module_id a lessons (para agrupar lecciones por módulo)
alter table public.lessons add column if not exists module_id uuid
  references public.modules(id) on delete cascade;
create index if not exists idx_lessons_module on public.lessons(module_id);


-- 4. LECCIONES DE EJEMPLO (para que puedas probar el diseño)
--    Reemplazá los URLs de YouTube con tus videos reales después.

-- === EXCEL BÁSICO (curso gratis) ===
insert into public.modules (course_id, titulo, descripcion, orden)
select id, 'Módulo 1: Fundamentos de Excel', 'Empezando desde cero', 1
from public.courses where slug = 'excel-basico';

insert into public.lessons (course_id, module_id, titulo, descripcion, tipo, url_contenido, duracion_min, orden)
select l.course_id, m.id, 'Bienvenida al curso', 'Introducción y qué vas a aprender', 'video',
  'https://www.youtube.com/embed/dQw4w9WgXcQ', 5, 1
from public.courses l
join public.modules m on m.course_id = l.id
where l.slug = 'excel-basico' and m.orden = 1;

-- === TABLAS DINÁMICAS (curso gratis) ===
insert into public.modules (course_id, titulo, descripcion, orden)
select id, 'Módulo 1: Introducción a Tablas Dinámicas', 'Conceptos básicos', 1
from public.courses where slug = 'tablas-dinamicas';

insert into public.lessons (course_id, module_id, titulo, descripcion, tipo, url_contenido, duracion_min, orden)
select l.course_id, m.id, '¿Qué es una tabla dinámica?', 'Concepto y utilidad', 'video',
  'https://www.youtube.com/embed/dQw4w9WgXcQ', 8, 1
from public.courses l
join public.modules m on m.course_id = l.id
where l.slug = 'tablas-dinamicas' and m.orden = 1;

-- ============================================================================
-- FIN — Ahora podés editar los cursos y lecciones desde el panel Admin
-- ============================================================================
