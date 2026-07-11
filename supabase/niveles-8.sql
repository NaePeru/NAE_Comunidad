-- ============================================================================
-- PROYECTO Z — Actualizar función recompute_level a 8 niveles
-- ============================================================================
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace function public.recompute_level(pts int)
returns int
language sql immutable
as $$
  select case
    when pts >= 10000 then 8  -- Leyenda NAE 💎
    when pts >= 5000  then 7  -- Experto 🌟
    when pts >= 3000  then 6  -- Maestro 🏆
    when pts >= 1500  then 5  -- Estratega 🧠
    when pts >= 800   then 4  -- Analista 📊
    when pts >= 300   then 3  -- Aprendiz 📚
    when pts >= 100   then 2  -- Explorador 🔍
    else 1                   -- Novato 🌱
  end;
$$;

-- Recalcular niveles de todos los usuarios existentes
update public.profiles set nivel = recompute_level(puntos);
