// ============================================================================
// PROYECTO Z — cursos.js  (v4 — Una sola página, cambio de vista)
// El catálogo y el curso viven en la MISMA página. Click = cambio de vista.
// Sin navegación entre URLs, sin onclick que se pierda, sin bugs de caché.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session, tieneAcceso } from './auth.js';
import { escapeHtml, toast } from './utils.js';

// Estado
window.__coursesData = [];
let cursoState = null;

// Colores por categoría
const CAT_COLORS = {
  excel:   { accent: '#217346', bg: 'rgba(33,115,70,0.12)',  border: 'rgba(33,115,70,0.35)',  label: '📊 Excel',    thumb: 'linear-gradient(135deg,#0d2818,#217346)' },
  powerbi: { accent: '#E05C2A', bg: 'rgba(224,92,42,0.12)',  border: 'rgba(224,92,42,0.35)',  label: '⚡ Power BI', thumb: 'linear-gradient(135deg,#2a1200,#c4480a)' },
  general: { accent: '#F2A900', bg: 'rgba(242,169,0,0.12)',  border: 'rgba(242,169,0,0.35)',  label: '📚 General',  thumb: 'linear-gradient(135deg,#1a1d2e,#2a2e44)' },
  sql:     { accent: '#E05C2A', bg: 'rgba(224,92,42,0.12)',  border: 'rgba(224,92,42,0.35)',  label: '🗄️ SQL',       thumb: 'linear-gradient(135deg,#2a1200,#c4480a)' },
};
function catStyle(cat) { return CAT_COLORS[cat] || CAT_COLORS.general; }


