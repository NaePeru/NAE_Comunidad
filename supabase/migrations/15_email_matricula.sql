-- ============================================================================
-- PROYECTO Z — Migración 15: Email de confirmación al matricularse
-- ============================================================================
-- Cuando el pago de una matrícula pasa a 'pagado' (confirmado), el alumno
-- recibe automáticamente un correo:
--   ✅ "Ya estás matriculado" (curso, horario, fecha de inicio)
--   ✅ "Además tienes acceso a la comunidad / curso grabado"
--   ✅ Botón para entrar a www.naeacademia.com
--
-- IMPORTANTE — autenticación de las llamadas desde la BD:
--   El gateway de Supabase exige un JWT válido en el header Authorization
--   (la clave ANON pública lo es). El CRON_SECRET viaja dentro del body
--   (campo cron_secret) para que la función la reconozca como llamada del
--   sistema.
--
-- ⚠️ REQUIERE: redeployar la Edge Function send-email (con el tipo
-- 'matricula' y el cron_secret por body) ANTES de confirmar pagos nuevos.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- ── 1. TRIGGER: pago confirmado → email al alumno ─────────────────────────
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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pago_email on public.t_pago;
create trigger trg_pago_email
  after insert or update of estado on public.t_pago
  for each row execute function public.trg_pago_email_matricula();

-- ── 2. REPARAR el cron del seminario (migración 05) ────────────────────────
-- Llamaba con el CRON_SECRET plano en Authorization → el gateway lo rechazaba
-- con "Invalid JWT" (el recordatorio del sábado nunca salió). Se reprograma
-- con la auth correcta: JWT anon + cron_secret en el body.
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
select 'Migracion 15 OK: email de matricula + cron seminario reparado' as resultado;
