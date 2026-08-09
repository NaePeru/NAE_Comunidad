-- ============================================================================
-- PROYECTO Z — Sistema de Certificados (NAE)
-- ============================================================================
-- Añade:
--   1. Columna `dni` a profiles (para constar en el certificado)
--   2. Tabla `certificates` (registro auditable de certificados emitidos)
--   3. RLS + políticas para certificates
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AÑADIR COLUMNA `dni` A PROFILES
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists dni text;

comment on column public.profiles.dni is 'DNI del alumno (aparece en los certificados)';


-- ----------------------------------------------------------------------------
-- 2. TABLA `certificates` — Registro de certificados emitidos
-- ----------------------------------------------------------------------------
create table if not exists public.certificates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  tipo            text not null check (tipo in ('excel', 'powerbi', 'completo')),
  titulo          text not null,                        -- "Analista de Datos en Excel" etc.
  codigo          text unique not null,                 -- código de verificación: NAE-2024-XXXX
  dni             text,                                 -- snapshot del DNI al emitir
  nombre_emisor   text not null,                        -- snapshot del nombre al emitir
  horas           integer not null default 60,
  modalidad       text not null default 'Virtual',
  emitido_en      timestamptz not null default now(),
  unique (user_id, tipo)                                -- un certificado por tipo por usuario
);

comment on table public.certificates is 'Certificados emitidos a los alumnos al completar módulos.';

create index if not exists idx_certificates_user on public.certificates(user_id);
create index if not exists idx_certificates_codigo on public.certificates(codigo);


-- ----------------------------------------------------------------------------
-- 3. RLS PARA certificates
-- ----------------------------------------------------------------------------
alter table public.certificates enable row level security;

-- El alumno puede ver SUS certificados; el admin puede ver TODOS
drop policy if exists "certificates_select_access" on public.certificates;
create policy "certificates_select_access" on public.certificates
  for select using (
    public.is_admin() or user_id = auth.uid()
  );

-- Solo el admin puede insertar/borrar certificados manualmente
-- (los alumnos los generan vía RPC/Edge Function con service_role)
drop policy if exists "certificates_admin_all" on public.certificates;
create policy "certificates_admin_all" on public.certificates
  for all using (public.is_admin()) with check (public.is_admin());

-- Permitir que un alumno actualice SU PROPIO dni en su perfil
-- (la política de profiles ya permite update de filas propias)


-- ----------------------------------------------------------------------------
-- 4. FUNCIÓN RPC — Verificar elegibilidad y emitir certificado
-- ----------------------------------------------------------------------------
-- Llamada desde el cliente. Verifica que el alumno completó todas las
-- lecciones del módulo y, si es así, inserta el certificado (o lo devuelve
-- si ya existe). Usa la auth.uid() del solicitante.
-- ----------------------------------------------------------------------------
create or replace function public.emitir_certificado(p_tipo text)
returns public.certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_profile  record;
  v_slugs    text[];
  v_total    int;
  v_done     int;
  v_codigo   text;
  v_titulo   text;
  v_cert     public.certificates;
begin
  -- Validar sesión
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  -- Datos del alumno
  select nombre, dni into v_profile from public.profiles where id = v_user;
  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  -- Slugs que componen cada módulo
  if p_tipo = 'excel' then
    v_slugs := array['excel-intermedio','excel-avanzado','excel-bi'];
    v_titulo := 'Analista de Datos en Excel';
  elsif p_tipo = 'powerbi' then
    v_slugs := array['power-bi-transformacion','power-bi-visualizaciones','power-bi-dax'];
    v_titulo := 'Analista de Datos en Power BI';
  elsif p_tipo = 'completo' then
    v_slugs := array['excel-intermedio','excel-avanzado','excel-bi',
                     'power-bi-transformacion','power-bi-visualizaciones','power-bi-dax'];
    v_titulo := 'Analista de Datos';
  else
    raise exception 'Tipo de certificado no válido';
  end if;

  -- Si ya existe un certificado de ese tipo, devolverlo sin recalcular
  select * into v_cert from public.certificates
    where user_id = v_user and certificates.tipo = p_tipo limit 1;
  if found then
    return v_cert;
  end if;

  -- Contar lecciones totales y completadas dentro de los cursos del módulo
  select count(*) into v_total
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where c.slug = any(v_slugs);

  select count(*) into v_done
  from public.lesson_progress lp
  join public.lessons l on l.id = lp.lesson_id
  join public.courses c on c.id = l.course_id
  where lp.user_id = v_user
    and lp.completado = true
    and c.slug = any(v_slugs);

  if v_total = 0 then
    raise exception 'No hay lecciones cargadas para este módulo todavía';
  end if;

  if v_done < v_total then
    raise exception 'Aún no completaste el módulo (% de % lecciones)', v_done, v_total;
  end if;

  -- Generar código único: NAE-2026-XXXXX
  v_codigo := 'NAE-' || extract(year from now())::text || '-' ||
              lpad(floor(random() * 100000)::text, 5, '0');

  -- Insertar el certificado
  insert into public.certificates (user_id, tipo, titulo, codigo, dni, nombre_emisor, horas, modalidad)
  values (v_user, p_tipo, v_titulo, v_codigo, v_profile.dni, v_profile.nombre, 60, 'Virtual')
  returning * into v_cert;

  return v_cert;
end;
$$;

-- Permisos: el alumno autenticado puede llamarla
revoke all on function public.emitir_certificado(text) from public;
grant execute on function public.emitir_certificado(text) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. FUNCIÓN RPC — Consultar certificados del usuario actual
-- ----------------------------------------------------------------------------
create or replace function public.mis_certificados()
returns setof public.certificates
language sql
security definer
set search_path = public
as $$
  select * from public.certificates
  where user_id = auth.uid()
  order by emitido_en desc;
$$;

revoke all on function public.mis_certificados() from public;
grant execute on function public.mis_certificados() to authenticated;


-- ============================================================================
-- FIN — certificados.sql
-- ============================================================================
