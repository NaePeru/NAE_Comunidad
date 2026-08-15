// ============================================================================
// PROYECTO Z — cert-final.js
// Sistema de certificados NAE (versión estable):
//   - Calcula progreso por módulo Y por curso individual
//   - Emite certificados vía RPC `emitir_certificado` (server-side verification)
//   - Genera PDF descargable con jsPDF (con fallback de CDN)
//   - Página de verificación pública vía `verificar_certificado` RPC
// ============================================================================

import { supabase } from './supabase-client.js';
import { session } from './auth.js';
import { toast, escapeHtml } from './utils.js';

// ── DEFINICIÓN DE MÓDULOS Y SLUGS ──────────────────────────────────────────
// Deben coincidir con los slugs reales en la BD y con la función SQL emitir_certificado
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
    descripcion: 'Completar ambos módulos: Excel (1-4) + Power BI (1-3) + SQL (Consultas SQL)',
    slugs: [
      'excel-nivel-1', 'excel-nivel-2', 'excel-nivel-3', 'excel-nivel-4',
      'power-bi-nivel-1', 'power-bi-nivel-2', 'power-bi-nivel-3',
      'sql-consultas',
    ],
    color: '#3B82F6',
    emoji: '🏆',
  },
};

// ── CARGAR PROGRESO POR MÓDULO (con detalle por curso) ─────────────────────
// Devuelve { [moduloKey]: { total, done, pct, cursos: [{titulo, done, total, pct}] } }
async function cargarProgresoModulos() {
  if (!session.user?.id) throw new Error('No hay sesión activa.');
  const userId = session.user.id;

  // Traer todos los slugs de los módulos Excel y Power BI
  // (el módulo "completo" es la unión de ambos + SQL)
  const todosSlugs = [...new Set([
    ...MODULOS.excel.slugs,
    ...MODULOS.powerbi.slugs,
    ...MODULOS.completo.slugs,
  ])];

  // 1. Cursos del módulo (guard anti-vacío)
  const { data: cursos, error: errCursos } = await supabase
    .from('courses')
    .select('id, slug, titulo')
    .in('slug', todosSlugs);

  if (errCursos) throw errCursos;
  if (!cursos || cursos.length === 0) {
    // No hay cursos cargados — devolver módulos vacíos
    const vacio = {};
    for (const [key, mod] of Object.entries(MODULOS)) {
      vacio[key] = { ...mod, total: 0, done: 0, pct: 0, cursos: [] };
    }
    return vacio;
  }

  const cursoIds = cursos.map(c => c.id);

  // 2. Total de lecciones por curso (guard anti-vacío)
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

  // 3. Lecciones completadas por el usuario (guard anti-vacío)
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

  // 4. Calcular por módulo (con detalle por curso)
  const resultado = {};
  for (const [key, mod] of Object.entries(MODULOS)) {
    const cursosMod = cursos.filter(c => mod.slugs.includes(c.slug));
    let total = 0, done = 0;
    const cursosDetalle = [];

    cursosMod.forEach(c => {
      const cTotal = totalPorCurso[c.id] || 0;
      const cDone = donePorCurso[c.id] || 0;
      total += cTotal;
      done += cDone;
      cursosDetalle.push({
        titulo: c.titulo,
        slug: c.slug,
        done: cDone,
        total: cTotal,
        pct: cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0,
      });
    });

    resultado[key] = {
      ...mod,
      total,
      done,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
      cursos: cursosDetalle,
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
// Usa jsPDF (cargado dinámicamente desde CDN, con fallback a mirror)
const JSPDF_URLS = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
];

async function cargarJsPDF() {
  if (window.jspdf) return;
  for (const url of JSPDF_URLS) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error('CDN falló: ' + url));
        document.head.appendChild(s);
      });
      return; // éxito
    } catch (e) {
      console.warn(url, 'falló, probando siguiente CDN...');
    }
  }
  throw new Error('No se pudo cargar el generador de PDF desde ningún CDN');
}

