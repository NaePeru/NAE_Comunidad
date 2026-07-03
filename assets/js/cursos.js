// ============================================================================
// PROYECTO Z — cursos.js
// Catálogo de cursos + vista de detalle con módulos, lecciones y progreso.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session, tieneAcceso } from './auth.js';
import { escapeHtml } from './utils.js';

// ── CARGAR CATÁLOGO DE CURSOS ───────────────────────────────────────────────
export async function cargarCatalogo() {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, slug, titulo, descripcion, categoria, icono, color_tema, requiere_pago, orden')
    .eq('publicado', true)
    .order('orden', { ascending: true });

  if (error) {
    console.error('Error cargando cursos:', error);
    document.getElementById('courses-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar cursos.</div>';
    return;
  }

  // Contar lecciones por curso
  const { data: counts } = await supabase
    .from('lessons')
    .select('course_id');

  const lessonCounts = {};
  (counts || []).forEach(l => {
    lessonCounts[l.course_id] = (lessonCounts[l.course_id] || 0) + 1;
  });

  // Mi progreso
  const { data: myProgress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completado')
    .eq('user_id', session.user.id);

  const myDone = new Set((myProgress || []).filter(p => p.completado).map(p => p.lesson_id));

  // Mapear progreso por curso (necesitamos lessons por curso)
  const { data: allLessons } = await supabase.from('lessons').select('id, course_id');
  const lessonsByCourse = {};
  (allLessons || []).forEach(l => {
    if (!lessonsByCourse[l.course_id]) lessonsByCourse[l.course_id] = [];
    lessonsByCourse[l.course_id].push(l.id);
  });

  window.__coursesData = courses;
  renderCatalogo(courses, lessonCounts, lessonsByCourse, myDone);
}

// ── COLORES DE CATEGORÍA ────────────────────────────────────────────────────
const CAT_COLORS = {
  excel:   { accent: '#217346', bg: 'rgba(33,115,70,0.12)',  border: 'rgba(33,115,70,0.35)',  label: '📊 Excel',    thumb: 'linear-gradient(135deg,#0d2818,#217346)' },
  powerbi: { accent: '#E05C2A', bg: 'rgba(224,92,42,0.12)',  border: 'rgba(224,92,42,0.35)',  label: '⚡ Power BI', thumb: 'linear-gradient(135deg,#2a1200,#c4480a)' },
  general: { accent: '#F2A900', bg: 'rgba(242,169,0,0.12)',  border: 'rgba(242,169,0,0.35)',  label: '📚 General',  thumb: 'linear-gradient(135deg,#1a1d2e,#2a2e44)' },
};

function catStyle(cat) {
  return CAT_COLORS[cat] || CAT_COLORS.general;
}

// ── RENDER CATÁLOGO ─────────────────────────────────────────────────────────
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

    return `
      <a class="course-card${bloqueado ? ' locked' : ''}${completed ? ' completed' : ''}"
         data-categoria="${c.categoria}"
         data-gratis="${c.requiere_pago ? 'no' : 'si'}"
         style="--cat-accent:${cs.accent};--cat-accent-bg:${cs.bg};--cat-accent-border:${cs.border};"
         href="${bloqueado ? '#' : 'curso.html?id=' + c.id}"
         onclick="${bloqueado ? "window.__locked();return false;" : ''}">
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
      </a>`;
  }).join('');
}

