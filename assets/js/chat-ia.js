// ============================================================================
// PROYECTO Z — chat-ia.js
// Alessandra — Asistente de matrícula NAE.
// IA GRATUITA vía Pollinations (sin API key, sin riesgo de seguridad).
// Con RAG (base de conocimiento NAE) + voz (micrófono + text-to-speech).
// ============================================================================

import { escapeHtml, getNivel, getSiguienteNivel, tiempoRelativo } from './utils.js';
import { supabase, SUPABASE_URL } from './supabase-client.js';
import { session, refrescarPerfil } from './auth.js';
import { SYSTEM_PROMPT } from './prompt.js';

// ── ESTADO ──────────────────────────────────────────────────────────────────
let chatHistory = [];
let isLoading = false;
let chatOpen = false;
let cacheProgreso = null;   // resumen de progreso de certificados (para la IA)
let cacheVouchers = null;   // últimos vouchers de pago del alumno (para la IA)
let cacheMatriculables = null; // cursos programados de matrícula (t_cursop) para la IA
let cacheCursosCatalogo = null; // catálogo grabado con nº de lecciones (detecta "en construcción")

// ── PROMPT BASE (Importado desde prompt.js) ────────────────────────────────
const PROMPT_BASE = SYSTEM_PROMPT;

// ── LLAMADA A OPENAI (Vía Edge Function de Supabase - Segura y Rápida) ─────
async function llamarIA(pregunta) {
  // PERSONALIZACIÓN (Nivel 4): inyectamos nombre + puntos + nivel del alumno
  // en el contexto para que Alessandra responda con datos reales.
  // Todo sale de session.profile (ya cargado) — sin tocar la Edge Function.
  let systemPrompt = PROMPT_BASE;
  const p = session?.profile;
  if (p) {
    const pts = p.puntos ?? 0;
    const nivel = getNivel(pts);
    const sig = getSiguienteNivel(pts);

    let ctx = `

<alumno_actual>
- Nombre: ${p.nombre}
- Puntos actuales: ${pts}
- Nivel actual: ${nivel.nombre} (nivel ${nivel.num} de 8)`;

    if (sig) {
      const faltan = sig.min - pts;
      ctx += `
- Siguiente nivel: ${sig.nombre} (se alcanza con ${sig.min} puntos; le faltan ${faltan})`;
    } else {
      ctx += `
- Ya alcanzó el nivel máximo (Súper Saiyajin Blue)`;
    }

    ctx += `

Puedes dirigirte a él por su nombre de forma natural y cercana (sin repetirlo
en cada mensaje). Si pregunta por sus puntos o su nivel, respónde con estos
datos exactos y anímalo a participar en la comunidad para sumar más.`;

    if (cacheProgreso) {
      ctx += `

- Progreso de certificados:
${cacheProgreso}

Si pregunta por su avance o qué le falta para un certificado, usa estos datos.
Los certificados se emiten automáticamente desde la sección "Mis Certificados"
(icono 🎓) cuando el módulo llega al 100%.`;
    }

    // Vouchers de pago (solo lectura: la IA informa estado, no ejecuta acciones)
    if (Array.isArray(cacheVouchers)) {
      if (cacheVouchers.length === 0) {
        ctx += `

- Vouchers de pago: no subió ningún comprobante todavía.`;
      } else {
        const lineasV = cacheVouchers.map(v => {
          const curso = v.courses?.titulo || 'Curso';
          const monto = v.monto_detectado ? `S/${v.monto_detectado}` : 'monto no legible';
          const estado = v.estado === 'aprobado' ? 'APROBADO ✓' : 'PENDIENTE de revisión';
          const cuando = tiempoRelativo(v.creado_en);
          return `  · ${curso} — ${monto} — ${estado} (subido ${cuando})`;
        });
        ctx += `

- Vouchers de pago subidos (últimos ${cacheVouchers.length}):
${lineasV.join('\n')}`;
      }
      ctx += `

Si pregunta por un pago o comprobante, usá estos datos exactos. Un voucher
PENDIENTE se revisa en menos de 24 horas (o por WhatsApp 988502354). Si todo
figura APROBADO pero un curso sigue bloqueado, indicale que recargue la página.
Si no subió ninguno, explicale que paga S/50 escaneando el QR de Yape en la
pantalla del curso y luego sube la captura ahí mismo.`;
    }

    // Cursos programados de MATRÍCULA (FASE 3 — Alessandra puede matricular)
    if (Array.isArray(cacheMatriculables) && cacheMatriculables.length > 0) {
      const fCorta = (iso) => {
        if (!iso) return '';
        const [y, m, d] = String(iso).slice(0, 10).split('-');
        return `${d}-${m}`;
      };
      const lineasM = cacheMatriculables.map(cp => {
        return `  · ${cp.t_cursos?.nombre} - ${cp.horario || 'horario por confirmar'} - S/${cp.t_cursos?.costo} - inicia ${fCorta(cp.fecha_inicio)} (código ${cp.cursop})`;
      });
      ctx += `

- Cursos EN VIVO con matrícula abierta:
${lineasM.join('\n')}

FORMATO DE RESPUESTA OBLIGATORIO: cuando pregunten por cursos en vivo/online,
mostrá la lista EXACTAMENTE en este formato, una línea por curso, sin profesor
ni texto extra:
nombre del curso - horario - S/costo - inicia DD-MM
Ejemplo real: "MS Excel nivel básico - lun-mier-vier - S/100 - inicia 25-08"
Si el alumno quiere matricularse, AHÍ recién pedí DNI y nombre.
Si no hay cursos programados, decíselo y derivá al WhatsApp 988502354.

PUEDES MATRICULAR por chat: si el alumno quiere inscribirse en un curso de esta
lista, pedile su DNI (8 dígitos) y su nombre completo (como está en su DNI).
Confirmale curso (por código) + DNI + nombre, y cuando estén TODOS los datos,
terminá tu respuesta con ESTE bloque exacto (el sistema lo ejecuta solo):
[[MATRICULAR:{"dni":"12345678","nombres":"APELLIDOS Y NOMBRES","cursop":"260801"}]]
Reemplazá los valores por los reales. Sin ese bloque no se matricula nada.`;
    }

    // Catálogo de cursos grabados con estado de construcción
    if (Array.isArray(cacheCursosCatalogo) && cacheCursosCatalogo.length > 0) {
      const UMBRAL = 3; // menos de 3 lecciones cargadas = en construcción
      const listos = cacheCursosCatalogo.filter(c => c.lecciones >= UMBRAL).map(c => `  · ${c.titulo} (${c.lecciones} lecciones)`);
      const construccion = cacheCursosCatalogo.filter(c => c.lecciones < UMBRAL).map(c => `  · ${c.titulo} (${c.lecciones} lecciones cargadas)`);
      ctx += `

- Estado del catálogo de cursos grabados:
DISPONIBLES ya:
${listos.join('\n') || '  (ninguno por ahora)'}
EN CONSTRUCCIÓN (contenido incompleto):
${construccion.join('\n') || '  (ninguno)'}

Si el alumno pregunta por un curso que está EN CONSTRUCCIÓN, respondé EXACTAMENTE
que estamos desarrollando los temas que faltan y que pronto estará disponible.
No prometas fechas exactas ni detalles del contenido.`;
    }

    ctx += `
</alumno_actual>`;
    systemPrompt += ctx;
  }
  const recentHistory = chatHistory.slice(-4);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: pregunta }
  ];

  try {
    // Obtener el token de sesión del usuario logueado
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No hay sesión');

    // Timeout de 30s: si la Edge Function o la IA no responden en ese tiempo,
    // abortamos para no dejar al usuario con el spinner girando para siempre.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Llamar a nuestra Edge Function en Supabase
    let response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/chat-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) throw new Error('Error en el servidor');

    const data = await response.json();

    if (data.error) throw new Error(data.error);

    return data.reply || 'No pude procesar eso. Intentá de nuevo.';
  } catch (err) {
    console.error('Error IA:', err);
    // Mensaje diferenciado para timeout (mejor UX que un error genérico)
    if (err.name === 'AbortError') {
      return 'La respuesta está demorando demasiado. Reintentá en un momento o escribinos al WhatsApp 988502354.';
    }
    return 'Tengo un problema de conexión en este momento. Escribinos al WhatsApp 988502354.';
  }
}

