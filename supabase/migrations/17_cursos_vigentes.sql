-- ============================================================================
-- PROYECTO Z — Migración 17: Vista de cursos VIGENTES (que aún no inician)
-- ============================================================================
-- Regla de negocio: un curso cuya fecha de inicio ya pasó NO se muestra ni
-- se ofrece (ya inició, ya no se puede matricular).
--
-- Esta vista devuelve el mismo formato que t_cursos con su t_cursop embebido,
-- pero SOLO con programaciones cuya fecha_inicio es HOY o futura (hora Lima).
-- La herramienta del chatbot (consultar_bd) consulta esta vista.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace view public.t_cursos_vigentes as
select
  c.codcurso,
  c.nombre,
  c.costo,
  coalesce(
    json_agg(
      json_build_object(
        'cursop',       p.cursop,
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
  'Catálogo de cursos con SOLO grupos que aún no inician (fecha Lima). Para el chatbot y la web.';

-- Verificación
select 'Migracion 17 OK: vista t_cursos_vigentes creada' as resultado;
