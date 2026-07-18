-- ============================================================================
-- PROYECTO Z — Sistema de Aprobación de Alumnos
-- ============================================================================
-- Los nuevos registros quedan "pendientes" hasta que el admin los apruebe.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- 1. Agregar nuevos estados al enum de membresía
alter type public.membership_status add value if not exists 'pendiente';
alter type public.membership_status add value if not exists 'rechazada';

-- 2. Cambiar el trigger: nuevos usuarios quedan "pendientes" (no más trial automático)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Crear perfil
  insert into public.profiles (id, nombre, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1))
  );

  -- Crear membresía PENDIENTE (esperando aprobación del admin)
  insert into public.memberships (user_id, estado, dias_validos, fecha_vence)
  values (new.id, 'pendiente', 7, now() + interval '7 days');

  return new;
end;
$$;

-- 3. Actualizar usuarios existentes: los que ya están activos o en trial quedan igual
--    (no los afectamos, solo los NUEVOS quedan pendientes)