// ── CARGAR CURSO INDIVIDUAL (detalle con lecciones) ─────────────────────────
export async function cargarCurso(courseId) {
  // Datos del curso
  const { data: course, error: cErr } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (cErr || !course) {
    document.getElementById('curso-container').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div>Curso no encontrado.</div>';
    return;
  }

  // ¿Bloqueado?
  const bloqueado = course.requiere_pago && !tieneAcceso();
  if (bloqueado) {
    renderCursoBloqueado(course);
    return;
  }

  // Módulos
  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .eq('course_id', courseId)
    .order('orden', { ascending: true });

  // Lecciones
  const { data: lessons } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .order('orden', { ascending: true });

  // Mi progreso
  const { data: myProgress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completado')
    .eq('user_id', session.user.id)
    .in('lesson_id', (lessons || []).map(l => l.id));

  const myDone = new Set((myProgress || []).filter(p => p.completado).map(p => p.lesson_id));
  const total = (lessons || []).length;
  const done = (lessons || []).filter(l => myDone.has(l.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  window.__cursoData = { course, modules, lessons, myDone, total, done, pct };
  renderCurso(course, modules, lessons, myDone, total, done, pct);

  // Abrir primera lección no completada por defecto
  const primera = (lessons || []).find(l => !myDone.has(l.id)) || (lessons || [])[0];
  if (primera) abrirLeccion(primera.id);
}

// ── RENDER DEL CURSO ────────────────────────────────────────────────────────
function renderCurso(course, modules, lessons, myDone, total, done, pct) {
  document.getElementById('curso-container').innerHTML = `
    <div class="course-back" onclick="history.back()">← Volver al catálogo</div>

    <div class="course-header">
      <div class="course-header-top">
        <div class="course-header-icon" style="background:${course.color_tema || '#0a1a3d'};">${course.icono || '📘'}</div>
        <div class="course-header-info">
          <div class="course-header-title">${escapeHtml(course.titulo)}</div>
          <div class="course-header-desc">${escapeHtml(course.descripcion || '')}</div>
        </div>
      </div>
      <div class="course-header-stats">
        <div class="course-stat"><div class="num">${total}</div><div class="label">Lecciones</div></div>
        <div class="course-stat"><div class="num">${done}</div><div class="label">Completadas</div></div>
        <div class="course-stat"><div class="num">${pct}%</div><div class="label">Progreso</div></div>
      </div>
      <div class="course-progress-bar" style="margin-top:14px;">
        <div class="course-progress-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <div id="lesson-player"></div>

    ${modules && modules.length > 0 ? modules.map(mod => {
      const modLessons = (lessons || []).filter(l => l.module_id === mod.id);
      const modDone = modLessons.filter(l => myDone.has(l.id)).length;
      return `
        <div class="module">
          <div class="module-header">
            <div class="module-icon">📦</div>
            <div class="module-title">${escapeHtml(mod.titulo)}</div>
            <div class="module-progress">${modDone}/${modLessons.length}</div>
          </div>
          ${modLessons.map(l => `
            <div class="lesson-item" id="li-${l.id}" onclick="window.__abrirLeccion('${l.id}')">
              <div class="lesson-check ${myDone.has(l.id) ? 'done' : ''}">${myDone.has(l.id) ? '✓' : ''}</div>
              <div class="lesson-info">
                <div class="lesson-title">${escapeHtml(l.titulo)}</div>
                <div class="lesson-meta">${l.tipo === 'video' ? '🎬 Video' : '📄 Texto'}</div>
              </div>
              <div class="lesson-duration">${l.duracion_min || ''} ${l.duracion_min ? 'min' : ''}</div>
            </div>
          `).join('')}
        </div>`;
    }).join('') : `
      <div class="module">
        <div class="module-header">
          <div class="module-icon">📦</div>
          <div class="module-title">Lecciones del curso</div>
          <div class="module-progress">${done}/${total}</div>
        </div>
        ${(lessons || []).map(l => `
          <div class="lesson-item" id="li-${l.id}" onclick="window.__abrirLeccion('${l.id}')">
            <div class="lesson-check ${myDone.has(l.id) ? 'done' : ''}">${myDone.has(l.id) ? '✓' : ''}</div>
            <div class="lesson-info">
              <div class="lesson-title">${escapeHtml(l.titulo)}</div>
              <div class="lesson-meta">${l.tipo === 'video' ? '🎬 Video' : '📄 Texto'}</div>
            </div>
            <div class="lesson-duration">${l.duracion_min || ''} ${l.duracion_min ? 'min' : ''}</div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// ── RENDER CURSO BLOQUEADO ──────────────────────────────────────────────────
function renderCursoBloqueado(course) {
  document.getElementById('curso-container').innerHTML = `
    <div class="course-back" onclick="history.back()">← Volver al catálogo</div>
    <div class="card locked-msg">
      <div class="lock-icon">🔒</div>
      <h3>Este curso es Premium</h3>
      <p>Para acceder a <strong>${escapeHtml(course.titulo)}</strong> necesitás una membresía activa.
         Los cursos gratuitos (Excel Básico y Tablas Dinámicas) están disponibles sin costo.</p>
      <a href="perfil.html" class="btn btn-primary">Ver opciones de membresía</a>
    </div>
  `;
}

// ── ABRIR LECCIÓN (reproductor) ─────────────────────────────────────────────
function abrirLeccion(lessonId) {
  const { lessons, myDone } = window.__cursoData;
  const l = lessons.find(x => x.id === lessonId);
  if (!l) return;

  // Marcar como activa
  document.querySelectorAll('.lesson-item').forEach(el => el.classList.remove('active'));
  const li = document.getElementById(`li-${lessonId}`);
  if (li) li.classList.add('active');

  // Scroll al reproductor
  document.getElementById('lesson-player').scrollIntoView({ behavior: 'smooth', block: 'start' });

  const isDone = myDone.has(lessonId);
  const videoHtml = l.tipo === 'video' && l.url_contenido
    ? `<div class="video-wrap"><iframe src="${l.url_contenido}" frameborder="0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></div>`
    : `<div class="empty-state"><div class="empty-icon">📄</div>Contenido textual</div>`;

  document.getElementById('lesson-player').innerHTML = `
    <div class="lesson-player">
      <div class="lesson-player-title">${escapeHtml(l.titulo)}</div>
      ${videoHtml}
      ${l.descripcion ? `<div class="lesson-desc">${escapeHtml(l.descripcion)}</div>` : ''}
      <div class="lesson-player-actions">
        <button class="lesson-complete-btn ${isDone ? 'done' : ''}" onclick="window.__completarLeccion('${lessonId}')">
          ${isDone ? '✓ Completada' : 'Marcar como completada ✅'}
        </button>
      </div>
    </div>
  `;
}

// ── COMPLETAR LECCIÓN ───────────────────────────────────────────────────────
async function completarLeccion(lessonId) {
  const { myDone } = window.__cursoData;
  const nuevoEstado = !myDone.has(lessonId);

  // Upsert progreso
  await supabase
    .from('lesson_progress')
    .upsert({
      user_id: session.user.id,
      lesson_id: lessonId,
      completado: nuevoEstado,
      porcentaje: nuevoEstado ? 100 : 0,
      completado_en: nuevoEstado ? new Date().toISOString() : null,
    });

  if (nuevoEstado) {
    myDone.add(lessonId);
    import('../assets/js/utils.js').then(m => m.toast('✅ Lección completada'));
  } else {
    myDone.delete(lessonId);
  }

  // Re-render del curso completo (para actualizar progreso)
  const courseId = window.__cursoData.course.id;
  await cargarCurso(courseId);
  // Volver a abrir la lección actual
  abrirLeccion(lessonId);
}

// ── EXPORTAR ────────────────────────────────────────────────────────────────
window.__abrirLeccion = abrirLeccion;
window.__completarLeccion = completarLeccion;
window.__locked = () => import('../assets/js/utils.js').then(m => m.toast('🔒 Necesitas membresía para este curso'));
