// ============================================================================
// PROYECTO Z — admin.js
// Panel de administración: CRUD de cursos, módulos, lecciones y alumnos.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session } from './auth.js';
import { escapeHtml, iniciales, colorAvatar, getNivel, formatNum, toast } from './utils.js';

let tabActual = 'cursos';
let cursoEditando = null;   // ID del curso que se está gestionando (lecciones)
let cursosCache = [];
let leccionesCache = {};    // { [cursoId]: [lecciones...] } para edición

// Exportar para que admin.html pueda leer la cache
export function getCursosCache() { return cursosCache; }
export function getCursoById(id) { return cursosCache.find(c => c.id === id) || null; }
export function getLeccionById(cursoId, leccionId) {
  const lista = leccionesCache[cursoId] || [];
  return lista.find(l => l.id === leccionId) || null;
}

// ============================================================================
// DASHBOARD — estadísticas generales
// ============================================================================
export async function cargarDashboard() {
  const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
  const { count: totalCourses } = await supabase.from('courses').select('id', { count: 'exact', head: true });
  const { count: totalLessons } = await supabase.from('lessons').select('id', { count: 'exact', head: true });
  const { count: totalPosts } = await supabase.from('posts').select('id', { count: 'exact', head: true });

  setText('ad-total-users', formatNum(totalUsers || 0));
  setText('ad-total-courses', formatNum(totalCourses || 0));
  setText('ad-total-lessons', formatNum(totalLessons || 0));
  setText('ad-total-posts', formatNum(totalPosts || 0));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}


// ============================================================================
// CURSOS — listar, crear, editar, borrar
// ============================================================================
export async function cargarCursosAdmin() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('orden', { ascending: true });

  if (error) { console.error(error); return; }
  cursosCache = data || [];
  renderCursosAdmin();
}

