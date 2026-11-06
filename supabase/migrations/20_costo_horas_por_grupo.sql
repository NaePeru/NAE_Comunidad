-- ============================================================================
-- MIGRACIÓN 20 — Precio y horas POR PROGRAMACIÓN (lógica de 3 formatos)
-- El mismo curso puede dictarse como: online completo (20h, S/150),
-- online compacto (15h) o virtual (videos, S/60). Cada EDICIÓN (t_cursop)
-- lleva su propio costo y horas; el catálogo conserva el precio del curso
-- completo como referencia.
--
-- EJECUTAR EN: Supabase → SQL Editor → pegar TODO → Run
-- ============================================================================

alter table public.t_cursop
  add column if not exists costo numeric(8,2),
  add column if not exists horas  integer;

-- precios de los grupos virtuales actuales (videos en comunidad: S/60)
update public.t_cursop set costo = 60 where cursop in ('261123', '261126');

-- vista del bot: cada grupo anuncia SU precio y horas (fallback al catálogo)
create or replace view public.t_cursos_vigentes as
select
  c.codcurso,
  c.nombre,
  c.costo as costo_curso,
  coalesce(
    json_agg(
      json_build_object(
        'cursop',       p.cursop,
        'modalidad',    p.modalidad,
        'horario',      p.horario,
        'costo',        coalesce(p.costo, c.costo),
        'horas',        p.horas,
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
       p.modalidad = 'virtual'
    or p.fecha_inicio >= ((now() at time zone 'America/Lima')::date)
 )
group by c.codcurso, c.nombre, c.costo;

comment on view public.t_cursos_vigentes is
  'Cursos ofertables: cada grupo trae modalidad + costo propio + horas (fallback al precio del catálogo).';

select 'Migracion 20 OK: precio y horas por programacion' as resultado;
