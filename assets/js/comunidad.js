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
  const faltantes = [...new Set(ids)].filter(id => id && !cachePerfiles[id]);
  if (faltantes.length === 0) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre, puntos, color, avatar_url, rol')
    .in('id', faltantes);
  if (error) {
    console.warn('No se pudieron cargar perfiles:', error.message);
    return;
  }
  data?.forEach(p => { cachePerfiles[p.id] = p; });
}

// ── CARGAR FEED ─────────────────────────────────────────────────────────────
// Paginación por cursor: traemos de a 50 posts. El cursor es la fecha del
// post más viejo cargado. Así evitamos recalcular offsets cuando entran
// posts nuevos mientras el usuario navega (más eficiente y consistente).
const FEED_PAGE_SIZE = 50;
let feedCursor = null;      // fecha del último post cargado (para siguiente página)
let hayMasPosts = false;    // si quedan posts viejos por cargar

export async function cargarFeed(reset = true) {
  if (reset) {
    feedCursor = null;
    cachePosts = [];
  }

  let query = supabase
    .from('posts')
    .select(`
      id, contenido, categoria, es_live, imagen_url,
      likes_count, comentarios_count, creado_en, autor_id
    `)
    .order('creado_en', { ascending: false })
    .limit(FEED_PAGE_SIZE);

  // Si no es reset, traer posts ANTERIORES al cursor (más viejos)
  if (!reset && feedCursor) {
    query = query.lt('creado_en', feedCursor);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error cargando feed:', error);
    if (reset) {
      document.getElementById('feed-list').innerHTML =
        '<div class="empty-state"><div class="empty-icon">⚠️</div>Error al cargar el feed.</div>';
    }
    return;
  }

  // ¿Quedan más posts por cargar? (si vino una página completa, probablemente sí)
  hayMasPosts = (data && data.length === FEED_PAGE_SIZE);

  if (!data || data.length === 0) {
    if (reset) {
      cachePosts = [];
      renderFeed();
    }
    renderBotonCargarMas();   // oculta el botón si no hay más
    return;
  }

  // Actualizar cursor con el post más viejo de esta página
  feedCursor = data[data.length - 1].creado_en;

  // Paralelizar: cargar mis likes Y perfiles al mismo tiempo
  const postIds = data.map(p => p.id);
  const [misLikesRes] = await Promise.all([
    supabase.from('post_likes').select('post_id').in('post_id', postIds),
    cargarPerfiles(data.map(p => p.autor_id)),
  ]);

  const misLikesSet = new Set((misLikesRes.data || []).map(l => l.post_id));
  data.forEach(p => { p.likedByMe = misLikesSet.has(p.id); });

  if (reset) {
    cachePosts = data;
  } else {
    // Evitar duplicados al concatenar (realtime pudo haber agregado alguno)
    const idsExistentes = new Set(cachePosts.map(p => p.id));
    cachePosts = cachePosts.concat(data.filter(p => !idsExistentes.has(p.id)));
  }

  renderFeed();
  renderBotonCargarMas();
}

// ── BOTÓN "CARGAR MÁS" ──────────────────────────────────────────────────────
function renderBotonCargarMas() {
  // Buscar o crear el botón al final del feed
  let btn = document.getElementById('feed-load-more');
  if (!btn) {
    const list = document.getElementById('feed-list');
    if (!list) return;
    btn = document.createElement('div');
    btn.id = 'feed-load-more';
    btn.style.cssText = 'text-align:center; padding:18px;';
    list.after(btn);   // se inserta después del contenedor del feed
  }

  if (hayMasPosts) {
    btn.innerHTML = `<button class="btn btn-ghost" onclick="window.__cargarMasPosts()">⬇️ Cargar más publicaciones</button>`;
  } else {
    btn.innerHTML = `<div style="font-size:12px; color:var(--muted2); padding:8px;">No hay más publicaciones</div>`;
  }
}

