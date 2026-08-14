-- ============================================================================
-- PROYECTO Z (NAE) — TRIGGERS COMPLETOS UNIFICADOS
-- ============================================================================
-- Consolida: triggers.sql + puntos-v2.sql + security-profile-lock.sql
--            + aprobar-alumnos.sql + niveles-dbz.sql + certificados.sql (RPCs)
--
-- CONFLICTOS RESUELTOS:
--   1. recompute_level: elijo la versión Dragon Ball Z (niveles-dbz.sql)
--      que es la que usa el frontend actual (utils.js).
--   2. handle_new_user: elijo la versión "pendiente" (aprobar-alumnos.sql)
--      que es la que mejor matchea con el flujo de aprobación real.
--   3. Sistema de puntos: el modelo v2 (likes recibidos, no acciones).
--
-- ⚠️  ARCHIVO DE REFERENCIA. Ejecutar solo en BD nueva, después de rls-completo.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- A. CREAR PERFIL + MEMBRESÍA AL REGISTRARSE
-- ----------------------------------------------------------------------------
-- VERSIÓN: nuevos usuarios quedan "pendientes" hasta aprobación del admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1))
  );

  -- Membresía PENDIENTE (esperando aprobación del admin)
  insert into public.memberships (user_id, estado, dias_validos, fecha_vence)
  values (new.id, 'pendiente', 7, now() + interval '7 days');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- B. ACTUALIZAR timestamps automáticamente
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
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
-- C. CONTADORES DE likes/comentarios EN posts (denormalización controlada)
-- ----------------------------------------------------------------------------
create or replace function public.recount_post_likes()
returns trigger language plpgsql as $$
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

create or replace function public.recount_post_comments()
returns trigger language plpgsql as $$
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
-- D. CONTADOR DE likes EN comments
-- ----------------------------------------------------------------------------
create or replace function public.recount_comment_likes()
returns trigger language plpgsql as $$
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


-- ----------------------------------------------------------------------------
-- E. GAMIFICACIÓN — puntos por RECIBIR likes (modelo Skool, puntos-v2.sql)
-- ----------------------------------------------------------------------------
create or replace function public.award_points(
  p_user_id uuid, p_cantidad int, p_motivo text, p_referencia uuid default null
) returns void language plpgsql
security definer set search_path = public as $$
begin
  insert into public.point_log (user_id, cantidad, motivo, referencia_id)
  values (p_user_id, p_cantidad, p_motivo, p_referencia);

  update public.profiles
  set puntos = greatest(0, puntos + p_cantidad)
  where id = p_user_id;
end;
$$;

