// ============================================================================
// PROYECTO Z — certificados.js
// Sistema de certificados NAE:
//   - Calcula progreso por módulo (Excel / Power BI / Completo)
//   - Emite certificados vía RPC `emitir_certificado` (server-side verification)
//   - Genera PDF descargable con jsPDF
// ============================================================================

import { supabase } from './supabase-client.js';
import { session } from './auth.js';
import { toast, escapeHtml } from './utils.js';

// ── DEFINICIÓN DE MÓDULOS Y SLUGS ──────────────────────────────────────────
// Deben coincidir con los slugs reales en la BD
const MODULOS = {
  excel: {
    titulo: 'Analista de Datos en Excel',
    descripcion: 'Completar: Excel Nivel 1, 2, 3 y 4 (Análisis de Datos)',
    slugs: ['excel-nivel-1', 'excel-nivel-2', 'excel-nivel-3', 'excel-nivel-4'],
    color: '#217346',
    emoji: '📗',
  },
  powerbi: {
    titulo: 'Analista de Datos en Power BI',
    descripcion: 'Completar: Power BI Nivel 1, 2 y 3',
    slugs: ['power-bi-nivel-1', 'power-bi-nivel-2', 'power-bi-nivel-3'],
    color: '#e8590c',
    emoji: '📊',
  },
  completo: {
    titulo: 'Analista de Datos',
    descripcion: 'Completar ambos módulos: Excel (1-4) + Power BI (1-3)',
    slugs: [
      'excel-nivel-1', 'excel-nivel-2', 'excel-nivel-3', 'excel-nivel-4',
      'power-bi-nivel-1', 'power-bi-nivel-2', 'power-bi-nivel-3',
    ],
    color: '#3B82F6',
    emoji: '🏆',
  },
};

// ── CARGAR PROGRESO POR MÓDULO ──────────────────────────────────────────────
// Devuelve { [moduloKey]: { total, done, pct, slugs } }
async function cargarProgresoModulos() {
  const userId = session.user.id;

  // Traer todos los slugs involucrados
  const todosSlugs = [
    ...MODULOS.excel.slugs,
    ...MODULOS.powerbi.slugs,
  ];

  // 1. Cursos del módulo
  const { data: cursos, error: errCursos } = await supabase
    .from('courses')
    .select('id, slug, titulo')
    .in('slug', todosSlugs);

  if (errCursos) throw errCursos;
  const cursoIds = (cursos || []).map(c => c.id);

  // 2. Total de lecciones por curso
  const { data: lecciones, error: errLecc } = await supabase
    .from('lessons')
    .select('id, course_id')
    .in('course_id', cursoIds);

  if (errLecc) throw errLecc;

  // Mapa: course_id → total lecciones
  const totalPorCurso = {};
  (lecciones || []).forEach(l => {
    totalPorCurso[l.course_id] = (totalPorCurso[l.course_id] || 0) + 1;
  });
  const leccionIds = (lecciones || []).map(l => l.id);

  // 3. Lecciones completadas por el usuario
  let doneSet = new Set();
  if (leccionIds.length > 0) {
    const { data: progreso, error: errProg } = await supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId)
      .eq('completado', true)
      .in('lesson_id', leccionIds);

    if (errProg) throw errProg;
    doneSet = new Set((progreso || []).map(p => p.lesson_id));
  }

  // Mapa: course_id → done lecciones
  const donePorCurso = {};
  (lecciones || []).forEach(l => {
    if (doneSet.has(l.id)) {
      donePorCurso[l.course_id] = (donePorCurso[l.course_id] || 0) + 1;
    }
  });

  // 4. Calcular por módulo
  const resultado = {};
  for (const [key, mod] of Object.entries(MODULOS)) {
    const cursosMod = (cursos || []).filter(c => mod.slugs.includes(c.slug));
    let total = 0, done = 0;
    cursosMod.forEach(c => {
      total += totalPorCurso[c.id] || 0;
      done += donePorCurso[c.id] || 0;
    });
    resultado[key] = {
      ...mod,
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }
  return resultado;
}

