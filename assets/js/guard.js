// ============================================================================
// PROYECTO Z — guard.js
// Verifica si el usuario tiene acceso aprobado. Si no, bloquea la pantalla.
// ============================================================================

import { estadoMembresia } from './auth.js';

// Llamar al inicio de cada página (después de cargarPerfilCompleto).
// Devuelve 'true' si puede usar la página, 'false' si está bloqueado.
export function verificarAcceso() {
  const estado = estadoMembresia();

  if (estado === 'activa' || estado === 'trial') {
    return true; // Acceso total
  }

  // Si está suspendido, pendiente o rechazado, mostramos mensaje
  let titulo = '⏳ Acceso en revisión';
  let msg = 'Tu cuenta está siendo revisada por el administrador.';
  let icono = '⏳';

  if (estado === 'suspendida') {
    titulo = '🔒 Acceso suspendido';
    msg = 'Tu acceso a la plataforma ha sido suspendido. Si crees que es un error, contactános.';
    icono = '🔒';
  } else if (estado === 'rechazada') {
    titulo = '🚫 Solicitud rechazada';
    msg = 'Lamentablemente, tu solicitud de ingreso a la comunidad fue rechazada.';
    icono = '🚫';
  }

  // Bloquear la pantalla
  document.body.innerHTML = `
    <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg); padding:20px; text-align:center;">
      <div style="max-width: 450px;">
        <div style="font-size: 70px; margin-bottom: 24px;">${icono}</div>
        <h1 style="font-family: var(--font-display); font-size: 28px; font-weight: 800; color: var(--text); margin-bottom: 16px;">${titulo}</h1>
        <p style="font-size: 15px; color: var(--muted); line-height: 1.6; margin-bottom: 32px;">${msg}</p>
        
        <div style="background: var(--card); border: 1px solid var(--border); padding: 20px; border-radius: 16px; margin-bottom: 24px;">
          <p style="font-size: 13px; color: var(--muted); margin-bottom: 8px;">¿Necesitás ayuda?</p>
          <a href="https://wa.me/51974688863" target="_blank" class="btn btn-primary" style="width: 100%;">
            💬 Escribir por WhatsApp
          </a>
        </div>

        <button onclick="window.__logoutApp()" style="background: none; border: none; color: var(--muted); font-size: 13px; cursor: pointer; text-decoration: underline;">
          Cerrar sesión
        </button>
      </div>
    </div>
  `;

  window.__logoutApp = async () => {
    const { supabase } = await import('./supabase-client.js');
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  };

  return false;
}
