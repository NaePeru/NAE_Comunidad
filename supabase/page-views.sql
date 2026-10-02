-- NAE — tabla de visitas web para medición de campañas
-- Ejecutar UNA VEZ en: Supabase Dashboard → SQL Editor → pegar todo → Run
create table if not exists page_views (
  id bigint generated always as identity primary key,
  path text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  session_id text,
  creado_en timestamptz not null default now()
);

alter table page_views enable row level security;

-- solo INSERTAR desde el navegador (anon); la lectura queda para la service key
drop policy if exists "insert anon page_views" on page_views;
create policy "insert anon page_views" on page_views
  for insert to anon, authenticated with check (true);
