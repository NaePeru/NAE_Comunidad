-- ============================================================================
-- MIGRACIÓN 19 — Cursos VIRTUALES siempre vigentes (no caducan)
-- Un curso virtual (videos/comunidad) no "inicia ni termina": la fecha_inicio
-- es su fecha de APERTURA y sigue ofreciéndose para siempre.
-- Los online/presenciales mantienen la regla actual: se ocultan al iniciar.
--
-- EJECUTAR EN: Supabase → SQL Editor → pegar TODO → Run
-- ============================================================================

create or replace view public.t_cursos_vigentes as
select
  c.codcurso,
  c.nombre,
  c.costo,
  c.modalidad,
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
 and (
       p.modalidad = 'virtual'                                          -- virtual: siempre vigente
    or p.fecha_inicio >= ((now() at time zone 'America/Lima')::date)   -- resto: aún no inicia
 )
group by c.codcurso, c.nombre, c.costo, c.modalidad;

comment on view public.t_cursos_vigentes is
  'Cursos ofertables: grupos online/presenciales que aún no inician + TODO grupo virtual (no caducan).';

select 'Migracion 19 OK: cursos virtuales siempre vigentes' as resultado;
