// ============================================================================
// PROYECTO Z — cursos.js  (v3 — Layout estilo Skool)
// Sidebar de módulos/lecciones colapsable + reproductor grande + siguiente lección.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session, tieneAcceso } from './auth.js';
import { escapeHtml, toast } from './utils.js';

// Estado del catálogo
window.__coursesData = [];

// ── CATALOGO ─────────────────────────────────────────────────────────────────
const CAT_COLORS = {
  excel:   { accent: '#217346', bg: 'rgba(33,115,70,0.12)',  border: 'rgba(33,115,70,0.35)',  label: '📊 Excel',    thumb: 'linear-gradient(135deg,#0d2818,#217346)' },
  powerbi: { accent: '#E05C2A', bg: 'rgba(224,92,42,0.12)',  border: 'rgba(224,92,42,0.35)',  label: '⚡ Power BI', thumb: 'linear-gradient(135deg,#2a1200,#c4480a)' },
  general: { accent: '#F2A900', bg: 'rgba(242,169,0,0.12)',  border: 'rgba(242,169,0,0.35)',  label: '📚 General',  thumb: 'linear-gradient(135deg,#1a1d2e,#2a2e44)' },
};
function catStyle(cat) { return CAT_COLORS[cat] || CAT_COLORS.general; }

export async function cargarCatalogo() {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, slug, titulo, descripcion, categoria, icono, color_tema, requiere_pago, orden')
    .eq('publicado', true)
    .order('orden', { ascending: true });

  if (error) {
    document.getElementById('courses-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar cursos.</div>';
    return;
  }

  const { data: counts } = await supabase.from('lessons').select('course_id');
  const lessonCounts = {};
  (counts || []).forEach(l => { lessonCounts[l.course_id] = (lessonCounts[l.course_id] || 0) + 1; });

  const { data: allLessons } = await supabase.from('lessons').select('id, course_id');
  const lessonsByCourse = {};
  (allLessons || []).forEach(l => {
    if (!lessonsByCourse[l.course_id]) lessonsByCourse[l.course_id] = [];
    lessonsByCourse[l.course_id].push(l.id);
  });

  const { data: myProgress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completado')
    .eq('user_id', session.user.id);
  const myDone = new Set((myProgress || []).filter(p => p.completado).map(p => p.lesson_id));

  window.__coursesData = courses;
  renderCatalogo(courses, lessonCounts, lessonsByCourse, myDone);
}

function renderCatalogo(courses, lessonCounts, lessonsByCourse, myDone) {
  const list = document.getElementById('courses-list');
  if (!courses || courses.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div>No hay cursos publicados aún.</div>';
    return;
  }

  const acceso = tieneAcceso();
  list.innerHTML = courses.map(c => {
    const total = lessonCounts[c.id] || 0;
    const lessonIds = lessonsByCourse[c.id] || [];
    const done = lessonIds.filter(id => myDone.has(id)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bloqueado = c.requiere_pago && !acceso;
    const completed = pct === 100 && total > 0;
    const cs = catStyle(c.categoria);

    const pagoBadge = c.requiere_pago
      ? (bloqueado ? '<span class="badge badge-muted">🔒 PREMIUM</span>' : '<span class="badge badge-gold">PREMIUM</span>')
      : '<span class="badge badge-green">GRATIS</span>';

    const progressBar = total > 0 ? `
      <div class="course-progress">
        <div class="course-progress-bar"><div class="course-progress-fill" style="width:${pct}%"></div></div>
        <span class="course-progress-text">${pct}%</span>
      </div>` : `
      <div class="course-meta" style="margin-top:auto;">
        <span>${total} leccion${total === 1 ? '' : 'es'}</span>
      </div>`;

    const actionLabel = bloqueado ? '🔒' :
                        completed ? '✓ Revisar' :
                        pct === 0 ? 'Comenzar →' : 'Continuar →';

    const clickHandler = bloqueado
      ? `window.__locked();`
      : `window.location.href='curso.html?id=${c.id}';`;

    return `
      <div class="course-card${bloqueado ? ' locked' : ''}${completed ? ' completed' : ''}"
         data-categoria="${c.categoria}"
         data-gratis="${c.requiere_pago ? 'no' : 'si'}"
         data-course-id="${c.id}"
         style="--cat-accent:${cs.accent};--cat-accent-bg:${cs.bg};--cat-accent-border:${cs.border};"
         onclick="${clickHandler}">
        <div class="course-thumb" style="background:${cs.thumb};">${c.icono || '📘'}</div>
        <div class="course-body">
          <div class="course-title">${escapeHtml(c.titulo)} ${pagoBadge}</div>
          ${c.descripcion ? `<div class="course-desc">${escapeHtml(c.descripcion)}</div>` : ''}
          <div class="course-meta">
            <span>${cs.label}</span>
            <span class="meta-dot">·</span>
            <span>${total} leccion${total === 1 ? '' : 'es'}</span>
          </div>
          ${progressBar}
        </div>
        <div class="course-action">${actionLabel}</div>
      </div>`;
  }).join('');
}


// ============================================================================
// VISTA DE CURSO INDIVIDUAL (sidebar + reproductor)
// ============================================================================
let cursoState = null;   // { course, modules, lessons, myDone, flattened }

export async function cargarCurso(courseId) {
  const { data: course, error: cErr } = await supabase
    .from('courses').select('*').eq('id', courseId).single();

  if (cErr || !course) {
    document.getElementById('curso-container').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div>Curso no encontrado.<br><code style="font-size:11px;color:var(--muted2);">' + escapeHtml(cErr?.message || 'ID inválido') + '</code></div>';
    return;
  }

  // ¿Bloqueado?
  const bloqueado = course.requiere_pago && !tieneAcceso();
  if (bloqueado) { renderCursoBloqueado(course); return; }

  const { data: modules, error: errMod } = await supabase
    .from('modules').select('*').eq('course_id', courseId).order('orden', { ascending: true });
  const { data: lessons, error: errLec } = await supabase
    .from('lessons').select('*').eq('course_id', courseId).order('orden', { ascending: true });

  // Logs de diagnóstico (visibles en consola)
  console.log('🔍 cargarCurso — courseId:', courseId);
  console.log('🔍 módulos:', modules, 'error:', errMod);
  console.log('🔍 lecciones:', lessons, 'error:', errLec);

  // Si la consulta de lecciones da error (ej: RLS bloquea), mostrar mensaje claro
  if (errLec) {
    document.getElementById('curso-container').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar lecciones.<br><code style="font-size:11px;color:var(--muted2);">' + escapeHtml(errLec.message) + '</code></div>';
    return;
  }

  const { data: myProgress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completado')
    .eq('user_id', session.user.id)
    .in('lesson_id', (lessons || []).map(l => l.id));
  const myDone = new Set((myProgress || []).filter(p => p.completado).map(p => p.lesson_id));

  // Lista aplanada de TODAS las lecciones (tengan o no módulo asignado)
  const flattened = (lessons || []).slice();

  cursoState = { course, modules: modules || [], lessons: lessons || [], myDone, flattened };

  if (flattened.length === 0) {
    renderCursoSinLecciones(course);
    return;
  }

  renderCursoLayout(course, modules || [], lessons || [], myDone);

  // Abrir la primera lección no completada (o la primera)
  const primera = flattened.find(l => !myDone.has(l.id)) || flattened[0];
  if (primera) abrirLeccion(primera.id);
}

function renderCursoLayout(course, modules, lessons, myDone) {
  const total = lessons.length;
  const done = lessons.filter(l => myDone.has(l.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const cs = catStyle(course.categoria);

  // Construir el sidebar de módulos.
  // Lógica robusta: muestra TODAS las lecciones, tengan o no módulo asignado.
  const leccionesSinModulo = lessons.filter(l => !l.module_id);
  let modsParaSidebar = modules.length > 0 ? [...modules] : [];

  // Si hay lecciones sin módulo, agregarlas como grupo "Lecciones"
  if (leccionesSinModulo.length > 0) {
    modsParaSidebar.push({ id: null, titulo: 'Lecciones', descripcion: '' });
  }
  // Fallback por si no hay nada
  if (modsParaSidebar.length === 0) {
    modsParaSidebar.push({ id: null, titulo: 'Lecciones', descripcion: '' });
  }

  const modsHtml = modsParaSidebar.map(mod => {
    // Lecciones de este módulo (si mod.id es null → las que no tienen módulo)
    let modLessons;
    if (mod.id === null) {
      modLessons = lessons.filter(l => !l.module_id);
    } else {
      modLessons = lessons.filter(l => l.module_id === mod.id);
    }
    const modDone = modLessons.filter(l => myDone.has(l.id)).length;
    const modKey = mod.id || 'nomod';
    return `
      <div class="sb-module" id="sb-mod-${modKey}">
        <div class="sb-module-header" onclick="window.__toggleModulo('${modKey}')">
          <span class="sb-module-chevron">▼</span>
          <span class="sb-module-name">${escapeHtml(mod.titulo)}</span>
          <span class="sb-module-count">${modDone}/${modLessons.length}</span>
        </div>
        <ul class="sb-lessons">
          ${modLessons.map(l => `
            <li class="sb-lesson ${myDone.has(l.id) ? 'done-item' : ''}" id="sb-l-${l.id}" onclick="window.__abrirLeccion('${l.id}')">
              <span class="sb-lesson-check ${myDone.has(l.id) ? 'done' : ''}">${myDone.has(l.id) ? '✓' : ''}</span>
              <span class="sb-lesson-title">${escapeHtml(l.titulo)}</span>
              ${l.duracion_min ? `<span class="sb-lesson-duration">${l.duracion_min}m</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>`;
  }).join('');

  document.getElementById('curso-container').innerHTML = `
    <div class="curso-back" onclick="history.back()">← Volver al catálogo</div>

    <div class="curso-layout">
      <!-- SIDEBAR -->
      <aside class="curso-sidebar" id="curso-sidebar">
        <div class="sidebar-course-info">
          <div class="sidebar-course-thumb" style="background:${cs.thumb};">${course.icono || '📘'}</div>
          <div style="flex:1;min-width:0;">
            <div class="sidebar-course-name">${escapeHtml(course.titulo)}</div>
            <div class="sidebar-progress">
              <div class="sidebar-progress-bar"><div class="sidebar-progress-fill" id="sb-progress-fill" style="width:${pct}%"></div></div>
              <span class="sidebar-progress-text" id="sb-progress-text">${pct}%</span>
            </div>
          </div>
        </div>
        ${modsHtml}
      </aside>

      <!-- MAIN -->
      <div class="curso-main">
        <div class="curso-main-header">
          <div class="curso-breadcrumb" id="player-breadcrumb">
            <span>${escapeHtml(course.titulo)}</span>
          </div>
          <button class="btn-toggle-sidebar" onclick="window.__toggleSidebar()">☰</button>
        </div>
        <div id="player-area">
          <div class="empty-state"><div class="empty-icon">⏳</div>Cargando lección...</div>
        </div>
      </div>
    </div>
    <div class="sidebar-overlay" id="sidebar-overlay" onclick="window.__toggleSidebar()"></div>
  `;
}

function renderCursoBloqueado(course) {
  document.getElementById('curso-container').innerHTML = `
    <div class="course-back" onclick="history.back()">← Volver al catálogo</div>
    <div class="card locked-msg">
      <div class="lock-icon">🔒</div>
      <h3>Este curso es Premium</h3>
      <p>Para acceder a <strong>${escapeHtml(course.titulo)}</strong> necesitás una membresía activa.</p>
      <a href="perfil.html" class="btn btn-primary">Ver opciones de membresía</a>
    </div>
  `;
}

function renderCursoSinLecciones(course) {
  document.getElementById('curso-container').innerHTML = `
    <div class="course-back" onclick="history.back()">← Volver al catálogo</div>
    <div class="card no-lessons-msg">
      <div class="icon">📦</div>
      <h3 style="font-size:18px;margin-bottom:8px;">Aún no hay lecciones</h3>
      <p style="color:var(--muted);font-size:14px;">Este curso todavía no tiene contenido. Volvé pronto.</p>
    </div>
  `;
}


// ── ABRIR LECCIÓN (render reproductor) ──────────────────────────────────────
function abrirLeccion(lessonId) {
  if (!cursoState) return;
  const { lessons, myDone, flattened, course, modules } = cursoState;
  const l = lessons.find(x => x.id === lessonId);
  if (!l) return;

  // Marcar activa en sidebar
  document.querySelectorAll('.sb-lesson').forEach(el => el.classList.remove('active'));
  const sbItem = document.getElementById(`sb-l-${lessonId}`);
  if (sbItem) sbItem.classList.add('active');

  // Breadcrumb: Curso > Módulo > Lección
  const mod = modules.find(m => m.id === l.module_id);
  document.getElementById('player-breadcrumb').innerHTML = `
    <span>${escapeHtml(course.titulo)}</span>
    <span>›</span>
    <span>${mod ? escapeHtml(mod.titulo) : 'Lecciones'}</span>
    <span>›</span>
    <span class="crumb-active">${escapeHtml(l.titulo)}</span>
  `;

  // Video
  const videoHtml = (l.tipo === 'video' && l.url_contenido)
    ? `<div class="video-wrap"><iframe src="${l.url_contenido}" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>`
    : `<div class="empty-state" style="padding:40px;"><div class="empty-icon">📄</div>Sin video. Lección de texto.</div>`;

  // ¿Hay siguiente lección?
  const idx = flattened.findIndex(x => x.id === lessonId);
  const siguiente = idx >= 0 && idx < flattened.length - 1 ? flattened[idx + 1] : null;

  const isDone = myDone.has(lessonId);
  document.getElementById('player-area').innerHTML = `
    <div class="player-card">
      ${videoHtml}
      <div class="player-content">
        ${mod ? `<span class="player-module-tag">📦 ${escapeHtml(mod.titulo)}</span>` : ''}
        <h2 class="player-lesson-title">${escapeHtml(l.titulo)}</h2>
        ${l.descripcion ? `<div class="player-lesson-desc">${escapeHtml(l.descripcion)}</div>` : ''}
        <div class="player-actions">
          <div class="player-actions-left">
            <button class="lesson-complete-btn ${isDone ? 'done' : ''}" onclick="window.__completarLeccion('${lessonId}')">
              ${isDone ? '✓ Completada' : 'Marcar como completada'}
            </button>
          </div>
          ${siguiente ? `
            <button class="lesson-next-btn" onclick="window.__abrirLeccion('${siguiente.id}')">
              Siguiente: ${escapeHtml(siguiente.titulo).slice(0, 30)}${siguiente.titulo.length > 30 ? '…' : ''} →
            </button>` : ''}
        </div>
      </div>
    </div>
  `;

  // En móvil, cerrar el sidebar al elegir lección
  cerrarSidebarMovil();
  // Scroll arriba
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ── COMPLETAR LECCIÓN ───────────────────────────────────────────────────────
async function completarLeccion(lessonId) {
  if (!cursoState) return;
  const { myDone, lessons, modules, course } = cursoState;
  const nuevoEstado = !myDone.has(lessonId);

  await supabase.from('lesson_progress').upsert({
    user_id: session.user.id,
    lesson_id: lessonId,
    completado: nuevoEstado,
    porcentaje: nuevoEstado ? 100 : 0,
    completado_en: nuevoEstado ? new Date().toISOString() : null,
  });

  if (nuevoEstado) {
    myDone.add(lessonId);
    toast('✅ Lección completada');
  } else {
    myDone.delete(lessonId);
  }

  // Recalcular progreso del sidebar
  const total = lessons.length;
  const done = lessons.filter(l => myDone.has(l.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = document.getElementById('sb-progress-fill');
  const txt = document.getElementById('sb-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (txt) txt.textContent = pct + '%';

  // Actualizar el check del sidebar para esta lección
  const sbItem = document.getElementById(`sb-l-${lessonId}`);
  if (sbItem) {
    const check = sbItem.querySelector('.sb-lesson-check');
    if (nuevoEstado) {
      check.classList.add('done');
      check.textContent = '✓';
      sbItem.classList.add('done-item');
    } else {
      check.classList.remove('done');
      check.textContent = '';
      sbItem.classList.remove('done-item');
    }
  }

  // Actualizar el botón del reproductor
  const btn = document.querySelector('.lesson-complete-btn');
  if (btn) {
    if (nuevoEstado) { btn.classList.add('done'); btn.innerHTML = '✓ Completada'; }
    else { btn.classList.remove('done'); btn.innerHTML = 'Marcar como completada'; }
  }

  // Actualizar el conteo del módulo
  const l = lessons.find(x => x.id === lessonId);
  if (l) {
    const modId = l.module_id || 'nomod';
    const modLessons = lessons.filter(x => (modules.length > 0 ? x.module_id === l.module_id : !x.module_id));
    const modDone = modLessons.filter(x => myDone.has(x.id)).length;
    const modHeader = document.querySelector(`#sb-mod-${modId} .sb-module-count`);
    if (modHeader) modHeader.textContent = `${modDone}/${modLessons.length}`;
  }
}


// ── TOGGLE MÓDULO (colapsar/expandir) ──────────────────────────────────────
function toggleModulo(modId) {
  const mod = document.getElementById(`sb-mod-${modId}`);
  if (mod) mod.classList.toggle('collapsed');
}

// ── SIDEBAR MÓVIL ───────────────────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.getElementById('curso-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb && ov) {
    sb.classList.toggle('open');
    ov.classList.toggle('open');
  }
}
function cerrarSidebarMovil() {
  const sb = document.getElementById('curso-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}


// ── EXPORTAR ────────────────────────────────────────────────────────────────
window.__abrirLeccion = abrirLeccion;
window.__completarLeccion = completarLeccion;
window.__toggleModulo = toggleModulo;
window.__toggleSidebar = toggleSidebar;
window.__locked = () => toast('🔒 Necesitas membresía para este curso');
