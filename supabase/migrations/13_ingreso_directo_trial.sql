-- ============================================================================
-- PROYECTO Z — Migración 13: Ingreso directo a la comunidad (trial)
-- ============================================================================
-- PROBLEMA: aprobar-alumnos.sql dejó los registros nuevos en 'pendiente',
-- obligando al admin a aprobar cada cuenta a mano (entrada lenta).
--
-- SOLUCIÓN: los nuevos usuarios entenan DIRECTO en estado 'trial'
-- (acceso inmediato, 7 días). El admin sigue pudiendo suspender o
-- activar desde el panel de miembros cuando quiera.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

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

  -- Membresía TRIAL: acceso inmediato a la comunidad (sin aprobación manual)
  insert into public.memberships (user_id, estado, dias_validos, fecha_vence)
  values (new.id, 'trial', 7, now() + interval '7 days');

  return new;
end;
$$;

-- Poner al día a los usuarios que quedaron atrapados en 'pendiente'
-- (pidieron entrar y nunca fueron aprobados): pasan a trial ahora mismo.
update public.memberships
set estado = 'trial',
    fecha_vence = now() + interval '7 days'
where estado = 'pendiente';
