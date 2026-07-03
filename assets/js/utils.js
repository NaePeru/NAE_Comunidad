// ============================================================================
// PROYECTO Z — utils.js
// Funciones auxiliares reutilizables en toda la plataforma.
// ============================================================================

// ── SISTEMA DE NIVELES NAE (9 niveles — temática Analista) ─────────────────
export const NIVELES = [
  { num: 1, min: 0,     max: 99,     nombre: 'Novato',       emoji: '🌱', color: '#6B7280' },
  { num: 2, min: 100,   max: 299,    nombre: 'Explorador',   emoji: '🔍', color: '#3B82F6' },
  { num: 3, min: 300,   max: 599,    nombre: 'Aprendiz',     emoji: '📚', color: '#06B6D4' },
  { num: 4, min: 600,   max: 999,    nombre: 'Practicante',  emoji: '⚡', color: '#3DD68C' },
  { num: 5, min: 1000,  max: 1999,   nombre: 'Analista',     emoji: '📊', color: '#14B8A6' },
  { num: 6, min: 2000,  max: 3499,   nombre: 'Estratega',    emoji: '🧠', color: '#8B5CF6' },
  { num: 7, min: 3500,  max: 5999,   nombre: 'Maestro',      emoji: '🏆', color: '#F59E0B' },
  { num: 8, min: 6000,  max: 9999,   nombre: 'Experto',      emoji: '🌟', color: '#F2A900' },
  { num: 9, min: 10000, max: 999999, nombre: 'Leyenda NAE',  emoji: '💎', color: '#FFD700' },
];

// Devuelve el nivel correspondiente a una cantidad de puntos
export function getNivel(pts = 0) {
  return NIVELES.find(n => pts >= n.min && pts <= n.max) || NIVELES[0];
}

// Devuelve el nivel siguiente (para la barra de progreso)
export function getSiguienteNivel(pts = 0) {
  return NIVELES.find(n => n.min > pts) || null;
}

// ── ESCAPE HTML (prevenir inyección XSS) ────────────────────────────────────
export function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ── GENERAR INICIALES Y COLOR DE AVATAR ─────────────────────────────────────
export function iniciales(nombre = '') {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Color determinístico a partir de un texto (mismo usuario = mismo color)
export function colorAvatar(seed = '') {
  const paletas = [
    ['#1a3a6b', '#6ba3f2'], ['#0a3d1a', '#6bf2a9'], ['#2a1a0a', '#f2a96b'],
    ['#1a0a3d', '#c46bf2'], ['#3d2a0a', '#f2d06b'], ['#0a3d3d', '#6bf2f2'],
    ['#3d0a28', '#f26b9e'], ['#0a283d', '#6b9ef2'],
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return paletas[Math.abs(h) % paletas.length];
}

// ── FORMATO DE FECHA RELATIVA ("Hace 2 horas", "Ayer") ──────────────────────
export function tiempoRelativo(fecha) {
  const f = new Date(fecha);
  const diff = Date.now() - f.getTime();
  const min = Math.floor(diff / 60000);
  const hor = Math.floor(min / 60);
  const dia = Math.floor(hor / 24);

  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  if (hor < 24) return `Hace ${hor} hora${hor === 1 ? '' : 's'}`;
  if (dia === 1) return 'Ayer';
  if (dia < 7) return `Hace ${dia} días`;
  return f.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Formatea fecha de evento: "15 JUN"
export function fechaCorta(fecha) {
  const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const f = new Date(fecha + 'T00:00:00');
  return { dia: f.getDate(), mes: MESES[f.getMonth()], anio: f.getFullYear() };
}

// ── TOAST (notificación flotante) ───────────────────────────────────────────
export function toast(msg, tipo = 'info') {
  const t = document.createElement('div');
  t.className = 'toast toast-center';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

// Toast especial de puntos ganados
export function toastPuntos(pts, motivo) {
  const t = document.createElement('div');
  t.className = 'toast toast-points';
  t.innerHTML = `
    <span class="toast-icon">⭐</span>
    <div>
      <div class="toast-title">+${pts} punto${pts > 1 ? 's' : ''}</div>
      <div class="toast-sub">${escapeHtml(motivo)}</div>
    </div>
  `;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ── FORMATEAR NÚMEROS (1,234) ───────────────────────────────────────────────
export function formatNum(n) {
  return Number(n || 0).toLocaleString('es-PE');
}

// ── DEBOUNCE (para inputs de búsqueda) ──────────────────────────────────────
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ── VALIDACIÓN DE EMAIL ─────────────────────────────────────────────────────
export function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
