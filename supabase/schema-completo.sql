-- ============================================================================
-- PROYECTO Z (NAE) — SCHEMA COMPLETO UNIFICADO
-- ============================================================================
-- Este archivo consolida los 16 SQL sueltos en UNA SOLA fuente de verdad.
-- Resuelve los conflictos entre versiones (recompute_level, handle_new_user,
-- has_active_membership) eligiendo la versión más reciente y correcta.
--
-- ⚠️  ESTE ARCHIVO ES DE REFERENCIA. NO LO EJECUTES sobre tu BD actual
--     (ya tiene todo aplicado). Se usa para:
--       1. Reinstalar la app desde cero en un Supabase nuevo
--       2. Entender la estructura completa de la BD
--       3. Documentar las decisiones de diseño
--
-- ORDEN DE EJECUCIÓN (en una BD nueva):
--   1. schema-completo.sql   (este archivo: tablas + índices + datos seed)
--   2. rls-completo.sql      (políticas de seguridad)
--   3. triggers-completo.sql (lógica automática)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. EXTENSIONES Y TIPOS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('admin', 'alumno');
exception when duplicate_object then null; end $$;

-- Estados de membresía (incluye 'pendiente' y 'rechazada' del sistema de aprobación)
do $$ begin
  create type public.membership_status as enum ('activa', 'suspendida', 'vencida', 'trial', 'pendiente', 'rechazada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_type as enum ('clase', 'webinar', 'qna', 'otro');
exception when duplicate_object then null; end $$;


-- ----------------------------------------------------------------------------
-- 1. PROFILES — Datos públicos del usuario
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  nombre          text not null,
  handle          text unique,
  bio             text,                                            -- biografía (bio-column.sql)
  dni             text,                                            -- para certificados (certificados.sql)
  avatar_url      text,
  rol             public.user_role not null default 'alumno',
  puntos          integer not null default 0,
  nivel           integer not null default 1,
  color           text[] default array['#1a3a6b','#6ba3f2'],
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 2. MEMBERSHIPS — Membresía/acceso del alumno
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  estado          public.membership_status not null default 'pendiente',  -- pendiente hasta aprobación
  fecha_inicio    timestamptz not null default now(),
  fecha_vence     timestamptz,
  dias_validos    integer not null default 30,
  creado_en       timestamptz not null default now(),
  unique (user_id)
);


-- ----------------------------------------------------------------------------
-- 3. POSTS — Publicaciones del feed
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  autor_id        uuid not null references public.profiles(id) on delete cascade,
  categoria       text not null default 'general',
  contenido       text not null,
  es_live         boolean not null default false,                       -- bonus LIVE (puntos-v2.sql)
  imagen_url      text,                                               -- imágenes en posts
  likes_count     integer not null default 0,
  comentarios_count integer not null default 0,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 4. POST_LIKES — Likes a posts (1 por usuario por post)
-- ----------------------------------------------------------------------------
create table if not exists public.post_likes (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  unique (post_id, user_id)
);


