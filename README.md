# NAE â€” Comunidad de AnÃ¡lisis de Datos (Proyecto Z)

Plataforma de comunidad + cursos + gamificaciÃ³n para **Centro de CapacitaciÃ³n NAE**.
Frontend vanilla (HTML/CSS/JS mÃ³dulos) Â· Backend 100% Supabase Â· Deploy en Vercel.

**Web:** https://www.naeacademia.com

---

## âœ¨ Funcionalidades

- **Comunidad:** feed con posts, likes, comentarios, imÃ¡genes, modo LIVE, presencia "en lÃ­nea"
- **Cursos:** catÃ¡logo, mÃ³dulos, lecciones con video, progreso y descarga de material
- **Pagos:** QR de Yape + subida de voucher con **verificaciÃ³n automÃ¡tica por IA** (Edge Function)
- **GamificaciÃ³n:** niveles Dragon Ball (8), puntos hÃ­bridos (+2 post, +1 comentario, +1 like recibido, +5 LIVE), ranking semanal
- **Certificados:** autoemisiÃ³n al completar mÃ³dulo, PDF premium (marfil/oro), cÃ³digo verificable pÃºblicamente en `/verificar.html`, herramienta de certificados manuales para externos (`app/cert-manual.html`)
- **Chatbot "Alessandra"** (Nivel 4): IA que conoce nombre, puntos, nivel, progreso y vouchers de cada alumno
- **Emails:** anuncio broadcast cuando el admin publica + recordatorio de seminario sÃ¡bados 08:00 (vÃ­a Resend)
- **Eventos:** seminarios con link de reuniÃ³n y "agregar al calendario"

## ðŸ—‚ï¸ Estructura

```
â”œâ”€â”€ index.html / verificar.html / test.html
â”œâ”€â”€ app/            â† 9 pÃ¡ginas privadas (comunidad, cursos, cert-manual, admin...)
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ css/ (10)   â† estilos por mÃ³dulo
â”‚   â”œâ”€â”€ img/        â† qr-yape.jpg
â”‚   â””â”€â”€ js/ (19)    â† lÃ³gica modular (ver error-guard.js = red anti crashes)
â”œâ”€â”€ legacy/         â† archivos retirados (aula, debug)
â”œâ”€â”€ supabase/
â”‚   â”œâ”€â”€ schema-completo.sql Â· rls-completo.sql Â· triggers-completo.sql  â† FUENTE ÃšNICA
â”‚   â”œâ”€â”€ GUIA-ADMIN.sql       â† comandos: clave, hacer admin, ver admins
â”‚   â”œâ”€â”€ migrations/          â† cambios numerados (01..05)
â”‚   â””â”€â”€ functions/send-email â† Edge Function de emails (en repo âœ…)
â”œâ”€â”€ publicar.bat    â† deploy en 1 clic (git push â†’ Vercel)
â””â”€â”€ vercel.json     â† cache + headers de seguridad
```

> âš ï¸ Las Edge Functions `chat-ai` y `verify-payment` viven solo en el dashboard
> de Supabase (respaldarlas en `supabase/functions/` es pendiente).

## ðŸš€ InstalaciÃ³n (BD nueva)

1. Supabase â†’ SQL Editor â†’ ejecutar en orden:
   `schema-completo.sql` â†’ `rls-completo.sql` â†’ `triggers-completo.sql`
2. Crear buckets de Storage: `avatars` (pÃºblico), `comunidad-img` (pÃºblico), `vouchers`
3. `assets/js/supabase-client.js` â†’ URL + anon key del proyecto
4. Edge Functions (dashboard): crear `chat-ai`, `verify-payment`, `send-email`
   (cÃ³digo de esta Ãºltima en `supabase/functions/send-email/index.ts`)
5. Secrets de `send-email`: `RESEND_API_KEY`, `OWNER_EMAIL`, `CRON_SECRET`
6. Ejecutar migraciones pendientes de `supabase/migrations/`

## ðŸ› ï¸ OperaciÃ³n diaria

| Tarea | CÃ³mo |
|---|---|
| Publicar cambios en la web | Doble clic en `publicar.bat` |
| Correr tests de lÃ³gica | Abrir `/test.html` (36 pruebas) |
| Nueva clave a un alumno | `GUIA-ADMIN.sql` Â§ 1 |
| Hacer admin a alguien | `GUIA-ADMIN.sql` Â§ 2 |
| Ver admins | `GUIA-ADMIN.sql` Â§ 3 |
| Emails a alumnos | Requiere dominio verificado en Resend (hoy: modo test, solo al dueÃ±o) |

## ðŸ” Seguridad

- RLS en las 16 tablas Â· lÃ³gica de puntos en triggers (no hackeable desde cliente)
- API keys solo en Edge Functions Â· `escapeHtml` en todo contenido de usuario
- Trigger anti-escalada de rol/puntos (`prevent_profile_tampering`, fix migraciÃ³n 03)
- Constraint UNIQUE anti-duplicados de cursos (migraciÃ³n 01)

## ðŸ“Š Escalabilidad

Plan Free de Supabase: ~50-60 usuarios simultÃ¡neos (lÃ­mite Realtime).
Plan Pro ($25/mes): hasta ~3.000 simultÃ¡neos. 50.000+ usuarios registrados en Free.

## ðŸ§­ Roadmap pendiente

- Dominio propio + emails a alumnos (activo el broadcast y recordatorios reales)
- Eventos recurrentes ("cada sÃ¡bado" automÃ¡tico)
- MigraciÃ³n 02 (leaderboard materializado) â€” creada, sin ejecutar
- Respaldar Edge Functions chat-ai y verify-payment al repo
- A 200+ usuarios: anti-spam por nivel, links de invitaciÃ³n
