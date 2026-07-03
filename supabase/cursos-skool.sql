-- ============================================================================
-- PROYECTO Z — Estructura de cursos replicando tu Skool (Nae. Information)
-- ============================================================================
-- Reemplaza los cursos de ejemplo por los REALES que tenés en Skool:
--   1. NAE/Empieza aquí (onboarding)
--   2. Recursos Exclusivos (bonus)
--   3. Tabla y Gráficos Dinámicos (GRATIS)
--   4. MS Excel - Nivel Fundamental (pago)
--   5. MS Excel - Nivel Intermedio (pago)
--   6. MS Excel - Nivel Avanzado (pago)
--   7. MS Excel - Business Intelligence (pago)
--   8. Power BI - Transformación (pago)
--   9. Power BI - Visualizaciones (pago)
--  10. Power BI - DAX (pago)
--
-- EJECUTAR EN: SQL Editor → Run
-- ============================================================================

-- 1. Limpiar datos viejos (en orden correcto: hijos primero, padres después)
--    Primero lecciones y el progreso (referencian a courses/modules),
--    después modules, y por último courses.
delete from public.lesson_progress;
delete from public.lessons;
delete from public.courses;  -- esto borra modules en cascada (on delete cascade)

-- 1b. Crear la tabla modules SI NO EXISTE (por si no se creó en el SQL anterior)
create table if not exists public.modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  titulo      text not null,
  descripcion text,
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_modules_course on public.modules(course_id);

-- RLS para modules (si no estaba configurado)
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

-- 1c. Agregar module_id a lessons si no existe
alter table public.lessons add column if not exists module_id uuid
  references public.modules(id) on delete cascade;
create index if not exists idx_lessons_module on public.lessons(module_id);


-- 2. Insertar los cursos reales (estructura de tu Skool)
insert into public.courses (slug, titulo, descripcion, categoria, icono, color_tema, requiere_pago, orden, publicado)
values
  ('nae-empieza-aqui', 'NAE / Empieza aquí',
   'Bienvenida a la comunidad. Todo lo que necesitás para empezar tu camino como Analista de Datos.',
   'general', '🚀', 'linear-gradient(135deg,#1a1d2e,#2a2e44)', false, 1, true),

  ('recursos-exclusivos', 'Recursos Exclusivos',
   'Plantillas, guías descargables y materiales bonus para los miembros de la comunidad.',
   'general', '🎁', 'linear-gradient(135deg,#1a1d2e,#2a2e44)', false, 2, true),

  ('tablas-dinamicas', 'Tabla y Gráficos Dinámicos',
   'Curso GRATIS. Domina tablas dinámicas desde cero. 15 días de contenido.',
   'excel', '📊', 'linear-gradient(135deg,#0d2818,#217346)', false, 3, true),

  ('excel-fundamental', 'MS Excel - Nivel Fundamental',
   'Fundamentos de Excel: interfaz, celdas, fórmulas básicas, formato y primera tabla.',
   'excel', '📗', 'linear-gradient(135deg,#0d2818,#217346)', true, 4, true),

  ('excel-intermedio', 'MS Excel - Nivel Intermedio',
   'Funciones avanzadas, BUSCARV, formato condicional, validación y gráficos.',
   'excel', '📘', 'linear-gradient(135deg,#08200f,#14532d)', true, 5, true),

  ('excel-avanzado', 'MS Excel - Nivel Avanzado',
   'Macros, Power Query, tablas avanzadas, automatización y modelado.',
   'excel', '📕', 'linear-gradient(135deg,#142e10,#2e6b21)', true, 6, true),

  ('excel-bi', 'MS Excel - Business Intelligence',
   'Dashboards, Power Pivot, visualización avanzada y reportes ejecutivos.',
   'excel', '📙', 'linear-gradient(135deg,#2e6b21,#3d8f2e)', true, 7, true),

  ('power-bi-transformacion', 'Power BI - Transformación',
   'ETL con Power Query: conexión, limpieza, transformación y modelado de datos.',
   'powerbi', '🔄', 'linear-gradient(135deg,#2a1200,#a8420a)', true, 8, true),

  ('power-bi-visualizaciones', 'Power BI - Visualizaciones',
   'Mapas, KPIs, dashboards profesionales y storytelling con datos.',
   'powerbi', '📊', 'linear-gradient(135deg,#3d1a00,#e8590c)', true, 9, true),

  ('power-bi-dax', 'Power BI - DAX',
   'Lenguaje DAX: medidas, CALCULATE, contexto de filtro y lógica avanzada.',
   'powerbi', '⚡', 'linear-gradient(135deg,#3d0f00,#c4480a)', true, 10, true);


-- 3. Crear módulos y lecciones iniciales en cursos clave
-- (Después vas a poder agregar más desde el panel Admin)

-- NAE/Empieza aquí
insert into public.modules (course_id, titulo, descripcion, orden)
select id, 'Bienvenida', 'Tu punto de partida en la comunidad', 1
from public.courses where slug = 'nae-empieza-aqui';

insert into public.lessons (course_id, module_id, titulo, descripcion, tipo, url_contenido, duracion_min, orden)
select c.id, m.id, 'Bienvenida a NAE', 'Presentación y qué vas a lograr en la comunidad',
  'video', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 5, 1
from public.courses c
join public.modules m on m.course_id = c.id
where c.slug = 'nae-empieza-aqui' and m.orden = 1;

insert into public.lessons (course_id, module_id, titulo, descripcion, tipo, url_contenido, duracion_min, orden)
select c.id, m.id, 'Cómo navegar la plataforma', 'Tour por la comunidad, cursos y seminarios',
  'video', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 4, 2
from public.courses c
join public.modules m on m.course_id = c.id
where c.slug = 'nae-empieza-aqui' and m.orden = 1;


-- Tabla y Gráficos Dinámicas (gratis)
insert into public.modules (course_id, titulo, descripcion, orden)
select id, 'Módulo 1: Fundamentos de Tablas Dinámicas', 'Conceptos básicos y primera tabla', 1
from public.courses where slug = 'tablas-dinamicas';

insert into public.lessons (course_id, module_id, titulo, descripcion, tipo, url_contenido, duracion_min, orden)
select c.id, m.id, '¿Qué es una tabla dinámica?', 'Concepto y para qué sirve',
  'video', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 8, 1
from public.courses c
join public.modules m on m.course_id = c.id
where c.slug = 'tablas-dinamicas' and m.orden = 1;

insert into public.lessons (course_id, module_id, titulo, descripcion, tipo, url_contenido, duracion_min, orden)
select c.id, m.id, 'Crear tu primera tabla dinámica', 'Paso a paso desde cero',
  'video', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 12, 2
from public.courses c
join public.modules m on m.course_id = c.id
where c.slug = 'tablas-dinamicas' and m.orden = 1;


-- ============================================================================
-- FIN — Ahora podés gestionar todo desde el panel Admin
-- ============================================================================
