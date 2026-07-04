-- ============================================================================
-- PROYECTO Z — Agregar campo link_descarga a lecciones
-- ============================================================================
-- Permite que cada lección tenga un link de descarga (Google Drive, Dropbox, etc.)
-- EJECUTAR EN: SQL Editor → Run
-- ============================================================================

alter table public.lessons add column if not exists link_descarga text;

comment on column public.lessons.link_descarga is 'URL de descarga de material (Drive, Dropbox, etc.)';
