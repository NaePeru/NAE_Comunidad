-- ============================================================================
-- MIGRACIÓN 01 — Constraint anti-duplicados en courses
-- ============================================================================
-- PROBLEMA: migraciones solapadas insertaron cursos con slugs/títulos
-- repetidos, causando que el catálogo mostrara duplicados (bug de los 24 cursos).
--
-- SOLUCIÓN: crear un índice UNIQUE sobre lower(titulo) para que la BD
-- bloqueé automáticamente cualquier INSERT duplicado a futuro.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- SEGURO: no toca datos existentes. Si hay duplicados aún, fallará y te
-- avisará (entonces hay que limpiarlos primero).
-- ============================================================================

-- Intentar crear el constraint. Si hay duplicados de título todavía,
-- esto va a FALLAR con un error claro (eso es bueno: te avisa).
CREATE UNIQUE INDEX IF NOT EXISTS courses_titulo_unique
  ON public.courses (lower(titulo));

-- Verificación: listar cualquier duplicado restante (debería devolver 0 filas).
SELECT lower(titulo) as titulo, count(*) as cantidad
FROM public.courses
GROUP BY lower(titulo)
HAVING count(*) > 1;
