-- ============================================================================
-- PROYECTO Z — Diagnóstico y limpieza de cursos duplicados
-- ============================================================================
-- PROBLEMA: los cursos se duplican en el catálogo.
-- CAUSA: schema.sql y cursos-skool.sql insertaron cursos con slugs distintos
--        para el mismo curso (ej: 'excel-basico' vs 'excel-fundamental',
--        'power-bi-visualizacion' vs 'power-bi-visualizaciones').
--
-- CÓMO USAR ESTE ARCHIVO:
--   1) Primero corré solo la SECCIÓN A (diagnóstico) en SQL Editor.
--   2) Revisá la salida. Si hay duplicados, seguí con la SECCIÓN B.
--   3) La SECCIÓN B es SEGURA: solo borra los cursos que NO tienen lecciones
--      ni progreso asociado, y mantiene los que sí tienen contenido real.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- SECCIÓN A — DIAGNÓSTICO (solo lectura, ejecutá esto primero)
-- ════════════════════════════════════════════════════════════════════════════

-- A.1) Listar todos los cursos con su slug, orden y nº de lecciones.
--      Vas a ver si hay filas con títulos parecidos / slugs similares.
select
  c.id,
  c.slug,
  c.titulo,
  c.requiere_pago,
  c.publicado,
  c.orden,
  (select count(*) from public.lessons l where l.course_id = c.id)   as num_lecciones,
  (select count(*) from public.modules m where m.course_id = c.id)   as num_modulos
from public.courses c
order by c.orden, c.titulo;

-- A.2) Detectar cursos duplicados por TÍTULO (ignorando mayúsculas).
--      Si esta query devuelve filas, tenés duplicados confirmados.
select lower(titulo) as titulo, count(*) as cantidad,
       string_agg(slug, ', ') as slugs_encontrados
from public.courses
group by lower(titulo)
having count(*) > 1;


-- ════════════════════════════════════════════════════════════════════════════
-- SECCIÓN B — LIMPIEZA SEGURA (ejecutá solo después de revisar A)
-- ════════════════════════════════════════════════════════════════════════════
-- Esta sección borra los cursos DUPLICADOS que NO tienen lecciones ni módulos
-- (es decir, los "fantasmas" que quedaron de inserts anteriores incompletos).
-- Conserva el curso que SÍ tiene contenido. Si AMBOS duplicados tienen
-- lecciones, NO borra nada (tendrás que mergear a mano).
--
-- ⚠️  ANTES DE CORRER: revisá la salida de la SECCIÓN A.
-- ⚠️  RECOMENDADO: hacé un backup/export de la tabla courses primero.
--     Supabase → Database → Table Editor → courses → Export.
-- ============================================================================

-- B.1) Ver qué cursos serían eliminados (PREVIEW — solo lectura).
--      Solo aparecen aquí los cursos sin lecciones NI módulos.
select c.id, c.slug, c.titulo, 'SIN CONTENIDO' as motivo
from public.courses c
where not exists (select 1 from public.lessons l where l.course_id = c.id)
  and not exists (select 1 from public.modules m where m.course_id = c.id)
order by c.titulo;

-- B.2) ELIMINAR cursos vacíos (sin lecciones ni módulos).
--      Estos son los duplicados que no aportan nada. Es seguro borrarlos.
--      Descomentá (borrá los "--") y ejecutá solo si estás de acuerdo con B.1.
--
-- delete from public.courses c
-- where not exists (select 1 from public.lessons l where l.course_id = c.id)
--   and not exists (select 1 from public.modules m where m.course_id = c.id);


-- ════════════════════════════════════════════════════════════════════════════
-- SECCIÓN C — MERGE MANUAL (solo si dos duplicados AMBOS tienen lecciones)
-- ════════════════════════════════════════════════════════════════════════════
-- Caso hipotético: tenés 'power-bi-visualizacion' (con 3 lecciones)
-- y 'power-bi-visualizaciones' (con 2 lecciones). Querés mover las lecciones
-- del segundo al primero y borrar el segundo.
--
-- Reemplazá los IDs/SLUGS por los reales (sacalos de la SECCIÓN A) y
-- descomentá las líneas:
--
-- -- 1. Mover lecciones del duplicado al curso que querés conservar:
-- update public.lessons
--   set course_id = (select id from public.courses where slug = 'power-bi-visualizaciones')
--   where course_id = (select id from public.courses where slug = 'power-bi-visualizacion');
--
-- -- 2. Mover módulos igual:
-- update public.modules
--   set course_id = (select id from public.courses where slug = 'power-bi-visualizaciones')
--   where course_id = (select id from public.courses where slug = 'power-bi-visualizacion');
--
-- -- 3. Ahora sí, borrar el duplicado vacío:
-- delete from public.courses where slug = 'power-bi-visualizacion';


-- ════════════════════════════════════════════════════════════════════════════
-- SECCIÓN D — PREVENCIÓN (constraint anti-duplicados a futuro)
-- ════════════════════════════════════════════════════════════════════════════
-- Esto evita que vuelva a pasar: fuerza que el título sea único (además del slug).
-- Ejecutá esta sección DESPUÉS de la limpieza, cuando ya no haya duplicados.
-- ============================================================================

-- D.1) Constraint de unicidad sobre el título (lowercase).
--      Si quedan duplicados de título, este constraint fallará y te avisará
--      (no se crea hasta que limpies). Una vez limpio, se crea y bloquea futuros
--      inserts duplicados a nivel de BD.
--
-- create unique index if not exists courses_titulo_unique
--   on public.courses (lower(titulo));

-- ============================================================================
-- FIN
-- ============================================================================
