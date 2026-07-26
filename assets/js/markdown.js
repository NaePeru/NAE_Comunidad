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

  // 1.5 EXTRAER YOUTUBE LINKS ANTES DE QUE EL PARSER LOS ROMPA
  // Guardamos los embeds en un array y los reemplazamos por placeholders únicos
  const ytEmbeds = [];
  
  // Formato 1: https://www.youtube.com/watch?v=VIDEO_ID
  text = text.replace(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})(?:[^\s<]*)?/g, (match, videoId) => {
    const embed = `<div class="video-wrap" oncontextmenu="return false;" style="margin:12px 0; position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; border:1px solid var(--border);">
      <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1" 
        style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" 
        frameborder="0" 
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen></iframe>
      <div style="position:absolute; bottom:0; right:0; width:140px; height:50px; background:var(--bg); z-index:10; pointer-events:none; display:flex; align-items:center; justify-content:center; border-top-left-radius:8px;">
        <span style="font-family:var(--font-display); font-weight:700; font-size:16px; color:#3B82F6;">◆ NAE</span>
      </div>
    </div>`;
    ytEmbeds.push(embed);
    return `__YT_EMBED_${ytEmbeds.length - 1}__`;
  });

  // Formato 2: https://youtu.be/VIDEO_ID
  text = text.replace(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([\w-]{11})(?:[^\s<]*)?/g, (match, videoId) => {
    const embed = `<div class="video-wrap" oncontextmenu="return false;" style="margin:12px 0; position:relative; padding-bottom:56.25%; height:0; overflow:hidden; border-radius:12px; border:1px solid var(--border);">
      <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1" 
        style="position:absolute; top:0; left:0; width:100%; height:100%; border:0;" 
        frameborder="0" 
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen></iframe>
      <div style="position:absolute; bottom:0; right:0; width:140px; height:50px; background:var(--bg); z-index:10; pointer-events:none; display:flex; align-items:center; justify-content:center; border-top-left-radius:8px;">
        <span style="font-family:var(--font-display); font-weight:700; font-size:16px; color:#3B82F6;">◆ NAE</span>
      </div>
    </div>`;
    ytEmbeds.push(embed);
    return `__YT_EMBED_${ytEmbeds.length - 1}__`;
  });

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

  // 5. Reemplazar placeholders de YouTube por los embeds reales
  ytEmbeds.forEach((embed, i) => {
    // El placeholder puede estar dentro de un <p> (en una línea de párrafo)
    // Lo reemplazamos y limpiamos etiquetas <p> vacías que puedan quedar
    html = html.replace(new RegExp(`<p class="md-p">__YT_EMBED_${i}__</p>`, 'g'), embed);
    html = html.replace(new RegExp(`__YT_EMBED_${i}__`, 'g'), embed);
  });

  return html;
}