// ── CARGAR CERTIFICADOS YA EMITIDOS ─────────────────────────────────────────
async function cargarCertificadosEmitidos() {
  const { data, error } = await supabase.rpc('mis_certificados');
  if (error) throw error;
  return data || [];
}

// ── EMITIR CERTIFICADO (vía RPC server-side) ────────────────────────────────
export async function emitirCertificado(tipo) {
  const { data, error } = await supabase.rpc('emitir_certificado', { p_tipo: tipo });
  if (error) throw error;
  return data;
}

// ── GENERAR PDF DEL CERTIFICADO ─────────────────────────────────────────────
// Usa jsPDF (cargado dinámicamente desde CDN)
export async function generarPDFCertificado(cert) {
  // Cargar jsPDF bajo demanda
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el generador de PDF'));
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const W = 297; // ancho A4 landscape
  const H = 210; // alto  A4 landscape

  // ── FONDO ──
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // ── BORDE EXTERIOR (azul tenue) ──
  doc.setDrawColor(70, 110, 180);     // azul bajito
  doc.setLineWidth(2);
  doc.rect(8, 8, W - 16, H - 16);

  // ── BORDE INTERIOR fino ──
  doc.setDrawColor(150, 175, 215);
  doc.setLineWidth(0.4);
  doc.rect(13, 13, W - 26, H - 26);

  // ── ENCABEZADO: LOGO + TÍTULO NAE ──
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 110, 180);
  doc.setFontSize(14);
  doc.text('◆ NAE', W / 2, 30, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 90);
  doc.setFontSize(10);
  doc.text('NEW ACADEMY EXCEL', W / 2, 37, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text('Centro de Capacitación NAE · Comunidad Virtual de Análisis de Datos', W / 2, 42, { align: 'center' });

  // Línea separadora
  doc.setDrawColor(70, 110, 180);
  doc.setLineWidth(0.6);
  doc.line(80, 47, W - 80, 47);

  // ── TÍTULO "CERTIFICADO" ──
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(26);
  doc.text('CERTIFICADO', W / 2, 62, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(11);
  doc.text('DE APROBACIÓN', W / 2, 69, { align: 'center' });

  // ── OTORGADO A ──
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text('Otorgado a:', W / 2, 82, { align: 'center' });

  // Nombre del alumno (mayúsculas)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(22);
  doc.text((cert.nombre_emisor || 'ALUMNO').toUpperCase(), W / 2, 92, { align: 'center' });

  // DNI
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  if (cert.dni) {
    doc.text(`DNI: ${cert.dni}`, W / 2, 99, { align: 'center' });
  }

  // ── TEXTO INTERMEDIO ──
  doc.setFontSize(11);
  doc.setTextColor(70, 70, 70);
  doc.text('Por completar satisfactoriamente el programa de:', W / 2, 112, { align: 'center' });

  // ── TÍTULO DEL CERTIFICADO ──
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(70, 110, 180);
  doc.setFontSize(20);
  doc.text(cert.titulo, W / 2, 123, { align: 'center' });

  // ── DETALLES: HORAS / MODALIDAD / FECHA ──
  const fechaStr = new Date(cert.emitido_en).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);

  // Tres pill-boxes
  const pills = [
    `⏱  ${cert.horas} horas`,
    `💻  Modalidad ${cert.modalidad}`,
    `📅  Emitido: ${fechaStr}`,
  ];
  const pillW = 70;
  const pillH = 8;
  const gap = 8;
  const totalPillsW = pills.length * pillW + (pills.length - 1) * gap;
  let xPill = (W - totalPillsW) / 2;
  const yPill = 138;

  pills.forEach(txt => {
    doc.setFillColor(240, 244, 252);
    doc.setDrawColor(70, 110, 180);
    doc.setLineWidth(0.3);
    doc.roundedRect(xPill, yPill, pillW, pillH, 2, 2, 'FD');
    doc.setTextColor(60, 90, 150);
    doc.setFontSize(9);
    doc.text(txt, xPill + pillW / 2, yPill + 5.4, { align: 'center' });
    xPill += pillW + gap;
  });

  // ── FIRMAS (2 firmas) ──
  const firmas = [
    { nombre: 'Geronimo Cruzado', cargo: 'Analista de Datos', x: 75 },
    { nombre: 'Jhonny Vasquez C.', cargo: 'Arquitecto de Datos', x: W - 75 },
  ];

  doc.setTextColor(40, 40, 40);
  firmas.forEach(f => {
    // Línea de firma
    doc.setDrawColor(70, 70, 70);
    doc.setLineWidth(0.5);
    doc.line(f.x - 45, 175, f.x + 45, 175);
    // Nombre
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(f.nombre, f.x, 170, { align: 'center' });
    // Cargo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(f.cargo, f.x, 181, { align: 'center' });
  });

  // ── CÓDIGO DE VERIFICACIÓN ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Código de verificación: ${cert.codigo}`, W / 2, 195, { align: 'center' });
  doc.setFontSize(7);
  doc.text('Verifica la autenticidad en nae-comunidad.vercel.app', W / 2, 199, { align: 'center' });

  // ── DESCARGAR ──
  const nombreArchivo = `Certificado_NAE_${(cert.tipo || '').toUpperCase()}_${(cert.nombre_emisor || 'alumno').replace(/\s+/g, '_')}.pdf`;
  doc.save(nombreArchivo);
}

