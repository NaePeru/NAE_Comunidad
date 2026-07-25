-- ============================================================================
-- PROYECTO Z — Actualizar función recompute_level (Niveles Dragon Ball Z)
-- ============================================================================
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

create or replace function public.recompute_level(pts int)
returns int
language sql immutable
as $$
  select case
    when pts >= 10000 then 8  -- Súper Saiyajin Blue 🔱
    when pts >= 5000  then 7  -- Saiyajin Dios 🔵
    when pts >= 3000  then 6  -- Súper Saiyajín 3 🌪️
    when pts >= 1500  then 5  -- Súper Saiyajín 2 ⚡
    when pts >= 800   then 4  -- Súper Saiyajín 💛
    when pts >= 300   then 3  -- Saiyajín 🐵
    when pts >= 100   then 2  -- Kaio-ken 🔴
    else 1                   -- Humano 🧍
  end;
$$;

-- Recalcular niveles de todos los usuarios existentes
update public.profiles set nivel = recompute_level(puntos);
