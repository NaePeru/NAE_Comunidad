-- ============================================================================
-- MIGRACIÓN 12 — Acceso a cursos premium comprados individualmente
-- ============================================================================
-- PROBLEMA: las políticas RLS de modules y lessons solo permitían ver
-- contenido de cursos gratis o con MEMBRESÍA. La compra individual
-- (tabla course_access, generada al aprobar el voucher de S/80) no estaba
-- considerada: el alumno pagaba, entraba al curso, pero las lecciones
-- quedaban vacías.
--
-- SOLUCIÓN: nueva función has_course_access(course_id) + políticas
-- actualizadas de modules y lessons.
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- 1. ¿El usuario actual compró este curso? (compra individual)
create or replace function public.has_course_access(cid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.course_access ca
    where ca.user_id = auth.uid()
      and ca.course_id = cid
  );
$$;

-- 2. Módulos: visibles si el curso es gratis, hay membresía O se compró
drop policy if exists "modules_select_access" on public.modules;
create policy "modules_select_access" on public.modules
  for select using (
    public.is_admin() or exists (
      select 1 from public.courses c
      where c.id = modules.course_id
        and (
          c.requiere_pago = false
          or public.has_active_membership()
          or public.has_course_access(modules.course_id)
        )
    )
  );

-- 3. Lecciones: misma regla
drop policy if exists "lessons_select_access" on public.lessons;
create policy "lessons_select_access" on public.lessons
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.courses c
      where c.id = lessons.course_id
        and (
          c.requiere_pago = false
          or public.has_active_membership()
          or public.has_course_access(lessons.course_id)
        )
    )
  );
