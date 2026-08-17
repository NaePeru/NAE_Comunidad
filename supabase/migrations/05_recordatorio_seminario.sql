-- ============================================================================
-- MIGRACIÓN 05 — Recordatorio automático del seminario (sábados 08:00 Lima)
-- ============================================================================
-- Usa pg_cron (programador de tareas de Supabase) + pg_net (llamadas HTTP)
-- para llamar a la Edge Function send-email con tipo 'seminario' cada
-- sábado a las 08:00 hora Perú (13:00 UTC).
--
-- La Edge Function busca si hay un evento con fecha = HOY:
--   · Si hay → envía el recordatorio (título, hora, link de la reunión)
--   · Si no hay → no envía nada (skipped)
--
-- REQUISITO PREVIO: crear el secret CRON_SECRET en Edge Functions → Secrets:
--   Name:  CRON_SECRET
--   Value: nae_cron_2026_Xk7mQ9vR4pZ2wT8L
--
-- EJECUTAR EN: Supabase → SQL Editor → Run
-- ============================================================================

-- 1. Extensiones necesarias (pg_net permite HTTP desde la BD)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Programar el recordatorio: sábados 13:00 UTC = 08:00 Lima
select cron.schedule(
  'recordatorio-seminario',
  '0 13 * * 6',
  $$
  select net.http_post(
    url := 'https://dlpsvbrctccnmvkbcsfp.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer nae_cron_2026_Xk7mQ9vR4pZ2wT8L'
    ),
    body := jsonb_build_object('tipo', 'seminario')
  );
  $$
);

-- 3. Verificar que quedó programado
select jobname, schedule, active from cron.job where jobname = 'recordatorio-seminario';

-- ============================================================================
-- PARA CANCELARLO EN EL FUTURO (si algún día lo querés quitar):
--   select cron.unschedule('recordatorio-seminario');
-- ============================================================================
