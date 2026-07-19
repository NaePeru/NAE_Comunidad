// ============================================================================
// PROYECTO Z — notificaciones.js
// Lógica de la campana de notificaciones.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session } from './auth.js';
import { escapeHtml, iniciales, colorAvatar, tiempoRelativo } from './utils.js';

let notifSubscription = null;

// ── INICIALIZAR (se llama desde navbar.js) ──────────────────────────────────
export async function initNotificaciones() {
  if (!session.user) return;

  // 1. Cargar contador inicial
  await actualizarContador();

  // 2. Suscribirse a cambios en tiempo real (para que suene al instante)
  if (!notifSubscription) {
    notifSubscription = supabase
      .channel('notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` },
        () => actualizarContador()
      )
      .subscribe();
  }
}

// ── ACTUALIZAR EL CONTADOR (badge rojo) ─────────────────────────────────────
async function actualizarContador() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('read', false);

  if (error) return;

  const badge = document.getElementById('navbar-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }
}

// ── MOSTRAR EL PANEL DE NOTIFICACIONES ──────────────────────────────────────
export async function togglePanelNotificaciones() {
  let panel = document.getElementById('notif-panel');
  
  if (panel) {
    panel.classList.toggle('open');
    // Si se cerró, no hacemos nada más
    if (!panel.classList.contains('open')) return;
  } else {
    // Crear el panel la primera vez
    panel = document.createElement('div');
    panel.id = 'notif-panel';
    panel.className = 'notif-panel open';
    document.body.appendChild(panel);
  }

  // Cargar notificaciones
  panel.innerHTML = '<div class="notif-loading">Cargando...</div>';

  const { data: notifs, error } = await supabase
    .from('notifications')
    .select('id, type, read, created_at, actor_id, post_id')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) {
    panel.innerHTML = '<div class="notif-empty">Error al cargar.</div>';
    return;
  }

  if (!notifs || notifs.length === 0) {
    panel.innerHTML = `
      <div class="notif-header">Notificaciones</div>
      <div class="notif-empty">
        <div style="font-size:32px;margin-bottom:8px;">🔕</div>
        No tienes notificaciones por ahora.
      </div>`;
    return;
  }

  // Buscar info de los usuarios que generaron la notif
  const actorIds = [...new Set(notifs.map(n => n.actor_id).filter(Boolean))];
  const { data: perfiles } = await supabase
    .from('profiles')
    .select('id, nombre, avatar_url, color')
    .in('id', actorIds);
  const perfilMap = {};
  (perfiles || []).forEach(p => perfilMap[p.id] = p);

  panel.innerHTML = `
    <div class="notif-header">
      Notificaciones
      <button class="notif-mark-all" onclick="window.__markAllRead()">Marcar todas como leídas</button>
    </div>
    <div class="notif-list">
      ${notifs.map(n => {
        const actor = perfilMap[n.actor_id] || { nombre: 'Alguien' };
        const [c1, c2] = actor.color || colorAvatar(actor.nombre);
        const avatarHtml = actor.avatar_url 
          ? `<img src="${actor.avatar_url}" class="notif-avatar" alt="">` 
          : `<div class="notif-avatar" style="background:${c1};color:${c2};">${escapeHtml(iniciales(actor.nombre))}</div>`;
        
        let icono = '❤️';
        let texto = 'le dio me gusta a tu publicación.';
        if (n.type === 'comment') {
          icono = '💬';
          texto = 'comentó en tu publicación.';
        }

        return `
          <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="window.__goToPost('${n.post_id}')">
            ${avatarHtml}
            <div class="notif-content">
              <div class="notif-text">
                <strong>${escapeHtml(actor.nombre)}</strong> ${texto}
              </div>
              <div class="notif-time">${tiempoRelativo(n.created_at)}</div>
            </div>
            <div class="notif-icon">${icono}</div>
          </div>`;
      }).join('')}
    </div>
  `;

  // Marcar como leídas automáticamente al abrir
  await marcarTodasComoLeidas();
}

// ── MARCAR TODAS COMO LEÍDAS ────────────────────────────────────────────────
async function marcarTodasComoLeidas() {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', session.user.id)
    .eq('read', false);

  if (!error) {
    // Quitar el badge rojo después de un pequeño delay visual
    setTimeout(() => {
      const badge = document.getElementById('navbar-badge');
      if (badge) badge.classList.remove('show');
      // Actualizar clases visuales en la lista
      document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.replace('unread', 'read'));
    }, 1000);
  }
}

// ── EXPORTAR FUNCIONES AL WINDOW ────────────────────────────────────────────
window.__toggleNotif = togglePanelNotificaciones;
window.__markAllRead = marcarTodasComoLeidas;
window.__goToPost = (postId) => {
  // Cerrar panel y redirigir (por ahora solo va a la comunidad)
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.remove('open');
  window.location.href = 'comunidad.html';
};
