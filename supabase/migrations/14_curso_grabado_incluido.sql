-- ============================================================================
-- PROYECTO Z — Migración 14: Curso grabado incluido con la matrícula en vivo
-- ============================================================================
-- REGLA DE NEGOCIO: el alumno que PAGA un curso en vivo (S/150) desde la web
-- obtiene automáticamente acceso al mismo curso en su versión grabada dentro
-- de la comunidad (tabla course_access).
--
-- Funciona en ambos órdenes:
--   a) Ya tiene cuenta en la comunidad → el acceso se otorga al confirmarse
--      el pago (trigger sobre t_pago).
--   b) Aún no tiene cuenta → cuando se registre en la comunidad CON EL MISMO
--      EMAIL, el acceso aparece solo (handle_new_user revisa pagos previos).
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- ── 1. MAPEO: curso web (t_cursos.codcurso) ↔ curso comunidad (courses) ────
alter table public.courses add column if not exists codcurso_web text;

update public.courses set codcurso_web = 'CUR-0003' where slug = 'excel-nivel-1-fundamental';
update public.courses set codcurso_web = 'CUR-0004' where slug = 'excel-nivel-2-intermedio';
update public.courses set codcurso_web = 'CUR-0005' where slug = 'excel-nivel-3-avanzado';
update public.courses set codcurso_web = 'CUR-0006' where slug = 'excel-nivel-4';
update public.courses set codcurso_web = 'CUR-0007' where slug = 'power-bi-nivel-1-transformacion';
update public.courses set codcurso_web = 'CUR-0008' where slug = 'power-bi-nivel-2-visualizaciones';
update public.courses set codcurso_web = 'CUR-0009' where slug = 'power-bi-nivel-3-dax';
update public.courses set codcurso_web = 'CUR-0010' where slug = 'sql-consultas-sql';
-- (CUR-0011 IA todavía no tiene curso espejo en la comunidad)

create unique index if not exists idx_courses_codcurso_web
  on public.courses(codcurso_web) where codcurso_web is not null;

-- ── 2. FUNCIÓN: otorgar todos los cursos grabados pagados por un email ─────
create or replace function public.otorgar_curso_grabado(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if p_email is null or p_email = '' then return; end if;

  select id into v_user from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user is null then return; end if;  -- sin cuenta aún: se otorgará al registrarse

  insert into public.course_access (user_id, course_id)
  select v_user, c.id
  from public.t_matricula m
  join public.t_cursop cp on cp.cursop = m.cursop
  join public.t_cursos cu on cu.codcurso = cp.codcurso
  join public.courses  c  on c.codcurso_web = cu.codcurso
  join public.t_alumnos a on a.dni = m.dni
  join public.t_pago p on p.matricula_id = m.id and p.estado = 'pagado'
  where lower(a.mail) = lower(p_email)
  on conflict do nothing;
end;
$$;

-- ── 3. TRIGGER: pago confirmado → otorgar curso grabado ────────────────────
-- (acompaña al trigger existente trg_pago_confirma; no lo reemplaza)
create or replace function public.trg_pago_otorga_curso()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mail text;
begin
  if new.estado = 'pagado' and (tg_op = 'INSERT' or old.estado is distinct from 'pagado') then
    select a.mail into v_mail
    from public.t_matricula m
    join public.t_alumnos a on a.dni = m.dni
    where m.id = new.matricula_id;

    perform public.otorgar_curso_grabado(v_mail);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pago_curso_grabado on public.t_pago;
create trigger trg_pago_curso_grabado
  after insert or update of estado on public.t_pago
  for each row execute function public.trg_pago_otorga_curso();

-- ── 4. REGISTRO NUEVO: si pagó antes con ese email, acceso inmediato ───────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Crear perfil
  insert into public.profiles (id, nombre, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1))
  );

  -- Membresía TRIAL: acceso inmediato a la comunidad (sin aprobación manual)
  insert into public.memberships (user_id, estado, dias_validos, fecha_vence)
  values (new.id, 'trial', 7, now() + interval '7 days');

  -- Si ya pagó un curso en vivo con este email → abrirle el curso grabado
  perform public.otorgar_curso_grabado(new.email);

  return new;
end;
$$;

-- ── 5. BACKFILL: alumnos que ya pagaron y ya tienen cuenta en la comunidad ─
insert into public.course_access (user_id, course_id)
select u.id, c.id
from auth.users u
join public.t_alumnos a on lower(a.mail) = lower(u.email)
join public.t_matricula m on m.dni = a.dni
join public.t_pago p on p.matricula_id = m.id and p.estado = 'pagado'
join public.t_cursop cp on cp.cursop = m.cursop
join public.courses  c  on c.codcurso_web = cp.codcurso
on conflict do nothing;

-- Verificación
select 'Migracion 14 OK: cursos grabados incluidos con la matricula en vivo' as resultado;
