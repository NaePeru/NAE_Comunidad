-- ============================================================================
-- PROYECTO Z — Blindar Suspensión (RLS)
-- ============================================================================
-- Hace que un alumno SUSPENDIDO no pueda publicar, comentar, dar like, etc.
-- Solo los usuarios con membresía ACTIVA o TRIAL pueden interactuar.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- 1. POSTS: Solo miembros activos/trial pueden publicar, editar, borrar
drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own_active" on public.posts
  for insert to authenticated with check (
    autor_id = auth.uid() and public.has_active_membership_or_trial()
  );

drop policy if exists "posts_update_own_or_admin" on public.posts;
create policy "posts_update_own_or_admin_active" on public.posts
  for update to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );

drop policy if exists "posts_delete_own_or_admin" on public.posts;
create policy "posts_delete_own_or_admin_active" on public.posts
  for delete to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );

-- 2. COMMENTS: Solo miembros activos/trial pueden comentar
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own_active" on public.comments
  for insert to authenticated with check (
    autor_id = auth.uid() and public.has_active_membership_or_trial()
  );

drop policy if exists "comments_update_own_or_admin" on public.comments;
create policy "comments_update_own_or_admin_active" on public.comments
  for update to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );

drop policy if exists "comments_delete_own_or_admin" on public.comments;
create policy "comments_delete_own_or_admin_active" on public.comments
  for delete to authenticated using (
    (autor_id = auth.uid() and public.has_active_membership_or_trial()) or public.is_admin()
  );

-- 3. POST_LIKES: Solo miembros activos/trial pueden dar like
drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own_active" on public.post_likes
  for insert to authenticated with check (
    user_id = auth.uid() and public.has_active_membership_or_trial()
  );

-- 4. COMMENT_LIKES: Solo miembros activos/trial pueden dar like a comentarios
drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own_active" on public.comment_likes
  for insert to authenticated with check (
    user_id = auth.uid() and public.has_active_membership_or_trial()
  );

-- ============================================================================
-- FUNCIÓN AUXILIAR: has_active_membership_or_trial()
-- ============================================================================
-- Como el estado trial puede ser 'trial' o 'activa', necesitamos una función
-- que considere ambos como válidos para interactuar, pero NO 'suspendida'.
-- ============================================================================
create or replace function public.has_active_membership_or_trial()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.estado in ('activa', 'trial')
  );
$$;

-- ============================================================================
-- FIN
-- ============================================================================
