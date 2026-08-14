// ============================================================================
// PROYECTO Z — eventos.js
// Calendario de seminarios en vivo. Cargar, crear (admin), borrar (admin).
// ============================================================================

import { supabase } from './supabase-client.js';
import { session, esAdmin } from './auth.js';
import { escapeHtml, toast } from './utils.js';

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// Cache de eventos cargados (para precargar el modal al editar).
let eventosCache = [];
export function getEventoById(id) { return eventosCache.find(e => e.id === id) || null; }

const TIPO_INFO = {
  webinar: { emoji: '📡', label: 'Webinar', cls: 'type-webinar' },
  clase:   { emoji: '🎥', label: 'Clase en vivo', cls: 'type-clase' },
  qna:     { emoji: '💬', label: 'Q&A', cls: 'type-qna' },
  otro:    { emoji: '📌', label: 'Evento', cls: 'type-otro' },
};

// ── CARGAR EVENTOS ──────────────────────────────────────────────────────────
export async function cargarEventos() {
  const list = document.getElementById('eventos-list');
  if (!list) return;

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('fecha', { ascending: true });

  if (error) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar eventos.</div>';
    return;
  }

  // Guardar en cache para poder precargar datos al editar (evita perder info).
  eventosCache = data || [];

  // Filtrar por fecha Y hora reales (para no cerrar un evento antes de hora)
  const ahora = Date.now();
  const proximos = eventosCache.filter(e => {
    const fechaCompleta = new Date(`${e.fecha}T${e.hora || '23:59:59'}`);
    return fechaCompleta.getTime() >= ahora;
  });
  const pasados = eventosCache.filter(e => {
    const fechaCompleta = new Date(`${e.fecha}T${e.hora || '00:00:00'}`);
    return fechaCompleta.getTime() < ahora;
  }).reverse().slice(0, 3);

  if (proximos.length === 0 && pasados.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        No hay eventos programados.${esAdmin() ? '<br>Creá el primer seminario con el botón de arriba.' : ''}
      </div>`;
    return;
  }

  let html = '';
  if (proximos.length > 0) {
    html += '<div class="event-section-title">📌 Próximos seminarios</div>';
    html += proximos.map(e => renderEvento(e)).join('');
  }
  if (pasados.length > 0) {
    html += '<div class="event-section-title">📼 Grabaciones recientes</div>';
    html += pasados.map(e => renderEvento(e, true)).join('');
  }
  list.innerHTML = html;
}

// ── RENDER EVENTO ───────────────────────────────────────────────────────────
function renderEvento(e, esPasado = false) {
  const fecha = new Date(e.fecha + 'T00:00:00');
  const dia = fecha.getDate();
  const mes = MESES[fecha.getMonth()];
  const diaSemana = DIAS[fecha.getDay()];
  const tipo = TIPO_INFO[e.tipo] || TIPO_INFO.otro;
  const hora = e.hora ? e.hora.substring(0, 5) : '';

  // ¿Es hoy y la hora ya pasó / está cerca?
  const hoyStr = new Date().toISOString().split('T')[0];
  const esHoy = e.fecha === hoyStr;
  const esLiveNow = false; // por ahora sin detección de live (se puede agregar)

  const joinBtn = (e.link && !esPasado)
    ? `<a href="${escapeHtml(e.link)}" target="_blank" rel="noopener" class="event-btn join">🎥 Unirse al seminario →</a>`
    : '';

  const addToCalendar = !esPasado
    ? `<button class="event-btn" onclick="window.__addCalendar('${escapeHtml(e.titulo)}','${e.fecha}','${hora}')">📅 Agregar al calendario</button>`
    : '';

  const adminBtns = esAdmin()
    ? `<button class="event-btn" onclick="window.__editarEvento('${e.id}')" style="color:var(--muted2);">✏️ Editar</button>
       <button class="event-btn" onclick="window.__borrarEvento('${e.id}')" style="color:#ff6b6b;">🗑️ Eliminar</button>`
    : '';

  const liveBadge = esHoy ? '<span class="live-badge">🔴 HOY</span>' : '';

  return `
    <div class="event-card${esPasado ? ' past' : ''}${esLiveNow ? ' live-now' : ''}">
      <div class="event-date">
        <div class="event-date-day">${dia}</div>
        <div class="event-date-month">${mes}</div>
        <div class="event-date-weekday">${diaSemana}</div>
      </div>
      <div class="event-body">
        <div class="event-title">
          ${escapeHtml(e.titulo)}
          ${liveBadge}
        </div>
        <div class="event-meta">
          <span class="event-type-badge ${tipo.cls}">${tipo.emoji} ${tipo.label}</span>
          ${hora ? `<span class="event-meta-item">🕐 ${hora}</span>` : ''}
          <span class="event-meta-item">📅 ${fecha.toLocaleDateString('es-PE', { day:'numeric', month:'long', year:'numeric' })}</span>
        </div>
        ${e.descripcion ? `<div class="event-desc">${escapeHtml(e.descripcion)}</div>` : ''}
        <div class="event-actions">
          ${joinBtn}
          ${addToCalendar}
          ${adminBtns}
        </div>
      </div>
    </div>`;
}

// ── CREAR / EDITAR EVENTO (admin) ───────────────────────────────────────────
export async function guardarEvento(formData) {
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return { error: true }; }
  const datos = {
    titulo: formData.titulo.trim(),
    tipo: formData.tipo,
    fecha: formData.fecha,
    hora: formData.hora || null,
    descripcion: formData.descripcion?.trim() || null,
    link: formData.link?.trim() || null,
    creado_por: session.user.id,
  };
  if (!datos.titulo || !datos.fecha) { toast('⚠️ Falta título y fecha'); return { error: true }; }

  let result;
  if (formData.id) {
    result = await supabase.from('events').update(datos).eq('id', formData.id);
  } else {
    result = await supabase.from('events').insert(datos);
  }
  if (result.error) { toast('⚠️ Error: ' + result.error.message); return { error: true }; }
  toast(formData.id ? '✅ Evento actualizado' : '✅ Evento creado');
  await cargarEventos();
  return { error: null };
}

// ── BORRAR EVENTO (admin) ───────────────────────────────────────────────────
export async function borrarEvento(id) {
  if (!confirm('¿Eliminar este evento?')) return;
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) { toast('⚠️ No se pudo eliminar'); return; }
  toast('🗑️ Evento eliminado');
  await cargarEventos();
}

// ── AGREGAR A GOOGLE CALENDAR ───────────────────────────────────────────────
function addCalendar(titulo, fecha, hora) {
  // FIX: antes calculaba "hora + 2" con parseInt, lo que generaba horas
  // inválidas como 25:00 para eventos tardíos (ej: 23:00 → 25:00).
  // Ahora usamos Date para manejar el rollo de medianoche correctamente.
  const base = hora ? `${fecha}T${hora}:00` : `${fecha}T18:00:00`;
  const inicio = new Date(base);
  const fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000); // +2 horas
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const text = encodeURIComponent('NAE — ' + titulo);
  const details = encodeURIComponent('Seminario en vivo de la comunidad NAE');
  const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(inicio)}/${fmt(fin)}&details=${details}`;
  window.open(url, '_blank');
}

// ── EXPORTAR ────────────────────────────────────────────────────────────────
window.__addCalendar = addCalendar;
window.__borrarEvento = borrarEvento;
window.__editarEvento = (id) => { if (typeof window.__openEventoModal === 'function') window.__openEventoModal(id); };
