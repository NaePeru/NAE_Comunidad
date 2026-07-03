-- ============================================================================
-- PROYECTO Z — Políticas de Storage para avatares (fotos de perfil)
-- ============================================================================
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → New query → Run
--
-- REQUISITO PREVIO:
--   1. Andá a Storage → New bucket
--   2. Name: avatars
--   3. Public bucket: SÍ (marcar el toggle)
--   4. Create bucket
--
-- Después de eso, ejecutá este SQL.
-- ============================================================================

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

-- ============================================================================
-- FIN
-- ============================================================================
