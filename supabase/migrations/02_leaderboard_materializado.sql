-- ============================================================================
-- MIGRACIÓN 02 — Leaderboard materializado (rendimiento a escala)
-- ============================================================================
-- PROBLEMA: la vista leaderboard_semanal se recalcula en CADA consulta
-- (JOIN + SUM sobre point_log). Con 500 usuarios activos x 100 acciones/semana
-- = 50.000 filas → ~200ms por carga del ranking.
--
-- SOLUCIÓN: convertir la vista en VISTA MATERIALIZADA (se guarda en disco)
-- y refrescarla automáticamente cada 5 minutos con pg_cron.
--
-- ⚠️  REQUISITO: la extensión pg_cron debe estar activa en Supabase.
--     Supabase → Database → Extensions → buscar "pg_cron" → Enable.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- 1. Crear la vista materializada (datos guardados en disco, acceso O(1))
CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard_semanal_mv AS
SELECT
  p.id,
  p.nombre,
  p.avatar_url,
  p.color,
  COALESCE(SUM(pl.cantidad), 0) AS puntos_semana,
  ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(pl.cantidad), 0) DESC) AS posicion
FROM public.profiles p
LEFT JOIN public.point_log pl
  ON pl.user_id = p.id
  AND pl.creado_en > now() - interval '7 days'
WHERE p.activo = true
GROUP BY p.id, p.nombre, p.avatar_url, p.color
ORDER BY puntos_semana DESC;

-- 2. Índice sobre la vista materializada (para consultas rápidas por user_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_mv_id
  ON public.leaderboard_semanal_mv (id);

-- 3. Permisos: cualquier usuario autenticado puede leerla
GRANT SELECT ON public.leaderboard_semanal_mv TO anon, authenticated;

-- 4. Refrescar cada 5 minutos automáticamente con pg_cron
--    (requiere extensión pg_cron activa)
DO $$
BEGIN
  -- Intentar programar el job. Si pg_cron no está activo, esto falla
  -- silenciosamente y podés refrescar a mano cuando quieras.
  BEGIN
    PERFORM cron.schedule(
      'refresh-leaderboard-semanal',
      '*/5 * * * *',
      $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_semanal_mv$$
    );
    RAISE NOTICE 'Job pg_cron programado: leaderboard se refresca cada 5 minutos.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron no disponible. Refrescá la vista a mano con: REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_semanal_mv;';
  END;
END $$;


-- ============================================================================
-- CÓMO USARLA DESDE EL FRONTEND
-- ============================================================================
-- En miembros.js y comunidad.html, cambiar:
--   .from('leaderboard_semanal')
-- por:
--   .from('leaderboard_semanal_mv')
--
-- Y para refrescar a mano (si querés ver cambios inmediatos):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_semanal_mv;
-- ============================================================================

-- Verificación: comparar tamaños
SELECT
  'vista original (recalcula en cada query)' as tipo,
  count(*) as filas
FROM public.leaderboard_semanal
UNION ALL
SELECT
  'vista materializada (guardada en disco)' as tipo,
  count(*) as filas
FROM public.leaderboard_semanal_mv;
