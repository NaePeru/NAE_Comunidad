-- ============================================================================
-- PROYECTO Z — Schema de Base de Datos (Supabase / PostgreSQL)
-- Plataforma tipo Skool para uso personal — optimizada para 500 usuarios
-- ============================================================================
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → New query → Run
-- Orden de ejecución: 1) schema.sql  →  2) rls.sql  →  3) triggers.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONES Y TIPOS PERSONALIZADOS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- para gen_random_uuid()

-- Tipo de rol de usuario
do $$ begin
  create type user_role as enum ('admin', 'alumno');
exception when duplicate_object then null; end $$;

-- Estado de membresía
do $$ begin
  create type membership_status as enum ('activa', 'suspendida', 'vencida', 'trial');
exception when duplicate_object then null; end $$;

-- Tipo de evento
do $$ begin
  create type event_type as enum ('clase', 'webinar', 'qna', 'otro');
exception when duplicate_object then null; end $$;


-- ----------------------------------------------------------------------------
-- 1. PROFILES — Datos públicos del usuario (1 fila por cuenta Auth)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text not null,
  handle          text unique,                          -- @usuario
  bio             text,
  avatar_url      text,
  rol             user_role not null default 'alumno',
  puntos          integer not null default 0,
  nivel           integer not null default 1,           -- cache del nivel actual
  color           text[] default array['#1a3a6b','#6ba3f2'], -- par de colores avatar
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.profiles is 'Perfil público de cada usuario. id = auth.users.id';


-- ----------------------------------------------------------------------------
-- 2. MEMBERSHIPS — Validez de acceso (reemplaza el "hash de 30 días")
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  estado          membership_status not null default 'trial',
  fecha_inicio    timestamptz not null default now(),
  fecha_vence     timestamptz,                          -- NULL = sin vencimiento
  dias_validos    integer not null default 30,          -- duración del plan
  creado_en       timestamptz not null default now(),
  unique (user_id)
);

comment on table public.memberships is 'Membresía de pago del alumno. Define acceso a cursos.';


-- ----------------------------------------------------------------------------
-- 3. POSTS — Publicaciones de la comunidad (feed)
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  autor_id        uuid not null references public.profiles(id) on delete cascade,
  categoria       text not null default 'general',     -- general | excel | powerbi | sql ...
  contenido       text not null,
  likes_count     integer not null default 0,
  comentarios_count integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

comment on table public.posts is 'Publicaciones del feed de comunidad.';


-- ----------------------------------------------------------------------------
-- 4. POST_LIKES — Likes (1 por usuario por post)
-- ----------------------------------------------------------------------------
create table if not exists public.post_likes (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  unique (post_id, user_id)                             -- no duplicar likes
);

comment on table public.post_likes is 'Likes únicos por usuario y post.';


-- ----------------------------------------------------------------------------
-- 5. COMMENTS — Comentarios en posts
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts(id) on delete cascade,
  autor_id        uuid not null references public.profiles(id) on delete cascade,
  contenido       text not null,
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 6. COURSES — Catálogo de cursos
-- ----------------------------------------------------------------------------
create table if not exists public.courses (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,                 -- ej: 'power-bi-nivel-2'
  titulo          text not null,
  descripcion     text,
  categoria       text not null default 'general',     -- excel | powerbi | sql | ...
  icono           text default '📘',
  color_tema      text default '#0a1a3d',
  requiere_pago   boolean not null default true,        -- false = curso gratis
  orden           integer not null default 0,
  password_clase  text,                                 -- protección extra (opcional)
  publicado       boolean not null default true,
  creado_en       timestamptz not null default now()
);

comment on table public.courses is 'Cursos disponibles en la plataforma.';


-- ----------------------------------------------------------------------------
-- 7. LESSONS — Clases/lecciones de cada curso
-- ----------------------------------------------------------------------------
create table if not exists public.lessons (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  titulo          text not null,
  descripcion     text,
  tipo            text not null default 'video',       -- video | texto | recurso
  url_contenido   text,                                 -- URL del video/recurso
  transcripcion   text,
  duracion_min    integer default 0,
  orden           integer not null default 0,
  creado_en       timestamptz not null default now()
);

comment on table public.lessons is 'Lecciones dentro de un curso.';


-- ----------------------------------------------------------------------------
-- 8. LESSON_PROGRESS — Progreso del alumno por lección
-- ----------------------------------------------------------------------------
create table if not exists public.lesson_progress (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  completado      boolean not null default false,
  porcentaje      integer not null default 0 check (porcentaje between 0 and 100),
  completado_en   timestamptz,
  unique (user_id, lesson_id)
);

