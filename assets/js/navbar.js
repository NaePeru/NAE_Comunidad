// ============================================================================
// PROYECTO Z — navbar.js
// Inyecta la barra de navegación superior horizontal (estilo Skool) en cada página.
// Evita repetir el HTML del sidebar en todas las páginas.
// ============================================================================

import { session, logout, esAdmin } from './auth.js';
import { getNivel, iniciales, colorAvatar } from './utils.js';

// Estructura de pestañas (id → ruta + label + icono)
const PESTANAS = [
  { id: 'aula',      ruta: 'aula.html',      icono: '🏠', label: 'Aula' },
  { id: 'cursos',    ruta: 'cursos.html',    icono: '📚', label: 'Cursos' },
  { id: 'comunidad', ruta: 'comunidad.html', icono: '💬', label: 'Comunidad' },
  { id: 'eventos',   ruta: 'eventos.html',   icono: '📅', label: 'Eventos' },
  { id: 'miembros',  ruta: 'miembros.html',  icono: '👥', label: 'Miembros' },
  { id: 'perfil',    ruta: 'perfil.html',    icono: '⚙️', label: 'Perfil' },
];
const PESTANA_ADMIN = { id: 'admin', ruta: 'admin.html', icono: '🛡️', label: 'Admin' };

const TABBAR_MOVIL = [
  { id: 'aula',      ruta: 'aula.html',      icono: '🏠' },
  { id: 'cursos',    ruta: 'cursos.html',    icono: '📚' },
  { id: 'comunidad', ruta: 'comunidad.html', icono: '💬' },
  { id: 'eventos',   ruta: 'eventos.html',   icono: '📅' },
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
      <a href="aula.html" class="navbar-brand">
        <span class="brand-mark">◆</span> NAE
      </a>
      <div class="navbar-user">
        <span class="nivel-chip" style="background:${nivel.color}18;border:1px solid ${nivel.color}40;color:${nivel.color};">
          ${nivel.emoji} ${nivel.nombre}
        </span>
        <div class="navbar-user-info">
          <div class="navbar-user-name">${p?.nombre || 'Alumno'}</div>
          <div class="navbar-user-role">${esAdminUser ? 'ADMIN' : (session.membership?.estado || 'alumno').toUpperCase()}</div>
        </div>
        ${avatarHtml}
        <button class="btn btn-sm btn-ghost" onclick="window.__logout()" title="Cerrar sesión">⏻</button>
      </div>
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

  window.__logout = logout;
}
