-- ============================================================================
-- MIGRACIÓN 19 — Certificados con fecha de INICIO y FIN del curso
-- ============================================================================
-- 1. Nueva columna fecha_inicio / fecha_fin en certificates
-- 2. RPC para que secretaría/admin emita certificados de cursos EN VIVO
--    (con fechas reales del grupo: p.ej. Power Pivot 24/11 → 08/12, 16 h)
-- Ejecutar completa en el SQL Editor del dashboard.
-- ============================================================================

-- ── 1. COLUMNAS NUEVAS ──────────────────────────────────────────────────────
alter table public.certificates
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin    date;

-- ── 2. RPC — emitir certificado de curso en vivo (secretaría/admin) ────────
create or replace function public.emitir_certificado_curso(
  p_email        text,
  p_titulo       text,
  p_horas        integer,
  p_modalidad    text default 'En vivo',
  p_fecha_inicio date,
  p_fecha_fin    date
)
returns public.certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol      text;
  v_user     uuid;
  v_profile  record;
  v_codigo   text;
  v_cert     public.certificates;
begin
  -- Solo secretaría o admin pueden emitir
  select rol into v_rol from public.profiles where id = auth.uid();
  if v_rol not in ('admin', 'secretaria') then
    raise exception 'Solo secretaría puede emitir certificados de curso';
  end if;

  -- Alumno por correo (auth.users → profiles)
  select p.id, p.nombre, p.dni into v_user, v_profile.nombre, v_profile.dni
  from public.profiles p
  where lower(p.id::text) in (
    select lower(u.id::text) from auth.users u where lower(u.email) = lower(p_email)
  );
  if v_user is null then
    -- fallback directo por metadata (algunos perfiles guardan el correo)
    select p.id, p.nombre, p.dni into v_user, v_profile.nombre, v_profile.dni
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(p_email);
  end if;
  if v_user is null then
    raise exception 'No se encontró alumno con el correo %', p_email;
  end if;

  -- Validaciones
  if p_titulo is null or length(trim(p_titulo)) < 3 then
    raise exception 'Falta el título del curso';
  end if;
  if p_horas is null or p_horas <= 0 then
    raise exception 'Las horas académicas deben ser mayores a 0';
  end if;
  if p_fecha_inicio is null or p_fecha_fin is null or p_fecha_fin < p_fecha_inicio then
    raise exception 'Fechas inválidas (inicio/fin)';
  end if;

  -- Evitar duplicado del mismo curso para el mismo alumno
  select * into v_cert from public.certificates
  where user_id = v_user and tipo = 'curso'
    and lower(titulo) = lower(trim(p_titulo))
    and fecha_inicio = p_fecha_inicio
  limit 1;
  if found then
    return v_cert;
  end if;

  v_codigo := 'NAE-' || extract(year from now())::text || '-' ||
              lpad(floor(random() * 100000)::text, 5, '0');

  insert into public.certificates
    (user_id, tipo, titulo, codigo, dni, nombre_emisor, horas, modalidad,
     fecha_inicio, fecha_fin)
  values
    (v_user, 'curso', trim(p_titulo), v_codigo, v_profile.dni, v_profile.nombre,
     p_horas, p_modalidad, p_fecha_inicio, p_fecha_fin)
  returning * into v_cert;

  return v_cert;
end;
$$;

revoke all on function public.emitir_certificado_curso(text, text, integer, text, date, date) from public;
grant execute on function public.emitir_certificado_curso(text, text, integer, text, date, date)
  to authenticated;

-- ── 3. Verificación ─────────────────────────────────────────────────────────
select 'Migracion 19 OK: certificates con fecha_inicio/fecha_fin + RPC emitir_certificado_curso' as resultado;
