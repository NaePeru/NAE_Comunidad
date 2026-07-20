// ============================================================================
// PROYECTO Z — storage.js
// Subida y gestión de avatares y imágenes de comunidad en Supabase Storage.
// ============================================================================
import { supabase } from './supabase-client.js';
import { session } from './auth.js';

const BUCKET = 'avatars';

// ── SUBIR FOTO DE PERFIL ────────────────────────────────────────────────────
// Recibe un File (del input type=file) y lo sube a Storage.
// Devuelve { url } pública o { error }.
export async function subirAvatar(file) {
  if (!file) return { error: 'No se seleccionó archivo.' };
  if (!session.user) return { error: 'No hay sesión.' };

  // Validaciones
  if (!file.type.startsWith('image/')) return { error: 'El archivo debe ser una imagen.' };
  if (file.size > 4 * 1024 * 1024) return { error: 'La imagen pesa más de 4MB.' };

  // Ruta: avatars/<uid>/avatar.jpg  (siempre el mismo nombre → reemplaza)
  const ext = file.name.split('.').pop().toLowerCase();
  const ruta = `${session.user.id}/avatar.${ext}`;

  // Subir (upsert = reemplazar si ya existe)
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(ruta, file, { upsert: true, contentType: file.type });

  if (upErr) return { error: 'No se pudo subir la imagen.' };

  // Obtener URL pública (con cache-buster para forzar refresco)
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  // Guardar la URL en el perfil
  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', session.user.id);

  if (dbErr) return { error: 'Subida OK, pero no se guardó en el perfil.' };

  // Actualizar sesión en memoria
  session.profile.avatar_url = url;

  return { url, error: null };
}

// ── AVATAR HELPERS (para el render) ─────────────────────────────────────────
// Devuelve el HTML de un avatar: si tiene foto → <img>, si no → iniciales.
import { iniciales, colorAvatar } from './utils.js';

// ── SUBIR IMAGEN A LA COMUNIDAD ─────────────────────────────────────────────
export async function subirImagenComunidad(file) {
  if (!session.user) return { error: 'No hay sesión.' };

  try {
    // Generar ruta única: comunidad-img/<uid>/<timestamp>.<ext>
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
    const ruta = `${session.user.id}/${Date.now()}.${ext}`;

    // Subida directa del archivo
    const { error: upErr } = await supabase.storage
      .from('comunidad-img')
      .upload(ruta, file, { cacheControl: '3600', upsert: false });

    if (upErr) return { error: upErr.message || 'No se pudo subir la imagen.' };

    // Obtener URL pública
    const { data: pub } = supabase.storage.from('comunidad-img').getPublicUrl(ruta);
    const url = pub.publicUrl;

    return { url, error: null };
  } catch (e) {
    return { error: 'Error inesperado procesando la imagen: ' + e.message };
  }
}

export function renderAvatar(perfil, sizeClass = 'avatar-md') {
  const nombre = perfil?.nombre || '?';
  const [c1, c2] = perfil?.color || colorAvatar(nombre);
  const ini = iniciales(nombre);

  if (perfil?.avatar_url) {
    return `<img src="${perfil.avatar_url}" class="avatar ${sizeClass}" alt="${nombre}"
              style="object-fit:cover;"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="avatar ${sizeClass}" style="display:none;background:${c1};color:${c2};">${ini}</div>`;
  }
  return `<div class="avatar ${sizeClass}" style="background:${c1};color:${c2};">${ini}</div>`;
}

// Versión para el feed (avatar pequeño de 42px)
export function renderAvatarFeed(perfil) {
  const nombre = perfil?.nombre || '?';
  const [c1, c2] = perfil?.color || colorAvatar(nombre);
  const ini = iniciales(nombre);

  if (perfil?.avatar_url) {
    return `<img src="${perfil.avatar_url}" class="feed-avatar" alt="${nombre}"
              style="object-fit:cover;"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="feed-avatar" style="display:none;background:${c1};color:${c2};">${ini}</div>`;
  }
  return `<div class="feed-avatar" style="background:${c1};color:${c2};">${ini}</div>`;
}
