-- ============================================================================
-- NAE — Guía rápida de comandos de administrador (SQL Editor)
-- ============================================================================
-- REQUISITO: haber ejecutado UNA VEZ la Migración 03 (fix del trigger).
-- Si ya la corriste, no hace falta repetirla.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ASIGNAR NUEVA CLAVE A UN EMAIL
--    (cuando un alumno olvida la contraseña)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE auth.users
SET encrypted_password = crypt('NUEVA_CLAVE', gen_salt('bf'))
WHERE email = 'EMAIL_DEL_ALUMNO';

-- Ejemplo real:
-- UPDATE auth.users
-- SET encrypted_password = crypt('nae2026', gen_salt('bf'))
-- WHERE email = 'alumno@correo.com';


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) PONER UN ALUMNO COMO ADMIN (por email)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.profiles
SET rol = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'EMAIL_DEL_ALUMNO'
);

-- Para QUITARLE el admin a alguien (volver a alumno):
-- UPDATE public.profiles
-- SET rol = 'alumno'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'EMAIL');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) VER QUIÉNES SON ADMIN
-- ═══════════════════════════════════════════════════════════════════════════

SELECT p.nombre, p.rol, u.email
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'admin';


-- ============================================================================
-- EXTRA ÚTILES
-- ============================================================================

-- Ver TODOS los usuarios con su rol (los últimos 20 registrados):
-- SELECT p.nombre, p.rol, u.email, u.created_at
-- FROM public.profiles p
-- JOIN auth.users u ON u.id = p.id
-- ORDER BY u.created_at DESC
-- LIMIT 20;

-- El fix del trigger (solo si algo raro vuelve a pasar con los roles):
-- CREATE OR REPLACE FUNCTION public.prevent_profile_tampering()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
-- BEGIN
--   IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
--     NEW.rol := OLD.rol;
--     NEW.puntos := OLD.puntos;
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
