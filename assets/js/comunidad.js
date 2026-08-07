// ============================================================================
// PROYECTO Z — comunidad.js  (v2 — Modelo Skool)
// Puntos por RECIBIR likes + bonus LIVE. Likes en comentarios también.
// ============================================================================

import { supabase } from './supabase-client.js';
import { session, refrescarPerfil, esAdmin } from './auth.js';
import { escapeHtml, iniciales, colorAvatar, tiempoRelativo, getNivel, toast } from './utils.js';
import { parseMarkdown } from './markdown.js';
import { renderAvatarFeed } from './storage.js';

// ── CONFIG DE CATEGORÍAS ────────────────────────────────────────────────────
export const CATEGORIAS = [
  { id: 'general', label: 'General', emoji: '💬' },
  { id: 'excel',   label: 'MS Excel', emoji: '📊' },
  { id: 'powerbi', label: 'Power BI', emoji: '⚡' },
  { id: 'ia',      label: 'IA', emoji: '🤖' },
];

function catInfo(id) {
  return CATEGORIAS.find(c => c.id === id) || CATEGORIAS[0];
}

// ── ESTADO ──────────────────────────────────────────────────────────────────
let filtroActual = 'general';
let cachePosts = [];
let cachePerfiles = {};
let subscription = null;

// ── CARGAR PERFILES EN BATCH ────────────────────────────────────────────────
async function cargarPerfiles(ids) {
  const faltantes = [...new Set(ids)].filter(id => !cachePerfiles[id]);
  if (faltantes.length === 0) return;
  const { data } = await supabase
    .from('profiles')
    .select('id, nombre, puntos, color, avatar_url, rol')
    .in('id', faltantes);
  data?.forEach(p => { cachePerfiles[p.id] = p; });
}

// ── CARGAR FEED ─────────────────────────────────────────────────────────────
export async function cargarFeed() {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id, contenido, categoria, es_live, imagen_url,
      likes_count, comentarios_count, creado_en, autor_id
    `)
    .order('creado_en', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error cargando feed:', error);
    document.getElementById('feed-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar el feed.</div>';
    return;
  }

  if (!data || data.length === 0) {
    cachePosts = [];
    renderFeed();
    return;
  }

  // Mis likes (para saber cuáles ya di like)
  const { data: misLikes } = await supabase
    .from('post_likes')
    .select('post_id')
    .in('post_id', data.map(p => p.id));
  const misLikesSet = new Set((misLikes || []).map(l => l.post_id));
  data.forEach(p => {
    p.likedByMe = misLikesSet.has(p.id);
  });

  await cargarPerfiles(data.map(p => p.autor_id));
  cachePosts = data;
  renderFeed();
}

// ── RENDER FEED ─────────────────────────────────────────────────────────────
function renderFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;

  // Filtrar por categoría
  let visibles = cachePosts.filter(p => p.categoria === filtroActual);

  // Ordenar: posts del ADMIN primero (fijos arriba), después el resto por fecha
  visibles.sort((a, b) => {
    const adminA = cachePerfiles[a.autor_id]?.rol === 'admin' ? 0 : 1;
    const adminB = cachePerfiles[b.autor_id]?.rol === 'admin' ? 0 : 1;
    if (adminA !== adminB) return adminA - adminB;  // admin (0) va primero
    // Si ambos son admin o ambos no-admin, ordenar por fecha (desc)
    return new Date(b.creado_en) - new Date(a.creado_en);
  });

  if (visibles.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌱</div>
        Aún no hay publicaciones${filtroActual !== 'todo' ? ' en esta categoría' : ''}.<br>
        ¡Sé el primero en compartir algo!
      </div>`;
    return;
  }

  const myId = session.user?.id;
  list.innerHTML = visibles.map(p => renderPost(p, myId)).join('');
}

