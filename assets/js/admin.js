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
  // OPTIMIZACIÓN: las 4 counts son independientes → las lanzamos en paralelo.
  // Antes se hacían secuenciales (4 viajes a la BD uno tras otro = lento).
  const [users, courses, lessons, posts] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('courses').select('id', { count: 'exact', head: true }),
    supabase.from('lessons').select('id', { count: 'exact', head: true }),
    supabase.from('posts').select('id', { count: 'exact', head: true }),
  ]);

  setText('ad-total-users', formatNum(users.count || 0));
  setText('ad-total-courses', formatNum(courses.count || 0));
  setText('ad-total-lessons', formatNum(lessons.count || 0));
  setText('ad-total-posts', formatNum(posts.count || 0));
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

  if (result.error) {
    // Mensaje claro si el título ya existe (constraint UNIQUE anti-duplicados)
    if (result.error.code === '23505' || result.error.message?.includes('duplicate key')) {
      toast('⚠️ Ya existe un curso con ese título. Usá otro nombre.');
    } else {
      toast('⚠️ Error: ' + result.error.message);
    }
    return { error: true };
  }

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

// ── Crear / editar lección (exportada para admin.html) ──
export async function guardarLeccion(formData) {
  return _guardarLeccion(formData);
}


// ============================================================================
// LECCIONES — gestionar módulos y lecciones de un curso
// ============================================================================
async function gestionarLecciones(cursoId) {
  cursoEditando = cursoId;
  const curso = cursosCache.find(c => c.id === cursoId);
  if (!curso) return;

  // Renderizar vista de gestión de lecciones (guard antes de tocar el DOM)
  const panel = document.getElementById('admin-lecciones-panel');
  if (!panel) return;
  const tituloEl = document.getElementById('lecciones-curso-titulo');

  // OPTIMIZACIÓN: módulos y lecciones son independientes → paralelas.
  const [modulesRes, lessonsRes] = await Promise.all([
    supabase.from('modules').select('*').eq('course_id', cursoId).order('orden', { ascending: true }),
    supabase.from('lessons').select('*').eq('course_id', cursoId).order('orden', { ascending: true }),
  ]);
  const modules = modulesRes.data;
  const lessons = lessonsRes.data;

  // Guardar en cache para edición
  leccionesCache[cursoId] = lessons || [];

  panel.dataset.cursoId = cursoId;
  if (tituloEl) tituloEl.textContent = '🎬 ' + curso.titulo;

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
async function _guardarLeccion(formData) {
  const cursoId = document.getElementById('admin-lecciones-panel').dataset.cursoId;
  const datos = {
    course_id: cursoId,
    module_id: formData.module_id || null,
    titulo: formData.titulo.trim(),
    descripcion: formData.descripcion?.trim() || null,
    tipo: 'video',
    url_contenido: formData.url_contenido?.trim() || null,
    link_descarga: formData.link_descarga?.trim() || null,
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


// (Sección Chatbot eliminada - Ahora se controla desde prompt.js)

// ============================================================================
// PAGOS — Listar comprobantes y calcular ingresos
// ============================================================================
export async function cargarPagosAdmin() {
  const list = document.getElementById('admin-pagos-list');
  if (!list) return;

  // 1. Obtener todos los logs de pago
  const { data: pagos, error } = await supabase
    .from('payment_logs')
    .select(`
      id, voucher_url, monto_detectado, estado, creado_en,
      numero_operacion, fecha_operacion,
      user_id, course_id,
      profiles:user_id (nombre),
      courses:course_id (titulo)
    `)
    .order('creado_en', { ascending: false });

  if (error) {
    console.error('Error cargando pagos:', error);
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar.</div>';
    return;
  }

  // 2. Actualizar estadísticas
  const aprobados = (pagos || []).filter(p => p.estado === 'aprobado');
  const pendientes = (pagos || []).filter(p => p.estado !== 'aprobado');
  // OPTIMIZACIÓN: antes los ingresos se calculaban como count * 50 (hardcodeado).
  // Ahora usamos el monto_detectado de cada voucher aprobado (más preciso).
  // Si no tiene monto, asumimos S/50 (precio estándar).
  const totalIngresos = aprobados.reduce((sum, p) => sum + (Number(p.monto_detectado) || 50), 0);

  const elIng = document.getElementById('stats-ingresos');
  const elVen = document.getElementById('stats-vendidos');
  const elPen = document.getElementById('stats-pendientes');
  
  if (elIng) elIng.textContent = `S/ ${totalIngresos}`;
  if (elVen) elVen.textContent = aprobados.length;
  if (elPen) elPen.textContent = pendientes.length;

  // 3. Renderizar la lista
  if (!pagos || pagos.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>Aún no hay comprobantes de pago.</div>';
    return;
  }

  list.innerHTML = pagos.map(p => {
    const nombreAlumno = p.profiles?.nombre || 'Desconocido';
    const nombreCurso = p.courses?.titulo || 'Curso eliminado';
    const fecha = new Date(p.creado_en).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const estadoClass = p.estado === 'aprobado' ? 'activa' : 'trial';
    const estadoText = p.estado === 'aprobado' ? '✅ Aprobado' : '⏳ Pendiente';

    return `
      <div class="admin-course-row" style="align-items: center;">
        <a href="${escapeHtml(p.voucher_url)}" target="_blank" class="admin-course-icon" style="background: var(--card2); cursor: pointer; text-decoration: none;" title="Ver comprobante">🖼️</a>
        <div class="admin-course-info">
          <div class="admin-course-title" style="color: #fff;">${escapeHtml(nombreAlumno)}</div>
          <div class="admin-course-meta">
            ${escapeHtml(nombreCurso)} · 
            S/ ${p.monto_detectado || 0} · 
            ${fecha}
          </div>
          ${p.numero_operacion || p.fecha_operacion ? `
          <div class="admin-course-meta" style="margin-top: 4px; font-size: 10.5px; color: var(--muted2);">
            ${p.numero_operacion ? `Operación: <strong style="color:var(--gold);">${escapeHtml(p.numero_operacion)}</strong> · ` : ''}
            ${p.fecha_operacion ? `Fecha Voucher: ${escapeHtml(p.fecha_operacion)}` : ''}
          </div>
          ` : ''}
        </div>
        <div class="admin-course-actions">
          <span class="badge-status ${estadoClass}">${estadoText}</span>
        </div>
      </div>`;
  }).join('');
}

// ============================================================================
export async function cargarAlumnos() {
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return; }
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, nombre, rol, puntos, avatar_url, color, activo, creado_en')
    .order('creado_en', { ascending: false });

  if (error) {
    console.error(error);
    toast('⚠️ No se pudo cargar la lista de alumnos.');
    return;
  }

  // Cargar membresías (con manejo de error)
  const ids = (profiles || []).map(p => p.id);
  let memMap = {};
  if (ids.length > 0) {
    const { data: memberships, error: memErr } = await supabase
      .from('memberships').select('*').in('user_id', ids);
    if (memErr) {
      console.error('Error cargando membresías:', memErr);
    } else {
      (memberships || []).forEach(m => memMap[m.user_id] = m);
    }
  }

  const tbody = document.getElementById('admin-alumnos-tbody');
  if (!tbody) return;

  if (!profiles || profiles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">Sin alumnos aún.</div></td></tr>';
    return;
  }

  tbody.innerHTML = profiles.map(p => {
    const mem = memMap[p.id];
    const estado = mem?.estado || 'pendiente';
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
          ${soy ? '<span style="color:var(--muted2);font-size:12px;">—</span>' : `
            <div style="display:flex;gap:6px;">
              <button class="icon-btn" title="Aprobar / Activar" onclick="window.__adminActivar('${p.id}')" style="color:#3DD68C;">✅</button>
              <button class="icon-btn" title="Rechazar / Suspender" onclick="window.__adminSuspender('${p.id}')" style="color:#EF4444;">❌</button>
            </div>
          `}
        </td>
      </tr>`;
  }).join('');
}

// ── APROBAR ALUMNO (Pasa a trial/activo) ──
// Flag anti-doble-click: si el admin hace click rápido 2 veces en ✅,
// no queremos disparar 2 updates contradictorios.
let _accionEnCurso = false;

async function aprobarAlumno(uid) {
  if (_accionEnCurso) return;
  _accionEnCurso = true;
  try {
    const { error } = await supabase.from('memberships')
      .update({ estado: 'trial', fecha_vence: null }).eq('user_id', uid);
    if (error) { toast('⚠️ Error al aprobar'); return; }
    toast('✅ Alumno aprobado');
    await cargarAlumnos();
  } finally {
    _accionEnCurso = false;
  }
}

async function activarAlumno(uid) {
  if (_accionEnCurso) return;
  _accionEnCurso = true;
  try {
    const { error } = await supabase.from('memberships')
      .update({ estado: 'activa', fecha_vence: null }).eq('user_id', uid);
    if (error) { toast('⚠️ Error'); return; }
    toast('✅ Acceso activado');
    await cargarAlumnos();
  } finally {
    _accionEnCurso = false;
  }
}

async function suspenderAlumno(uid) {
  if (_accionEnCurso) return;
  if (!confirm('¿Rechazar/Suspender el acceso de este alumno?')) return;
  _accionEnCurso = true;
  try {
    const { error } = await supabase.from('memberships')
      .update({ estado: 'rechazada' }).eq('user_id', uid);
    if (error) { toast('⚠️ Error'); return; }
    toast('🚫 Alumno rechazado/suspendido');
    await cargarAlumnos();
  } finally {
    _accionEnCurso = false;
  }
}


// ============================================================================
// NAVEGACIÓN ENTRE SECCIONES
// ============================================================================
export function mostrarSeccion(seccion) {
  ['dashboard', 'cursos', 'lecciones', 'alumnos', 'pagos', 'mailing'].forEach(s => {
    const el = document.getElementById('admin-section-' + s);
    if (el) el.classList.toggle('hidden', s !== seccion);
  });
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === seccion);
  });

  if (seccion === 'dashboard') cargarDashboard();
  if (seccion === 'cursos') cargarCursosAdmin();
  if (seccion === 'alumnos') cargarAlumnos();
  if (seccion === 'pagos') cargarPagosAdmin();
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
window.__adminActivar = aprobarAlumno;
window.__adminSuspender = suspenderAlumno;

// Importar funciones de modales desde admin.html (se definen ahí)
async function abrirModalCurso(id) {
  if (typeof window.__openCursoModal === 'function') window.__openCursoModal(id);
}
async function abrirModalLeccion(id, modId) {
  if (typeof window.__openLeccionModal === 'function') window.__openLeccionModal(id, modId);
}
