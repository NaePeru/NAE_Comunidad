-- ============================================================================
-- MIGRACIÓN 08 — MÓDULO DE MATRÍCULA (especificación oficial NAE)
-- ============================================================================
-- 6 tablas aisladas (prefijo t_ = cero contacto con las tablas de la comunidad)
-- Roles: secretaria (humano) · bot (solo RPC) · trigger (único que confirma)
--
-- ⚠️  EJECUTAR EN 2 PASOS (limitación de PostgreSQL con enums nuevos):
--   PASO 1: correr SOLO la línea "alter type ... 'secretaria'" → Run → commit
--   PASO 2: correr este archivo completo → Run
--   (sin el paso 1 previo falla con "unsafe use of new value")
-- ============================================================================

-- ── 0. ROL SECRETARIA (si ya lo corriste solo en el PASO 1, esto se ignora) ─
alter type public.user_role add value if not exists 'secretaria';

create or replace function public.is_secretaria()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol in ('admin', 'secretaria')
  );
$$;

-- ── 1. SECUENCIAS (códigos autogenerados) ─────────────────────────────────
create sequence if not exists t_cursos_seq    start 1;
create sequence if not exists t_profesor_seq  start 1;
create sequence if not exists t_cursop_seq    start 1;

-- ── 2. TABLAS ──────────────────────────────────────────────────────────────

-- Catálogo de cursos
create table if not exists public.t_cursos (
  codcurso text primary key default 'CUR-' || lpad(nextval('t_cursos_seq')::text, 4, '0'),
  nombre   text not null,
  costo    numeric(8,2) not null default 0 check (costo >= 0)
);

-- Profesores
create table if not exists public.t_profesor (
  codprofesor text primary key default 'PRF-' || lpad(nextval('t_profesor_seq')::text, 4, '0'),
  nombre  text not null,
  fono    text,
  mail    text
);

-- Curso programado (edición con fechas — sin límite de vacantes)
create table if not exists public.t_cursop (
  cursop       text primary key default to_char(now(), 'YYMM') || lpad(nextval('t_cursop_seq')::text, 2, '0'),
  codcurso     text not null references public.t_cursos(codcurso),
  codprofesor  text not null references public.t_profesor(codprofesor),
  horario      text,
  fecha_inicio date not null,
  fecha_fin    date,
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

-- Alumnos (DNI único — independiente de la tabla profiles de la comunidad)
create table if not exists public.t_alumnos (
  dni      text primary key check (dni ~ '^\d{8}$'),
  nombres  text not null,
  mail     text,
  telefono text
);

-- Matrículas (el ESTADO solo lo cambia el trigger — nadie edita a mano)
create table if not exists public.t_matricula (
  id              uuid primary key default gen_random_uuid(),
  cursop          text not null references public.t_cursop(cursop),
  dni             text not null references public.t_alumnos(dni),
  fecha_matricula date not null default current_date,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'confirmada')),
  unique (cursop, dni)   -- un DNI no se matricula 2 veces en el mismo cursop
);

-- Pagos (tabla separada de matrícula)
create table if not exists public.t_pago (
  id           uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.t_matricula(id) on delete cascade,
  monto        numeric(8,2) not null check (monto >= 0),
  fecha_pago   date,
  pasarela     text,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'pagado', 'rechazado')),
  creado_en    timestamptz not null default now()
);

-- ── 3. ÍNDICES (rendimiento con +2000 alumnos) ────────────────────────────
create index if not exists idx_t_matricula_dni     on public.t_matricula(dni);
create index if not exists idx_t_matricula_cursop  on public.t_matricula(cursop);
create index if not exists idx_t_pago_matricula    on public.t_pago(matricula_id);
create index if not exists idx_t_cursop_curso      on public.t_cursop(codcurso);
create index if not exists idx_t_cursop_fechas     on public.t_cursop(fecha_inicio, fecha_fin);

-- ── 4. TRIGGER DE NEGOCIO (regla oficial) ──────────────────────────────────
-- Pago pasa a 'pagado' → matrícula queda 'confirmada'. Es el ÚNICO camino.
create or replace function public.trg_confirmar_matricula()
returns trigger language plpgsql security definer as $$
begin
  if new.estado = 'pagado' and (tg_op = 'INSERT' or old.estado is distinct from 'pagado') then
    update public.t_matricula
    set estado = 'confirmada'
    where id = new.matricula_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pago_confirma on public.t_pago;
