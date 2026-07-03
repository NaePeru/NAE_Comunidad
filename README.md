# Proyecto Z — Plataforma tipo Skool (uso personal)

Plataforma de comunidad + cursos + eventos con gamificación, para un solo dueño,
optimizada para **hasta 500 usuarios simultáneos**. Backend en **Supabase**.

---

## 📁 Estructura

```
proyecto-z/
├── index.html                  ← Landing + Login / Registro
├── app/
│   ├── aula.html               ← Panel principal (Fase 1 ✅)
│   ├── comunidad.html          ← (Fase 2)
│   ├── cursos.html             ← (Fase 3)
│   ├── eventos.html            ← (Fase 4)
│   ├── miembros.html           ← (Fase 4)
│   ├── perfil.html             ← (Fase 4)
│   └── admin.html              ← (Fase 6)
├── assets/
│   ├── css/                    ← base, components, layout, gamificacion
│   └── js/                     ← supabase-client, auth, utils (✅) + resto por fases
└── supabase/
    ├── schema.sql              ← ✅ Tablas + índices
    ├── rls.sql                 ← ✅ Seguridad por fila
    └── triggers.sql            ← ✅ Lógica automática (puntos, niveles, perfiles)
```

---

## 🚀 Instalación (3 pasos)

### PASO 1 — Crear la base de datos en Supabase
1. Entra a tu proyecto en https://supabase.com
2. Ve a **SQL Editor → New query**
3. Copia y pega el contenido de `supabase/schema.sql` → **Run**
4. Repite con `supabase/rls.sql` → **Run**
5. Repite con `supabase/triggers.sql` → **Run**

### PASO 2 — Configurar las credenciales
1. En Supabase: **Project Settings → API**
2. Copia tu **Project URL** y tu **anon public key**
3. Abre `assets/js/supabase-client.js`
4. Reemplaza:
   ```js
   const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';
   ```
   con tus valores reales.

### PASO 3 — Activar Auth y darte rol de ADMIN
1. En Supabase: **Authentication → Providers → Email** → asegúrate de que esté habilitado.
   *(Opcional: desactiva "Confirm email" en Authentication → Settings si quieres login inmediato en pruebas).*
2. Regístrate desde `index.html` (serás el primer usuario).
3. En **SQL Editor**, ejecuta para darte rol admin:
   ```sql
   update profiles set rol = 'admin' where email = 'TU_EMAIL@ejemplo.com';
   ```
   *(Reemplaza con el email que usaste).*

### PASO 4 — Probarlo
Abre `index.html` en tu navegador. Si tienes problemas con los módulos ES (CORS),
necesitarás un servidor local:
```bash
# Dentro de la carpeta proyecto-z/
npx serve .
# o
python -m http.server 8000
```

---

## ✅ Lo que YA funciona (Fase 1)

- **Registro y login** con cuentas individuales (email + contraseña)
- **Sesión persistente** (no te pide login cada vez)
- **Perfiles automáticos** al registrarse (trigger)
- **Membresía trial de 7 días** automática al registrarse
- **Sistema de niveles NAE** (5 niveles, igual al original)
- **Panel del aula** con tarjeta de nivel y barra de progreso
- **Detección de rol admin** (muestra el acceso al panel de admin)
- **Validación de membresía** (muestra días restantes / vencida)

---

## 🎮 Sistema de niveles NAE

| Nivel | Puntos | Nombre | Emoji |
|-------|--------|--------|-------|
| 1 | 0–49 | Aprendiz | 🌱 |
| 2 | 50–149 | Analista Junior | 📊 |
| 3 | 150–349 | Analista de Datos | ⚡ |
| 4 | 350–699 | Analista Senior | 🏆 |
| 5 | 700+ | Experto NAE | 🌟 |

**Puntos que otorga el sistema automáticamente (triggers):**
- +10 → crear publicación
- +3 → comentar
- +1 → dar like
- +15 → completar una lección

---

## ⚠️ Seguridad

- La **anon key** es pública por diseño (está protegida por RLS).
- **NUNCA** pongas la `service_role` key en el frontend.
- Si vienes del archivo `Index.html` anterior: **revoca la API key de OpenAI** que estaba expuesta. En la Fase 5 migraremos el chat a una Edge Function segura.

---

## 📅 Próximas fases

- **Fase 2:** Comunidad (feed, posts, likes, comentarios con Realtime)
- **Fase 3:** Cursos (catálogo, lecciones, progreso)
- **Fase 4:** Eventos + Miembros (calendario, leaderboard en vivo)
- **Fase 5:** Chat IA Alessandra (Edge Function segura) + voz
- **Fase 6:** Panel Admin (gestión de alumnos, suspensiones, stats)

---

## 🆘 Problemas comunes

**"Falta configurar Supabase" en la pantalla de login**
→ Aún tienes los placeholders en `supabase-client.js`. Revisa el Paso 2.

**El registro funciona pero no puedo entrar**
→ Probablemente necesitas confirmar el email, o desactiva "Confirm email" en Auth Settings para pruebas.

**Los módulos ES no cargan (error de CORS al abrir como `file://`)**
→ Sirve la carpeta con un servidor local (Paso 4).
