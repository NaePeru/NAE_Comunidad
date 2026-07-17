// ============================================================================
// PROYECTO Z — chat-ia.js
// Alessandra — Asistente de matrícula NAE.
// IA GRATUITA vía Pollinations (sin API key, sin riesgo de seguridad).
// Con RAG (base de conocimiento NAE) + voz (micrófono + text-to-speech).
// ============================================================================

import { escapeHtml } from './utils.js';

// ── ESTADO ──────────────────────────────────────────────────────────────────
let chatHistory = [];
let isLoading = false;
let chatOpen = false;

// ── PROMPT BASE (personalidad + reglas de Alessandra) ──────────────────────
const PROMPT_BASE = `Eres Alessandra, asistente de matrícula y ventas de NAE (New Academy Excel). Tu ÚNICA función es dar información sobre los cursos, precios, planes y proceso de pago de esta plataforma. NO resuelves dudas técnicas de Excel, Power BI, DAX ni fórmulas — ni aunque insistan.

REGLAS:
1. Responde SIEMPRE en español, tono cercano y motivador.
2. Tu función es EXCLUSIVAMENTE informar sobre cursos, planes, precios y proceso de matrícula.
3. NUNCA resuelves dudas técnicas. Si insisten: "Esa parte la aprenderás dentro del curso 😊 ¿Te ayudo con la matrícula?"
4. Máximo 100 palabras por respuesta. Sin introducciones largas.
5. Los links como HTML clicable.
6. Si el alumno duda del precio → reformulá el valor (acceso a TODOS los cursos) sin sonar agresivo.`;

// ── BASE DE CONOCIMIENTO NAE (RAG) ─────────────────────────────────────────
const KB = [
  {
    keys: ['curso','cursos','que cursos hay','que tienen','disponible','niveles','temario','excel','power bi','sql','tablas dinamicas','tablas dinámicas'],
    content: `Cursos disponibles AHORA:
📋 Tablas y Gráficos Dinámicos (GRATIS): acceso libre apenas te registras.

PRÓXIMAMENTE (premium):
📊 MS Excel (4 niveles: Básico, Intermedio, Avanzado, BI)
⚡ Power BI (3 niveles: Transformación, Visualizaciones, DAX)

Cuando se habiliten los cursos premium, se accederá a todos con un solo plan mensual.`
  },
  {
    keys: ['gratis','prueba','gratuito','sin pagar','tablas dinamicas gratis','trial'],
    content: `El curso de Tablas y Gráficos Dinámicos es TOTALMENTE GRATIS.
Solo tenés que registrarte con tu email y ya podés empezar a aprender.`
  },
  {
    keys: ['precio','costo','cuanto cuesta','cuanto es','plan','mensualidad','pagar','pago','suscripcion','tarifa','membresia'],
    content: `Por ahora el curso de Tablas Dinámicas es 100% GRATIS.
Cuando lancemos los cursos premium de Excel y Power BI, anunciaremos los precios.
Para consultas anticipadas, escribinos al WhatsApp 974 688 863.`
  },
  {
    keys: ['como pago','yape','plin','como pagar','transferencia','boucher','voucher','comprobante','como activo','matricula','matricularme'],
    content: `Hoy todos los cursos disponibles son GRATIS, no necesitas pagar nada.
Cuando lancemos los cursos premium (Excel y Power BI), el pago será por Yape/Plin al WhatsApp 974 688 863.`
  },
  {
    keys: ['excel','power bi','premium','cuando','pronto','proximamente','cuando salen'],
    content: `Los cursos de MS Excel y Power BI (premium) están en desarrollo.
¡Muy pronto los tendremos disponibles! Mantente atento a los anuncios en la comunidad.`
  },
  {
    keys: ['certificado','certificacion','diploma','constancia','analista de datos'],
    content: `El certificado "Analista de Datos" se entregará cuando estén disponibles TODOS los cursos y el alumno los complete.
Por ahora, solo está disponible el curso gratuito de Tablas Dinámicas.`
  },
  {
    keys: ['whatsapp','contacto','profesor','asesor','duda','escribir','telefono','numero'],
    content: `Para consultas personalizadas o soporte: WhatsApp 974 688 863.
También podés escribir a solucionew@gmail.com.`
  },
  {
    keys: ['seminario','webinar','sabado','en vivo','calendario','evento'],
    content: `Cada sábado hay seminarios en vivo, alternando entre Excel y Power BI.
Revisá la pestaña "Eventos" en la plataforma para ver las próximas fechas.`
  },
  {
    keys: ['comunidad','foro','participar','puntos','nivel','ranking'],
    content: `En NAE podés compartir avances, resolver dudas y ganar puntos.
Ganás puntos cuando otros le dan like a tus aportes. Hay 8 niveles, desde Novato hasta Leyenda NAE.
Mirá el ranking en la pestaña "Miembros".`
  }
];

