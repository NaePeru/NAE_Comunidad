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

      <!-- Pasos -->
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:20px; margin-bottom:20px;">
        <div style="font-family:var(--font-display); font-size:12px; font-weight:600; color:#94A3B8; text-transform:uppercase; letter-spacing:1px; margin-bottom:14px;">
          Pasos para activar
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:22px; height:22px; background:rgba(59,130,246,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#3B82F6; flex-shrink:0;">1</div>
            <div style="font-size:13px; color:var(--text);">Pagá <strong>S/${PRECIO_CURSO}</strong> por <strong style="color:#fff;">Yape</strong> o <strong style="color:#fff;">Plin</strong> al <strong style="color:#3B82F6;">988502354</strong></div>
          </div>
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:22px; height:22px; background:rgba(59,130,246,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#3B82F6; flex-shrink:0;">2</div>
            <div style="font-size:13px; color:var(--text);">Tomá captura de pantalla del voucher</div>
          </div>
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="width:22px; height:22px; background:rgba(59,130,246,0.1); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#3B82F6; flex-shrink:0;">3</div>
            <div style="font-size:13px; color:var(--text);">Subí la captura acá abajo ↓</div>
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

    const btn = document.getElementById('btn-verificar-pago');
    const status = document.getElementById('voucher-status');
    const statusText = document.getElementById('voucher-status-text');
    const preview = document.getElementById('voucher-preview');

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
      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sess.access_token}`,
        },
        body: JSON.stringify({ voucherUrl }),
      });

      const result = await response.json();

      if (result.error) throw new Error(result.error);

      // 3. Guardar el registro de pago
      statusText.textContent = 'Verificando monto...';

      const { error: logErr } = await supabase.from('payment_logs').insert({
        user_id: session.user.id,
        course_id: courseId,
        voucher_url: voucherUrl,
        monto_detectado: parseFloat(result.monto) || 0,
        fecha_detectada: result.fecha || null,
        estado: result.aprobado ? 'aprobado' : 'pendiente',
      });

      // 4. Si la IA aprobó (monto >= 50)
      if (result.aprobado) {
        // Desbloquear el curso
        const { error: accErr } = await supabase.from('course_access').insert({
          user_id: session.user.id,
          course_id: courseId,
        });

        // Actualizar el log a aprobado
        if (!logErr) {
          await supabase.from('payment_logs')
            .update({ estado: 'aprobado' })
            .eq('user_id', session.user.id)
            .eq('course_id', courseId)
            .order('creado_en', { ascending: false })
            .limit(1);
        }

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
        // No aprobado (monto < 50 o no detectado)
        status.innerHTML = `
          <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
          <div style="font-size:16px; font-weight:600; color:var(--text); margin-bottom:8px;">No se pudo verificar el pago</div>
          <div style="font-size:13px; color:var(--muted); margin-bottom:8px;">
            ${result.monto ? `Monto detectado: S/ ${result.monto}` : 'No se detectó un monto válido'}<br>
            El curso cuesta S/ ${PRECIO_CURSO}.
          </div>
          <div style="font-size:12px; color:var(--muted2); margin-bottom:16px;">
            Si el pago es correcto, escribinos por WhatsApp y lo activamos manualmente.
          </div>
          <a href="https://wa.me/51988502354" target="_blank" class="btn btn-ghost" style="width:100%; margin-bottom:8px;">
            💬 Contactar por WhatsApp
          </a>
          <button class="btn btn-ghost" onclick="window.__quitarVoucher(); document.getElementById('voucher-status').style.display='none'; document.getElementById('voucher-upload-zone').style.display='block';" style="width:100%;">
            Intentar con otra imagen
          </button>
        `;
      }

    } catch (err) {
      console.error('Error verify payment:', err);
      status.innerHTML = `
        <div style="font-size:40px; margin-bottom:12px;">⚠️</div>
        <div style="font-size:15px; color:var(--text); margin-bottom:16px;">Hubo un error al verificar. Intentá de nuevo o escribinos por WhatsApp.</div>
        <a href="https://wa.me/51988502354" target="_blank" class="btn btn-primary" style="width:100%;">
          💬 Escribir por WhatsApp
        </a>
      `;
    }
  };
}
