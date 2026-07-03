-- ============================================================================
-- PROYECTO Z — Row Level Security (RLS) / Políticas de seguridad
-- ============================================================================
-- Define QUIÉN puede ver / crear / editar / borrar en cada tabla.
-- Principio: los alumnos solo tocan lo suyo; el admin (tú) tiene acceso total.
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → New query → Run
-- (después de haber ejecutado schema.sql)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. FUNCIONES AUXILIARES (helper SQL reutilizable)
-- ----------------------------------------------------------------------------

-- ¿El usuario actual es admin?
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- ¿El usuario actual tiene membresía activa (acceso a contenido de pago)?
create or replace function public.has_active_membership()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.estado = 'activa'
      and (m.fecha_vence is null or m.fecha_vence > now())
  );
$$;


-- ============================================================================
-- 1. PROFILES
-- ============================================================================
alter table public.profiles enable row level security;

-- Ver: todos pueden ver los perfiles (son públicos, como en Skool)
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

-- Insert: un usuario solo crea SU perfil (al registrarse). Admin puede crear cualquiera.
drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
create policy "profiles_insert_own_or_admin" on public.profiles
  for insert with check (id = auth.uid() or public.is_admin());

-- Update: el usuario edita SU perfil. Admin edita cualquiera.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- Delete: solo admin
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());


-- ============================================================================
-- 2. MEMBERSHIPS
-- ============================================================================
alter table public.memberships enable row level security;

-- Ver: el usuario ve SU membresía. Admin ve todas.
drop policy if exists "memberships_select_own_or_admin" on public.memberships;
create policy "memberships_select_own_or_admin" on public.memberships
  for select using (user_id = auth.uid() or public.is_admin());

-- Insert/Update/Delete: SOLO admin gestiona membresías
drop policy if exists "memberships_insert_admin" on public.memberships;
create policy "memberships_insert_admin" on public.memberships
  for insert with check (public.is_admin());

drop policy if exists "memberships_update_admin" on public.memberships;
create policy "memberships_update_admin" on public.memberships
  for update using (public.is_admin());

drop policy if exists "memberships_delete_admin" on public.memberships;
create policy "memberships_delete_admin" on public.memberships
  for delete using (public.is_admin());


-- ============================================================================
-- 3. POSTS (comunidad)
-- ============================================================================
alter table public.posts enable row level security;

-- Ver: todos los autenticados ven todos los posts (comunidad abierta)
drop policy if exists "posts_select_authenticated" on public.posts;
create policy "posts_select_authenticated" on public.posts
  for select using (auth.uid() is not null);

-- Insert: cualquier usuario autenticado crea sus posts
drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert with check (autor_id = auth.uid());

-- Update: el autor edita SU post; admin edita cualquiera
drop policy if exists "posts_update_own_or_admin" on public.posts;
create policy "posts_update_own_or_admin" on public.posts
  for update using (autor_id = auth.uid() or public.is_admin());

-- Delete: el autor borra SU post; admin borra cualquiera
drop policy if exists "posts_delete_own_or_admin" on public.posts;
create policy "posts_delete_own_or_admin" on public.posts
  for delete using (autor_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 4. POST_LIKES
-- ============================================================================
alter table public.post_likes enable row level security;

-- Ver: todos ven los likes (público)
drop policy if exists "likes_select_authenticated" on public.post_likes;
create policy "likes_select_authenticated" on public.post_likes
  for select using (auth.uid() is not null);

-- Insert: solo tu propio like
drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own" on public.post_likes
  for insert with check (user_id = auth.uid());

-- Delete: solo borras tu propio like (o admin)
drop policy if exists "likes_delete_own_or_admin" on public.post_likes;
create policy "likes_delete_own_or_admin" on public.post_likes
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 5. COMMENTS
-- ============================================================================
alter table public.comments enable row level security;

drop policy if exists "comments_select_authenticated" on public.comments;
create policy "comments_select_authenticated" on public.comments
  for select using (auth.uid() is not null);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
  for insert with check (autor_id = auth.uid());

drop policy if exists "comments_update_own_or_admin" on public.comments;
create policy "comments_update_own_or_admin" on public.comments
  for update using (autor_id = auth.uid() or public.is_admin());

drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin" on public.comments
  for delete using (autor_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 6. COURSES
-- ============================================================================
alter table public.courses enable row level security;

-- Ver: cursos publicados son visibles para todos los autenticados
drop policy if exists "courses_select_authenticated" on public.courses;
create policy "courses_select_authenticated" on public.courses
  for select using (publicado = true or public.is_admin());

-- Modificación: solo admin
drop policy if exists "courses_insert_admin" on public.courses;
create policy "courses_insert_admin" on public.courses
  for insert with check (public.is_admin());

drop policy if exists "courses_update_admin" on public.courses;
create policy "courses_update_admin" on public.courses
  for update using (public.is_admin());

drop policy if exists "courses_delete_admin" on public.courses;
create policy "courses_delete_admin" on public.courses
  for delete using (public.is_admin());


-- ============================================================================
-- 7. LESSONS
-- ============================================================================
alter table public.lessons enable row level security;

-- Ver: las lecciones se ven si el curso es gratis, o si tienes membresía activa
drop policy if exists "lessons_select_access" on public.lessons;
create policy "lessons_select_access" on public.lessons
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = lessons.course_id
        and (c.requiere_pago = false or public.has_active_membership())
    )
  );