function renderCursosAdmin() {
  const list = document.getElementById('admin-courses-list');
  if (!list) return;

  if (cursosCache.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div>Aún no hay cursos. Creá el primero.</div>';
    return;
  }

  list.innerHTML = cursosCache.map(c => {
    const catLabel = c.categoria === 'excel' ? 'Excel' : c.categoria === 'powerbi' ? 'Power BI' : 'General';
    const pagoLabel = c.requiere_pago ? '💰 Pago' : '🎁 Gratis';
    const pubLabel = c.publicado ? 'Publicado' : 'Borrador';
    return `
      <div class="admin-course-row">
        <div class="admin-course-icon" style="background:${c.color_tema || '#1a1d2e'};">${c.icono || '📘'}</div>
        <div class="admin-course-info">
          <div class="admin-course-title">${escapeHtml(c.titulo)}</div>
          <div class="admin-course-meta">
            <span>${catLabel}</span><span>·</span>
            <span>${pagoLabel}</span><span>·</span>
            <span>${pubLabel}</span><span>·</span>
            <span>Orden ${c.orden}</span>
          </div>
        </div>
        <div class="admin-course-actions">
          <button class="icon-btn" title="Gestionar lecciones" onclick="window.__adminLecciones('${c.id}')">🎬</button>
          <button class="icon-btn" title="Editar" onclick="window.__adminEditarCurso('${c.id}')">✏️</button>
          <button class="icon-btn danger" title="Eliminar" onclick="window.__adminBorrarCurso('${c.id}')">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

// ── Crear / Editar curso ──
export async function guardarCurso(formData) {
  const datos = {
    titulo: formData.titulo.trim(),
    descripcion: formData.descripcion.trim(),
    categoria: formData.categoria,
    icono: formData.icono || '📘',
    color_tema: formData.color_tema || 'linear-gradient(135deg,#1a1d2e,#2a2e44)',
    requiere_pago: formData.requiere_pago,
    publicado: formData.publicado,
    orden: parseInt(formData.orden) || 1,
  };
  datos.slug = (datos.titulo.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || 'curso-' + Date.now();

  if (!datos.titulo) { toast('⚠️ Falta el título'); return { error: true }; }

  let result;
  if (formData.id) {
    // Editar
    result = await supabase.from('courses').update(datos).eq('id', formData.id);
  } else {
    // Crear
    result = await supabase.from('courses').insert(datos);
  }

  if (result.error) { toast('⚠️ Error: ' + result.error.message); return { error: true }; }

  toast(formData.id ? '✅ Curso actualizado' : '✅ Curso creado');
  await cargarCursosAdmin();
  return { error: null };
}

// ── Borrar curso ──
export async function borrarCurso(id) {
  const curso = cursosCache.find(c => c.id === id);
  if (!confirm(`¿Eliminar "${curso?.titulo}"? Se borrarán también sus módulos y lecciones.`)) return;
  const { error } = await supabase.from('courses').delete().eq('id', id);
  if (error) { toast('⚠️ No se pudo eliminar'); return; }
  toast('🗑️ Curso eliminado');
  await cargarCursosAdmin();
}


// ============================================================================
// LECCIONES — gestionar módulos y lecciones de un curso
// ============================================================================
async function gestionarLecciones(cursoId) {
  cursoEditando = cursoId;
  const curso = cursosCache.find(c => c.id === cursoId);
  if (!curso) return;

  // Cargar módulos y lecciones
  const { data: modules } = await supabase
    .from('modules').select('*').eq('course_id', cursoId).order('orden', { ascending: true });
  const { data: lessons } = await supabase
    .from('lessons').select('*').eq('course_id', cursoId).order('orden', { ascending: true });

  // Guardar en cache para edición
  leccionesCache[cursoId] = lessons || [];

  // Renderizar vista de gestión de lecciones
  const panel = document.getElementById('admin-lecciones-panel');
  panel.dataset.cursoId = cursoId;
  document.getElementById('lecciones-curso-titulo').textContent = '🎬 ' + curso.titulo;

  panel.innerHTML = `
    <div class="card" style="margin-bottom:18px;">
      <div style="font-weight:700;margin-bottom:10px;">➕ Crear módulo</div>
      <div class="form-row">
        <input type="text" class="form-input" id="new-mod-titulo" placeholder="Título del módulo (ej: Módulo 1: Fundamentos)">
      </div>
      <button class="btn btn-primary btn-sm" onclick="window.__adminCrearModulo()">+ Crear módulo</button>
    </div>

    ${(modules || []).length === 0 && (!lessons || lessons.filter(l => !l.module_id).length === 0)
      ? '<div class="empty-state"><div class="empty-icon">📦</div>No hay módulos ni lecciones todavía.</div>'
      : ''
    }

    ${(modules && modules.length > 0) ? modules.map(mod => {
      const modLessons = (lessons || []).filter(l => l.module_id === mod.id);
      return `
        <div class="module-block">
          <div class="module-block-header">
            <span class="module-icon">📦</span>
            <div class="module-block-title">${escapeHtml(mod.titulo)}</div>
            <button class="icon-btn danger" title="Borrar módulo" onclick="window.__adminBorrarModulo('${mod.id}')">🗑️</button>
          </div>

          <div id="lecciones-mod-${mod.id}">
            ${modLessons.map(l => `
              <div class="lesson-row">
                <span>🎬</span>
                <div class="lesson-row-title">${escapeHtml(l.titulo)}</div>
                <div class="lesson-row-meta">${l.duracion_min || 0} min</div>
                <button class="icon-btn" title="Editar lección" onclick="window.__adminEditarLeccion('${l.id}', '${mod.id}')">✏️</button>
                <button class="icon-btn danger" title="Borrar lección" onclick="window.__adminBorrarLeccion('${l.id}')">🗑️</button>
              </div>
            `).join('')}
          </div>

          <button class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%;" onclick="window.__adminCrearLeccion('${mod.id}')">
            + Agregar lección
          </button>
        </div>`;
    }).join('') : ''}

    ${(!modules || modules.length === 0) ? `
      <div class="module-block">
        <div class="module-block-header">
          <span class="module-icon">📦</span>
          <div class="module-block-title">Lecciones sin módulo</div>
        </div>
        <div id="lecciones-sin-mod">
          ${(lessons || []).filter(l => !l.module_id).map(l => `
            <div class="lesson-row">
              <span>🎬</span>
              <div class="lesson-row-title">${escapeHtml(l.titulo)}</div>
              <button class="icon-btn" title="Editar" onclick="window.__adminEditarLeccion('${l.id}', null)">✏️</button>
              <button class="icon-btn danger" title="Borrar" onclick="window.__adminBorrarLeccion('${l.id}')">🗑️</button>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  mostrarSeccion('lecciones');
}

// ── Crear módulo ──
async function crearModulo() {
  const titulo = document.getElementById('new-mod-titulo').value.trim();
  if (!titulo) { toast('⚠️ Escribe un título'); return; }
  const cursoId = document.getElementById('admin-lecciones-panel').dataset.cursoId;

  // Calcular orden
  const { data: mods } = await supabase.from('modules').select('orden').eq('course_id', cursoId);
  const orden = (mods || []).length + 1;

  const { error } = await supabase.from('modules').insert({
    course_id: cursoId, titulo, orden,
  });
  if (error) { toast('⚠️ Error'); return; }
  toast('✅ Módulo creado');
  await gestionarLecciones(cursoId);
}

// ── Borrar módulo ──
async function borrarModulo(modId) {
  if (!confirm('¿Borrar este módulo y todas sus lecciones?')) return;
  await supabase.from('modules').delete().eq('id', modId);
  toast('🗑️ Módulo eliminado');
  const cursoId = document.getElementById('admin-lecciones-panel').dataset.cursoId;
  await gestionarLecciones(cursoId);
}

// ── Crear / editar lección ──
async function guardarLeccion(formData) {
  const cursoId = document.getElementById('admin-lecciones-panel').dataset.cursoId;
  const datos = {
    course_id: cursoId,
    module_id: formData.module_id || null,
    titulo: formData.titulo.trim(),
    descripcion: formData.descripcion?.trim() || null,
    tipo: 'video',
    url_contenido: formData.url_contenido?.trim() || null,
    duracion_min: parseInt(formData.duracion_min) || 0,
    orden: parseInt(formData.orden) || 1,
  };
  if (!datos.titulo) { toast('⚠️ Falta el título de la lección'); return { error: true }; }

  let result;
  if (formData.id) {
    result = await supabase.from('lessons').update(datos).eq('id', formData.id);
  } else {
    result = await supabase.from('lessons').insert(datos);
  }

  if (result.error) { toast('⚠️ Error: ' + result.error.message); return { error: true }; }
  toast(formData.id ? '✅ Lección actualizada' : '✅ Lección creada');
  await gestionarLecciones(cursoId);
  return { error: null };
}

async function borrarLeccion(id) {
  if (!confirm('¿Borrar esta lección?')) return;
  await supabase.from('lessons').delete().eq('id', id);
  toast('🗑️ Lección eliminada');
  const cursoId = document.getElementById('admin-lecciones-panel').dataset.cursoId;
  await gestionarLecciones(cursoId);
}


// ============================================================================
// ALUMNOS — listar y gestionar membresías
// ============================================================================
export async function cargarAlumnos() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, nombre, rol, puntos, avatar_url, color, activo, creado_en')
    .order('creado_en', { ascending: false });

  if (error) { console.error(error); return; }

  // Cargar membresías
  const ids = (profiles || []).map(p => p.id);
  const { data: memberships } = await supabase
    .from('memberships').select('*').in('user_id', ids);
  const memMap = {};
  (memberships || []).forEach(m => memMap[m.user_id] = m);

  const tbody = document.getElementById('admin-alumnos-tbody');
  if (!tbody) return;

  if (!profiles || profiles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Sin alumnos aún.</div></td></tr>';
    return;
  }

  tbody.innerHTML = profiles.map(p => {
    const mem = memMap[p.id];
    const estado = mem?.estado || 'trial';
    const nivel = getNivel(p.puntos || 0);
    const [c1, c2] = p.color || colorAvatar(p.nombre);
    const avatarHtml = p.avatar_url
      ? `<img src="${p.avatar_url}" alt="${escapeHtml(p.nombre)}">`
      : `<div class="mini-avatar" style="background:${c1};color:${c2};">${escapeHtml(iniciales(p.nombre))}</div>`;
    const soy = p.id === session.user.id;
    return `
      <tr>
        <td>
          <div class="user-cell">
            ${avatarHtml}
            <div>
              <div style="font-weight:600;">${escapeHtml(p.nombre)}${soy ? ' <span class="badge badge-muted" style="font-size:9px;">TÚ</span>' : ''}</div>
              <div style="font-size:11px;color:var(--muted2);">${p.rol}</div>
            </div>
          </div>
        </td>
        <td><span style="color:${nivel.color};">${nivel.emoji} ${nivel.nombre}</span></td>
        <td><span style="font-family:var(--font-mono);">${formatNum(p.puntos || 0)}</span></td>
        <td><span class="badge-status ${estado}">${estado}</span></td>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--muted2);">
          ${new Date(p.creado_en).toLocaleDateString('es-PE')}
        </td>
        <td>
          ${soy ? '' : `
            <button class="icon-btn" title="Activar" onclick="window.__adminActivar('${p.id}')">✅</button>
            <button class="icon-btn" title="Suspender" onclick="window.__adminSuspender('${p.id}')">⏸️</button>
          `}
        </td>
      </tr>`;
  }).join('');
}

async function activarAlumno(uid) {
  const { error } = await supabase.from('memberships')
    .update({ estado: 'activa', fecha_vence: null }).eq('user_id', uid);
  if (error) { toast('⚠️ Error'); return; }
  toast('✅ Acceso activado');
  await cargarAlumnos();
}

async function suspenderAlumno(uid) {
  if (!confirm('¿Suspender el acceso de este alumno?')) return;
  const { error } = await supabase.from('memberships')
    .update({ estado: 'suspendida' }).eq('user_id', uid);
  if (error) { toast('⚠️ Error'); return; }
  toast('⏸️ Alumno suspendido');
  await cargarAlumnos();
}


// ============================================================================
// NAVEGACIÓN ENTRE SECCIONES
// ============================================================================
export function mostrarSeccion(seccion) {
  ['dashboard', 'cursos', 'lecciones', 'alumnos'].forEach(s => {
    const el = document.getElementById('admin-section-' + s);
    if (el) el.classList.toggle('hidden', s !== seccion);
  });
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === seccion);
  });

  if (seccion === 'dashboard') cargarDashboard();
  if (seccion === 'cursos') cargarCursosAdmin();
  if (seccion === 'alumnos') cargarAlumnos();
}


// ============================================================================
// EXPORTAR FUNCIONES AL WINDOW
// ============================================================================
window.__adminLecciones = gestionarLecciones;
window.__adminEditarCurso = (id) => abrirModalCurso(id);
window.__adminBorrarCurso = borrarCurso;
window.__adminCrearModulo = crearModulo;
window.__adminBorrarModulo = borrarModulo;
window.__adminCrearLeccion = (modId) => abrirModalLeccion(null, modId);
window.__adminEditarLeccion = (id, modId) => abrirModalLeccion(id, modId);
window.__adminBorrarLeccion = borrarLeccion;
window.__adminActivar = activarAlumno;
window.__adminSuspender = suspenderAlumno;

// Importar funciones de modales desde admin.html (se definen ahí)
async function abrirModalCurso(id) {
  if (typeof window.__openCursoModal === 'function') window.__openCursoModal(id);
}
async function abrirModalLeccion(id, modId) {
  if (typeof window.__openLeccionModal === 'function') window.__openLeccionModal(id, modId);
}
