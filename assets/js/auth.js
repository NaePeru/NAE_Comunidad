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

// ── REGISTRO / LOGIN CON CÓDIGO OTP (estilo WhatsApp/LinkedIn) ─────────────
// El usuario pone nombre + email → recibe un CÓDIGO de 6 dígitos por correo
// → lo escribe en la app → entra directo. Sin links, sin salir de la app.

// ── Enviar código OTP al email ──────────────────────────────────────────────
export async function enviarCodigoOTP({ nombre, email }) {
  if (!esEmailValido(email))
    return { error: 'Email no válido.' };

  const options = {};
  if (nombre && nombre.trim().length >= 2) {
    options.data = { nombre: nombre.trim() };   // metadata → trigger crea el perfil
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options,
    // NO pasamos emailRedirectTo → forzamos modo código (no link)
  });

  if (error) return { error: traducirErrorAuth(error.message) };
  return { data, error: null, enviado: true };
}

// ── Verificar el código OTP de 6 dígitos ────────────────────────────────────
export async function verificarCodigoOTP(email, token) {
  if (!esEmailValido(email)) return { error: 'Email no válido.' };
  if (!token || token.trim().length < 6) return { error: 'Ingresá el código de 6 dígitos.' };

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: token.trim(),
    type: 'email',
  });

  if (error) return { error: traducirErrorAuth(error.message) };
  return { data, error: null };
}

// ── MÉTODOS LEGADOS (por si se necesitan después) ───────────────────────────
// Mantenemos compatibilidad, pero la app ahora usa Magic Link.
export async function login(email, password) {
  if (!esEmailValido(email)) return { error: 'Email no válido.' };
  if (!password) return { error: 'Ingresa tu contraseña.' };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: traducirErrorAuth(error.message) };
  return { data, error: null };
}

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

  // Perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  session.profile = profile;

  // Membresía
  const { data: membership } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', user.id)
    .single();
  session.membership = membership;

  return session;
}

// ── REFRESCAR PERFIL (para que puntos/nivel se actualicen en vivo) ──────────
// Llamar después de acciones que dan puntos (post, comentario, like, lección).
// Recarga solo el perfil (no toda la sesión) y dispara un evento para que las
// páginas actualicen el chip de nivel y la barra de progreso.
export async function refrescarPerfil() {
  if (!session.user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (profile) {
    const puntosAnt = session.profile?.puntos ?? 0;
    session.profile = profile;
    // Avisar a la página que el perfil cambió (para refrescar UI)
    window.dispatchEvent(new CustomEvent('perfil-actualizado', {
      detail: { puntos: profile.puntos, puntosAnteriores: puntosAnt }
    }));
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
  if (m.fecha_vence && new Date(m.fecha_vence) < new Date()) return false;
  return true;
}

// ── DÍAS RESTANTES DE LA MEMBRESÍA ──────────────────────────────────────────
export function diasRestantes() {
  const m = session.membership;
  if (!m || !m.fecha_vence) return null;
  const diff = new Date(m.fecha_vence) - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── GUARDAR RUTA DESTINO TRAS LOGIN ─────────────────────────────────────────
export function requiereAuth(redirect = 'app/aula.html') {
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
