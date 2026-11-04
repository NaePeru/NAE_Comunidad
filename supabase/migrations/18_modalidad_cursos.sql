-- ============================================================================
-- MIGRACIÓN 18 — Modalidad en la PROGRAMACIÓN de cursos (t_cursop)
-- La modalidad es de cada grupo programado, no del curso del catálogo:
--   virtual (videos/comunidad) · online (en vivo Zoom) · presencial
-- EJECUTAR EN: Supabase → SQL Editor → pegar TODO → Run
-- (misma sesión de dashboard que los redeploys de send-email y verify-payment)
-- ============================================================================

alter table public.t_cursop
  add column if not exists modalidad text not null default 'online'
  check (modalidad in ('virtual', 'online', 'presencial'));

-- grupo existente de Power Pivot: dictado en vivo
update public.t_cursop set modalidad = 'online' where cursop = '261122';

-- vista del bot: cada grupo lleva su modalidad
create or replace view public.t_cursos_vigentes as
select
  c.codcurso,
  c.nombre,
  c.costo,
  coalesce(
    json_agg(
      json_build_object(
        'cursop',       p.cursop,
        'modalidad',    p.modalidad,
        'horario',      p.horario,
        'fecha_inicio', p.fecha_inicio,
        'fecha_fin',    p.fecha_fin
      ) order by p.fecha_inicio
    ) filter (where p.cursop is not null),
    '[]'::json
  ) as t_cursop
from public.t_cursos c
left join public.t_cursop p
  on p.codcurso = c.codcurso
 and p.fecha_inicio >= ((now() at time zone 'America/Lima')::date)
group by c.codcurso, c.nombre, c.costo;

comment on view public.t_cursos_vigentes is
  'Catálogo con grupos que aún no inician (fecha Lima). Cada grupo incluye su modalidad (virtual/online/presencial).';

select 'Migracion 18 OK: modalidad en t_cursop' as resultado;