comment on table public.lesson_progress is 'Progreso individual de cada lección.';


-- ----------------------------------------------------------------------------
-- 9. EVENTS — Eventos del calendario (clases en vivo, webinars, Q&A)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  tipo            event_type not null default 'otro',
  fecha           date not null,
  hora            time,
  descripcion     text,
  link            text,                                 -- URL de la reunión (Zoom/Meet)
  creado_por      uuid references public.profiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 10. POINT_LOG — Historial de puntos ganados (auditable)
-- ----------------------------------------------------------------------------
create table if not exists public.point_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  cantidad        integer not null,                     -- puede ser negativo
  motivo          text not null,                        -- 'post', 'comentario', 'leccion'...
  referencia_id   uuid,                                 -- id del objeto que generó el punto
  creado_en       timestamptz not null default now()
);

comment on table public.point_log is 'Bitácora de todos los puntos ganados. Permite auditoría.';


-- ============================================================================
-- ÍNDICES — CRÍTICOS PARA RENDIMIENTO CON 500 USUARIOS
-- Sin estos, las consultas se vuelven lentas. Con ellos, van como rayo.
-- ============================================================================
create index if not exists idx_profiles_rol         on public.profiles(rol);
create index if not exists idx_profiles_puntos      on public.profiles(puntos desc);
create index if not exists idx_profiles_activo      on public.profiles(activo);

create index if not exists idx_memberships_user     on public.memberships(user_id);
create index if not exists idx_memberships_estado   on public.memberships(estado);

create index if not exists idx_posts_autor          on public.posts(autor_id);
create index if not exists idx_posts_categoria      on public.posts(categoria);
create index if not exists idx_posts_creado_desc    on public.posts(creado_en desc);

create index if not exists idx_post_likes_post      on public.post_likes(post_id);
create index if not exists idx_post_likes_user      on public.post_likes(user_id);

create index if not exists idx_comments_post        on public.comments(post_id);
create index if not exists idx_comments_autor       on public.comments(autor_id);

create index if not exists idx_courses_slug         on public.courses(slug);
create index if not exists idx_courses_publicado    on public.courses(publicado);

create index if not exists idx_lessons_course       on public.lessons(course_id);
create index if not exists idx_lessons_orden        on public.lessons(course_id, orden);

create index if not exists idx_progress_user        on public.lesson_progress(user_id);
create index if not exists idx_progress_lesson      on public.lesson_progress(lesson_id);
create index if not exists idx_progress_completado  on public.lesson_progress(user_id, completado);

create index if not exists idx_events_fecha         on public.events(fecha);

create index if not exists idx_pointlog_user        on public.point_log(user_id);
create index if not exists idx_pointlog_creado      on public.point_log(creado_en desc);


-- ============================================================================
-- DATOS INICIALES — Cursos base (puedes editarlos después)
-- ============================================================================
insert into public.courses (slug, titulo, descripcion, categoria, icono, color_tema, requiere_pago, orden)
values
  ('tablas-dinamicas', 'Tablas y Gráficos Dinámicos',
   'Curso GRATIS de 15 días. Domina tablas dinámicas desde cero.', 'excel', '📊', '#0a3d1a', false, 1),
  ('excel-basico', 'MS Excel — Nivel Básico',
   'Fundamentos de Excel: celdas, fórmulas, formato.', 'excel', '📗', '#0d2818', true, 2),
  ('excel-intermedio', 'MS Excel — Nivel Intermedio',
   'Funciones avanzadas, búsqueda, validación de datos.', 'excel', '📘', '#217346', true, 3),
  ('excel-avanzado', 'MS Excel — Nivel Avanzado',
   'Macros, Power Query, modelado de datos.', 'excel', '📕', '#14532d', true, 4),
  ('excel-bi', 'Excel Business Intelligence',
   'Dashboards, Power Pivot, visualización avanzada.', 'excel', '📙', '#2e6b21', true, 5),
  ('power-bi-transformacion', 'Power BI — Transformación de Datos',
   'ETL con Power Query: limpieza y modelado.', 'powerbi', '🔄', '#0a1a3d', true, 6),
  ('power-bi-visualizacion', 'Power BI — Visualizaciones',
   'Mapas, KPIs, dashboards profesionales.', 'powerbi', '📊', '#3d1a00', true, 7),
  ('power-bi-dax', 'Power BI — DAX',
   'Medidas, CALCULATE, lógica de filtros.', 'powerbi', '⚡', '#c4480a', true, 8)
on conflict (slug) do nothing;

-- ============================================================================
-- FIN DE schema.sql
-- ============================================================================
