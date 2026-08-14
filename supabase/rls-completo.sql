-- ============================================================================
-- PROYECTO Z (NAE) — RLS COMPLETO UNIFICADO
-- ============================================================================
-- Consolida: rls.sql + storage-avatars.sql + suspender-blinds.sql
-- Resuelve el conflicto de has_active_membership (3 versiones) usando
-- la versión más completa (activa + trial).
--
-- ⚠️  ARCHIVO DE REFERENCIA. Ejecutar solo en BD nueva, después de schema-completo.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. FUNCIONES AUXILIARES
-- ----------------------------------------------------------------------------

-- ¿El usuario actual es admin?
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- ¿Tiene membresía activa (pago vigente)?
create or replace function public.has_active_membership()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.estado = 'activa'
      and (m.fecha_vence is null or m.fecha_vence > now())
  );
$$;

-- ¿Tiene acceso para interactuar? (activa O trial — la versión unificada)
-- Esta reemplaza a las 3 versiones conflictivas que había antes.
create or replace function public.has_active_membership_or_trial()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.estado in ('activa', 'trial')
  );
$$;


-- ============================================================================
-- 1. PROFILES
-- ============================================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own_or_admin" on public.profiles;
create policy "profiles_insert_own_or_admin" on public.profiles
  for insert with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete using (public.is_admin());


-- ============================================================================
-- 2. MEMBERSHIPS — solo el admin gestiona
-- ============================================================================
alter table public.memberships enable row level security;

drop policy if exists "memberships_select_own_or_admin" on public.memberships;
create policy "memberships_select_own_or_admin" on public.memberships
  for select using (user_id = auth.uid() or public.is_admin());

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
-- 3. POSTS — con blindaje de suspensión (solo activos/trial escriben)
-- ============================================================================
alter table public.posts enable row level security;

drop policy if exists "posts_select_authenticated" on public.posts;
create policy "posts_select_authenticated" on public.posts
  for select using (auth.uid() is not null);

drop policy if exists "posts_insert_own_active" on public.posts;
create policy "posts_insert_own_active" on public.posts
  for insert to authenticated with check (
    autor_id = auth.uid() and public.has_active_membership_or_trial()
  );

drop policy if exists "posts_update_own_or_admin_active" on public.posts;
create policy "posts_update_own_or_admin_active" on public.posts
  for update to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );

drop policy if exists "posts_delete_own_or_admin_active" on public.posts;
create policy "posts_delete_own_or_admin_active" on public.posts
  for delete to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );


-- ============================================================================
-- 4. POST_LIKES — con blindaje de suspensión
-- ============================================================================
alter table public.post_likes enable row level security;

drop policy if exists "likes_select_authenticated" on public.post_likes;
create policy "likes_select_authenticated" on public.post_likes
  for select using (auth.uid() is not null);

drop policy if exists "likes_insert_own_active" on public.post_likes;
create policy "likes_insert_own_active" on public.post_likes
  for insert to authenticated with check (
    user_id = auth.uid() and public.has_active_membership_or_trial()
  );

drop policy if exists "likes_delete_own_or_admin" on public.post_likes;
create policy "likes_delete_own_or_admin" on public.post_likes
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 5. COMMENTS — con blindaje de suspensión
-- ============================================================================
alter table public.comments enable row level security;

drop policy if exists "comments_select_authenticated" on public.comments;
create policy "comments_select_authenticated" on public.comments
  for select using (auth.uid() is not null);

drop policy if exists "comments_insert_own_active" on public.comments;
create policy "comments_insert_own_active" on public.comments
  for insert to authenticated with check (
    autor_id = auth.uid() and public.has_active_membership_or_trial()
  );

drop policy if exists "comments_update_own_or_admin_active" on public.comments;
create policy "comments_update_own_or_admin_active" on public.comments
  for update to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );

drop policy if exists "comments_delete_own_or_admin_active" on public.comments;
create policy "comments_delete_own_or_admin_active" on public.comments
  for delete to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );


-- ============================================================================
-- 6. COMMENT_LIKES
-- ============================================================================
alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_authenticated" on public.comment_likes
  for select using (auth.uid() is not null);