create trigger trg_pago_confirma
  after insert or update of estado on public.t_pago
  for each row execute function public.trg_confirmar_matricula();

-- ── 5. RPC PARA EL BOT (Fase 3 — Alessandra nunca toca t_matricula directo) ─
create or replace function public.bot_crear_matricula(
  p_dni text, p_cursop text, p_monto numeric, p_pasarela text
)
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into public.t_matricula (cursop, dni) values (p_cursop, p_dni)
  on conflict (cursop, dni) do update set estado = 'pendiente'
  returning id into v_id;

  insert into public.t_pago (matricula_id, monto, pasarela, estado)
  values (v_id, p_monto, p_pasarela, 'pendiente');

  return v_id;
end;
$$;
revoke all on function public.bot_crear_matricula(text, text, numeric, text) from public, authenticated;

-- ── 6. RLS — SOLO SECRETARÍA (alumnos: sin acceso; bot: solo vía service) ──
alter table public.t_cursos    enable row level security;
alter table public.t_profesor  enable row level security;
alter table public.t_cursop    enable row level security;
alter table public.t_alumnos   enable row level security;
alter table public.t_matricula enable row level security;
alter table public.t_pago      enable row level security;

drop policy if exists "t_cursos_secretaria" on public.t_cursos;
create policy "t_cursos_secretaria" on public.t_cursos
  for all using (public.is_secretaria()) with check (public.is_secretaria());

drop policy if exists "t_profesor_secretaria" on public.t_profesor;
create policy "t_profesor_secretaria" on public.t_profesor
  for all using (public.is_secretaria()) with check (public.is_secretaria());

drop policy if exists "t_cursop_secretaria" on public.t_cursop;
create policy "t_cursop_secretaria" on public.t_cursop
  for all using (public.is_secretaria()) with check (public.is_secretaria());

drop policy if exists "t_alumnos_secretaria" on public.t_alumnos;
create policy "t_alumnos_secretaria" on public.t_alumnos
  for all using (public.is_secretaria()) with check (public.is_secretaria());

drop policy if exists "t_matricula_secretaria" on public.t_matricula;
create policy "t_matricula_secretaria" on public.t_matricula
  for all using (public.is_secretaria()) with check (public.is_secretaria());

drop policy if exists "t_pago_secretaria" on public.t_pago;
create policy "t_pago_secretaria" on public.t_pago
  for all using (public.is_secretaria()) with check (public.is_secretaria());

-- ── 7. VISTAS PARA LOS 2 INFORMES (con RLS del que consulta) ───────────────

-- Informe 1: alumnos matriculados (SOLO confirmadas)
create or replace view public.t_informe_matriculados
with (security_invoker = true) as
select
  a.nombres,
  a.dni,
  cu.nombre        as curso,
  cp.horario,
  m.fecha_matricula,
  m.estado,
  p.monto          as monto_pagado
from public.t_matricula m
join public.t_alumnos a  on a.dni = m.dni
join public.t_cursop  cp on cp.cursop = m.cursop
join public.t_cursos  cu on cu.codcurso = cp.codcurso
left join public.t_pago p on p.matricula_id = m.id and p.estado = 'pagado'
where m.estado = 'confirmada';

-- Informe 2: cursos dictados por profesor (con conteo de matriculados)
create or replace view public.t_informe_cursos_profesor
with (security_invoker = true) as
select
  pr.nombre          as profesor,
  cu.nombre          as curso,
  cp.horario,
  cp.fecha_inicio,
  cp.fecha_fin,
  count(m.id) filter (where m.estado = 'confirmada') as alumnos_matriculados
from public.t_cursop cp
join public.t_profesor pr on pr.codprofesor = cp.codprofesor
join public.t_cursos   cu on cu.codcurso = cp.codcurso
left join public.t_matricula m on m.cursop = cp.cursop
group by pr.nombre, cu.nombre, cp.horario, cp.fecha_inicio, cp.fecha_fin, cp.cursop;

-- Verificación
select 'Modulo de matricula creado: 6 tablas + trigger + RLS + 2 vistas' as resultado;
