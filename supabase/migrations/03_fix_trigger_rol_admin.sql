-- ============================================================================
-- MIGRACIÓN 03 — Fix del trigger que bloquea el cambio de rol admin
-- ============================================================================
-- PROBLEMA: el trigger prevent_profile_tampering bloquea TODO cambio de
-- 'rol' y 'puntos' si is_admin() devuelve false. Pero desde SQL Editor
-- (que usa service_role) no hay auth.uid(), entonces is_admin() siempre
-- devuelve false y NUNCA se puede cambiar el rol, ni siquiera el admin
-- real desde Supabase Dashboard.
--
-- SOLUCIÓN: el trigger debe permitir cambios cuando:
--   1. El usuario es admin (caso normal desde la web), O
--   2. No hay sesión activa (auth.uid() IS NULL) → ejecución server-side
--      desde SQL Editor, Edge Functions, o el propio backend de Supabase.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace function public.prevent_profile_tampering()
returns trigger language plpgsql
security definer as $$
begin
  -- Solo bloquear si hay un usuario logueado Y no es admin.
  -- Si no hay sesión (auth.uid() IS NULL), es una operación del backend
  -- (SQL Editor con service_role, Edge Function, etc.) → la permitimos.
  if auth.uid() is not null and not public.is_admin() then
    NEW.rol := OLD.rol;
    NEW.puntos := OLD.puntos;
  end if;
  return NEW;
end;
$$;

-- Verificación: ahora esto debería funcionar
-- (descomentá las líneas de abajo para probar)
-- update public.profiles set rol = 'admin' where nombre = 'Luz';
-- select nombre, rol from public.profiles where nombre = 'Luz';