// ── RENDER PRINCIPAL DE LA PÁGINA ───────────────────────────────────────────
export async function renderCertificados() {
  const root = document.getElementById('cert-root');
  if (!root) return;

  // Estado de carga
  root.innerHTML = `
    <div style="text-align:center;padding:60px 20px;color:var(--muted);">
      <div class="spinner" style="margin:0 auto 16px;width:32px;height:32px;border-width:3px;"></div>
      Cargando tus certificados...
    </div>
  `;

  try {
    const [progreso, emitidos] = await Promise.all([
      cargarProgresoModulos(),
      cargarCertificadosEmitidos(),
    ]);

    // Mapear emitidos por tipo
    const emitidosMap = {};
    emitidos.forEach(c => { emitidosMap[c.tipo] = c; });

    // ── Sección: Mis datos (DNI) ──
    const p = session.profile;
    const dniActual = p.dni || '';

    let html = `
      <div class="card" style="margin-bottom:24px;">
        <div style="font-weight:700;margin-bottom:6px;font-size:15px;">🪪 Mis datos de certificado</div>
        <p style="font-size:12.5px;color:var(--muted);margin:0 0 14px;">
          Tu nombre y DNI aparecerán en el certificado tal como están aquí.
          Si necesitas corregirlos, contáctanos al WhatsApp 988502354.
        </p>
        <div style="display:flex;gap:14px;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">Nombre</label>
            <div style="font-weight:700;font-size:15px;padding:6px 0;">${escapeHtml(p.nombre)}</div>
          </div>
          <div style="min-width:160px;">
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;">DNI</label>
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
              <input type="text" id="input-dni" maxlength="8" value="${escapeHtml(dniActual)}"
                placeholder="12345678"
                style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-family:var(--font-mono);font-size:13px;width:120px;color:var(--text);">
              <button class="btn btn-sm btn-ghost" id="btn-guardar-dni" onclick="window.__guardarDni(this)">Guardar</button>
            </div>
          </div>
        </div>
      </div>

      <div style="font-weight:700;margin-bottom:14px;font-size:15px;">🎓 Mis certificados</div>
      <div class="cert-grid">
    `;

    // ── Tarjetas por módulo ──
    for (const [key, mod] of Object.entries(MODULOS)) {
      const prog = progreso[key];
      const yaEmitido = emitidosMap[key];

      const completo = prog.pct >= 100 && prog.total > 0;
      const sinLecciones = prog.total === 0;

      html += `
        <div class="cert-card ${yaEmitido ? 'cert-card-emitido' : ''}" style="--accent:${mod.color};">
          <div class="cert-card-head">
            <span class="cert-emoji">${mod.emoji}</span>
            <div style="flex:1;min-width:0;">
              <div class="cert-titulo-mod">${escapeHtml(mod.titulo)}</div>
              <div class="cert-desc">${escapeHtml(mod.descripcion)}</div>
            </div>
          </div>

          ${yaEmitido ? `
            <div class="cert-emitido-badge">
              ✅ Certificado emitido
              <span style="font-family:var(--font-mono);font-size:10.5px;opacity:0.8;">${yaEmitido.codigo}</span>
            </div>
            <button class="btn btn-primary btn-block" onclick="window.__descargarCert('${key}')" style="margin-top:12px;">
              ⬇️ Descargar PDF
            </button>
          ` : completo ? `
            <div class="cert-ready-badge">🎉 ¡Listo para emitir!</div>
            <button class="btn btn-primary btn-block" onclick="window.__emitirCert('${key}', this)" style="margin-top:12px;">
              Emitir certificado
            </button>
          ` : `
            <div class="cert-progress-wrap">
              <div class="cert-progress-info">
                <span>${prog.done}/${prog.total} lecciones</span>
                <span>${prog.pct}%</span>
              </div>
              <div class="progress-wrap" style="margin-top:6px;">
                <div class="progress-bar" style="width:${prog.pct}%;background:${mod.color};"></div>
              </div>
              ${sinLecciones ? `<div style="font-size:11px;color:var(--muted2);margin-top:8px;">Aún no hay lecciones cargadas en este módulo.</div>` : ''}
            </div>
          `}
        </div>
      `;
    }

    html += '</div>';

    // Info al pie
    html += `
      <div class="card" style="margin-top:24px;font-size:12.5px;color:var(--muted);line-height:1.6;">
        <strong style="color:var(--text);">¿Cómo obtengo un certificado?</strong><br>
        Los certificados se otorgan al completar el <strong>100% de las lecciones</strong> de un módulo.
        El certificado <strong>"Analista de Datos"</strong> requiere completar ambos módulos (Excel + Power BI).
        Cada certificado tiene un código único de verificación.
      </div>
    `;

    root.innerHTML = html;

    // ── Guardar referencia para los handlers globales ──
    window.__certEmitidosMap = emitidosMap;

  } catch (err) {
    console.error('Error cargando certificados:', err);
    root.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--muted);">
        <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
        No pudimos cargar tus certificados.<br>
        <span style="font-size:12px;color:var(--muted2);">${escapeHtml(err.message || '')}</span>
      </div>
    `;
  }
}

// ── HANDLERS GLOBALES (onclick inline — a prueba de cache) ──────────────────
window.__emitirCert = async function(tipo, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Emitiendo...'; }
  try {
    const cert = await emitirCertificado(tipo);
    toast('✅ ¡Certificado emitido!');
    await renderCertificados();
    if (cert) await generarPDFCertificado(cert);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Emitir certificado'; }
    toast('⚠️ ' + (err.message || 'No se pudo emitir'));
  }
};

window.__descargarCert = async function(tipo) {
  const cert = window.__certEmitidosMap?.[tipo];
  if (!cert) { toast('⚠️ Certificado no encontrado'); return; }
  toast('📄 Generando PDF...');
  try {
    await generarPDFCertificado(cert);
  } catch (err) {
    toast('⚠️ No se pudo generar el PDF');
  }
};

window.__guardarDni = async function(btn) {
  const input = document.getElementById('input-dni');
  if (!input) return;
  const dni = input.value.trim();
  if (dni && !/^\d{8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener 8 dígitos');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  const { error } = await supabase
    .from('profiles')
    .update({ dni: dni || null })
    .eq('id', session.user.id);
  btn.disabled = false;
  btn.textContent = 'Guardar';
  if (error) {
    toast('⚠️ No se pudo guardar el DNI');
  } else {
    session.profile.dni = dni || null;
    toast('✅ DNI guardado');
  }
};
