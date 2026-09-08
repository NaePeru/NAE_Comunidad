-- ============================================================================
-- MIGRACIÓN 10 — Eliminar alumno SIN pagos (regla oficial en el servidor)
-- ============================================================================
-- REGLA (definida por el dueño): un alumno puede eliminarse SOLO si no ha
-- realizado ningún pago. Si tiene cualquier pago en estado 'pagado' (o una
-- matrícula confirmada), el historial queda protegido y se rechaza.
--
-- Por qué RPC y no un DELETE directo del panel:
--   1. La regla vive en la base: nadie la salta aunque edite el frontend.
--   2. Es atómica: valida → borra matrículas pendientes → borra alumno,
--      sin dejar el alumno huérfano a mitad de camino.
--   3. Los pagos PENDIENTES de matrículas eliminadas se van en cascada
--      (t_pago ya tiene ON DELETE CASCADE desde t_matricula).
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace function public.eliminar_alumno_sin_pago(p_dni text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo secretaría/admin puede eliminar
  if not public.is_secretaria() then
    raise exception 'Solo secretaría puede eliminar alumnos';
  end if;

  -- REGLA OFICIAL: si tiene algún pago hecho (o matrícula confirmada), NO se elimina
  if exists (
    select 1
    from public.t_matricula m
    where m.dni = p_dni
      and (
        m.estado = 'confirmada'
        or exists (
          select 1 from public.t_pago p
          where p.matricula_id = m.id and p.estado = 'pagado'
        )
      )
  ) then
    raise exception 'El alumno tiene pagos registrados — no se puede eliminar (historial protegido)';
  end if;

  -- Matrículas pendientes del alumno (sus pagos pendientes caen en cascada)
  delete from public.t_matricula where dni = p_dni;

  -- El alumno
  delete from public.t_alumnos where dni = p_dni;

  if not found then
    raise exception 'No existe un alumno con DNI %', p_dni;
  end if;

  return true;
end;
$$;

revoke all on function public.eliminar_alumno_sin_pago(text) from public, anon;
grant execute on function public.eliminar_alumno_sin_pago(text) to authenticated;

select 'RPC eliminar_alumno_sin_pago creada — regla: sin pagos hechos se elimina, con pagos queda protegido' as resultado;
