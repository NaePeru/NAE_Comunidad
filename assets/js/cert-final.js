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

// ── RESUMEN DE PROGRESO PARA LA IA (chatbot Alessandra) ─────────────────────
// Devuelve un resumen compacto en texto del progreso de certificados del
// alumno actual. Lo usa chat-ia.js para responder con datos reales cuando
// preguntan "¿qué me falta para mi certificado?".
export async function resumenProgresoIA() {
  if (!session.user?.id) return null;
  try {
    const prog = await cargarProgresoModulos();
    const lineas = [];
    for (const [key, mod] of Object.entries(prog)) {
      if (!mod.total || mod.total === 0) {
        lineas.push(`- ${mod.titulo}: todavía no hay lecciones cargadas`);
        continue;
      }
      const estado = mod.pct >= 100 ? '¡COMPLETO, listo para emitir!' : `${mod.pct}%`;
      lineas.push(`- ${mod.titulo}: ${mod.done}/${mod.total} lecciones (${estado})`);
      if (mod.pct < 100) {
        const pendientes = (mod.cursos || [])
          .filter(c => c.pct < 100)
          .map(c => `${c.titulo} (${c.done}/${c.total})`);
        if (pendientes.length > 0) {
          lineas.push(`  · Cursos pendientes: ${pendientes.join(', ')}`);
        }
      }
    }
    return lineas.join('\n');
  } catch (e) {
    console.warn('No se pudo cargar progreso para IA:', e);
    return null;
  }
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

// ── html2canvas (para renderizar el diseño HTML/CSS del certificado) ────────
const H2C_URLS = [
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js',
];

async function cargarHtml2Canvas() {
  if (window.html2canvas) return;
  for (const url of H2C_URLS) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error('CDN falló: ' + url));
        document.head.appendChild(s);
      });
      return;
    } catch (e) {
      console.warn(url, 'falló, probando siguiente CDN...');
    }
  }
  throw new Error('No se pudo cargar html2canvas desde ningún CDN');
}

