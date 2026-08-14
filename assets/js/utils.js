// ============================================================================
// PROYECTO Z — utils.js
// Funciones auxiliares reutilizables en toda la plataforma.
// ============================================================================

// ── SISTEMA DE NIVELES NAE (8 niveles — temática Dragon Ball Z) ────────────
export const NIVELES = [
  { num: 1, min: 0,     max: 99,     nombre: 'Humano',            emoji: '🧍', color: '#6B7280' },
  { num: 2, min: 100,   max: 299,    nombre: 'Kaio-ken',          emoji: '🔴', color: '#EF4444' },
  { num: 3, min: 300,   max: 799,    nombre: 'Saiyajín',          emoji: '🐵', color: '#F59E0B' },
  { num: 4, min: 800,   max: 1499,   nombre: 'Súper Saiyajín',    emoji: '💛', color: '#FBBF24' },
  { num: 5, min: 1500,  max: 2999,   nombre: 'Súper Saiyajín 2',  emoji: '⚡', color: '#FACC15' },
  { num: 6, min: 3000,  max: 4999,   nombre: 'Súper Saiyajín 3',  emoji: '🌪️', color: '#A78BFA' },
  { num: 7, min: 5000,  max: 9999,   nombre: 'Saiyajin Dios',     emoji: '🔵', color: '#3B82F6' },
  { num: 8, min: 10000, max: 999999, nombre: 'Súper Saiyajin Blue',emoji: '🔱', color: '#06B6D4' },
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

// ── RED DE SEGURIDAD GLOBAL ────────────────────────────────────────────────
// Captura cualquier error JS no manejado y muestra un mensaje claro al
// usuario en vez de dejar la pantalla en blanco. Solo se instala una vez.
// Importa este módulo desde cualquier página y la red queda activa.
let _errorGuardInstalado = false;
export function instalarErrorGlobal() {
  if (_errorGuardInstalado) return;
  _errorGuardInstalado = true;

  // Errores síncronos (TypeError, ReferenceError, etc.)
  window.addEventListener('error', (e) => {
    console.error('Error capturado:', e.error || e.message);
    mostrarPantallaError(e.message || 'Error desconocido');
  });

  // Promesas rechazadas sin catch (async/await sin try/catch)
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Promesa rechazada:', e.reason);
    // Para promesas, solo mostramos toast (no bloqueamos toda la pantalla)
    // porque pueden ser fallos no críticos (ej: un like que falló)
    toast('⚠️ Algo falló en segundo plano. Si persiste, recargá la página.');
  });
}

function mostrarPantallaError(mensaje) {
  // Si ya hay una pantalla de error, no la duplicamos
  if (document.getElementById('fatal-error-screen')) return;
  // Si el body ni siquiera cargó, no podemos hacer nada
  if (!document.body) return;

  const div = document.createElement('div');
  div.id = 'fatal-error-screen';
  div.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:#0B0F19; color:#fff;
    display:flex; align-items:center; justify-content:center;
    padding:20px; text-align:center;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  div.innerHTML = `
    <div style="max-width:420px;">
      <div style="font-size:56px; margin-bottom:16px;">😵</div>
      <h2 style="font-size:22px; font-weight:700; margin-bottom:10px;">
        Algo salió mal
      </h2>
      <p style="font-size:14px; color:#94A3B8; line-height:1.6; margin-bottom:24px;">
        Se produjo un error inesperado. Probá recargar la página.<br>
        Si el problema continúa, escribinos por WhatsApp.
      </p>
      <button onclick="location.reload()" style="
        background:#F2A900; color:#000; border:none;
        padding:12px 24px; border-radius:8px; font-weight:700;
        cursor:pointer; font-size:14px; margin-bottom:10px; width:100%;
      ">🔄 Recargar página</button>
      <a href="https://wa.me/51988502354" target="_blank" style="
        display:block; color:#94A3B8; font-size:13px; text-decoration:none;
      ">💬 Contactar soporte</a>
    </div>
  `;
  document.body.appendChild(div);
}