window.__cargarMasPosts = async () => {
  const btn = document.getElementById('feed-load-more');
  if (btn) btn.innerHTML = '<div class="spinner" style="margin:0 auto;"></div>';
  await cargarFeed(false);
};

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
          mediaHtml += `<img src="${p.imagen_url}" class="feed-image" alt="Imagen" loading="lazy" decoding="async" onclick="window.__abrirImagen('${p.imagen_url}')" style="margin:0; flex-shrink:0;">`;
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
  if (!session.user?.id) {
    toast('⚠️ Tu sesión expiró. Recargá la página.');
    return { error: true };
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      contenido: contenido.trim(),
      categoria,
      es_live: esLive,
      imagen_url: imagenUrl,
      autor_id: session.user.id,
    })
    .select('id, contenido, categoria, es_live, imagen_url, likes_count, comentarios_count, creado_en, autor_id')
    .single();   // devolvemos el post creado para agregarlo al feed sin recargar

  if (error) {
    toast('⚠️ No se pudo publicar');
    return { error: true };
  }

  // Agregar el post del autor al feed sin recargar todo (optimización).
  // El Realtime filtra el post del propio autor, así que lo agregamos a mano.
  if (data) {
    data.likedByMe = false;
    await agregarPostRealtime(data);
  }

  // ANUNCIO POR EMAIL: cuando el ADMIN publica, se notifica a los alumnos.
  // (Los posts de alumnos normales NO disparan email — decisión de diseño:
  // evitar ruido; solo los anuncios del admin son broadcast.)
  if (esAdmin()) {
    notificarAnuncio(data?.contenido || contenido.trim());
  }

  if (esLive) {
    toast('🔴 ¡Estás en vivo! +5 pts bonus');
  } else {
    toast('✅ Publicado');
  }
  await refrescarPerfil();
  return { error: null };
}

// ── EMAIL DE ANUNCIO (cuando el ADMIN publica en la comunidad) ──────────────
// Fire-and-forget: nunca bloquea la publicación. La Edge Function decide
// si envía (modo test → 1 email al dueño; producción → todos los alumnos).
async function notificarAnuncio(contenido) {
  try {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    await fetch('https://dlpsvbrctccnmvkbcsfp.supabase.co/functions/v1/send-email', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tipo: 'anuncio', contenido }),
    });
  } catch (e) {
    /* silencioso: el email es un bonus, nunca debe romper la publicación */
  }
}

// ── TOGGLE LIKE EN POST ─────────────────────────────────────────────────────
// Importante: el que da el like NO gana puntos. El AUTOR del post gana +1.
async function toggleLike(postId) {
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return; }
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
  // OPTIMIZACIÓN: antes re-renderizábamos TODO el post (outerHTML).
  // Eso destruía y recreaba el nodo completo (videos, imágenes, etc.).
  // Ahora actualizamos solo el botón de like → más rápido y sin flujos raros.
  const likeBtn = document.querySelector(`#post-${postId} .feed-action:first-child`);
  if (likeBtn) {
    likeBtn.classList.toggle('liked', post.likedByMe);
    likeBtn.innerHTML = `${post.likedByMe ? '👍' : '👍🏻'} ${post.likes_count || 0}`;
  }
}

// ── COMENTARIOS (ahora con like en comentarios) ─────────────────────────────
async function toggleComentarios(postId) {
  const sec = document.getElementById(`comments-${postId}`);
  const abierto = sec.classList.toggle('open');
  if (abierto) await cargarComentarios(postId);
}