// ── RENDER POST ─────────────────────────────────────────────────────────────
function renderPost(p, myId) {
  const perfil = cachePerfiles[p.autor_id] || { nombre: 'Alumno', puntos: 0, color: null };
  const nivel = getNivel(perfil.puntos || 0);
  const cat = catInfo(p.categoria);
  const likedByMe = p.likedByMe;
  const esMio = p.autor_id === myId;
  const esAdminPost = perfil.rol === 'admin';
  const pinnedBadge = esAdminPost ? '<span class="badge badge-gold" style="font-size:9px;">📌 FIJO</span>' : '';
  const liveBadge = p.es_live ? '<span class="badge badge-live">🔴 LIVE</span>' : '';

  return `
    <div class="feed-post${p.es_live ? ' post-live' : ''}" id="post-${p.id}">
      <div class="feed-header">
        ${renderAvatarFeed(perfil)}
        <div style="flex:1;min-width:0;">
          <div class="feed-name">
            ${escapeHtml(perfil.nombre)}
            ${liveBadge}
          </div>
          <div class="feed-time">
            ${tiempoRelativo(p.creado_en)}${esAdminPost ? ' · <span class="cat-tag">📌 FIJO</span>' : ''}
          </div>
        </div>
      </div>
      ${(() => {
        // Procesar el texto y extraer videos/imágenes
        const resultado = parseMarkdown(p.contenido);
        let textoHtml = resultado.html;
        const embeds = resultado.embeds || [];
        
        let mediaHtml = '';

        // 1. Extraer imagen subida (si existe)
        if (p.imagen_url) {
          mediaHtml += `<img src="${p.imagen_url}" class="feed-image" alt="Imagen" onclick="window.__abrirImagen('${p.imagen_url}')" style="margin:0; flex-shrink:0;">`;
        }

        // 2. Extraer videos de YouTube (si existen en el texto)
        if (embeds.length > 0) {
          embeds.forEach((embed, i) => {
            // Reemplazar el marcador en el texto por un espacio vacío
            textoHtml = textoHtml.replace(`<!--YT_EMBED_${i}-->`, '');
            // Agregar el video a la columna de medios
            mediaHtml += embed;
          });
        }

        // Limpiar párrafos vacíos que hayan quedado
        textoHtml = textoHtml.replace(/<p class="md-p">\s*<\/p>/g, '').trim();

        // 3. Renderizar layout
        if (mediaHtml) {
          // Si hay medios (video/imagen), ponerlos a la DERECHA y el texto a la IZQUIERDA
          return `
            <div style="display:flex; flex-direction: row-reverse; gap:14px; margin-bottom:12px; align-items: flex-start;">
              <div style="flex-shrink: 0;">${mediaHtml}</div>
              <div class="feed-body" style="flex:1; min-width:0; margin:0;">${textoHtml}</div>
            </div>
          `;
        }

        // Si no hay medios, solo texto
        return `<div class="feed-body">${textoHtml}</div>`;
      })()}
      <div class="feed-actions">
        <button class="feed-action ${likedByMe ? 'liked' : ''}" onclick="window.__like('${p.id}')">
          ${likedByMe ? '👍' : '👍🏻'} ${p.likes_count || 0}
        </button>
        <button class="feed-action" onclick="window.__toggleComentarios('${p.id}')">
          💬 ${p.comentarios_count || 0}
        </button>
        ${(esMio || esAdmin()) ? `<button class="feed-action" style="margin-left:auto;color:#64748B;" onclick="window.__borrarPost('${p.id}')" title="Eliminar">🗑️</button>` : ''}
      </div>
      <div class="comments-section" id="comments-${p.id}"></div>
    </div>`;
}

// ── CREAR POST (ahora con flag es_live) ─────────────────────────────────────
export async function crearPost(contenido, categoria, esLive = false, imagenUrl = null) {
  if (!contenido || !contenido.trim()) {
    toast('⚠️ Escribe algo primero');
    return { error: true };
  }
  const { error } = await supabase
    .from('posts')
    .insert({
      contenido: contenido.trim(),
      categoria,
      es_live: esLive,
      imagen_url: imagenUrl,
      autor_id: session.user.id,
    });

  if (error) {
    toast('⚠️ No se pudo publicar');
    return { error: true };
  }

  if (esLive) {
    toast('🔴 ¡Estás en vivo! +5 pts bonus');
  } else {
    toast('✅ Publicado');
  }
  await refrescarPerfil();
  return { error: null };
}