// ── RAG: busca contexto relevante según la pregunta ────────────────────────
function ragContext(pregunta) {
  const q = pregunta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const matches = [];
  for (const bloque of KB) {
    const hit = bloque.keys.some(k => q.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (hit) matches.push(bloque.content);
  }
  if (matches.length === 0) return '';
  return '\n\n════ CONTEXTO RELEVANTE ════\n' + matches.slice(0, 2).join('\n\n---\n');
}

// ── LLAMADA A POLLINATIONS (IA gratuita, sin API key) ──────────────────────
async function llamarIA(pregunta) {
  const contexto = ragContext(pregunta);
  const systemPrompt = PROMPT_BASE + contexto;

  // Construir mensajes (historial reciente)
  const recentHistory = chatHistory.slice(-4);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory,
    { role: 'user', content: pregunta }
  ];

  try {
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: messages,
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new Error('No se pudo conectar');

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Lo siento, no pude procesar eso.';
    return reply;
  } catch (err) {
    console.error('Error IA:', err);
    return '⚠️ Tengo un problema de conexión en este momento. Escribime al WhatsApp 974 688 863 y te ayudo enseguida 😊';
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
    <div class="chat-suggestions" id="chat-suggestions">
      <div class="chat-suggestion" onclick="window.__quickAsk('¿Qué cursos hay?')">📚 ¿Qué cursos hay?</div>
      <div class="chat-suggestion" onclick="window.__quickAsk('¿Cuánto cuesta?')">💰 ¿Cuánto cuesta?</div>
      <div class="chat-suggestion" onclick="window.__quickAsk('¿Cómo pago?')">💳 ¿Cómo pago?</div>
      <div class="chat-suggestion" onclick="window.__quickAsk('¿Hay curso gratis?')">🎁 ¿Hay gratis?</div>
    </div>
    <div class="chat-input-wrap">
      <button class="chat-mic" id="chat-mic" onclick="window.__toggleMic()" title="Hablar">🎤</button>
      <input type="text" class="chat-input" id="chat-input" placeholder="Escribí tu consulta..." onkeydown="if(event.key==='Enter') window.__sendChat()">
      <button class="chat-send" id="chat-send" onclick="window.__sendChat()">➤</button>
    </div>
  `;
  document.body.appendChild(win);

  // Mensaje de bienvenida (limpio y central, como pediste)
  addBotMsg(`Hola, soy <strong style="color:var(--gold);">Alessandra</strong> 🙋‍♀️ ¿En qué te ayudo hoy?`);
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
    setTimeout(() => document.getElementById('chat-input')?.focus(), 200);
  }
}

// ── AÑADIR MENSAJES ─────────────────────────────────────────────────────────
function addBotMsg(text, isHtml = false) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg bot';
  // Agregar botón de "escuchar"
  const speakable = !isHtml;
  const cleanText = speakable ? text.replace(/[*#`>]/g, '') : '';
  div.innerHTML = (isHtml ? text : escapeHtml(text).replace(/\n/g, '<br>')) +
    (speakable ? `<br><button class="chat-speak" onclick="window.__speak('${cleanText.replace(/'/g, "\\'").slice(0, 200)}')">🔊 Escuchar</button>` : '');
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

  const reply = await llamarIA(text);

  removeTyping();
  addBotMsg(reply, true);
  chatHistory.push({ role: 'assistant', content: reply });

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