-- +1 al autor del post cuando recibe un like
create or replace function public.points_on_post_like_received()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    perform public.award_points(
      p_user_id => (select autor_id from public.posts where id = new.post_id),
      p_cantidad => 1, p_motivo => 'Like recibido en post', p_referencia => new.post_id
    );
  elsif (tg_op = 'DELETE') then
    perform public.award_points(
      p_user_id => (select autor_id from public.posts where id = old.post_id),
      p_cantidad => -1, p_motivo => 'Like retirado de post', p_referencia => old.post_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_points_post_like_received on public.post_likes;
create trigger trg_points_post_like_received
  after insert or delete on public.post_likes
  for each row execute function public.points_on_post_like_received();

-- +1 al autor del comentario cuando recibe un like
create or replace function public.points_on_comment_like_received()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    perform public.award_points(
      p_user_id => (select autor_id from public.comments where id = new.comment_id),
      p_cantidad => 1, p_motivo => 'Like recibido en comentario', p_referencia => new.comment_id
    );
  elsif (tg_op = 'DELETE') then
    perform public.award_points(
      p_user_id => (select autor_id from public.comments where id = old.comment_id),
      p_cantidad => -1, p_motivo => 'Like retirado de comentario', p_referencia => old.comment_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_points_comment_like_received on public.comment_likes;
create trigger trg_points_comment_like_received
  after insert or delete on public.comment_likes
  for each row execute function public.points_on_comment_like_received();


-- ----------------------------------------------------------------------------
-- F. BONUS LIVE (+5 por participar en seminarios, 1 por día anti-abuso)
-- ----------------------------------------------------------------------------
create or replace function public.bonus_live_post()
returns trigger language plpgsql as $$
begin
  if new.es_live = true then
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
  for each row when (new.es_live = true)
  execute function public.bonus_live_post();


-- ----------------------------------------------------------------------------
-- G. RECALCULAR NIVEL — versión Dragon Ball Z (8 niveles)
-- ----------------------------------------------------------------------------
-- ⚠️ Elegimos esta versión porque matchea con el frontend (utils.js NIVELES).
create or replace function public.recompute_level(pts int)
returns int language sql immutable as $$
  select case
    when pts >= 10000 then 8  -- Súper Saiyajin Blue 🔱
    when pts >= 5000  then 7  -- Saiyajin Dios 🔵
    when pts >= 3000  then 6  -- Súper Saiyajín 3 🌪️
    when pts >= 1500  then 5  -- Súper Saiyajín 2 ⚡
    when pts >= 800   then 4  -- Súper Saiyajín 💛
    when pts >= 300   then 3  -- Saiyajín 🐵
    when pts >= 100   then 2  -- Kaio-ken 🔴
    else 1                    -- Humano 🧍
  end;
$$;

create or replace function public.sync_profile_level()
returns trigger language plpgsql as $$
begin
  new.nivel = public.recompute_level(new.puntos);
  return new;
end;
$$;

drop trigger if exists trg_profile_level on public.profiles;
create trigger trg_profile_level
  before insert or update of puntos on public.profiles
  for each row execute function public.sync_profile_level();


-- ----------------------------------------------------------------------------
-- H. SEGURIDAD — bloquear autotampering de rol/puntos (security-profile-lock.sql)
-- ----------------------------------------------------------------------------
create or replace function public.prevent_profile_tampering()
returns trigger language plpgsql
security definer as $$
begin
  if not public.is_admin() then
    -- Un alumno no puede cambiarse el rol ni los puntos a sí mismo
    NEW.rol := OLD.rol;
    NEW.puntos := OLD.puntos;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_tampering on public.profiles;
create trigger trg_prevent_tampering
  before update on public.profiles
  for each row execute function public.prevent_profile_tampering();


-- ----------------------------------------------------------------------------
-- I. VISTA — leaderboard semanal (puntos de últimos 7 días)
-- ----------------------------------------------------------------------------
create or replace view public.leaderboard_semanal as
select
  p.id, p.nombre, p.avatar_url, p.color,
  coalesce(sum(pl.cantidad), 0) as puntos_semana,
  row_number() over (order by coalesce(sum(pl.cantidad), 0) desc) as posicion
from public.profiles p
left join public.point_log pl
  on pl.user_id = p.id and pl.creado_en > now() - interval '7 days'
where p.activo = true
group by p.id, p.nombre, p.avatar_url, p.color
order by puntos_semana desc;

grant select on public.leaderboard_semanal to anon, authenticated;


-- ----------------------------------------------------------------------------
-- J. RPCs DE CERTIFICADOS
-- ----------------------------------------------------------------------------
-- Emitir certificado (verifica módulo completo)
create or replace function public.emitir_certificado(p_tipo text)
returns public.certificates language plpgsql
security definer set search_path = public as $$
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
  if v_user is null then raise exception 'No autenticado'; end if;

  select nombre, dni into v_profile from public.profiles where id = v_user;
  if not found then raise exception 'Perfil no encontrado'; end if;

  if p_tipo = 'excel' then
    v_slugs := array['excel-nivel-1','excel-nivel-2','excel-nivel-3','excel-nivel-4'];
    v_titulo := 'Analista de Datos en Excel';
  elsif p_tipo = 'powerbi' then
    v_slugs := array['power-bi-nivel-1','power-bi-nivel-2','power-bi-nivel-3'];
    v_titulo := 'Analista de Datos en Power BI';
  elsif p_tipo = 'completo' then
    v_slugs := array['excel-nivel-1','excel-nivel-2','excel-nivel-3','excel-nivel-4',
                     'power-bi-nivel-1','power-bi-nivel-2','power-bi-nivel-3','sql-consultas'];
    v_titulo := 'Analista de Datos';
  else
    raise exception 'Tipo de certificado no válido';
  end if;

  select * into v_cert from public.certificates
    where user_id = v_user and certificates.tipo = p_tipo limit 1;
  if found then return v_cert; end if;

  select count(*) into v_total
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where c.slug = any(v_slugs);

  select count(*) into v_done
  from public.lesson_progress lp
  join public.lessons l on l.id = lp.lesson_id
  join public.courses c on c.id = l.course_id
  where lp.user_id = v_user and lp.completado = true and c.slug = any(v_slugs);

  if v_total = 0 then raise exception 'No hay lecciones cargadas para este módulo todavía'; end if;
  if v_done < v_total then
    raise exception 'Aún no completaste el módulo (% de % lecciones)', v_done, v_total;
  end if;

  v_codigo := 'NAE-' || extract(year from now())::text || '-' ||
              lpad(floor(random() * 100000)::text, 5, '0');

  insert into public.certificates (user_id, tipo, titulo, codigo, dni, nombre_emisor, horas, modalidad)
  values (v_user, p_tipo, v_titulo, v_codigo, v_profile.dni, v_profile.nombre, 60, 'Virtual')
  returning * into v_cert;

  return v_cert;
end;
$$;

revoke all on function public.emitir_certificado(text) from public;
grant execute on function public.emitir_certificado(text) to authenticated;

-- Consultar mis certificados
create or replace function public.mis_certificados()
returns setof public.certificates language sql
security definer set search_path = public as $$
  select * from public.certificates where user_id = auth.uid() order by emitido_en desc;
$$;

revoke all on function public.mis_certificados() from public;
grant execute on function public.mis_certificados() to authenticated;

-- Verificación pública de certificado
create or replace function public.verificar_certificado(p_codigo text)
returns table (
  codigo text, titulo text, nombre_emisor text, dni text,
  horas integer, modalidad text, emitido_en timestamptz
) language sql security definer set search_path = public as $$
  select c.codigo, c.titulo, c.nombre_emisor, c.dni, c.horas, c.modalidad, c.emitido_en
  from public.certificates c where upper(c.codigo) = upper(p_codigo) limit 1;
$$;

revoke all on function public.verificar_certificado(text) from public;
grant execute on function public.verificar_certificado(text) to anon, authenticated;

-- ============================================================================
-- FIN DE triggers-completo.sql
-- ============================================================================