// ============================================================================
// VISTA 1: CATÁLOGO
// ============================================================================
export async function cargarCatalogo() {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, titulo, descripcion, categoria, icono, color_tema, requiere_pago, orden')
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
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div>No hay cursos publicados.</div>';
    return;
  }

  const acceso = tieneAcceso();
  list.innerHTML = courses.map(c => {
    const bloqueado = c.requiere_pago && !acceso;
    const cs = catStyle(c.categoria);

    const pagoBadge = c.requiere_pago
      ? (bloqueado ? '<span class="badge badge-muted">🔒 PREMIUM</span>' : '<span class="badge badge-gold">PREMIUM</span>')
      : '<span class="badge badge-green">GRATIS</span>';

    return `
      <div class="course-card${bloqueado ? ' locked' : ''}"
           data-course-id="${c.id}"
           data-bloqueado="${bloqueado ? '1' : '0'}"
           data-categoria="${c.categoria}"
           data-gratis="${c.requiere_pago ? 'no' : 'si'}"
           style="--cat-accent:${cs.accent};--cat-accent-bg:${cs.bg};--cat-accent-border:${cs.border};cursor:pointer;">
        <div class="course-thumb" style="background:${cs.thumb};">${c.icono || '📘'}</div>
        <div class="course-body">
          <div class="course-title">${escapeHtml(c.titulo)} ${pagoBadge}</div>
          ${c.descripcion ? `<div class="course-desc">${escapeHtml(c.descripcion)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Event listener global
  bindClicksCatalogo();
}

// Listener global para clicks en tarjetas (delegación de eventos)
export function bindClicksCatalogo() {
  const list = document.getElementById('courses-list');
  if (!list) return;
  // Evitar duplicar listeners
  list.replaceWith(list.cloneNode(true));
  const newList = document.getElementById('courses-list');
  newList.addEventListener('click', async (e) => {
    const card = e.target.closest('.course-card');
    if (!card) return;
    const courseId = card.dataset.courseId;
    const bloqueado = card.dataset.bloqueado === '1';
    if (!courseId) return;
    if (bloqueado) { toast('🔒 Necesitas membresía para este curso'); return; }
    // Cambiar a vista de curso
    await abrirCurso(courseId);
  });
}


// ============================================================================
// CAMBIO DE VISTA: catálogo → curso
// ============================================================================
async function abrirCurso(courseId) {
  // Ocultar catálogo, mostrar contenedor de curso
  document.getElementById('vista-catalogo').classList.add('hidden');
  document.getElementById('vista-curso').classList.remove('hidden');
  document.getElementById('vista-curso').scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.getElementById('curso-container').innerHTML =
    '<div class="empty-state"><div class="empty-icon">⏳</div>Cargando curso...</div>';

  const { data: course, error: cErr } = await supabase
    .from('courses').select('*').eq('id', courseId).single();

  if (cErr || !course) {
    document.getElementById('curso-container').innerHTML =
      '<div class="empty-state"><div class="empty-icon">❌</div>Curso no encontrado.</div>';
    return;
  }

  const bloqueado = course.requiere_pago && !tieneAcceso();
  if (bloqueado) { renderCursoBloqueado(course); return; }

  const { data: modules, error: errMod } = await supabase
    .from('modules').select('*').eq('course_id', courseId).order('orden', { ascending: true });
  const { data: lessons, error: errLec } = await supabase
    .from('lessons').select('*').eq('course_id', courseId).order('orden', { ascending: true });

  if (errLec) {
    document.getElementById('curso-container').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar lecciones.</div>';
    return;
  }

  const { data: myProgress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completado')
    .eq('user_id', session.user.id)
    .in('lesson_id', (lessons || []).map(l => l.id));
  const myDone = new Set((myProgress || []).filter(p => p.completado).map(p => p.lesson_id));

  const flattened = (lessons || []).slice();
  cursoState = { course, modules: modules || [], lessons: lessons || [], myDone, flattened };

  if (flattened.length === 0) { renderCursoSinLecciones(course); return; }

  renderCursoLayout(course, modules || [], lessons || [], myDone);
  const primera = flattened.find(l => !myDone.has(l.id)) || flattened[0];
  if (primera) abrirLeccion(primera.id);
}


// ============================================================================
// VOLVER AL CATÁLOGO
// ============================================================================
function volverAlCatalogo() {
  document.getElementById('vista-curso').classList.add('hidden');
  document.getElementById('vista-catalogo').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ============================================================================
// RENDER DEL CURSO (sidebar + reproductor)
// ============================================================================
function renderCursoLayout(course, modules, lessons, myDone) {
  const total = lessons.length;
  const done = lessons.filter(l => myDone.has(l.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const cs = catStyle(course.categoria);

  // Agrupar lecciones: módulos reales + las que no tienen módulo
  const leccionesSinModulo = lessons.filter(l => !l.module_id);
  let modsParaSidebar = modules.length > 0 ? [...modules] : [];
  if (leccionesSinModulo.length > 0) {
    modsParaSidebar.push({ id: null, titulo: 'Lecciones', descripcion: '' });
  }
  if (modsParaSidebar.length === 0) {
    modsParaSidebar.push({ id: null, titulo: 'Lecciones', descripcion: '' });
  }

  const modsHtml = modsParaSidebar.map(mod => {
    let modLessons = (mod.id === null)
      ? lessons.filter(l => !l.module_id)
      : lessons.filter(l => l.module_id === mod.id);
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
    <div class="course-back" onclick="window.__volverCatalogo()">← Volver al catálogo</div>

    <div class="curso-layout">
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
    <div class="course-back" onclick="window.__volverCatalogo()">← Volver al catálogo</div>
    <div class="card locked-msg">
      <div class="lock-icon">🔒</div>
      <h3>Este curso es Premium</h3>
      <p>Para acceder a <strong>${escapeHtml(course.titulo)}</strong> necesitás una membresía activa.</p>
    </div>
  `;
}

function renderCursoSinLecciones(course) {
  document.getElementById('curso-container').innerHTML = `
    <div class="course-back" onclick="window.__volverCatalogo()">← Volver al catálogo</div>
    <div class="card no-lessons-msg">
      <div class="icon">📦</div>
      <h3 style="font-size:18px;margin-bottom:8px;">Aún no hay lecciones</h3>
      <p style="color:var(--muted);font-size:14px;">Este curso todavía no tiene contenido.</p>
    </div>
  `;
}


// ── ABRIR LECCIÓN ───────────────────────────────────────────────────────────
function abrirLeccion(lessonId) {
  if (!cursoState) return;
  const { lessons, myDone, flattened, course, modules } = cursoState;
  const l = lessons.find(x => x.id === lessonId);
  if (!l) return;

  document.querySelectorAll('.sb-lesson').forEach(el => el.classList.remove('active'));
  const sbItem = document.getElementById(`sb-l-${lessonId}`);
  if (sbItem) sbItem.classList.add('active');

  const mod = modules.find(m => m.id === l.module_id);
  document.getElementById('player-breadcrumb').innerHTML = `
    <span>${escapeHtml(course.titulo)}</span><span>›</span>
    <span>${mod ? escapeHtml(mod.titulo) : 'Lecciones'}</span><span>›</span>
    <span class="crumb-active">${escapeHtml(l.titulo)}</span>
  `;

  // Construir URL del video con protecciones anti-copia y mayor tamaño
  let videoUrl = l.url_contenido || '';
  if (videoUrl.includes('youtube.com/embed/') || videoUrl.includes('youtube-nocookie.com/embed/')) {
    const sep = videoUrl.includes('?') ? '&' : '?';
    videoUrl += sep + 'rel=0&modestbranding=1&showinfo=0&iv_load_policy=3&disablekb=1&playsinline=1';
    videoUrl = videoUrl.replace('youtube.com/embed/', 'youtube-nocookie.com/embed/');
  }

  const videoHtml = (l.tipo === 'video' && videoUrl)
    ? `<div class="video-wrap" oncontextmenu="return false;">
         <iframe src="${escapeHtml(videoUrl)}" frameborder="0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen style="width:100%; height:100%; position:absolute; top:0; left:0; min-height:400px;"></iframe>
         <div style="position:absolute; bottom:0; right:0; width:140px; height:50px; background:#0B0F19; z-index:10; pointer-events:none; display:flex; align-items:center; justify-content:center; border-top-left-radius:8px;">
           <span style="font-family: var(--font-display); font-weight:700; font-size:16px; color:#3B82F6; letter-spacing:1px;">◆ NAE</span>
         </div>
       </div>`
    : `<div class="empty-state" style="padding:40px;"><div class="empty-icon">📄</div>Sin video.</div>`;

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
            ${l.link_descarga ? `<a href="${escapeHtml(l.link_descarga)}" target="_blank" rel="noopener" class="lesson-next-btn">📥 Descargar material</a>` : ''}
          </div>
          ${siguiente ? `
            <button class="lesson-next-btn" onclick="window.__abrirLeccion('${siguiente.id}')">
              Siguiente: ${escapeHtml(siguiente.titulo).slice(0, 30)}${siguiente.titulo.length > 30 ? '…' : ''} →
            </button>` : ''}
        </div>
      </div>
    </div>
  `;
  cerrarSidebarMovil();
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

  if (nuevoEstado) { myDone.add(lessonId); toast('✅ Lección completada'); }
  else { myDone.delete(lessonId); }

  // Recalcular progreso
  const total = lessons.length;
  const done = lessons.filter(l => myDone.has(l.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = document.getElementById('sb-progress-fill');
  const txt = document.getElementById('sb-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (txt) txt.textContent = pct + '%';

  // Actualizar check del sidebar
  const sbItem = document.getElementById(`sb-l-${lessonId}`);
  if (sbItem) {
    const check = sbItem.querySelector('.sb-lesson-check');
    if (nuevoEstado) { check.classList.add('done'); check.textContent = '✓'; sbItem.classList.add('done-item'); }
    else { check.classList.remove('done'); check.textContent = ''; sbItem.classList.remove('done-item'); }
  }
  // Actualizar botón
  const btn = document.querySelector('.lesson-complete-btn');
  if (btn) {
    if (nuevoEstado) { btn.classList.add('done'); btn.innerHTML = '✓ Completada'; }
    else { btn.classList.remove('done'); btn.innerHTML = 'Marcar como completada'; }
  }
  // Actualizar conteo del módulo
  const l = lessons.find(x => x.id === lessonId);
  if (l) {
    const modKey = l.module_id || 'nomod';
    const modLessons = lessons.filter(x => (modules.length > 0 ? x.module_id === l.module_id : true));
    const modDone = modLessons.filter(x => myDone.has(x.id)).length;
    const modHeader = document.querySelector(`#sb-mod-${modKey} .sb-module-count`);
    if (modHeader) modHeader.textContent = `${modDone}/${modLessons.length}`;
  }
}


// ── TOGGLES ─────────────────────────────────────────────────────────────────
function toggleModulo(modId) {
  const mod = document.getElementById(`sb-mod-${modId}`);
  if (mod) mod.classList.toggle('collapsed');
}
function toggleSidebar() {
  const sb = document.getElementById('curso-sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.toggle('open');
  if (ov) ov.classList.toggle('open');
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
window.__volverCatalogo = volverAlCatalogo;