export async function generarPDFCertificado(cert, esDemo = false) {
  await cargarJsPDF();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const W = 297; // ancho A4 landscape
  const H = 210; // alto  A4 landscape

  // ── PALETA ESTILO MICROSOFT LEARN ──
  const MSBLUE = [0, 120, 212];    // azul Microsoft (acento principal)
  const DARK   = [27, 27, 27];     // texto principal
  const GRAY   = [96, 94, 92];     // texto secundario
  const LGRAY  = [210, 208, 206];  // líneas divisorias suaves
  const GOLD   = [201, 162, 39];   // medalla
  const NAVY   = [22, 35, 63];     // marca NAE

  // ── FONDO BLANCO LIMPIO (estilo MS: mucho espacio en blanco) ──
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // Línea superior fina azul Microsoft (firma visual del estilo)
  doc.setFillColor(...MSBLUE);
  doc.rect(0, 0, W, 3, 'F');

  // ── ENCABEZADO: MARCA ARRIBA-IZQUIERDA (como el logo MS) ──
  // Rombo NAE como isotipo geométrico
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('◆', 22, 26);
  doc.setFontSize(15);
  doc.text('NAE', 31, 25.5, { charSpace: 1 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('Centro de Capacitación · New Academy Excel', 22, 32);

  // Arriba-derecha: año
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text(String(new Date(cert.emitido_en).getFullYear()), W - 22, 26, { align: 'right' });

  // ── MEDALLA CENTRAL (equivalente al trofeo de Microsoft Learn) ──
  const mx = W / 2, my = 52, mr = 11;
  // Cintas de la medalla (dos rectángulos en V)
  doc.setFillColor(...GOLD);
  doc.triangle(mx - 8, my + 6, mx - 2, my + 6, mx - 5, my + 20, 'F');
  doc.triangle(mx + 2, my + 6, mx + 8, my + 6, mx + 5, my + 20, 'F');
  // Círculo exterior dorado + interior blanco + anillo azul
  doc.setFillColor(...GOLD);
  doc.circle(mx, my, mr, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(mx, my, mr - 2.2, 'F');
  doc.setDrawColor(...MSBLUE);
  doc.setLineWidth(0.8);
  doc.circle(mx, my, mr - 4.5);
  // Check estilizado dentro (dibujado con líneas, como el badge MS)
  doc.setDrawColor(...MSBLUE);
  doc.setLineWidth(1.4);
  doc.line(mx - 3.5, my, mx - 1, my + 3);
  doc.line(mx - 1, my + 3, mx + 4, my - 3.5);

  // ── TÍTULO (estilo MS: sobrio, centrado, espaciado) ──
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.setFontSize(23);
  doc.text('CERTIFICADO DE FINALIZACIÓN', W / 2, 88, { align: 'center', charSpace: 1.5 });

  // ── PRESENTADO A ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text('Este certificado se presenta a', W / 2, 100, { align: 'center' });

  // ── NOMBRE (grande, protagonista — como en MS) ──
  const nombreCompleto = cert.nombre_emisor || 'ALUMNO';
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.setFontSize(nombreCompleto.length > 28 ? 19 : 24);
  doc.text(nombreCompleto.toUpperCase(), W / 2, 114, { align: 'center' });

  // DNI (necesario en Perú, discreto debajo del nombre)
  if (cert.dni) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`DNI: ${cert.dni}`, W / 2, 121, { align: 'center' });
  }

  // ── TEXTO Y NOMBRE DE LA CERTIFICACIÓN (en azul Microsoft) ──
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text('por completar satisfactoriamente los requisitos de', W / 2, 133, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MSBLUE);
  doc.setFontSize(17);
  doc.text(cert.titulo || '', W / 2, 143, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRAY);
  doc.text(`${cert.horas} horas académicas · Modalidad ${cert.modalidad} · Lima, Perú`, W / 2, 153, { align: 'center' });

  // ── DIVISORIA FINA (línea gris suave, como MS) ──
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.5);
  doc.line(60, 163, W - 60, 163);

  // ── BLOQUE DE CREDENCIAL (estilo Microsoft: 3 columnas con etiqueta gris) ──
  const fechaStr = new Date(cert.emitido_en).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const cols = [
    { label: 'EMITIDO', valor: fechaStr, x: 82 },
    { label: 'ID DE CREDENCIAL', valor: cert.codigo, x: W / 2 },
    { label: 'VALIDEZ', valor: 'Sin vencimiento', x: W - 82 },
  ];
  cols.forEach(c => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(c.label, c.x, 173, { align: 'center', charSpace: 1 });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...DARK);
    doc.text(c.valor, c.x, 180, { align: 'center' });
  });

  // ── PIE: VERIFICACIÓN (como el "Verify this certificate" de MS) ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Verifica la autenticidad de este certificado en', W / 2, 194, { align: 'center' });
  doc.setTextColor(...MSBLUE);
  doc.setFontSize(9);
  doc.text('nae-comunidad.vercel.app/verificar.html', W / 2, 200, { align: 'center' });

  // ── DESCARGAR ──
  // UN SOLO FORMATO: mismo diseño limpio para vista previa y certificado real.
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

      // ── Detalle por curso (solo si no está emitido y tiene cursos) ──
      let detalleCursosHtml = '';
      if (!yaEmitido && prog.cursos && prog.cursos.length > 0) {
        detalleCursosHtml = `
          <div class="cert-cursos-list">
            ${prog.cursos.map(c => {
              const icono = c.pct >= 100 ? '✅' : c.pct > 0 ? '⏳' : '⚪';
              return `
                <div class="cert-curso-item">
                  <span class="cert-curso-icono">${icono}</span>
                  <span class="cert-curso-nombre">${escapeHtml(c.titulo)}</span>
                  <span class="cert-curso-pct">${c.done}/${c.total}</span>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

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
            ${detalleCursosHtml}
            <button class="btn btn-primary btn-block" onclick="window.__emitirCert('${key}', this)" style="margin-top:12px;">
              Emitir certificado
            </button>
            <button class="btn btn-sm btn-ghost btn-block" onclick="window.__verDemo('${key}', this)" style="margin-top:6px;">
              👁️ Ver demo
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
            </div>
            ${detalleCursosHtml}
            ${sinLecciones ? `<div style="font-size:11px;color:var(--muted2);margin-top:8px;">Aún no hay lecciones cargadas en este módulo.</div>` : ''}
            <button class="btn btn-sm btn-ghost btn-block" onclick="window.__verDemo('${key}', this)" style="margin-top:8px;">
              👁️ Ver demo
            </button>
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
        El certificado <strong>"Analista de Datos"</strong> requiere completar ambos módulos (Excel + Power BI) + SQL.
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
    toast('⚠️ ' + (err.message || 'No se pudo generar el PDF'));
  }
};

