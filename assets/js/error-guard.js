// ============================================================================
// PROYECTO Z — error-guard.js (cargar PRIMERO en todas las páginas)
// ============================================================================
// Red de seguridad global: captura errores JS no manejados para que el
// usuario nunca vea una pantalla en blanco. En vez de eso, muestra un
// mensaje claro con botón de recargar.
//
// Este archivo NO es un módulo ES (se carga con <script> normal) para que
// se ejecute ANTES que cualquier otro JS y pueda capturar errores tempranos.
// ============================================================================

(function () {
  'use strict';

  var installed = window.__errorGuardInstalled;
  if (installed) return;
  window.__errorGuardInstalled = true;

  // Errores síncronos (TypeError, ReferenceError, etc.)
  window.addEventListener('error', function (e) {
    console.error('Error capturado:', e.error || e.message);
    mostrarPantallaError(e.message || 'Error desconocido');
  });

  // Promesas rechazadas sin catch
  window.addEventListener('unhandledrejection', function (e) {
    console.error('Promesa rechazada:', e.reason);
    // Para promesas usamos toast porque pueden ser fallos no críticos
    mostrarToast('⚠️ Algo falló. Si persiste, recargá la página.');
  });

  function mostrarToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed; bottom:20px; left:50%; transform:translateX(-50%);' +
      'background:#1f2937; color:#fff; padding:12px 20px; border-radius:8px;' +
      'font-size:13px; z-index:99999; font-family:system-ui,sans-serif;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.3); transition:opacity 0.3s;';
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, 3000);
  }

  function mostrarPantallaError(mensaje) {
    if (document.getElementById('fatal-error-screen')) return;
    if (!document.body) {
      // El body ni cargó — esperar
      document.addEventListener('DOMContentLoaded', function () {
        mostrarPantallaError(mensaje);
      });
      return;
    }

    var div = document.createElement('div');
    div.id = 'fatal-error-screen';
    div.style.cssText =
      'position:fixed; inset:0; z-index:99999; background:#0B0F19; color:#fff;' +
      'display:flex; align-items:center; justify-content:center; padding:20px;' +
      'text-align:center; font-family:system-ui,-apple-system,sans-serif;';
    div.innerHTML =
      '<div style="max-width:420px;">' +
        '<div style="font-size:56px; margin-bottom:16px;">😵</div>' +
        '<h2 style="font-size:22px; font-weight:700; margin-bottom:10px;">Algo salió mal</h2>' +
        '<p style="font-size:14px; color:#94A3B8; line-height:1.6; margin-bottom:24px;">' +
          'Se produjo un error inesperado. Probá recargar la página.<br>' +
          'Si el problema continúa, escribinos por WhatsApp.' +
        '</p>' +
        '<button onclick="location.reload()" style="' +
          'background:#F2A900; color:#000; border:none; padding:12px 24px;' +
          'border-radius:8px; font-weight:700; cursor:pointer; font-size:14px;' +
          'margin-bottom:10px; width:100%;">🔄 Recargar página</button>' +
        '<a href="https://wa.me/51988502354" target="_blank" style="' +
          'display:block; color:#94A3B8; font-size:13px; text-decoration:none;">' +
          '💬 Contactar soporte</a>' +
      '</div>';
    document.body.appendChild(div);
  }
})();