drop policy if exists "lessons_insert_admin" on public.lessons;
create policy "lessons_insert_admin" on public.lessons
  for insert with check (public.is_admin());

drop policy if exists "lessons_update_admin" on public.lessons;
create policy "lessons_update_admin" on public.lessons
  for update using (public.is_admin());

drop policy if exists "lessons_delete_admin" on public.lessons;
create policy "lessons_delete_admin" on public.lessons
  for delete using (public.is_admin());


-- ============================================================================
-- 8. LESSON_PROGRESS
-- ============================================================================
alter table public.lesson_progress enable row level security;

-- Ver: solo tu propio progreso (admin ve todo)
drop policy if exists "progress_select_own_or_admin" on public.lesson_progress;
create policy "progress_select_own_or_admin" on public.lesson_progress
  for select using (user_id = auth.uid() or public.is_admin());

-- Insert/Update: solo tu propio progreso
drop policy if exists "progress_insert_own" on public.lesson_progress;
create policy "progress_insert_own" on public.lesson_progress
  for insert with check (user_id = auth.uid());

drop policy if exists "progress_update_own" on public.lesson_progress;
create policy "progress_update_own" on public.lesson_progress
  for update using (user_id = auth.uid());

drop policy if exists "progress_delete_own_or_admin" on public.lesson_progress;
create policy "progress_delete_own_or_admin" on public.lesson_progress
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 9. EVENTS
-- ============================================================================
alter table public.events enable row level security;

-- Ver: todos los autenticados ven los eventos
drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_authenticated" on public.events
  for select using (auth.uid() is not null);

-- Crear/Editar/Borrar: solo admin
drop policy if exists "events_insert_admin" on public.events;
create policy "events_insert_admin" on public.events
  for insert with check (public.is_admin());

drop policy if exists "events_update_admin" on public.events;
create policy "events_update_admin" on public.events
  for update using (public.is_admin());

drop policy if exists "events_delete_admin" on public.events;
create policy "events_delete_admin" on public.events
  for delete using (public.is_admin());


-- ============================================================================
-- 10. POINT_LOG
-- ============================================================================
alter table public.point_log enable row level security;

-- Ver: ves tu propio historial (admin ve todo)
drop policy if exists "pointlog_select_own_or_admin" on public.point_log;
create policy "pointlog_select_own_or_admin" on public.point_log
  for select using (user_id = auth.uid() or public.is_admin());

-- Insert: lo hace el sistema (triggers) o admin. Permitimos insert propio para flexibilidad.
drop policy if exists "pointlog_insert_admin" on public.point_log;
create policy "pointlog_insert_admin" on public.point_log
  for insert with check (public.is_admin());

-- ============================================================================
-- 11. STORAGE — AVATARES (fotos de perfil)
-- ============================================================================
-- Requiere crear previamente el bucket público "avatars" en:
-- Supabase → Storage → New bucket → Name: avatars → Public: ON
-- ----------------------------------------------------------------------------

-- (a) Las políticas de Storage se aplican sobre storage.objects
-- (b) Cada foto se guarda en una carpeta con el ID del usuario: avatars/<uid>/foto.jpg
--     Así garantizamos que cada uno solo modifica la suya.

-- Ver avatares: público (todas las fotos visibles en el feed)
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Subir avatar: solo usuario autenticado, en su propia carpeta
drop policy if exists "avatars_upload_own" on storage.objects;
create policy "avatars_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reemplazar avatar: solo el dueño
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Borrar avatar: solo el dueño
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