drop policy if exists "comment_likes_insert_own_active" on public.comment_likes;
create policy "comment_likes_insert_own_active" on public.comment_likes
  for insert to authenticated with check (
    user_id = auth.uid() and public.has_active_membership_or_trial()
  );

drop policy if exists "comment_likes_delete_own_or_admin" on public.comment_likes;
create policy "comment_likes_delete_own_or_admin" on public.comment_likes
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 7. COURSES — solo admin modifica
-- ============================================================================
alter table public.courses enable row level security;

drop policy if exists "courses_select_authenticated" on public.courses;
create policy "courses_select_authenticated" on public.courses
  for select using (publicado = true or public.is_admin());

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
-- 8. MODULES
-- ============================================================================
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


-- ============================================================================
-- 9. LESSONS — visibles si curso es gratis o tenés membresía
-- ============================================================================
alter table public.lessons enable row level security;

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
-- 10. LESSON_PROGRESS — solo tu propio progreso
-- ============================================================================
alter table public.lesson_progress enable row level security;

drop policy if exists "progress_select_own_or_admin" on public.lesson_progress;
create policy "progress_select_own_or_admin" on public.lesson_progress
  for select using (user_id = auth.uid() or public.is_admin());

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
-- 11. COURSE_ACCESS — cursos comprados
-- ============================================================================
alter table public.course_access enable row level security;

drop policy if exists "course_access_select_own_or_admin" on public.course_access;
create policy "course_access_select_own_or_admin" on public.course_access
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "course_access_insert_own" on public.course_access;
create policy "course_access_insert_own" on public.course_access
  for insert with check (user_id = auth.uid());

drop policy if exists "course_access_delete_admin" on public.course_access;
create policy "course_access_delete_admin" on public.course_access
  for delete using (public.is_admin());


-- ============================================================================
-- 12. PAYMENT_LOGS — el alumno sube, el admin revisa
-- ============================================================================
alter table public.payment_logs enable row level security;

drop policy if exists "payment_logs_select_own_or_admin" on public.payment_logs;
create policy "payment_logs_select_own_or_admin" on public.payment_logs
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payment_logs_insert_own" on public.payment_logs;
create policy "payment_logs_insert_own" on public.payment_logs
  for insert with check (user_id = auth.uid());

drop policy if exists "payment_logs_update_admin" on public.payment_logs;
create policy "payment_logs_update_admin" on public.payment_logs
  for update using (public.is_admin());


-- ============================================================================
-- 13. EVENTS — todos ven, admin edita
-- ============================================================================
alter table public.events enable row level security;

drop policy if exists "events_select_authenticated" on public.events;
create policy "events_select_authenticated" on public.events
  for select using (auth.uid() is not null);

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
-- 14. NOTIFICATIONS — ves solo las tuyas
-- ============================================================================
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own_or_admin" on public.notifications;
create policy "notifications_select_own_or_admin" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_insert_system" on public.notifications;
create policy "notifications_insert_system" on public.notifications
  for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 15. CERTIFICATES
-- ============================================================================
alter table public.certificates enable row level security;

drop policy if exists "certificates_select_access" on public.certificates;
create policy "certificates_select_access" on public.certificates
  for select using (public.is_admin() or user_id = auth.uid());

drop policy if exists "certificates_admin_all" on public.certificates;
create policy "certificates_admin_all" on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 16. POINT_LOG — auditoría
-- ============================================================================
alter table public.point_log enable row level security;

drop policy if exists "pointlog_select_own_or_admin" on public.point_log;
create policy "pointlog_select_own_or_admin" on public.point_log
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "pointlog_insert_admin" on public.point_log;
create policy "pointlog_insert_admin" on public.point_log
  for insert with check (public.is_admin());


-- ============================================================================
-- 17. STORAGE — avatares
-- ============================================================================
-- Requiere crear el bucket "avatars" (público) y "vouchers" (privado) en Supabase.

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_upload_own" on storage.objects;
create policy "avatars_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- FIN DE rls-completo.sql
-- ============================================================================
