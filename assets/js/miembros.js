// ============================================================================
// PROYECTO Z — miembros.js
// Leaderboard semanal (ventana de 7 días, estilo Skool) + ranking total.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session } from './auth.js';
import { escapeHtml, iniciales, colorAvatar, getNivel, formatNum } from './utils.js';
import { renderAvatar } from './storage.js';

// ── CARGAR LEADERBOARD SEMANAL ──────────────────────────────────────────────
export async function cargarLeaderboard() {
  // Usamos la vista leaderboard_semanal que calcula puntos de últimos 7 días
  const { data, error } = await supabase
    .from('leaderboard_semanal')
    .select('id, nombre, avatar_url, color, puntos_semana, posicion')
    .order('posicion', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Error cargando leaderboard:', error);
    document.getElementById('lb-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar el ranking.</div>';
    return;
  }

  // Filtrar los que tienen 0 puntos (no aportaron esta semana)
  const activos = (data || []).filter(u => u.puntos_semana > 0);

  if (activos.length === 0) {
    document.getElementById('lb-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        Aún no hay actividad esta semana.<br>
        ¡Sé el primero en aportar y liderar el ranking!
      </div>`;
    return;
  }

  const myId = session.user?.id;
  document.getElementById('lb-list').innerHTML = activos.map((u, i) =>
    renderFila(u, i, myId, 'semana')
  ).join('');
}

// ── CARGAR RANKING TOTAL (histórico) ────────────────────────────────────────
export async function cargarRankingTotal() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, avatar_url, color, puntos')
    .order('puntos', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error cargando ranking total:', error);
    return;
  }

  const activos = (data || []).filter(u => u.puntos > 0);
  if (activos.length === 0) {
    document.getElementById('lb-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        Aún no hay datos históricos.
      </div>`;
    return;
  }

  const myId = session.user?.id;
  document.getElementById('lb-list').innerHTML = activos.map((u, i) =>
    renderFila(u, i, myId, 'total')
  ).join('');
}

// ── RENDER FILA ─────────────────────────────────────────────────────────────
function renderFila(u, i, myId, tipo) {
  // Para tab "semana" usamos puntos_semana; para "total" usamos puntos
  const puntosParaNivel = tipo === 'semana' ? (u.puntos_totales_perfil || 0) : (u.puntos || 0);
  const nivel = getNivel(puntosParaNivel);
  const soy = u.id === myId;
  const medallas = ['gold', 'silver', 'bronze'];
  const emojis = ['🥇', '🥈', '🥉'];
  const ptsNum = tipo === 'semana' ? u.puntos_semana : u.puntos;

  const [c1, c2] = u.color || colorAvatar(u.nombre);
  const avatarHtml = u.avatar_url
    ? `<img src="${u.avatar_url}" class="avatar avatar-md" style="object-fit:cover;" alt="${escapeHtml(u.nombre)}" onerror="this.style.display='none';">`
    : `<div class="avatar avatar-md" style="background:${c1};color:${c2};">${escapeHtml(iniciales(u.nombre))}</div>`;

  return `
    <div class="lb-row${i === 0 ? ' lb-top1' : ''}${soy ? ' lb-me' : ''}">
      <div class="lb-pos ${medallas[i] || ''}">${emojis[i] || (i + 1)}</div>
      ${avatarHtml}
      <div class="lb-info">
        <div class="lb-name">
          ${escapeHtml(u.nombre)}
          ${soy ? '<span class="badge badge-muted" style="font-size:9px;">TÚ</span>' : ''}
        </div>
        <div class="lb-sub">${nivel.emoji} ${nivel.nombre}</div>
      </div>
      <div class="lb-pts">${formatNum(ptsNum || 0)}</div>
    </div>`;
}

// ── ESTADÍSTICAS DE LA COMUNIDAD ────────────────────────────────────────────
export async function cargarStatsComunidad() {
  // Total de miembros
  const { count: totalMiembros } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true);

  // Posts totales
  const { count: totalPosts } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true });

  // Activos esta semana (con puntos > 0)
  const { count: activosSemana } = await supabase
    .from('leaderboard_semanal')
    .select('id', { count: 'exact', head: true })
    .gt('puntos_semana', 0);

  document.getElementById('stat-miembros').textContent = formatNum(totalMiembros || 0);
  document.getElementById('stat-posts').textContent = formatNum(totalPosts || 0);
  document.getElementById('stat-activos').textContent = formatNum(activosSemana || 0);
}
