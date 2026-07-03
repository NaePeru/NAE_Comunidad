-- ============================================================================
-- PROYECTO Z — Sistema de puntos v2 (Modelo Skool puro)
-- ============================================================================
-- CAMBIOS CLAVE vs versión anterior:
--   1. Los puntos se ganan al RECIBIR likes (no al publicar/comentar)
--   2. El leaderboard usa una ventana de 7 días (rolling)
--   3. 9 niveles de comunidad (temática Analista)
--   4. Bonus LIVE (+5) por participar en seminarios
--   5. Likes también en comentarios (tabla comment_likes)
--
-- ⚠️  ESTE SCRIPT:
--   - BORRA los triggers viejos de puntos y los reemplaza
--   - No toca tus datos (posts, usuarios, etc. se mantienen)
--   - Migrar los puntos existentes al nuevo modelo (likes recibidos)
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → Run
-- ============================================================================


-- ============================================================================
-- 0. LIMPIEZA DE TRIGGERS VIEJOS (los del modelo anterior)
-- ============================================================================
drop trigger if exists trg_points_post on public.posts;
drop function if exists public.points_on_post();

drop trigger if exists trg_points_comment on public.comments;
drop function if exists public.points_on_comment();

drop trigger if exists trg_points_like on public.post_likes;
drop function if exists public.points_on_like();

drop trigger if exists trg_points_lesson on public.lesson_progress;
drop function if exists public.points_on_lesson();

-- Mantenemos award_points pero ahora se usa distinto


