# NAE — Comunidad de Análisis de Datos (Proyecto Z)

Plataforma de comunidad + cursos + gamificación para **Centro de Capacitación NAE**.
Frontend vanilla (HTML/CSS/JS módulos) · Backend 100% Supabase · Deploy en Vercel.

**Web:** https://www.naeacademia.com

---

## ✨ Funcionalidades

- **Comunidad:** feed con posts, likes, comentarios, imágenes, modo LIVE, presencia "en línea"
- **Cursos:** catálogo, módulos, lecciones con video, progreso y descarga de material
- **Pagos:** QR de Yape + subida de voucher con **verificación automática por IA** (Edge Function)
- **Gamificación:** niveles Dragon Ball (8), puntos híbridos (+2 post, +1 comentario, +1 like recibido, +5 LIVE), ranking semanal
- **Certificados:** autoemisión al completar módulo, PDF premium (marfil/oro), código verificable públicamente en `/verificar.html`, herramienta de certificados manuales para externos (`app/cert-manual.html`)
- **Chatbot "Alessandra"** (Nivel 4): IA que conoce nombre, puntos, nivel, progreso y vouchers de cada alumno
- **Bot de Telegram** `@asistente_nae_bot`: consultas por chat + suscripción a avisos automáticos cuando se publica en la comunidad
- **Emails (Resend, dominio naeacademia.com verificado — en producción):** anuncio broadcast al publicar + recordatorio de seminarios sábados 08:00 (vía pg_cron)
- **Campañas a ex-alumnos:** panel `app/campanas.html` — importación desde Excel, personalización `[nombre]/[curso]`, oleadas de 100/día con copia de control al dueño
- **Medición de campaña:** registro de vistas de lecciones (migración 11) + panel de embudo diario (emails → registros → vistas, video estrella "Clasificación ABC")

## 🗂️ Estructura

```
├── index.html / verificar.html / test.html
├── app/            ← páginas privadas (comunidad, cursos, campanas, admin...)
├── assets/
│   ├── css/ (10)   ← estilos por módulo
│   ├── img/        ← qr-yape.jpg
│   └── js/ (19)    ← lógica modular (ver error-guard.js = red anti crashes)
├── legacy/         ← archivos retirados (aula, debug)
├── supabase/
│   ├── schema-completo.sql · rls-completo.sql · triggers-completo.sql  ← FUENTE ÚNICA
│   ├── GUIA-ADMIN.sql       ← comandos: clave, hacer admin, ver admins
│   ├── migrations/          ← cambios numerados (01..11)
│   ├── functions/           ← Edge Functions (send-email, chat-ai, verify-payment,
│   │                          telegram-bot/router/suscribir, bot-matricula)
│   └── bakup n8n/           ← respaldo de los workflows n8n del bot/registro
├── publicar.bat    ← deploy en 1 clic (git push → Vercel)
└── vercel.json     ← cache + headers de seguridad
```

> ⚠️ Las Edge Functions del repo son respaldos de las que corren en el
> dashboard de Supabase. Si se edita una, recordar desplegarla ahí también.

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
| Enviar oleada de campaña | `app/campanas.html` → botón "Enviar oleada de hoy" |
| Medir campaña | `app/campanas.html` → panel "Medición de campaña" (embudo 8 días) |

## 🔐 Seguridad

- RLS en las tablas · lógica de puntos en triggers (no hackeable desde cliente)
- API keys solo en Edge Functions · `escapeHtml` en todo contenido de usuario
- Trigger anti-escalada de rol/puntos (`prevent_profile_tampering`, fix migración 03)
- Constraint UNIQUE anti-duplicados de cursos (migración 01)
- `lesson_views`: alumnos solo insertan sus propias vistas, sin update/delete; lectura solo admin (migración 11)

## 📊 Escalabilidad

Plan Free de Supabase: ~50-60 usuarios simultáneos (límite Realtime).
Plan Pro ($25/mes): hasta ~3.000 simultáneos. 50.000+ usuarios registrados en Free.

## 🧭 Roadmap pendiente

- Eventos recurrentes ("cada sábado" automático)
- Migración 02 (leaderboard materializado) — creada, sin ejecutar
- A 200+ usuarios: anti-spam por nivel, links de invitación
- Campaña actual (sep-2026): 1100 ex-alumnos, oleadas de 100/día — medir a los 4-5 días las vistas del video de Clasificación ABC (panel de medición + YouTube Studio)