// ── INICIALIZAR WIDGET ─────────────────────────────────────────────────────
export function initChat() {
  // Cargar el CSS dinámicamente (una sola vez)
  if (!document.querySelector('link[href*="chat-ia.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../assets/css/chat-ia.css';
    document.head.appendChild(link);
  }

  // Crear elementos del DOM
  const fab = document.createElement('button');
  fab.className = 'chat-fab';
  fab.innerHTML = '💬<span class="chat-badge">1</span>';
  fab.onclick = () => toggleChat();
  document.body.appendChild(fab);

  const win = document.createElement('div');
  win.className = 'chat-window';
  win.id = 'chat-window';
  win.innerHTML = `
    <div class="chat-header">
      <div class="chat-avatar">👩‍💼</div>
      <div class="chat-header-info">
        <div class="chat-header-name">Alessandra</div>
        <div class="chat-header-status">En línea</div>
      </div>
      <button class="chat-close" onclick="window.__closeChat()">✕</button>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-wrap">
      <button class="chat-mic" id="chat-mic" onclick="window.__toggleMic()" title="Hablar">🎤</button>
      <input type="text" class="chat-input" id="chat-input" placeholder="Escribí tu consulta..." onkeydown="if(event.key==='Enter') window.__sendChat()">
      <button class="chat-send" id="chat-send" onclick="window.__sendChat()">➤</button>
    </div>
  `;
  document.body.appendChild(win);

  // Mensaje de bienvenida (simple + nombre del alumno)
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  const primerNombre = session?.profile?.nombre?.trim().split(/\s+/)[0];
  div.innerHTML = `Hola${primerNombre ? ', ' + escapeHtml(primerNombre) : ''}, soy <strong style="color:var(--gold);">Alessandra</strong>. ¿En qué puedo ayudar?`;
  msgs.appendChild(div);
}

function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chat-window');
  const fab = document.querySelector('.chat-fab');
  win.classList.toggle('open', chatOpen);
  fab.classList.toggle('hidden', chatOpen);
  if (chatOpen) {
    // Ocultar badge
    const badge = fab.querySelector('.chat-badge');
    if (badge) badge.style.display = 'none';
    // Refrescar puntos/nivel silenciosamente para que el contexto de la IA
    // esté siempre fresco. silent:true evita el evento 'perfil-actualizado'
    // que re-renderizaba la navbar (bug de navbar duplicada).
    refrescarPerfil({ silent: true }).catch(() => {});
    // Cargar progreso de certificados (import perezoso: solo al abrir el chat)
    import('./cert-final.js')
      .then(m => m.resumenProgresoIA())
      .then(txt => { cacheProgreso = txt; })
      .catch(() => { cacheProgreso = null; });
    // Cargar últimos vouchers de pago (RLS garantiza que solo ve los suyos).
    // SOLO LECTURA: la IA únicamente informa el estado, no ejecuta nada.
    supabase
      .from('payment_logs')
      .select('monto_detectado, estado, creado_en, courses(titulo)')
      .order('creado_en', { ascending: false })
      .limit(3)
      .then(res => { cacheVouchers = res.data || []; })
      .catch(() => { cacheVouchers = null; });
    // Cargar cursos programados de MATRÍCULA (t_cursop) — para que Alessandra
    // informe qué cursos hay y pueda matricular por chat (FASE 3).
    const hoyISO2 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    supabase
      .from('t_cursop')
      .select('cursop, horario, fecha_inicio, fecha_fin, t_cursos(nombre, costo), t_profesor(nombre)')
      .or(`fecha_fin.gte.${hoyISO2},fecha_fin.is.null`)  // vigentes o sin fecha fin
      .order('fecha_inicio', { ascending: true })
      .limit(10)
      .then(res => { cacheMatriculables = res.data || []; })
      .catch(() => { cacheMatriculables = null; }); // sin tablas → sin matrícula por chat
    // Cargar catálogo de cursos grabados con su nº de lecciones (para detectar
    // los que están EN CONSTRUCCIÓN y responder que pronto estarán disponibles).
    supabase
      .from('courses')
      .select('id, titulo, publicado, lessons(id)')
      .eq('publicado', true)
      .order('orden')
      .then(res => {
        cacheCursosCatalogo = (res.data || []).map(c => ({
          titulo: c.titulo,
          lecciones: (c.lessons || []).length,
        }));
      })
      .catch(() => { cacheCursosCatalogo = null; });
    setTimeout(() => document.getElementById('chat-input')?.focus(), 200);
  }
}

