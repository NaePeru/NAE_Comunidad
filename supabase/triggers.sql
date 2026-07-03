-- ============================================================================
-- PROYECTO Z — Triggers y lógica automática de base de datos
-- ============================================================================
-- Esto se ejecuta SOLO en el servidor (PostgreSQL), sin intervención del
-- navegador. Garantiza integridad de datos y automatiza la gamificación.
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → New query → Run
-- (después de schema.sql y rls.sql)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A) CREAR PERFIL + MEMBRESÍA AUTOMÁTICAMENTE AL REGISTRARSE
-- Cuando un usuario nuevo se registra en Auth, se le crea su perfil y
-- una membresía de prueba (trial) de 7 días.
-- ----------------------------------------------------------------------------
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

  -- Crear membresía trial de 7 días
  insert into public.memberships (user_id, estado, dias_validos, fecha_vence)
  values (new.id, 'trial', 7, now() + interval '7 days');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- B) ACTUALIZAR timestamps "actualizado_en" automáticamente
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_posts_updated on public.posts;
create trigger trg_posts_updated
  before update on public.posts
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- C) MANTENER CONTADORES DE LIKES Y COMENTARIOS EN posts
-- (denormalización controlada para no contar filas en cada carga del feed)
-- ----------------------------------------------------------------------------

-- likes_count
create or replace function public.recount_post_likes()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set likes_count = likes_count + 1 where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.posts set likes_count = greatest(0, likes_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_likes_count on public.post_likes;
create trigger trg_likes_count
  after insert or delete on public.post_likes
  for each row execute function public.recount_post_likes();

-- comentarios_count
create or replace function public.recount_post_comments()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set comentarios_count = comentarios_count + 1 where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.posts set comentarios_count = greatest(0, comentarios_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comments_count on public.comments;
create trigger trg_comments_count
  after insert or delete on public.comments
  for each row execute function public.recount_post_comments();


-- ----------------------------------------------------------------------------
-- D) GAMIFICACIÓN — otorgar puntos por acciones
-- Función centralizada para sumar puntos + registrar en bitácora.
-- ----------------------------------------------------------------------------
create or replace function public.award_points(
  p_user_id uuid,
  p_cantidad int,
  p_motivo text,
  p_referencia uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Registrar en bitácora
  insert into public.point_log (user_id, cantidad, motivo, referencia_id)
  values (p_user_id, p_cantidad, p_motivo, p_referencia);

  -- Actualizar puntos del perfil
  update public.profiles
  set puntos = greatest(0, puntos + p_cantidad)
  where id = p_user_id;
end;
$$;

-- 10 puntos por crear un post
create or replace function public.points_on_post()
returns trigger
language plpgsql
as $$
begin
  perform public.award_points(new.autor_id, 10, 'Nueva publicación', new.id);
  return new;
end;
$$;

drop trigger if exists trg_points_post on public.posts;
create trigger trg_points_post
  after insert on public.posts
  for each row execute function public.points_on_post();

-- 3 puntos por comentar
create or replace function public.points_on_comment()
returns trigger
language plpgsql
as $$
begin
  perform public.award_points(new.autor_id, 3, 'Comentario', new.id);
  return new;
end;
$$;

drop trigger if exists trg_points_comment on public.comments;
create trigger trg_points_comment
  after insert on public.comments
  for each row execute function public.points_on_comment();

-- 1 punto por dar like
create or replace function public.points_on_like()
returns trigger
language plpgsql
as $$
begin
  perform public.award_points(new.user_id, 1, 'Reacción (like)', new.id);
  return new;
end;
$$;

drop trigger if exists trg_points_like on public.post_likes;
create trigger trg_points_like
  after insert on public.post_likes
  for each row execute function public.points_on_like();

-- 15 puntos por completar una lección
create or replace function public.points_on_lesson()
returns trigger
language plpgsql
as $$
begin
  if new.completado and (old.completado is null or old.completado = false) then
    perform public.award_points(new.user_id, 15, 'Lección completada', new.lesson_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_points_lesson on public.lesson_progress;
create trigger trg_points_lesson
  after update on public.lesson_progress
  for each row execute function public.points_on_lesson();


-- ----------------------------------------------------------------------------
-- E) RECALCULAR NIVEL AUTOMÁTICAMENTE cuando cambian los puntos
-- Mapea puntos → nivel (1-5) según el sistema NAE original
-- ----------------------------------------------------------------------------
create or replace function public.recompute_level(pts int)
returns int
language sql immutable
as $$
  select case
    when pts >= 700 then 5   -- Experto NAE 🌟
    when pts >= 350 then 4   -- Analista Senior 🏆
    when pts >= 150 then 3   -- Analista de Datos ⚡
    when pts >= 50  then 2   -- Analista Junior 📊
    else 1                   -- Aprendiz 🌱
  end;
$$;

create or replace function public.sync_profile_level()
returns trigger
language plpgsql
as $$
begin
  new.nivel = public.recompute_level(new.puntos);
  return new;
end;
$$;

drop trigger if exists trg_profile_level on public.profiles;
create trigger trg_profile_level
  before insert or update of puntos on public.profiles
  for each row execute function public.sync_profile_level();


-- ============================================================================
-- FIN DE triggers.sql
-- ============================================================================