// ── TOGGLE LIKE EN POST ─────────────────────────────────────────────────────
// Importante: el que da el like NO gana puntos. El AUTOR del post gana +1.
async function toggleLike(postId) {
  const myId = session.user.id;
  const post = cachePosts.find(p => p.id === postId);
  if (!post) return;

  if (post.likedByMe) {
    // QUITAR LIKE
    const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', myId);
    if (error) {
      toast('⚠️ No se pudo quitar el like');
      return;
    }
    post.likedByMe = false;
    post.likes_count = Math.max(0, (post.likes_count || 0) - 1);
  } else {
    // DAR LIKE
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: myId });
    if (error) {
      toast('⚠️ No se pudo registrar el like');
      return;
    }
    post.likedByMe = true;
    post.likes_count = (post.likes_count || 0) + 1;
  }
  const el = document.getElementById(`post-${postId}`);
  if (el) el.outerHTML = renderPost(post, myId);
}

// ── COMENTARIOS (ahora con like en comentarios) ─────────────────────────────
async function toggleComentarios(postId) {
  const sec = document.getElementById(`comments-${postId}`);
  const abierto = sec.classList.toggle('open');
  if (abierto) await cargarComentarios(postId);
}

async function cargarComentarios(postId) {
  const sec = document.getElementById(`comments-${postId}`);
  sec.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0;">Cargando...</div>';

  const { data, error } = await supabase
    .from('comments')
    .select('id, contenido, creado_en, autor_id, likes_count')
    .eq('post_id', postId)
    .order('creado_en', { ascending: true });

  if (error) { sec.innerHTML = '<div class="muted" style="font-size:12px;">Error al cargar.</div>'; return; }

  await cargarPerfiles(data.map(c => c.autor_id));

  // Mis likes en comentarios
  const { data: misCommentLikes } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .in('comment_id', data.map(c => c.id));
  const misSet = new Set((misCommentLikes || []).map(l => l.comment_id));

  if (data.length === 0) {
    sec.innerHTML = `
      <div class="muted" style="font-size:12px;padding:6px 0;">Sin comentarios aún. ¡Sé el primero!</div>
      ${renderCommentInput(postId)}`;
    return;
  }

  sec.innerHTML = data.map(c => {
    const perfil = cachePerfiles[c.autor_id] || { nombre: 'Alumno', color: null };
    const [c1, c2] = perfil.color || colorAvatar(perfil.nombre);
    const avatarHtml = perfil.avatar_url
      ? `<img src="${perfil.avatar_url}" class="comment-avatar" style="object-fit:cover;" alt="${escapeHtml(perfil.nombre)}" onerror="this.style.display='none';">`
      : `<div class="comment-avatar" style="background:${c1};color:${c2};">${escapeHtml(iniciales(perfil.nombre))}</div>`;
    const liked = misSet.has(c.id);
    return `
      <div class="comment" id="comment-${c.id}">
        ${avatarHtml}
        <div class="comment-body">
          <div class="comment-name">${escapeHtml(perfil.nombre)}</div>
          <div class="comment-text">${(parseMarkdown(c.contenido) || {}).html || ''}</div>
          <div class="comment-meta">
            <span class="comment-time">${tiempoRelativo(c.creado_en)}</span>
            <button class="comment-like ${liked ? 'liked' : ''}" onclick="window.__likeComment('${c.id}')">
              ${liked ? '❤️' : '🤍'} ${c.likes_count || 0}
            </button>
          </div>
        </div>
      </div>`;
  }).join('') + renderCommentInput(postId);
}

function renderCommentInput(postId) {
  return `
    <div class="comment-input">
      <input type="text" id="comment-text-${postId}" placeholder="Escribe un comentario..."
             onkeydown="if(event.key==='Enter') window.__comentar('${postId}')">
      <button class="btn btn-primary btn-sm" onclick="window.__comentar('${postId}')">Enviar</button>
    </div>`;
}

