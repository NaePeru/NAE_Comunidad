// ============================================================================
// PROYECTO Z — navbar.js
// Inyecta la barra de navegación superior horizontal (estilo Skool) en cada página.
// Evita repetir el HTML del sidebar en todas las páginas.
// ============================================================================

import { session, logout, esAdmin } from './auth.js';
import { getNivel, iniciales, colorAvatar } from './utils.js';
import { initChat } from './chat-ia.js';

// Estructura de pestañas (id → ruta + label + icono)
const PESTANAS = [
  { id: 'comunidad', ruta: 'comunidad.html', icono: '💬', label: 'Comunidad' },
  { id: 'cursos',    ruta: 'cursos.html',    icono: '📚', label: 'Cursos' },
  { id: 'eventos',   ruta: 'eventos.html',   icono: '📅', label: 'Eventos' },
  { id: 'miembros',  ruta: 'miembros.html',  icono: '👥', label: 'Miembros' },
  { id: 'perfil',    ruta: 'perfil.html',    icono: '⚙️', label: 'Perfil' },
];
const PESTANA_ADMIN = { id: 'admin', ruta: 'admin.html', icono: '🛡️', label: 'Admin' };

const TABBAR_MOVIL = [
  { id: 'comunidad', ruta: 'comunidad.html', icono: '💬' },
  { id: 'cursos',    ruta: 'cursos.html',    icono: '📚' },
  { id: 'eventos',   ruta: 'eventos.html',   icono: '📅' },
  { id: 'miembros',  ruta: 'miembros.html',  icono: '👥' },
  { id: 'perfil',    ruta: 'perfil.html',    icono: '👤' },
];

// Inyecta la navbar al inicio del body y completa datos del usuario.
export function renderNavbar(activoId) {
  const p = session.profile;
  const esAdminUser = esAdmin();
  const nivel = getNivel(p?.puntos || 0);
  const [c1, c2] = p?.color || colorAvatar(p?.nombre || '?');

  const pestanas = esAdminUser ? [...PESTANAS, PESTANA_ADMIN] : PESTANAS;

  // Avatar del usuario
  const avatarHtml = p?.avatar_url
    ? `<img src="${p.avatar_url}" class="avatar avatar-sm" style="object-fit:cover;" alt="">`
    : `<div class="avatar avatar-sm" style="background:${c1};color:${c2};">${iniciales(p?.nombre || '?')}</div>`;

  const navbar = document.createElement('nav');
  navbar.className = 'navbar';
  navbar.innerHTML = `
    <div class="navbar-top">
      <a href="comunidad.html" class="navbar-brand">
        <span class="brand-mark">◆</span> NAE
      </a>
      <div class="navbar-actions">
        <button class="navbar-icon-btn" id="navbar-search-btn" title="Buscar" onclick="window.__toggleSearch()">
          🔍
        </button>
        <button class="navbar-icon-btn" id="navbar-bell-btn" title="Notificaciones">
          🔔<span class="navbar-badge"></span>
        </button>
        <span class="nivel-chip" style="background:${nivel.color}18;border:1px solid ${nivel.color}40;color:${nivel.color};">
          ${nivel.emoji} ${nivel.nombre}
        </span>
        <div class="navbar-user">
          <div class="navbar-user-info">
            <div class="navbar-user-name">${p?.nombre || 'Alumno'}</div>
            <div class="navbar-user-role">${esAdminUser ? 'ADMIN' : (session.membership?.estado || 'alumno').toUpperCase()}</div>
          </div>
          ${avatarHtml}
          <button class="btn btn-sm btn-ghost" onclick="window.__logout()" title="Cerrar sesión">⏻</button>
        </div>
      </div>
    </div>
    <div class="navbar-search-bar" id="navbar-search-bar">
      <input type="text" id="navbar-search-input" placeholder="Buscar en la comunidad..." oninput="window.__doSearch(this.value)">
      <div id="navbar-search-results" class="navbar-search-results"></div>
    </div>
    <div class="navbar-tabs">
      ${pestanas.map(t => `
        <a href="${t.ruta}" class="navbar-tab ${t.id === activoId ? 'active' : ''}">
          <span class="nav-icon">${t.icono}</span> ${t.label}
        </a>
      `).join('')}
    </div>
  `;

  // Tabbar móvil (si la página no tiene uno propio)
  let tabbar = document.querySelector('.tabbar');
  if (!tabbar) {
    tabbar = document.createElement('div');
    tabbar.className = 'tabbar';
    document.body.appendChild(tabbar);
  }
  tabbar.innerHTML = TABBAR_MOVIL.map(t => `
    <a href="${t.ruta}" class="tabbar-item ${t.id === activoId ? 'active' : ''}">
      <span class="tab-icon">${t.icono}</span>
    </a>
  `).join('');

  // Insertar la navbar al principio del body
  document.body.insertBefore(navbar, document.body.firstChild);

  // Lógica para ocultar navbar al hacer scroll hacia abajo
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 150) {
      // Scrolleando hacia abajo: ocultar
      navbar.classList.add('hidden-nav');
    } else {
      // Scrolleando hacia arriba: mostrar
      navbar.classList.remove('hidden-nav');
    }
    lastScrollY = currentScrollY;
  });

  // Inicializar Alessandra (chat IA flotante) — una sola vez
  if (!window.__chatInit) {
    window.__chatInit = true;
    initChat();
  }

  window.__logout = logout;
}

// ── BUSCADOR ────────────────────────────────────────────────────────────────
import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';

window.__toggleSearch = () => {
  const bar = document.getElementById('navbar-search-bar');
  if (!bar) return;
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) {
    setTimeout(() => document.getElementById('navbar-search-input')?.focus(), 100);
  }
};

let searchTimer;
window.__doSearch = (q) => {
  clearTimeout(searchTimer);
  if (!q || q.trim().length < 2) {
    document.getElementById('navbar-search-results').innerHTML = '';
    return;
  }
  searchTimer = setTimeout(async () => {
    const query = q.trim();
    const [posts, courses, users] = await Promise.all([
      supabase.from('posts').select('id, contenido, categoria').ilike('contenido', `%${query}%`).limit(3),
      supabase.from('courses').select('id, titulo, icono').ilike('titulo', `%${query}%`).limit(3),
      supabase.from('profiles').select('id, nombre, avatar_url').ilike('nombre', `%${query}%`).limit(3),
    ]);

    let html = '';
    if (courses.data?.length > 0) {
      html += '<div class="search-group-title">📚 Cursos</div>';
      html += courses.data.map(c => `<a href="cursos.html" class="search-result-item">${c.icono||'📘'} ${escapeHtml(c.titulo)}</a>`).join('');
    }
    if (posts.data?.length > 0) {
      html += '<div class="search-group-title">💬 Publicaciones</div>';
      html += posts.data.map(p => `<a href="comunidad.html" class="search-result-item">💭 ${escapeHtml(p.contenido.substring(0,50))}...</a>`).join('');
    }
    if (users.data?.length > 0) {
      html += '<div class="search-group-title">👥 Personas</div>';
      html += users.data.map(u => `<a href="miembros.html" class="search-result-item">👤 ${escapeHtml(u.nombre)}</a>`).join('');
    }
    if (!html) html = '<div class="search-empty">Sin resultados para "' + escapeHtml(query) + '"</div>';

    const res = document.getElementById('navbar-search-results');
    if (res) res.innerHTML = html;
  }, 300);
};