-- ----------------------------------------------------------------------------
-- 5. COMMENTS — Comentarios en posts
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references public.posts(id) on delete cascade,
  autor_id        uuid not null references public.profiles(id) on delete cascade,
  contenido       text not null,
  likes_count     integer not null default 0,                          -- likes en comentarios (puntos-v2.sql)
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 6. COMMENT_LIKES — Likes a comentarios (puntos-v2.sql)
-- ----------------------------------------------------------------------------
create table if not exists public.comment_likes (
  id              uuid primary key default gen_random_uuid(),
  comment_id      uuid not null references public.comments(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  unique (comment_id, user_id)
);


-- ----------------------------------------------------------------------------
-- 7. COURSES — Catálogo de cursos
-- ----------------------------------------------------------------------------
create table if not exists public.courses (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  titulo          text not null,
  descripcion     text,
  categoria       text not null default 'general',
  icono           text default '📘',
  color_tema      text default '#0a1a3d',
  requiere_pago   boolean not null default true,
  orden           integer not null default 0,
  password_clase  text,
  publicado       boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- ⚠️ CONSTRAINT ANTI-DUPLICADOS: previene que se inserten cursos con el mismo
-- título (ignorando mayúsculas). Esto bloquea el bug de los 24 cursos para siempre.
create unique index if not exists courses_titulo_unique
  on public.courses (lower(titulo));


-- ----------------------------------------------------------------------------
-- 8. MODULES — Módulos dentro de un curso (cursos-datos.sql)
-- ----------------------------------------------------------------------------
create table if not exists public.modules (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  titulo          text not null,
  descripcion     text,
  orden           integer not null default 0,
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 9. LESSONS — Lecciones dentro de un curso/módulo
-- ----------------------------------------------------------------------------
create table if not exists public.lessons (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  module_id       uuid references public.modules(id) on delete cascade,  -- módulo al que pertenece
  titulo          text not null,
  descripcion     text,
  tipo            text not null default 'video',
  url_contenido   text,
  link_descarga   text,                                               -- material descargable (material-descarga.sql)
  transcripcion   text,
  duracion_min    integer default 0,
  orden           integer not null default 0,
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 10. LESSON_PROGRESS — Progreso del alumno por lección
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


-- ----------------------------------------------------------------------------
-- 11. COURSE_ACCESS — Cursos comprados por el alumno (pago-voucher.js)
-- ----------------------------------------------------------------------------
create table if not exists public.course_access (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid not null references public.courses(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  unique (user_id, course_id)
);


-- ----------------------------------------------------------------------------
-- 12. PAYMENT_LOGS — Comprobantes de pago subidos (admin.js)
-- ----------------------------------------------------------------------------
create table if not exists public.payment_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  course_id       uuid references public.courses(id) on delete set null,
  voucher_url     text not null,
  monto_detectado numeric,
  numero_operacion text,
  fecha_operacion  text,
  estado          text not null default 'pendiente',                    -- pendiente | aprobado
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 13. EVENTS — Seminarios en vivo
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  tipo            public.event_type not null default 'otro',
  fecha           date not null,
  hora            time,
  descripcion     text,
  link            text,
  creado_por      uuid references public.profiles(id) on delete set null,
  creado_en       timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS — Notificaciones del usuario (notificaciones.js)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  type            text not null default 'like',                        -- like | comment | ...
  post_id         uuid,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- 15. CERTIFICATES — Certificados emitidos (certificados.sql)
-- ----------------------------------------------------------------------------
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tipo            text not null check (tipo in ('excel', 'powerbi', 'completo')),
  titulo          text not null,
  codigo          text unique not null,
  dni             text,
  nombre_emisor   text not null,
  horas           integer not null default 60,
  modalidad       text not null default 'Virtual',
  emitido_en      timestamptz not null default now(),
  unique (user_id, tipo)
);


-- ----------------------------------------------------------------------------
-- 16. POINT_LOG — Bitácora auditable de puntos
-- ----------------------------------------------------------------------------
create table if not exists public.point_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  cantidad        integer not null,
  motivo          text not null,
  referencia_id   uuid,
  creado_en       timestamptz not null default now()
);


-- ============================================================================
-- ÍNDICES — críticos para rendimiento con cientos de usuarios
-- ============================================================================
create index if not exists idx_profiles_rol         on public.profiles(rol);
create index if not exists idx_profiles_puntos      on public.profiles(puntos desc);
create index if not exists idx_profiles_activo      on public.profiles(activo);

create index if not exists idx_memberships_user     on public.memberships(user_id);
create index if not exists idx_memberships_estado   on public.memberships(estado);

create index if not exists idx_posts_autor          on public.posts(autor_id);
create index if not exists idx_posts_categoria      on public.posts(categoria);
create index if not exists idx_posts_creado_desc    on public.posts(creado_en desc);
create index if not exists idx_posts_es_live        on public.posts(es_live);

create index if not exists idx_post_likes_post      on public.post_likes(post_id);
create index if not exists idx_post_likes_user      on public.post_likes(user_id);

create index if not exists idx_comments_post        on public.comments(post_id);
create index if not exists idx_comments_autor       on public.comments(autor_id);

create index if not exists idx_comment_likes_comment on public.comment_likes(comment_id);
create index if not exists idx_comment_likes_user    on public.comment_likes(user_id);

create index if not exists idx_courses_slug         on public.courses(slug);
create index if not exists idx_courses_publicado    on public.courses(publicado);

create index if not exists idx_modules_course       on public.modules(course_id);

create index if not exists idx_lessons_course       on public.lessons(course_id);
create index if not exists idx_lessons_orden        on public.lessons(course_id, orden);
create index if not exists idx_lessons_module       on public.lessons(module_id);

create index if not exists idx_progress_user        on public.lesson_progress(user_id);
create index if not exists idx_progress_lesson      on public.lesson_progress(lesson_id);
create index if not exists idx_progress_completado  on public.lesson_progress(user_id, completado);

create index if not exists idx_course_access_user   on public.course_access(user_id);
create index if not exists idx_course_access_course on public.course_access(course_id);

create index if not exists idx_payment_logs_user    on public.payment_logs(user_id);
create index if not exists idx_payment_logs_estado  on public.payment_logs(estado);

create index if not exists idx_events_fecha         on public.events(fecha);

create index if not exists idx_notifications_user   on public.notifications(user_id);
create index if not exists idx_notifications_read   on public.notifications(user_id, read);

create index if not exists idx_certificates_user    on public.certificates(user_id);
create index if not exists idx_certificates_codigo  on public.certificates(codigo);

create index if not exists idx_pointlog_user        on public.point_log(user_id);
create index if not exists idx_pointlog_creado      on public.point_log(creado_en desc);


-- ============================================================================
-- DATOS INICIALES (SEED)
-- ============================================================================
-- ⚠️ NO insertamos cursos aquí para evitar duplicados. Los cursos se gestionan
--    desde el panel Admin o se importan con el archivo seed-cursos.sql aparte.

-- ============================================================================
-- FIN DE schema-completo.sql
-- ============================================================================
