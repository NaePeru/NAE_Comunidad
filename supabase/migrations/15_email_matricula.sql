-- ============================================================================
-- PROYECTO Z — Migración 15: Email de confirmación al matricularse
-- ============================================================================
-- Cuando el pago de una matrícula pasa a 'pagado' (confirmado), el alumno
-- recibe automáticamente un correo:
--   ✅ "Ya estás matriculado" (curso, horario, fecha de inicio)
--   ✅ "Además tienes acceso a la comunidad / curso grabado"
--   ✅ Botón para entrar a www.naeacademia.com
--
-- Usa pg_net (ya instalado por la migración 05) para llamar a la Edge
-- Function send-email con el nuevo tipo 'matricula'.
--
-- ⚠️ REQUIERE: redeployar la Edge Function send-email (con el tipo
-- 'matricula' nuevo) ANTES de crear pagos nuevos.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace function public.trg_pago_email_matricula()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mail   text;
  v_nombre text;
  v_curso  text;
  v_horario text;
  v_inicio date;
begin
  if new.estado = 'pagado' and (tg_op = 'INSERT' or old.estado is distinct from 'pagado') then
    select a.mail, a.nombres, cu.nombre, cp.horario, cp.fecha_inicio
      into v_mail, v_nombre, v_curso, v_horario, v_inicio
    from public.t_matricula m
    join public.t_alumnos a  on a.dni = m.dni
    join public.t_cursop  cp on cp.cursop = m.cursop
    join public.t_cursos  cu on cu.codcurso = cp.codcurso
    where m.id = new.matricula_id;

    if v_mail is not null and v_mail <> '' then
      perform net.http_post(
        url := 'https://dlpsvbrctccnmvkbcsfp.supabase.co/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer nae_cron_2026_Xk7mQ9vR4pZ2wT8L'
        ),
        body := jsonb_build_object(
          'tipo',        'matricula',
          'email',       v_mail,
          'nombre',      v_nombre,
          'curso',       v_curso,
          'horario',     v_horario,
          'fecha_inicio', v_inicio
        )
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pago_email on public.t_pago;
create trigger trg_pago_email
  after insert or update of estado on public.t_pago
  for each row execute function public.trg_pago_email_matricula();

-- Verificación
select 'Migracion 15 OK: email de confirmacion de matricula activo' as resultado;
