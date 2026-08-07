// ============================================================================
// PROYECTO Z — markdown.js
// Parser de Markdown mínimo y SEGURO (escapa HTML antes de aplicar formato).
// Soporta: **negrita**, *cursiva*, `código`, # títulos, - listas, > citas,
// [links](url), saltos de línea y emojis.
// ============================================================================

import { escapeHtml } from './utils.js';

export function parseMarkdown(raw = '') {
  if (!raw) return '';

  // 1. Escapar TODO el HTML primero (previene inyección XSS)
  let text = escapeHtml(raw);

  // 1.5 EXTRAER YOUTUBE LINKS Y CONVERTIRLOS EN MINIATURAS (THUMBNAILS)
  // Se muestra una imagen estática. Al hacer click, se carga el reproductor real.
  const ytEmbeds = [];
  
  // Función para generar el HTML de la miniatura
  function makeYtThumb(videoId) {
    const thumb = `<div class="yt-preview" onclick="window.__openVideoViewer('${videoId}')">
      <img src="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" class="yt-thumb-img" alt="Video">
      <div class="yt-play-btn">
        <svg width="48" height="34" viewBox="0 0 68 48"><path class="yt-play-bg" d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"></path><path d="M45 24 27 14v20" fill="#fff"></path></svg>
      </div>
    </div>`;
    ytEmbeds.push(thumb);
    return `__YT_EMBED_${ytEmbeds.length - 1}__`;
  }

  // Formato 1: https://www.youtube.com/watch?v=VIDEO_ID
  text = text.replace(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})(?:[^\s<]*)?/g, (match, videoId) => makeYtThumb(videoId));

  // Formato 2: https://youtu.be/VIDEO_ID
  text = text.replace(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([\w-]{11})(?:[^\s<]*)?/g, (match, videoId) => makeYtThumb(videoId));

  // 2. Bloques de código ``` ... ``` (se procesan antes que todo)
  text = text.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre class="md-codeblock"><code>${code.trim()}</code></pre>`
  );

  // 3. Procesar línea por línea para títulos, listas, citas, separadores
  const lines = text.split('\n');
  const out = [];
  let inList = false;

  for (let line of lines) {
    const t = line.trim();

    // Separador horizontal
    if (/^---+$/.test(t)) { if (inList) { out.push('</ul>'); inList = false; } out.push('<hr>'); continue; }

    // Títulos: ###, ##, #
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = h[1].length;
      out.push(`<h${level} class="md-h${level}">${h[2]}</h${level}>`);
      continue;
    }

    // Cita: >
    if (/^&gt;\s?/.test(t)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<blockquote class="md-quote">${t.replace(/^&gt;\s?/, '')}</blockquote>`);
      continue;
    }

    // Lista: - o *
    if (/^[-*]\s+/.test(t)) {
      if (!inList) { out.push('<ul class="md-list">'); inList = true; }
      out.push(`<li>${t.replace(/^[-*]\s+/, '')}</li>`);
      continue;
    }

    // Línea vacía → cerrar lista
    if (t === '') {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('');
      continue;
    }

    // Línea normal (párrafo)
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p class="md-p">${t}</p>`);
  }
  if (inList) out.push('</ul>');

  // 4. Unir y aplicar formato inline (negrita, cursiva, código, links)
  let html = out.join('\n');

  // Inline code `...` (antes que cursiva para no romper)
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

  // Links [texto](url) — solo http/https seguros
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');

  // Negrita **
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Cursiva *
  html = html.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  // 5. Reemplazar placeholders de YouTube por marcadores limpios
  ytEmbeds.forEach((embed, i) => {
    // En lugar de insertar el HTML complejo acá, dejamos un marcador simple.
    // El render del post (comunidad.js) detectará este marcador y lo separará del texto.
    html = html.replace(new RegExp(`<p class="md-p">__YT_EMBED_${i}__</p>`, 'g'), `<!--YT_EMBED_${i}-->`);
    html = html.replace(new RegExp(`__YT_EMBED_${i}__`, 'g'), `<!--YT_EMBED_${i}-->`);
  });

  return { html: html, embeds: ytEmbeds };
}

// ── FUNCIÓN GLOBAL: Expandir/Cerrar miniatura de YouTube ───────────────────
window.__playYt = function(el) {
  const videoId = el.getAttribute('data-video-id');
  if (!videoId) return;
  
  // Reemplazar el contenido por el iframe (reproductor real)
  el.classList.add('playing');
  el.onclick = null; // Evitar doble click
  
  el.innerHTML = `
    <div class="yt-player-wrap">
      <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1" 
        frameborder="0" 
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen></iframe>
      <div class="yt-nae-watermark">◆ NAE</div>
    </div>
    <button class="yt-close-btn" onclick="window.__closeYt(event, '${videoId}')">✕ Cerrar video</button>
  `;
};

// ── FUNCIÓN GLOBAL: Cerrar video y volver a la miniatura ────────────────────
window.__closeYt = function(event, videoId) {
  event.stopPropagation();
  const container = event.target.parentElement;
  if (!container) return;
  
  // Restaurar la miniatura
  container.classList.remove('playing');
  container.setAttribute('data-video-id', videoId);
  container.onclick = function() { window.__playYt(this); };
  
  container.innerHTML = `
    <img src="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" class="yt-thumb-img" alt="Video">
    <div class="yt-play-btn">
      <svg width="48" height="34" viewBox="0 0 68 48"><path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"></path><path d="M45 24 27 14v20" fill="#fff"></path></svg>
    </div>
  `;
};
