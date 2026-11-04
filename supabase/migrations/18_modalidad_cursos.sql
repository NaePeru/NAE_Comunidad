-- ============================================================================
-- MIGRACIÓN 18 — Modalidad de cursos en el sistema de matrícula
-- Distinción de productos: virtual (videos/comunidad, S/60) · online (en vivo
-- por Zoom) · presencial.
--
-- EJECUTAR EN: Supabase → SQL Editor → pegar TODO → Run
-- (misma sesión de dashboard que los redeploys de send-email y verify-payment)
-- ============================================================================

-- 1) Columna modalidad en el catálogo
alter table public.t_cursos
  add column if not exists modalidad text not null default 'online'
  check (modalidad in ('virtual', 'online', 'presencial'));

-- 2) Modalidad de los cursos existentes (ajustar a criterio del negocio)
update public.t_cursos set modalidad = 'virtual' where codcurso = 'CUR-0012'; -- Power Pivot: videos comunidad S/60
update public.t_cursos set modalidad = 'online'
  where codcurso in ('CUR-0006', 'CUR-0007'); -- Excel BI y Power BI básico: en vivo Zoom

-- 3) La vista que lee el bot incluye la modalidad (copia fiel de la 17 + columna)
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
group by c.codcurso, c.nombre, c.costo, c.modalidad;

comment on view public.t_cursos_vigentes is
  'Catálogo de cursos con SOLO grupos que aún no inician (fecha Lima). Incluye modalidad (virtual/online/presencial). Para el chatbot y la web.';

select 'Migracion 18 OK: modalidad agregada' as resultado;