-- ============================================================================
-- 1. NUEVA TABLA: comment_likes (likes en comentarios, como en Skool)
-- ============================================================================
create table if not exists public.comment_likes (
  id              uuid primary key default gen_random_uuid(),
  comment_id      uuid not null references public.comments(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  creado_en       timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists idx_comment_likes_comment on public.comment_likes(comment_id);
create index if not exists idx_comment_likes_user   on public.comment_likes(user_id);

-- RLS para comment_likes
alter table public.comment_likes enable row level security;
drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_authenticated" on public.comment_likes
  for select using (auth.uid() is not null);
drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes
  for insert with check (user_id = auth.uid());
drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own" on public.comment_likes
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================================
-- 2. MODIFICAR posts: agregar columna es_live (bandera LIVE)
-- ============================================================================
alter table public.posts add column if not exists es_live boolean not null default false;
create index if not exists idx_posts_es_live on public.posts(es_live);


-- ============================================================================
-- 3. EL NUEVO CORAZÓN: puntos por RECIBIR likes (estilo Skool)
-- ============================================================================

-- Cuando alguien le da like a un POST → +1 punto al AUTOR del post
create or replace function public.points_on_post_like_received()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    -- Sumar +1 al autor del post
    perform public.award_points(
      p_user_id => (select autor_id from public.posts where id = new.post_id),
      p_cantidad => 1,
      p_motivo => 'Like recibido en post',
      p_referencia => new.post_id
    );
  elsif (tg_op = 'DELETE') then
    -- Restar 1 al autor del post (quitó el like)
    perform public.award_points(
      p_user_id => (select autor_id from public.posts where id = old.post_id),
      p_cantidad => -1,
      p_motivo => 'Like retirado de post',
      p_referencia => old.post_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_points_post_like_received on public.post_likes;
create trigger trg_points_post_like_received
  after insert or delete on public.post_likes
  for each row execute function public.points_on_post_like_received();


-- Cuando alguien le da like a un COMENTARIO → +1 al autor del comentario
create or replace function public.points_on_comment_like_received()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.award_points(
      p_user_id => (select autor_id from public.comments where id = new.comment_id),
      p_cantidad => 1,
      p_motivo => 'Like recibido en comentario',
      p_referencia => new.comment_id
    );
  elsif (tg_op = 'DELETE') then
    perform public.award_points(
      p_user_id => (select autor_id from public.comments where id = old.comment_id),
      p_cantidad => -1,
      p_motivo => 'Like retirado de comentario',
      p_referencia => old.comment_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_points_comment_like_received on public.comment_likes;
create trigger trg_points_comment_like_received
  after insert or delete on public.comment_likes
  for row execute function public.points_on_comment_like_received();


-- ============================================================================
-- 4. BONUS LIVE: +5 cuando un alumno publica en modo LIVE (una vez por evento)
-- ============================================================================
-- El bonus se otorga solo una vez por día para evitar abuso.
create or replace function public.bonus_live_post()
returns trigger
language plpgsql
as $$
begin
  if new.es_live = true then
    -- ¿Ya recibió bonus LIVE hoy? (anti-abuso: 1 por día)
    if not exists (
      select 1 from public.point_log
      where user_id = new.autor_id
        and motivo = 'Bonus LIVE (seminario)'
        and creado_en > now() - interval '24 hours'
    ) then
      perform public.award_points(
        p_user_id => new.autor_id,
        p_cantidad => 5,
        p_motivo => 'Bonus LIVE (seminario)',
        p_referencia => new.id
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bonus_live on public.posts;
create trigger trg_bonus_live
  after insert on public.posts
  for each row
  when (new.es_live = true)
  execute function public.bonus_live_post();


-- ============================================================================
-- 5. ACTUALIZAR CONTEO DE likes EN comentarios (comment_likes_count)
-- ============================================================================
alter table public.comments add column if not exists likes_count integer not null default 0;

create or replace function public.recount_comment_likes()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.comments set likes_count = likes_count + 1 where id = new.comment_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.comments set likes_count = greatest(0, likes_count - 1) where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comment_likes_count on public.comment_likes;
create trigger trg_comment_likes_count
  after insert or delete on public.comment_likes
  for each row execute function public.recount_comment_likes();


-- ============================================================================
-- 6. VISTA: leaderboard semanal (puntos últimos 7 días)
-- ============================================================================
-- Una vista es una "tabla virtual" que se calcula sola. La usamos para
-- el leaderboard de la semana sin que tengamos que calcularlo en el frontend.
create or replace view public.leaderboard_semanal as
select
  p.id,
  p.nombre,
  p.avatar_url,
  p.color,
  coalesce(sum(pl.cantidad), 0) as puntos_semana,
  -- Ranking: ordenado por puntos de la semana descendente
  row_number() over (order by coalesce(sum(pl.cantidad), 0) desc) as posicion
from public.profiles p
left join public.point_log pl
  on pl.user_id = p.id
  and pl.creado_en > now() - interval '7 days'
where p.activo = true
group by p.id, p.nombre, p.avatar_url, p.color
order by puntos_semana desc;

-- Dar permiso de lectura a la vista
grant select on public.leaderboard_semanal to anon, authenticated;


-- ============================================================================
-- 7. RECALCULAR NIVELES DE LOS USUARIOS EXISTENTES (con el nuevo sistema)
-- ============================================================================
-- Como cambió la forma de ganar puntos, recalculamos los puntos actuales
-- de cada usuario basándonos en los likes que ha RECIBIDO.
-- (Esto es para que el sistema empiece limpio con el nuevo modelo.)

-- Paso 1: Crear una tabla temporal con los puntos correctos por usuario
--         (likes recibidos en posts + likes recibidos en comentarios + bonus LIVE)
create temporary table if not exists tmp_recalc as
select
  u.user_id as uid,
  coalesce(u.total, 0) as puntos_correctos
from (
  -- Likes recibidos en posts
  select autor_id as user_id, count(*) as total
  from public.posts p
  join public.post_likes pl on pl.post_id = p.id
  group by autor_id
  union all
  -- Likes recibidos en comentarios
  select c.autor_id as user_id, count(*) as total
  from public.comments c
  join public.comment_likes cl on cl.comment_id = c.id
  group by c.autor_id
  union all
  -- Bonus LIVE (×5 cada uno)
  select autor_id as user_id, count(*) * 5 as total
  from public.posts
  where es_live = true
  group by autor_id
) u
group by u.user_id, u.total;

-- Paso 2: Aplicar los puntos recalculados
update public.profiles p
set puntos = t.puntos_correctos
from tmp_recalc t
where p.id = t.uid;

-- Recalcular el nivel de todos
update public.profiles
set nivel = public.recompute_level(puntos);


-- ============================================================================
-- 8. FIN — Sistema de puntos v2 listo
-- ============================================================================
-- Resumen del nuevo modelo:
--   • Recibir like en post      → +1 punto
--   • Recibir like en comentario → +1 punto
--   • Publicar en modo LIVE     → +5 puntos (1 por día, anti-abuso)
--   • Leaderboard semanal       → últimos 7 días (vista leaderboard_semanal)
--   • Niveles (1-9)             → por puntos totales
-- ============================================================================
