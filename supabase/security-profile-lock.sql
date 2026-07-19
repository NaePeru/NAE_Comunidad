-- ============================================================================
-- PROYECTO Z — FIX CRÍTICO DE SEGURIDAD
-- ============================================================================
-- PROBLEMA: Un alumno podía autoproclamarse Admin modificando su perfil.
-- SOLUCIÓN: Un trigger que bloquea cambios de 'rol' y 'puntos' si no es admin.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace function public.prevent_profile_tampering()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Si el usuario NO es admin, no le permitimos cambiar 'rol' ni 'puntos'
  if not public.is_admin() then
    -- Forzar a que mantenga los valores originales
    NEW.rol := OLD.rol;
    NEW.puntos := OLD.puntos;
  end if;
  return NEW;
end;
$$;

-- Crear el trigger (si ya existe, lo reemplazamos)
drop trigger if exists trg_prevent_tampering on public.profiles;
create trigger trg_prevent_tampering
  before update on public.profiles
  for each row execute function public.prevent_profile_tampering();
