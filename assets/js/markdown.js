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

  return html;
}