// ── FUENTES PREMIUM (Playfair Display + Great Vibes) ────────────────────────
async function asegurarFuentesCert() {
  if (!document.querySelector('link[data-cert-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.dataset.certFonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,600;1,700&family=Great+Vibes&display=swap';
    document.head.appendChild(l);
  }
  try { await document.fonts.ready; } catch (e) { /* seguimos con fallback serif */ }
}

// ── PLANTILLA HTML DEL CERTIFICADO (diseño premium marfil & oro) ────────────
function htmlCertificado(cert) {
  const nombre = (cert.nombre_emisor || 'ALUMNO').toUpperCase();
  const fecha = new Date(cert.emitido_en).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const anio = new Date(cert.emitido_en).getFullYear();
  const nombreLargo = nombre.length > 30;
  const dniHtml = cert.dni ? `<div style="font-family:'Playfair Display',serif;font-size:22px;color:#6b6353;letter-spacing:2px;margin-top:10px;">DNI: ${cert.dni}</div>` : '';

  // Ornamento de esquina (SVG dorado, se rota con CSS para cada esquina)
  const esquina = (rot) => `
    <svg width="120" height="120" viewBox="0 0 120 120" style="position:absolute;${rot};opacity:0.9;">
      <path d="M6,114 C6,52 52,6 114,6" stroke="#b8912e" stroke-width="3.5" fill="none"/>
      <path d="M18,114 C18,62 62,18 114,18" stroke="#d4af37" stroke-width="1.6" fill="none"/>
      <circle cx="114" cy="6" r="4.5" fill="#b8912e"/>
      <circle cx="6" cy="114" r="4.5" fill="#b8912e"/>
      <path d="M114,30 C104,30 96,22 96,12" stroke="#d4af37" stroke-width="1.4" fill="none"/>
      <path d="M30,114 C30,104 22,96 12,96" stroke="#d4af37" stroke-width="1.4" fill="none"/>
    </svg>`;

  return `
  <div id="cert-canvas-root" style="width:1480px;height:1046px;position:fixed;left:-99999px;top:0;z-index:-1;">
    <!-- Papel marfil con viñeta sutil -->
    <div style="width:100%;height:100%;background:
        radial-gradient(ellipse at center,#fbf7ee 0%,#f3ecd9 78%,#ece2c8 100%);
        padding:30px;box-sizing:border-box;">

      <!-- Marco dorado metálico exterior -->
      <div style="width:100%;height:100%;background:linear-gradient(135deg,
          #8a6d1f 0%,#d4af37 18%,#f5e08a 38%,#d4af37 58%,#a8842a 78%,#8a6d1f 100%);
          padding:7px;box-sizing:border-box;">

        <!-- Filete interior oscuro -->
        <div style="width:100%;height:100%;background:#faf6ec;
            border:1px solid rgba(138,109,31,0.55);padding:5px;box-sizing:border-box;">

          <!-- Marco dorado fino principal -->
          <div style="width:100%;height:100%;border:3px solid #b8912e;position:relative;
              box-sizing:border-box;padding:64px 100px 56px;display:flex;
              flex-direction:column;align-items:center;">

            ${esquina('top:14px;left:14px;')}
            ${esquina('top:14px;right:14px;transform:scaleX(-1);')}
            ${esquina('bottom:14px;left:14px;transform:scaleY(-1);')}
            ${esquina('bottom:14px;right:14px;transform:scale(-1,-1);')}

            <!-- Monograma NAE: rombo dorado -->
            <div style="position:relative;width:132px;height:132px;margin-bottom:18px;">
              <svg width="132" height="132" viewBox="0 0 132 132">
                <defs>
                  <linearGradient id="oroD" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#8a6d1f"/><stop offset="0.35" stop-color="#e8c766"/>
                    <stop offset="0.6" stop-color="#f7e7a8"/><stop offset="1" stop-color="#a8842a"/>
                  </linearGradient>
                </defs>
                <rect x="27" y="27" width="78" height="78" transform="rotate(45 66 66)" fill="url(#oroD)"/>
                <rect x="36" y="36" width="60" height="60" transform="rotate(45 66 66)" fill="#faf6ec"/>
                <rect x="41" y="41" width="50" height="50" transform="rotate(45 66 66)" fill="none" stroke="#b8912e" stroke-width="1.6"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                  font-family:'Playfair Display',serif;font-weight:900;font-size:30px;color:#1d2340;
                  letter-spacing:1px;">NAE</div>
            </div>

            <!-- Encabezado institucional -->
            <div style="font-family:'Playfair Display',serif;font-size:23px;color:#6b6353;
                letter-spacing:6px;margin-bottom:6px;">NEW ACADEMY EXCEL</div>
            <div style="font-family:'Playfair Display',serif;font-size:16px;color:#9a8f78;
                letter-spacing:2px;margin-bottom:22px;">Centro de Capacitación · Comunidad de Análisis de Datos</div>

            <!-- Título -->
            <div style="font-family:'Playfair Display',serif;font-weight:900;font-size:64px;
                color:#1d2340;letter-spacing:14px;text-indent:14px;">CERTIFICADO</div>
            <div style="font-family:'Playfair Display',serif;font-size:21px;color:#6b6353;
                letter-spacing:9px;text-indent:9px;margin-top:2px;">DE APROBACIÓN</div>

            <!-- Divisor: línea — rombo — línea -->
            <div style="display:flex;align-items:center;gap:14px;margin:26px 0 24px;">
              <div style="width:150px;height:2px;background:linear-gradient(90deg,transparent,#b8912e);"></div>
              <div style="width:12px;height:12px;background:linear-gradient(135deg,#d4af37,#8a6d1f);transform:rotate(45deg);"></div>
              <div style="width:150px;height:2px;background:linear-gradient(90deg,#b8912e,transparent);"></div>
            </div>

            <!-- Otorgado a + nombre -->
            <div style="font-family:'Playfair Display',serif;font-size:19px;color:#9a8f78;
                letter-spacing:5px;">SE OTORGA A</div>
            <div style="font-family:'Playfair Display',serif;font-weight:700;font-style:italic;
                font-size:${nombreLargo ? '52px' : '64px'};color:#161a2e;margin-top:14px;
                text-align:center;line-height:1.1;max-width:1100px;">${nombre}</div>
            ${dniHtml}

            <!-- Adorno bajo el nombre -->
            <div style="display:flex;align-items:center;gap:10px;margin:18px 0 20px;">
              <div style="width:220px;height:1.5px;background:#c9a544;"></div>
              <div style="width:8px;height:8px;background:#b8912e;transform:rotate(45deg);"></div>
              <div style="width:220px;height:1.5px;background:#c9a544;"></div>
            </div>

            <!-- Programa -->
            <div style="font-family:'Playfair Display',serif;font-size:20px;color:#6b6353;">Por completar satisfactoriamente el programa de</div>
            <div style="font-family:'Playfair Display',serif;font-weight:700;font-size:38px;
                color:#8a6d1f;margin-top:10px;text-align:center;">${cert.titulo || ''}</div>
            <div style="font-family:'Playfair Display',serif;font-size:19px;color:#6b6353;
                margin-top:12px;">${cert.horas} horas académicas · Modalidad ${cert.modalidad} · Lima, Perú</div>

            <!-- Zona inferior: firmas + sello -->
            <div style="display:flex;align-items:flex-end;justify-content:center;gap:130px;
                width:100%;margin-top:auto;padding-top:30px;">

              <div style="text-align:center;width:300px;">
                <div style="font-family:'Great Vibes',cursive;font-size:44px;color:#1d2340;
                    line-height:1;">Geronimo Cruzado</div>
                <div style="width:260px;height:1.5px;background:#6b6353;margin:10px auto 8px;"></div>
                <div style="font-family:'Playfair Display',serif;font-size:15px;color:#6b6353;
                    letter-spacing:1px;">Analista de Datos · Director</div>
              </div>

              <!-- Sello de lacre dorado -->
              <div style="width:150px;height:150px;border-radius:50%;position:relative;
                  background:radial-gradient(circle at 35% 30%,#f0d98a 0%,#d4af37 40%,#8a6d1f 100%);
                  box-shadow:0 3px 10px rgba(90,70,20,0.45), inset 0 0 0 6px rgba(255,248,220,0.25);
                  display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <div style="position:absolute;inset:16px;border-radius:50%;
                    border:2px dashed rgba(70,55,15,0.55);"></div>
                <div style="text-align:center;font-family:'Playfair Display',serif;color:#3d2f0e;">
                  <div style="font-size:15px;letter-spacing:2px;">◆ NAE ◆</div>
                  <div style="font-size:11px;font-weight:700;letter-spacing:1px;margin-top:4px;">CERTIFICADO<br>VERIFICADO</div>
                  <div style="font-size:12px;margin-top:4px;">${anio}</div>
                </div>
              </div>

              <div style="text-align:center;width:300px;">
                <div style="font-family:'Great Vibes',cursive;font-size:44px;color:#1d2340;
                    line-height:1;">Jhonny Vasquez C.</div>
                <div style="width:260px;height:1.5px;background:#6b6353;margin:10px auto 8px;"></div>
                <div style="font-family:'Playfair Display',serif;font-size:15px;color:#6b6353;
                    letter-spacing:1px;">Arquitecto de Datos</div>
              </div>
            </div>

            <!-- Pie de verificación -->
            <div style="margin-top:26px;text-align:center;">
              <div style="font-family:'Playfair Display',serif;font-size:15px;color:#6b6353;">
                Emitido el ${fecha} · Código de verificación: <b>${cert.codigo}</b></div>
              <div style="font-family:'Playfair Display',serif;font-size:13px;color:#9a8f78;
                  margin-top:4px;">Verifica la autenticidad en www.naeacademia.com/verificar.html</div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export async function generarPDFCertificado(cert, esDemo = false) {
  // DISEÑO PREMIUM: el certificado se construye en HTML/CSS (gradientes dorados,
  // tipografías elegantes, ornamentos SVG) y se convierte a PDF con html2canvas.
  await cargarJsPDF();
  await cargarHtml2Canvas();
  await asegurarFuentesCert();

  // Limpiar render anterior si existiera
  document.getElementById('cert-canvas-root')?.remove();

  // Insertar la plantilla fuera de pantalla
  document.body.insertAdjacentHTML('beforeend', htmlCertificado(cert));
  const el = document.getElementById('cert-canvas-root');

  // Pequeña espera para que fuentes y layout se estabilicen
  await new Promise(r => setTimeout(r, 150));

  const canvas = await html2canvas(el, {
    scale: 2,               // 2x = calidad de impresión (~250 dpi en A4)
    backgroundColor: null,
    useCORS: true,
    logging: false,
  });
  el.remove();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 297, 210);

  // UN SOLO FORMATO: mismo diseño para vista previa y certificado real.
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
