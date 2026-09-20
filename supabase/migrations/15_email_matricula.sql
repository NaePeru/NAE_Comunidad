-- ============================================================================
-- PROYECTO Z — Migración 15: Email de confirmación al matricularse
-- ============================================================================
-- Cuando el pago de una matrícula pasa a 'pagado' (confirmado), el alumno
-- recibe automáticamente un correo:
--   ✅ "Ya estás matriculado" (curso, horario, fecha de inicio)
--   ✅ "Además tienes acceso a la comunidad / curso grabado"
--   ✅ Botón para entrar a www.naeacademia.com
--
-- Autenticación: el gateway de Supabase exige un JWT válido en el header
-- Authorization (la clave ANON pública lo es). El CRON_SECRET viaja en el
-- body (campo cron_secret) para marcar la llamada como del sistema.
--
-- El trigger es a prueba de fallos: si el correo no puede enviarse, el pago
-- se confirma igual (nunca bloquea una matrícula por un problema de email).
--
-- ⚠️ REQUIERE: redeployar la Edge Function send-email (tipo 'matricula' +
-- cron_secret por body) ANTES de confirmar pagos nuevos.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- ── 0. EXTENSIONES (pg_net: llamadas HTTP desde la BD · pg_cron: agenda) ───
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── 1. TRIGGER: pago confirmado → email al alumno (a prueba de fallos) ─────
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
    begin
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
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscHN2YnJjdGNjbm12a2Jjc2ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwNTMsImV4cCI6MjA5ODM0MjA1M30.sMjCrC0wDEks9YBcoxHK4xf1ODCKD6SRJqwRjdea9pU'
          ),
          body := jsonb_build_object(
            'tipo',        'matricula',
            'cron_secret', 'nae_cron_2026_Xk7mQ9vR4pZ2wT8L',
            'email',       v_mail,
            'nombre',      v_nombre,
            'curso',       v_curso,
            'horario',     v_horario,
            'fecha_inicio', v_inicio
          )
        );
      end if;
    exception when others then
      null; -- el email es un extra: jamás bloquea la confirmación del pago
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pago_email on public.t_pago;
create trigger trg_pago_email
  after insert or update of estado on public.t_pago
  for each row execute function public.trg_pago_email_matricula();

-- ── 2. REPARAR el cron del seminario (migración 05 nunca llegó a correr) ───
-- Requiere pg_cron (creado arriba). Recordatorio: sábados 13:00 UTC = 08:00 Lima.
select cron.unschedule('recordatorio-seminario');
select cron.schedule(
  'recordatorio-seminario',
  '0 13 * * 6',
  $$
  select net.http_post(
    url := 'https://dlpsvbrctccnmvkbcsfp.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscHN2YnJjdGNjbm12a2Jjc2ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwNTMsImV4cCI6MjA5ODM0MjA1M30.sMjCrC0wDEks9YBcoxHK4xf1ODCKD6SRJqwRjdea9pU'
    ),
    body := jsonb_build_object(
      'tipo', 'seminario',
      'cron_secret', 'nae_cron_2026_Xk7mQ9vR4pZ2wT8L'
    )
  );
  $$
);

-- Verificación
select 'Migracion 15 OK: trigger de email blindado + cron seminario activo' as resultado;