// Generar certificado de DEMOSTRACIÓN (con marca de agua "MUESTRA")
window.__verDemo = async function(tipo, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Generando...'; }
  // Crear objeto certificado ficticio con los datos del perfil actual
  const p = session.profile;
  const mod = MODULOS[tipo];
  const certDemo = {
    tipo: tipo,
    titulo: mod.titulo,
    codigo: 'NAE-DEMO-00000',
    dni: p.dni || '--------',
    nombre_emisor: p.nombre || 'Alumno Demo',
    horas: 60,
    modalidad: 'Virtual',
    emitido_en: new Date().toISOString(),
  };
  toast('📄 Generando certificado de muestra...');
  try {
    await generarPDFCertificado(certDemo, true);
  } catch (err) {
    toast('⚠️ ' + (err.message || 'No se pudo generar el PDF'));
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '👁️ Ver demo'; }
};

window.__guardarDni = async function(btn) {
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return; }
  const input = document.getElementById('input-dni');
  if (!input) return;
  const dni = input.value.trim();
  if (dni && !/^\d{8}$/.test(dni)) {
    toast('⚠️ El DNI debe tener 8 dígitos');
    return;
  }
  // Anti-doble-click: si ya está guardando, ignorar clicks nuevos
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ dni: dni || null })
      .eq('id', session.user.id);
    if (error) {
      toast('⚠️ No se pudo guardar el DNI');
    } else {
      session.profile.dni = dni || null;
      toast('✅ DNI guardado');
    }
  } catch (e) {
    toast('⚠️ Error inesperado. Probá de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
};