async function cargarComentarios(postId) {
  const sec = document.getElementById(`comments-${postId}`);
  if (!sec) return;
  sec.innerHTML = '<div class="muted" style="font-size:12px;padding:6px 0;">Cargando...</div>';

  const { data, error } = await supabase
    .from('comments')
    .select('id, contenido, creado_en, autor_id, likes_count')
    .eq('post_id', postId)
    .order('creado_en', { ascending: true });

  if (error) { sec.innerHTML = '<div class="muted" style="font-size:12px;">Error al cargar.</div>'; return; }

  // Early return si no hay comentarios (evita 2 queries innecesarias)
  if (!data || data.length === 0) {
    sec.innerHTML = `
      <div class="muted" style="font-size:12px;padding:6px 0;">Sin comentarios aún. ¡Sé el primero!</div>
      ${renderCommentInput(postId)}`;
    return;
  }

  // OPTIMIZACIÓN: perfiles y mis likes son independientes → paralelas.
  const commentIds = data.map(c => c.id);
  const [, likesRes] = await Promise.all([
    cargarPerfiles(data.map(c => c.autor_id)),
    supabase.from('comment_likes').select('comment_id').in('comment_id', commentIds),
  ]);
  const misSet = new Set((likesRes.data || []).map(l => l.comment_id));

  sec.innerHTML = data.map(c => {
    const perfil = cachePerfiles[c.autor_id] || { nombre: 'Alumno', color: null };
    const [c1, c2] = perfil.color || colorAvatar(perfil.nombre);
    const avatarHtml = perfil.avatar_url
      ? `<img src="${perfil.avatar_url}" class="comment-avatar" loading="lazy" decoding="async" style="object-fit:cover;" alt="${escapeHtml(perfil.nombre)}" onerror="this.style.display='none';">`
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
            <button class="comment-like ${liked ? 'liked' : ''}" onclick="window.__likeComment(event, '${c.id}')">
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
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return; }
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
  // Actualizar contador en cache Y en el DOM
  const post = cachePosts.find(p => p.id === postId);
  if (post) {
    post.comentarios_count = (post.comentarios_count || 0) + 1;
    const commentBtn = document.querySelector(`#post-${postId} .feed-action:nth-child(2)`);
    if (commentBtn) commentBtn.innerHTML = `💬 ${post.comentarios_count}`;
  }
}

// ── TOGGLE LIKE EN COMENTARIO ───────────────────────────────────────────────
async function likeComment(eventArg, commentId) {
  // Guard de sesión
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return; }
  // Ahora recibimos el evento como parámetro (no usamos la variable global deprecada).
  const btn = eventArg?.target?.closest('.comment-like');
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
  if (!session.user?.id) { toast('⚠️ Tu sesión expiró. Recargá la página.'); return; }
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

    // Paralelizar borrado de dependencias (likes de comentarios, comentarios, likes del post)
    const deletes = [
      supabase.from('post_likes').delete().eq('post_id', postId),
      supabase.from('comments').delete().eq('post_id', postId),
    ];
    if (comments && comments.length > 0) {
      const commentIds = comments.map(c => c.id);
      deletes.push(supabase.from('comment_likes').delete().in('comment_id', commentIds));
    }
    await Promise.all(deletes);

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
      async (payload) => {
        if (payload.new.autor_id !== session.user?.id) {
          toast('💬 Nueva publicación en la comunidad');
          // Agregar solo el post nuevo en vez de recargar todo el feed
          await agregarPostRealtime(payload.new);
        }
      }
    )
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'posts' },
      (payload) => {
        // Solo remover el post borrado del cache, sin recargar todo
        const deletedId = payload?.old?.id;
        if (deletedId) {
          cachePosts = cachePosts.filter(p => p.id !== deletedId);
          renderFeed();
        } else {
          cargarFeed();
        }
      }
    )
    .subscribe();
}

// ── DETENER REALTIME ────────────────────────────────────────────────────────
// CRÍTICO para estabilidad: si no desuscribimos el canal al salir de la página,
// la conexión WebSocket queda abierta y se acumula en cada navegación (fuga).
// Llamar desde comunidad.html en 'pagehide' / 'beforeunload'.
export function detenerRealtime() {
  if (subscription) {
    try { supabase.removeChannel(subscription); } catch (e) { /* canal ya cerrado */ }
    subscription = null;
  }
}

// Agregar un solo post nuevo al cache (sin recargar todo el feed)
async function agregarPostRealtime(postNuevo) {
  // Evitar duplicados
  if (cachePosts.some(p => p.id === postNuevo.id)) return;

  // Cargar el perfil del autor del post nuevo
  await cargarPerfiles([postNuevo.autor_id]);

  // Agregar al inicio del cache
  postNuevo.likedByMe = false;
  cachePosts.unshift(postNuevo);
  // Nota: no cortamos a 50 acá porque el usuario pudo haber cargado más páginas.
  // El límite lo controla el cursor de paginación, no el cache.

  renderFeed();
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