// ── AÑADIR MENSAJES (SEGURIDAD XSS: SIEMPRE ESCAPA HTML) ───────────────────
function addBotMsg(text, isHtml = false) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';

  // 1. Escapar SIEMPRE el HTML para evitar XSS
  //    (incluso si viene de la IA o la base de datos)
  let safeHtml = escapeHtml(text).replace(/\n/g, '<br>');

  // 2. Aplicar formato seguro (negritas, listas, etc.) DESPUÉS de escapar
  // Reemplazar **texto** por <strong>texto</strong>
  safeHtml = safeHtml.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
  // Reemplazar *texto* o _texto_ por <em>texto</em>
  safeHtml = safeHtml.replace(/(^|\s)\*([^\*]+)\*(?!\*)/g, '$1<em>$2</em>');
  safeHtml = safeHtml.replace(/(^|\s)_([^_]+)_(?!\*)/g, '$1<em>$2</em>');

  // 3. Texto limpio para el botón "Escuchar" (sin HTML ni markdown)
  const cleanText = text.replace(/[*#`>_]/g, '').replace(/\n/g, ' ');

  // 4. Render final
  div.innerHTML = safeHtml + 
    `<br><button class="chat-speak" onclick="window.__speak(\`${cleanText.substring(0, 200).replace(/`/g, '')}\`)">🔊 Escuchar</button>`;
  
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserMsg(text) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg user';
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addTyping() {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-typing';
  div.id = 'chat-typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('chat-typing-indicator');
  if (el) el.remove();
}