async function comentar(postId) {
  const input = document.getElementById(`comment-text-${postId}`);
  const texto = input.value.trim();
  if (!texto) return;

  const { error } = await supabase.from('comments').insert({
    post_id: postId,
    autor_id: session.user.id,
    contenido: texto,
  });

  if (error) { toast('⚠️ No se pudo comentar'); return; }
  await cargarComentarios(postId);
  // Actualizar contador
  const post = cachePosts.find(p => p.id === postId);
  if (post) post.comentarios_count = (post.comentarios_count || 0) + 1;
}

// ── TOGGLE LIKE EN COMENTARIO ───────────────────────────────────────────────
async function likeComment(commentId) {
  const btn = event?.target?.closest('.comment-like');
  const wasLiked = btn?.classList.contains('liked');

  if (wasLiked) {
    await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', session.user.id);
  } else {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: session.user.id });
  }
  // Recargar comentarios para refrescar el contador
  // Encontrar postId del comentario abierto
  const openSec = document.querySelector('.comments-section.open');
  if (openSec) {
    const postId = openSec.id.replace('comments-', '');
    await cargarComentarios(postId);
  }
}

// ── BORRAR POST ─────────────────────────────────────────────────────────────
async function borrarPost(postId) {
  if (!confirm('¿Eliminar esta publicación? No se puede deshacer.')) return;
  
  // 1. Borrar primero los likes de los comentarios asociados
  // 2. Borrar los comentarios asociados
  // 3. Borrar los likes del post
  // 4. Finalmente, borrar el post
  
  try {
    // Obtener IDs de comentarios del post
    const { data: comments } = await supabase
      .from('comments')
      .select('id')
      .eq('post_id', postId);
    
    // Borrar likes de esos comentarios (si hay comentarios)
    if (comments && comments.length > 0) {
      const commentIds = comments.map(c => c.id);
      await supabase.from('comment_likes').delete().in('comment_id', commentIds);
    }
    
    // Borrar comentarios del post
    await supabase.from('comments').delete().eq('post_id', postId);
    
    // Borrar likes del post
    await supabase.from('post_likes').delete().eq('post_id', postId);
    
    // Finalmente, borrar el post
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) throw error;
    
    toast('🗑️ Publicación eliminada');
  } catch (err) {
    console.error('Error borrando post:', err);
    toast('⚠️ No se pudo eliminar. Intentá de nuevo.');
  }
}

// ── REALTIME ────────────────────────────────────────────────────────────────
export function iniciarRealtime() {
  if (subscription) return;
  subscription = supabase
    .channel('feed-publico')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'posts' },
      (payload) => {
        if (payload.new.autor_id !== session.user?.id) {
          toast('💬 Nueva publicación en la comunidad');
          cargarFeed();
        }
      }
    )
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'posts' },
      () => cargarFeed()
    )
    .subscribe();
}

// ── FILTRAR ─────────────────────────────────────────────────────────────────
export function filtrar(cat) {
  filtroActual = cat;
  renderFeed();
}
// Exponer el filtro actual para que comunidad.html lo pueda leer al publicar
export function getFiltroActual() { return filtroActual; }

// ── EXPORTAR acciones ───────────────────────────────────────────────────────
window.__like = toggleLike;
window.__toggleComentarios = toggleComentarios;
window.__comentar = comentar;
window.__borrarPost = borrarPost;
window.__likeComment = likeComment;

// ── VISOR MULTIMEDIA (Videos e Imágenes en popup) ──────────────────────────
window.__closeViewer = () => {
  const viewer = document.getElementById('media-viewer');
  if (viewer) {
    viewer.classList.remove('open');
    document.getElementById('media-viewer-body').innerHTML = ''; // Detener video
  }
};

window.__openVideoViewer = (videoId) => {
  const viewer = document.getElementById('media-viewer');
  const body = document.getElementById('media-viewer-body');
  if (!viewer || !body) return;
  body.innerHTML = `
    <div class="media-viewer-video">
      <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1" 
        frameborder="0" 
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen></iframe>
    </div>
  `;
  viewer.classList.add('open');
};

window.__abrirImagen = (url) => {
  const viewer = document.getElementById('media-viewer');
  const body = document.getElementById('media-viewer-body');
  if (!viewer || !body) return;
  body.innerHTML = `<img src="${url}" class="media-viewer-image" alt="Imagen">`;
  viewer.classList.add('open');
};
