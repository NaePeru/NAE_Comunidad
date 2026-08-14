# 🗄️ Supabase — Guía de instalación

## 📦 Instalación nueva (BD limpia)

Ejecutar los 3 archivos **en este orden** en Supabase → SQL Editor:

1. **`schema-completo.sql`** → tablas + índices
2. **`rls-completo.sql`** → políticas de seguridad
3. **`triggers-completo.sql`** → lógica automática (puntos, niveles, certificados)

Después, importá los cursos desde el panel Admin o con un seed manual.

---

## 📂 Estructura nueva

```
supabase/
├── schema-completo.sql       ← 1. TABLAS (fuente única de verdad)
├── rls-completo.sql          ← 2. SEGURIDAD
├── triggers-completo.sql     ← 3. LÓGICA AUTOMÁTICA
├── migrations/
│   └── 01_constraint_cursos_unicos.sql   ← Cambios incrementales
└── (archivos viejos a continuación, solo referencia histórica)
```

## ⚠️ Archivos obsoletos (NO ejecutar)

Estos archivos fueron consolidados en los 3 de arriba. Se mantienen solo como
referencia histórica de qué cambios se hicieron:

| Archivo viejo | Consolidado en |
|---|---|
| `schema.sql` | `schema-completo.sql` |
| `rls.sql` | `rls-completo.sql` |
| `triggers.sql` | `triggers-completo.sql` |
| `puntos-v2.sql` | `triggers-completo.sql` (sección E) |
| `certificados.sql` | `schema-completo.sql` (tabla certificates) + `triggers-completo.sql` (RPCs) |
| `cursos-skool.sql` | ❌ obsoleto (causó duplicados) |
| `cursos-datos.sql` | ❌ obsoleto (causó duplicados) |
| `storage-avatars.sql` | `rls-completo.sql` (sección 17) |
| `niveles-8.sql` | ❌ obsoleto (reemplazado por niveles-dbz) |
| `niveles-dbz.sql` | `triggers-completo.sql` (sección G) |
| `bio-column.sql` | `schema-completo.sql` (columna `bio`) |
| `material-descarga.sql` | `schema-completo.sql` (columna `link_descarga`) |
| `aprobar-alumnos.sql` | `triggers-completo.sql` (sección A) |
| `suspender-blinds.sql` | `rls-completo.sql` (políticas `_active`) |
| `security-profile-lock.sql` | `triggers-completo.sql` (sección H) |
| `limpiar-cursos-duplicados.sql` | utilidad puntual (ya ejecutada) |

## 🔍 Conflictos resueltos en la consolidación

Durante la consolidación se detectaron 3 conflictos entre los SQL sueltos:

### 1. `recompute_level` (3 versiones con umbrales distintos)
- `triggers.sql`: 5 niveles (NAE original, hasta 700 pts)
- `niveles-8.sql`: 8 niveles (hasta 10.000 pts)
- `niveles-dbz.sql`: 8 niveles Dragon Ball Z (hasta 10.000 pts) ✅ **elegida**

**Criterio:** es la que matchea con el frontend (`utils.js` NIVELES).

### 2. `handle_new_user` (2 versiones opuestas)
- `triggers.sql`: crea membresía `trial` de 7 días
- `aprobar-alumnos.sql`: crea membresía `pendiente` (espera aprobación) ✅ **elegida**

**Criterio:** el flujo real es que el admin aprueba cada registro (index.html lo refleja).

### 3. `has_active_membership` (2 versiones)
- `rls.sql`: solo cuenta estado `activa`
- `suspender-blinds.sql`: cuenta `activa` y `trial` (como `has_active_membership_or_trial`) ✅ **elegida**

**Criterio:** la versión con `trial` es la correcta (los trial pueden interactuar).