// ── ENVIAR MENSAJE ──────────────────────────────────────────────────────────
async function sendMsg(text) {
  if (isLoading) return;
  const input = document.getElementById('chat-input');
  text = text || input?.value?.trim();
  if (!text) return;

  input.value = '';
  addUserMsg(text);
  chatHistory.push({ role: 'user', content: text });

  // Ocultar sugerencias tras primer mensaje
  const sug = document.getElementById('chat-suggestions');
  if (sug) sug.style.display = 'none';

  isLoading = true;
  document.getElementById('chat-send').disabled = true;
  addTyping();

  // Antes había un setTimeout de 5s aquí para "simular que piensa".
  // Lo eliminamos: el indicador addTyping() ya cubre la espera, y el delay
  // solo duplicaba el tiempo total de respuesta (5s fijos + latencia real de la IA).
  let reply = await llamarIA(text);

  // ── FASE 3: detección del bloque [[MATRICULAR:{...}]] ──
  // Si Alessandra cerró la conversación de matrícula con el bloque, se ejecuta
  // la acción real (Edge Function bot-matricula) y el bloque no se muestra.
  const mMatch = reply.match(/\[\[MATRICULAR:\s*(\{[\s\S]*?\})\s*\]\]/);
  let matriculaAviso = null;
  if (mMatch) {
    reply = reply.replace(mMatch[0], '').trim(); // limpiarlo del texto visible
    try {
      const datos = JSON.parse(mMatch[1]);
      const { data: { session: sM } } = await supabase.auth.getSession();
      const r = await fetch(`${SUPABASE_URL}/functions/v1/bot-matricula`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sM.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dni: datos.dni,
          nombres: datos.nombres,
          cursop: datos.cursop,
          // el mail real lo resuelve el servidor (user.email de la sesión)
          telefono: datos.telefono || null,
        }),
      });
      const out = await r.json();
      matriculaAviso = out.ok
        ? `✅ ¡Matrícula registrada en ${out.curso} (código ${datos.cursop})!\nPago pendiente: S/ ${out.monto}. El equipo de NAE confirmará tu pago y quedarás matriculado oficialmente.`
        : `⚠️ No pude completar la matrícula: ${out.error || 'intenta de nuevo o escribí al WhatsApp 988502354'}`;
    } catch (e) {
      matriculaAviso = '⚠️ Error procesando la matrícula. Escribinos al WhatsApp 988502354.';
    }
  }

  removeTyping();
  addBotMsg(reply || 'Procesando tu matrícula...'); // Sin 'true', forzamos el escape seguro
  if (matriculaAviso) addBotMsg(matriculaAviso);
  chatHistory.push({ role: 'assistant', content: (reply + (matriculaAviso ? '\n' + matriculaAviso : '')) });

  isLoading = false;
  document.getElementById('chat-send').disabled = false;
}

// ── PREGUNTA RÁPIDA ─────────────────────────────────────────────────────────
function quickAsk(q) {
  sendMsg(q);
}

// ── VOZ: TEXT-TO-SPEECH ────────────────────────────────────────────────────
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-PE';
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

// ── VOZ: MICRÓFONO (Speech Recognition) ────────────────────────────────────
let recognition = null;
let isRecording = false;
const speechSupported = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);

function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'es-PE';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = document.getElementById('chat-input');
    input.value = transcript;
    input.focus();
  };
  recognition.onerror = () => stopRecording();
  recognition.onend = () => stopRecording();
}

function toggleMic() {
  if (!speechSupported) {
    alert('Tu navegador no soporta micrófono. Probá en Chrome.');
    return;
  }
  if (!recognition) initRecognition();
  if (isRecording) {
    recognition.stop();
  } else {
    recognition.start();
    isRecording = true;
    document.getElementById('chat-mic').classList.add('recording');
  }
}

function stopRecording() {
  isRecording = false;
  const mic = document.getElementById('chat-mic');
  if (mic) mic.classList.remove('recording');
}

// ── EXPORTAR ────────────────────────────────────────────────────────────────
window.__closeChat = () => toggleChat();
window.__sendChat = () => sendMsg();
window.__quickAsk = quickAsk;
window.__speak = speak;
window.__toggleMic = toggleMic;
