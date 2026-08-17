# NAE — Comunidad de Análisis de Datos (Proyecto Z)

Plataforma de comunidad + cursos + gamificación para **Centro de Capacitación NAE**.
Frontend vanilla (HTML/CSS/JS módulos) · Backend 100% Supabase · Deploy en Vercel.

**Web:** https://nae-comunidad.vercel.app

---

## ✨ Funcionalidades

- **Comunidad:** feed con posts, likes, comentarios, imágenes, modo LIVE, presencia "en línea"
- **Cursos:** catálogo, módulos, lecciones con video, progreso y descarga de material
- **Pagos:** QR de Yape + subida de voucher con **verificación automática por IA** (Edge Function)
- **Gamificación:** niveles Dragon Ball (8), puntos híbridos (+2 post, +1 comentario, +1 like recibido, +5 LIVE), ranking semanal
- **Certificados:** autoemisión al completar módulo, PDF premium (marfil/oro), código verificable públicamente en `/verificar.html`, herramienta de certificados manuales para externos (`app/cert-manual.html`)
- **Chatbot "Alessandra"** (Nivel 4): IA que conoce nombre, puntos, nivel, progreso y vouchers de cada alumno
- **Emails:** anuncio broadcast cuando el admin publica + recordatorio de seminario sábados 08:00 (vía Resend)
- **Eventos:** seminarios con link de reunión y "agregar al calendario"

## 🗂️ Estructura

```
├── index.html / verificar.html / test.html
├── app/            ← 9 páginas privadas (comunidad, cursos, cert-manual, admin...)
├── assets/
│   ├── css/ (10)   ← estilos por módulo
│   ├── img/        ← qr-yape.jpg
│   └── js/ (19)    ← lógica modular (ver error-guard.js = red anti crashes)
├── legacy/         ← archivos retirados (aula, debug)
├── supabase/
│   ├── schema-completo.sql · rls-completo.sql · triggers-completo.sql  ← FUENTE ÚNICA
│   ├── GUIA-ADMIN.sql       ← comandos: clave, hacer admin, ver admins
│   ├── migrations/          ← cambios numerados (01..05)
│   └── functions/send-email ← Edge Function de emails (en repo ✅)
├── publicar.bat    ← deploy en 1 clic (git push → Vercel)
└── vercel.json     ← cache + headers de seguridad
```

> ⚠️ Las Edge Functions `chat-ai` y `verify-payment` viven solo en el dashboard
> de Supabase (respaldarlas en `supabase/functions/` es pendiente).

## 🚀 Instalación (BD nueva)

1. Supabase → SQL Editor → ejecutar en orden:
   `schema-completo.sql` → `rls-completo.sql` → `triggers-completo.sql`
2. Crear buckets de Storage: `avatars` (público), `comunidad-img` (público), `vouchers`
3. `assets/js/supabase-client.js` → URL + anon key del proyecto
4. Edge Functions (dashboard): crear `chat-ai`, `verify-payment`, `send-email`
   (código de esta última en `supabase/functions/send-email/index.ts`)
5. Secrets de `send-email`: `RESEND_API_KEY`, `OWNER_EMAIL`, `CRON_SECRET`
6. Ejecutar migraciones pendientes de `supabase/migrations/`

## 🛠️ Operación diaria

| Tarea | Cómo |
|---|---|
| Publicar cambios en la web | Doble clic en `publicar.bat` |
| Correr tests de lógica | Abrir `/test.html` (36 pruebas) |
| Nueva clave a un alumno | `GUIA-ADMIN.sql` § 1 |
| Hacer admin a alguien | `GUIA-ADMIN.sql` § 2 |
| Ver admins | `GUIA-ADMIN.sql` § 3 |
| Emails a alumnos | Requiere dominio verificado en Resend (hoy: modo test, solo al dueño) |

## 🔐 Seguridad

- RLS en las 16 tablas · lógica de puntos en triggers (no hackeable desde cliente)
- API keys solo en Edge Functions · `escapeHtml` en todo contenido de usuario
- Trigger anti-escalada de rol/puntos (`prevent_profile_tampering`, fix migración 03)
- Constraint UNIQUE anti-duplicados de cursos (migración 01)

## 📊 Escalabilidad

Plan Free de Supabase: ~50-60 usuarios simultáneos (límite Realtime).
Plan Pro ($25/mes): hasta ~3.000 simultáneos. 50.000+ usuarios registrados en Free.

## 🧭 Roadmap pendiente

- Dominio propio + emails a alumnos (activo el broadcast y recordatorios reales)
- Eventos recurrentes ("cada sábado" automático)
- Migración 02 (leaderboard materializado) — creada, sin ejecutar
- Respaldar Edge Functions chat-ai y verify-payment al repo
- A 200+ usuarios: anti-spam por nivel, links de invitación
