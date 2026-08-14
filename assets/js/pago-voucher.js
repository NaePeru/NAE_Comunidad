// ============================================================================
// PROYECTO Z — pago-voucher.js
// MÓDULO SEPARADO: Pago de cursos premium vía voucher + IA.
// Este módulo es independiente y desmontable del sistema principal.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session } from './auth.js';

const SUPABASE_URL = 'https://dlpsvbrctccnmvkbcsfp.supabase.co';
const PRECIO_CURSO = 50; // S/50

// ── Verificar si el alumno ya compró un curso específico ───────────────────
export async function tieneCursoComprado(courseId) {
  if (!session.user) return false;
  const { data } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('user_id', session.user.id)
    .eq('course_id', courseId);
  return (data && data.length > 0);
}

// ── Renderizar la pantalla de pago con subida de voucher ───────────────────
export function renderPantallaPago(course, containerId = 'curso-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="course-back" onclick="window.__volverCatalogo()">← Volver al catálogo</div>
    
    <div class="card payment-card" style="max-width:480px; margin:20px auto; padding:32px 24px;">
      
      <div style="text-align:center; margin-bottom:24px;">
        <span style="font-family:var(--font-display); font-size:11px; font-weight:600; color:#3B82F6; background:rgba(59,130,246,0.1); padding:4px 12px; border-radius:20px; letter-spacing:0.5px;">
          ACCESO PREMIUM
        </span>
        <h3 style="font-family:var(--font-display); font-size:22px; font-weight:700; margin:16px 0 8px; color:#fff;">
          ${course.titulo}
        </h3>
        <div style="font-size:28px; font-weight:800; color:#3B82F6; font-family:var(--font-display);">
          S/ ${PRECIO_CURSO}.00
        </div>
      </div>

      <!-- QR DE YAPE -->
      <div style="background:#fff; border-radius:12px; padding:16px; margin-bottom:14px; text-align:center;">
        <div style="font-family:var(--font-display); font-size:12px; font-weight:700; color:#5C2670; margin-bottom:10px;">
          📱 ESCANEÁ Y PAGÁ CON YAPE
        </div>
        <img src="../assets/img/qr-yape.jpg" alt="QR de pago Yape" style="width:100%; max-width:230px; border-radius:8px; display:block; margin:0 auto;">
        <div style="font-size:12px; color:#374151; margin-top:10px; font-weight:600;">
          Monto exacto: <span style="color:#5C2670;">S/ ${PRECIO_CURSO}.00</span> a nombre de <strong>Geronimo Cruzado</strong>
        </div>
      </div>

      <!-- Nota para móviles: no pueden escanear su propia pantalla -->
      <div style="font-size:12px; color:var(--muted); text-align:center; margin-bottom:14px; line-height:1.5;">
        ¿Estás en el celular? Abrí <strong style="color:#fff;">Yape</strong> y pagá al <strong style="color:#3B82F6;">988502354</strong> · Geronimo Cruzado
      </div>

      <!-- Pasos -->
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:20px;">
        <div style="font-family:var(--font-display); font-size:12px; font-weight:600; color:#94A3B8; text-transform:uppercase; letter-spacing:1px; margin-bottom:14px;">
          Pasos para activar
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:22px; height:22px; background:rgba(59,130,246,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#3B82F6; flex-shrink:0;">1</div>
            <div style="font-size:13px; color:var(--text);">Pagá <strong>S/${PRECIO_CURSO} exactos</strong> escaneando el QR (o por Yape al 988502354)</div>
          </div>
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:22px; height:22px; background:rgba(59,130,246,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#3B82F6; flex-shrink:0;">2</div>
            <div style="font-size:13px; color:var(--text);">Tomá captura de pantalla del voucher</div>
          </div>
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:22px; height:22px; background:rgba(59,130,246,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#3B82F6; flex-shrink:0;">3</div>
            <div style="font-size:13px; color:var(--text);">Subí la captura acá abajo ↓ y se desbloquea solo</div>
          </div>
        </div>
      </div>

      <!-- Zona de subida -->
      <div id="voucher-upload-zone" style="border:2px dashed var(--border2); border-radius:12px; padding:28px 20px; text-align:center; cursor:pointer; transition:border-color 0.2s; margin-bottom:16px;"
           onclick="document.getElementById('voucher-file-input').click()">
        <input type="file" id="voucher-file-input" accept="image/*" style="display:none;" onchange="window.__manejarVoucher(event, '${course.id}')">
        <div style="font-size:36px; margin-bottom:8px;">📸</div>
        <div style="font-size:14px; font-weight:600; color:var(--text); margin-bottom:4px;">Subir comprobante</div>
        <div style="font-size:12px; color:var(--muted2);">Click aquí para elegir la captura</div>
      </div>

      <!-- Preview + botón enviar -->
      <div id="voucher-preview" style="display:none; margin-bottom:16px;">
        <img id="voucher-preview-img" style="width:100%; max-height:300px; object-fit:contain; border-radius:8px; border:1px solid var(--border); margin-bottom:12px;">
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" style="flex:1;" onclick="window.__quitarVoucher()">❌ Cancelar</button>
          <button class="btn btn-primary" style="flex:1;" id="btn-verificar-pago" onclick="window.__verificarPago('${course.id}', '${course.titulo.replace(/'/g, "\\'")}')">
            ✅ Verificar pago
          </button>
        </div>
      </div>

      <!-- Estado de verificación -->
      <div id="voucher-status" style="display:none; text-align:center; padding:20px;">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        <div style="font-size:14px; color:var(--muted);" id="voucher-status-text">Verificando pago con IA...</div>
      </div>

      <!-- WhatsApp alternativo -->
      <a href="https://wa.me/51988502354?text=Hola!%20Quiero%20activar%20el%20curso%20${encodeURIComponent(course.titulo)}" 
         target="_blank" class="btn btn-ghost" style="width:100%; font-size:13px;">
        💬 O escribínos por WhatsApp
      </a>
    </div>
  `;

  // Inicializar funciones del módulo
  initVoucherFunctions();
}

// ── Inicializar funciones globales del módulo ───────────────────────────────
let voucherFile = null;

function initVoucherFunctions() {
  window.__manejarVoucher = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Debe ser una imagen');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('La imagen pesa más de 5MB');
      return;
    }

    voucherFile = file;
    const previewUrl = URL.createObjectURL(file);
    document.getElementById('voucher-preview-img').src = previewUrl;
    document.getElementById('voucher-preview').style.display = 'block';
    document.getElementById('voucher-upload-zone').style.display = 'none';
  };

  window.__quitarVoucher = () => {
    voucherFile = null;
    document.getElementById('voucher-preview').style.display = 'none';
    document.getElementById('voucher-upload-zone').style.display = 'block';
    document.getElementById('voucher-file-input').value = '';
  };

  window.__verificarPago = async (courseId, courseTitle) => {
    if (!voucherFile) return;
    // Guard de sesión: sin esto, session.user.id null → TypeError y flujo roto.
    if (!session.user?.id) { alert('Tu sesión expiró. Recargá la página.'); return; }

    const btn = document.getElementById('btn-verificar-pago');
    const status = document.getElementById('voucher-status');
    const statusText = document.getElementById('voucher-status-text');
    const preview = document.getElementById('voucher-preview');
    if (!btn || !status || !preview) return;

    // Anti-doble-click mientras verifica
    if (btn.disabled) return;
    btn.disabled = true;
    preview.style.display = 'none';
    status.style.display = 'block';
    statusText.textContent = 'Subiendo comprobante...';

    try {
      // 1. Subir imagen al Storage
      const ext = voucherFile.name.split('.').pop().toLowerCase();
      const ruta = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('vouchers')
        .upload(ruta, voucherFile, { cacheControl: '3600' });

      if (upErr) throw new Error('No se pudo subir la imagen');

      const { data: pub } = supabase.storage.from('vouchers').getPublicUrl(ruta);
      const voucherUrl = pub.publicUrl;

      // 2. Llamar a la Edge Function (IA lee el voucher)
      statusText.textContent = 'La IA está leyendo tu comprobante...';

      const { data: { session: sess } } = await supabase.auth.getSession();
      // Timeout de 45s: la verificación con visión IA puede tardar más que el chat.
      // Si excede, abortamos y damos feedback claro en vez de spinner eterno.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      let response;
      try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sess.access_token}`,
          },
          // Mandamos la URL de la foto Y el ID del curso al servidor
          body: JSON.stringify({ voucherUrl, courseId }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const result = await response.json();

      if (result.error) throw new Error(result.error);

      // === NUEVO: Si el voucher ya fue usado (fraude) ===
      if (result.ya_usado) {
        status.innerHTML = `
          <div style="font-size:40px; margin-bottom:12px;">🚫</div>
          <div style="font-size:16px; font-weight:600; color:var(--red); margin-bottom:8px;">Comprobante ya utilizado</div>
          <div style="font-size:13px; color:var(--muted); margin-bottom:16px; line-height:1.6;">
            Este comprobante de pago ya fue registrado por otro alumno.<br>
            Cada pago es válido para un solo curso.
          </div>
          <button class="btn btn-ghost" onclick="window.__quitarVoucher(); document.getElementById('voucher-status').style.display='none'; document.getElementById('voucher-upload-zone').style.display='block';" style="width:100%;">
            Subir otro comprobante
          </button>
        `;
        return;
      }

      // 3. Si la IA aprobó (monto y nombre correctos)
      if (result.aprobado) {
        // El servidor ya le dio acceso automáticamente (course_access)
        
        // Mostrar éxito
        status.innerHTML = `
          <div style="font-size:48px; margin-bottom:12px;">🎉</div>
          <div style="font-size:18px; font-weight:700; color:var(--green); margin-bottom:8px;">¡Pago verificado!</div>
          <div style="font-size:14px; color:var(--muted); margin-bottom:20px;">
            Monto detectado: <strong style="color:#fff;">S/ ${result.monto}</strong><br>
            El curso ha sido desbloqueado.
          </div>
          <button class="btn btn-primary" onclick="location.reload()" style="width:100%;">
            ▶ Entrar al curso
          </button>
        `;
      } else {
        // No aprobado: armar mensaje claro con el motivo
        let motivoError = '';
        
        if (!result.monto_valido && !result.nombre_valido) {
          motivoError = `No se detectó un pago de exactamente S/${PRECIO_CURSO} a nombre de Geronimo Cruzado.`;
        } else if (!result.monto_valido) {
          motivoError = `El monto detectado es S/ ${result.monto}, pero el curso vale exactamente S/ ${PRECIO_CURSO}.<br>El monto debe ser de S/50.`;
        } else if (!result.nombre_valido) {
          motivoError = `El pago no fue a nombre del beneficiario correcto.<br>
          <span style="font-size:12px; color:var(--muted2);">Destinatario detectado: ${result.destinatario || 'No detectado'}</span>`;
        } else {
          motivoError = 'No se pudieron verificar los datos del comprobante.';
        }

        status.innerHTML = `
          <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
          <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:8px;">Pago no verificado</div>
          <div style="font-size:13px; color:var(--muted); margin-bottom:8px; line-height:1.6;">
            ${motivoError}
          </div>
          <div style="font-size:12px; color:var(--muted2); margin-bottom:16px;">
            Si creés que es un error, escribinos por WhatsApp con tu comprobante.
          </div>
          <a href="https://wa.me/51988502354" target="_blank" class="btn btn-primary" style="width:100%; margin-bottom:8px;">
            💬 Contactar por WhatsApp
          </a>
          <button class="btn btn-ghost" onclick="window.__quitarVoucher(); document.getElementById('voucher-status').style.display='none'; document.getElementById('voucher-upload-zone').style.display='block';" style="width:100%;">
            Subir otra imagen
          </button>
        `;
      }

    } catch (err) {
      console.error('Error verify payment:', err);
      const esTimeout = err.name === 'AbortError';
      const mensaje = esTimeout
        ? 'La verificación está demorando demasiado. Intentá de nuevo en un momento o escribinos por WhatsApp.'
        : 'Hubo un error al verificar. Intentá de nuevo o escribinos por WhatsApp.';
      status.innerHTML = `
        <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
        <div style="font-size:15px; color:var(--text); margin-bottom:16px;">${mensaje}</div>
        <a href="https://wa.me/51988502354" target="_blank" class="btn btn-primary" style="width:100%;">
          💬 Escribir por WhatsApp
        </a>
        <button class="btn btn-ghost" onclick="window.__quitarVoucher(); document.getElementById('voucher-status').style.display='none'; document.getElementById('voucher-upload-zone').style.display='block';" style="width:100%; margin-top:8px;">
          Subir otra imagen
        </button>
      `;
    }
  };
}
