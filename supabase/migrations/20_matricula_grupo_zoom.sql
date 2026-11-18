-- ============================================================================
-- MIGRACIÓN 20 — Matrícula completa: email de confirmación con GRUPO DE
-- WHATSAPP + ZOOM del curso
-- ============================================================================
-- 1. t_cursop guarda por grupo su enlace de WhatsApp y de Zoom
-- 2. El trigger del email de matrícula los envía a la Edge send-email
-- 3. Backfill de los grupos vigentes con sus links de WhatsApp
-- Ejecutar completa en el SQL Editor.
-- ============================================================================

-- ── 1. COLUMNAS NUEVAS EN t_cursop ──────────────────────────────────────────
alter table public.t_cursop
  add column if not exists grupo_whatsapp text,
  add column if not exists link_zoom      text;

-- ── 2. TRIGGER DEL EMAIL: incluye grupo de WhatsApp + Zoom ─────────────────
create or replace function public.trg_pago_email_matricula()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_mail    text;
  v_nombre  text;
  v_curso   text;
  v_horario text;
  v_inicio  date;
  v_wa      text;
  v_zoom    text;
begin
  if new.estado = 'pagado' and (tg_op = 'INSERT' or old.estado is distinct from 'pagado') then
    begin
      select a.mail, a.nombres, cu.nombre, cp.horario, cp.fecha_inicio,
             cp.grupo_whatsapp, cp.link_zoom
        into v_mail, v_nombre, v_curso, v_horario, v_inicio, v_wa, v_zoom
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
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscHN2YnJjdGNjbm12a2Jqc2ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwNTMsImV4cCI6MjA5ODM0MjA1M30.sMjCrC0wDEks9YBcoxHK4xf1ODCKD6SRJqwRjdea9pU'
          ),
          body := jsonb_build_object(
            'tipo',        'matricula',
            'cron_secret', 'nae_cron_2026_Xk7mQ9vR4pZ2wT8L',
            'email',       v_mail,
            'nombre',      v_nombre,
            'curso',       v_curso,
            'horario',     v_horario,
            'fecha_inicio', v_inicio,
            'grupo_whatsapp', v_wa,
            'link_zoom',      v_zoom
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

-- ── 3. BACKFILL: links de WhatsApp de los grupos vigentes ──────────────────
update public.t_cursop cp set grupo_whatsapp = 'https://chat.whatsapp.com/JrOcXf0t4OEDh2EdZu7pLb'
where cp.grupo_whatsapp is null
  and exists (select 1 from public.t_cursos c
              where c.codcurso = cp.codcurso
                and c.nombre ilike '%inteligencia de negocios%');

update public.t_cursop cp set grupo_whatsapp = 'https://chat.whatsapp.com/GUKPpi04VSkKaei5kYYkBX'
where cp.grupo_whatsapp is null
  and exists (select 1 from public.t_cursos c
              where c.codcurso = cp.codcurso
                and c.nombre ilike '%power pivot%');

-- ── 4. Verificación ─────────────────────────────────────────────────────────
select cp.cursop, c.nombre, cp.fecha_inicio, cp.grupo_whatsapp, cp.link_zoom
from public.t_cursop cp
join public.t_cursos c on c.codcurso = cp.codcurso
order by cp.fecha_inicio;
