// ============================================================================
// PROYECTO Z — auth.js
// Autenticación: registro, login, logout, sesión, roles y membresía.
// Reemplaza el antiguo sistema de hash compartido por cuentas individuales.
// ============================================================================

import { supabase } from './supabase-client.js';
import { esEmailValido } from './utils.js';

// ── ESTADO GLOBAL DE SESIÓN ─────────────────────────────────────────────────
export const session = {
  user: null,        // auth user
  profile: null,     // perfil (public.profiles)
  membership: null,  // membresía (public.memberships)
};

// ── REGISTRO CON CONTRASEÑA ─────────────────────────────────────────────────
export async function registrar({ nombre, email, password }) {
  if (!nombre || nombre.trim().length < 2) return { error: 'Ingresa tu nombre.' };
  if (!esEmailValido(email)) return { error: 'Email no válido.' };
  if (!password || password.length < 6) return { error: 'La contraseña debe tener al menos 6 caracteres.' };

  // BLOQUEO SILENCIOSO: Evitar registros de dominios no permitidos
  const dominiosBloqueados = ['@uni.edu.pe'];
  const emailLower = email.toLowerCase().trim();
  for (const dom of dominiosBloqueados) {
    if (emailLower.endsWith(dom)) {
      // Devolvemos un error especial que el frontend va a ignorar silenciosamente
      return { error: 'silent_block', data: null }; 
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre: nombre.trim() } },
  });

  if (error) return { error: traducirErrorAuth(error.message) };
  return { data, error: null };
}

// ── LOGIN CON CONTRASEÑA ────────────────────────────────────────────────────
export async function login(email, password) {
  if (!esEmailValido(email)) return { error: 'Email no válido.' };
  if (!password) return { error: 'Ingresa tu contraseña.' };

  // BLOQUEO SILENCIOSO EN LOGIN (con excepción para el admin)
  const adminEmails = ['geronimo.cruzado.c@uni.edu.pe'];
  const dominiosBloqueados = ['@uni.edu.pe'];
  const emailLower = email.toLowerCase().trim();

  // Si es admin, lo dejamos pasar
  if (!adminEmails.includes(emailLower)) {
    for (const dom of dominiosBloqueados) {
      if (emailLower.endsWith(dom)) {
        return { error: 'silent_block', data: null };
      }
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: traducirErrorAuth(error.message) };
  return { data, error: null };
}

// ── MÉTODOS LEGADOS (Eliminados para evitar duplicados) ────────────────────

// ── LOGOUT ──────────────────────────────────────────────────────────────────
export async function logout() {
  await supabase.auth.signOut();
  Object.assign(session, { user: null, profile: null, membership: null });
  window.location.href = 'comunidad.html';
}

// ── CARGAR PERFIL + MEMBRESÍA DEL USUARIO ACTUAL ────────────────────────────
export async function cargarPerfilCompleto() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  session.user = user;

  // OPTIMIZACIÓN: perfil y membresía son independientes → se cargan en paralelo.
  // Antes se hacían secuenciales (2 viajes a la BD uno tras otro).
  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('memberships').select('*').eq('user_id', user.id).single(),
  ]);

  session.profile = profileRes.data;
  session.membership = membershipRes.data;

  return session;
}

// ── REFRESCAR PERFIL (para que puntos/nivel se actualicen en vivo) ──────────
// Llamar después de acciones que dan puntos (post, comentario, like, lección).
// OPTIMIZACIÓN: antes traía TODAS las columnas. Ahora solo las que cambian
// (puntos, nivel) + las que usa el navbar (rol, nombre, color, avatar_url).
// Hace merge con el perfil existente para no perder datos.
export async function refrescarPerfil(opciones = {}) {
  if (!session.user?.id) return;
  const { data } = await supabase
    .from('profiles')
    .select('puntos, nivel, rol, nombre, color, avatar_url')
    .eq('id', session.user.id)
    .single();
  if (data) {
    const puntosAnt = session.profile?.puntos ?? 0;
    // Merge: conservamos los campos viejos que no trajimos y actualizamos los nuevos
    session.profile = { ...(session.profile || {}), ...data };
    // Avisar a la página que el perfil cambió (para refrescar UI).
    // Con { silent: true } no disparamos el evento (para refrescos internos,
    // p.ej. actualizar el contexto del chat sin re-renderizar la navbar).
    if (opciones?.silent !== true) {
      window.dispatchEvent(new CustomEvent('perfil-actualizado', {
        detail: { puntos: data.puntos, puntosAnteriores: puntosAnt }
      }));
    }
  }
  return session;
}

// ── ¿EL USUARIO ES ADMIN? ───────────────────────────────────────────────────
export function esAdmin() {
  return session.profile?.rol === 'admin';
}

// ── ¿TIENE ACCESO ACTIVO? (membresía vigente y no suspendida) ───────────────
export function tieneAcceso() {
  const m = session.membership;
  if (!m) return false;
  if (m.estado === 'suspendida') return false;
  if (m.estado === 'vencida') return false;
  if (m.estado === 'pendiente') return false;
  if (m.estado === 'rechazada') return false;
  if (m.fecha_vence && new Date(m.fecha_vence) < new Date()) return false;
  return true;
}

// ── ESTADO DE LA MEMBRESÍA (para mostrar mensajes claros) ──────────────────
export function estadoMembresia() {
  return session.membership?.estado || 'pendiente';
}

// ── DÍAS RESTANTES DE LA MEMBRESÍA ──────────────────────────────────────────
export function diasRestantes() {
  const m = session.membership;
  if (!m || !m.fecha_vence) return null;
  const diff = new Date(m.fecha_vence) - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── GUARDAR RUTA DESTINO TRAS LOGIN ─────────────────────────────────────────
// Nota: esta función NO se usa actualmente (las páginas validan sesión inline).
// Antes apuntaba a app/aula.html, que fue movido a /legacy. Se mantiene por
// compatibilidad pero con redirect a comunidad.html (entrada post-login real).
export function requiereAuth(redirect = 'app/comunidad.html') {
  // Esta función la usan las páginas internas para verificar sesión.
  supabase.auth.getSession().then(async ({ data }) => {
    if (!data.session) {
      window.location.href = '../index.html';
      return;
    }
    await cargarPerfilCompleto();
    if (!session.profile) {
      window.location.href = '../index.html';
      return;
    }
  });
}

// ── TRADUCIR ERRORES DE SUPABASE AL ESPAÑOL ─────────────────────────────────
function traducirErrorAuth(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Email o contraseña incorrectos.';
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Ya existe una cuenta con este email.';
  if (m.includes('email rate limit')) return 'Demasiados intentos. Espera un minuto.';
  if (m.includes('password should be')) return 'La contraseña es muy débil (mínimo 6 caracteres).';
  if (m.includes('email not confirmed')) return 'Debes confirmar tu email antes de ingresar.';
  return msg;
}

// ── ESCUCHAR CAMBIOS DE SESIÓN (cierre en otra pestaña, etc.) ───────────────
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    Object.assign(session, { user: null, profile: null, membership: null });
  }
});
