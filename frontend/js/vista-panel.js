// Iconos, cabecera, selector de video y tarjetas de metricas
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

const NOMBRES_LUCIDE_A_PHOSPHOR = {
  'shield-check': 'shield-check', 'sliders': 'faders', 'refresh-cw': 'arrow-clockwise',
  'database': 'database', 'alert-triangle': 'warning', 'help-circle': 'question',
  'clock': 'clock', 'calendar': 'calendar-blank', 'sparkles': 'sparkle',
  'alert-circle': 'warning-circle', 'layers': 'stack', 'tag': 'tag', 'table': 'table',
  'layout-grid': 'squares-four', 'check-circle-2': 'check-circle', 'lightbulb': 'lightbulb',
  'arrow-right': 'arrow-right', 'trending-up': 'trend-up', 'check': 'check', 'x': 'x',
  'server': 'hard-drives', 'map': 'map-pin', 'compass': 'compass',
  'upload': 'upload-simple', 'arrow-left': 'arrow-left',
};

const TAMANO_ICONO_PX = { 'w-3.5': 14, 'w-3': 12, 'w-4': 16, 'w-6': 24, 'w-7': 28, 'w-8': 32 };

function icon(name, cls) {
  cls = cls || '';
  const phosphorName = NOMBRES_LUCIDE_A_PHOSPHOR[name] || name;
  let px = 16;
  for (const clase in TAMANO_ICONO_PX) {
    if (cls.includes(clase)) { px = TAMANO_ICONO_PX[clase]; break; }
  }
  return `<i class="ph-bold ph-${phosphorName} ${cls}" style="font-size:${px}px;line-height:1;display:inline-block"></i>`;
}

// Botoncito "?" para poner junto al titulo de casi cualquier tarjeta del
// dashboard: al pasar el mouse muestra el texto corto (title nativo), y al
// hacer click abre el mismo texto en un modal (renderInfoModal(), en
// vista-modales.js) -pensado para que en pantallas tactiles, donde no hay
// "hover", la explicacion siga siendo alcanzable con un toque. El texto
// vive donde se llama a infoButton(), no en una lista aparte: asi nunca se
// desincroniza el texto del tooltip nativo con el del modal, son el mismo.
function infoButton(titulo, texto) {
  return `<button type="button" data-action="mostrar-info" data-info-titulo="${esc(titulo)}" data-info-texto="${esc(texto)}"
    class="cursor-pointer text-[#A8A29E] hover:text-[#1F6C9F] transition-colors shrink-0"
    title="${esc(texto)}" aria-label="¿De dónde sale este dato?">${icon('help-circle', 'w-3 h-3')}</button>`;
}

function renderHeader() {
  let statusHtml;
  if (state.useMockMode) {
    statusHtml = `<div class="flex items-center gap-1.5">
      <span class="w-2 h-2 rounded-full bg-[#956400]"></span>
      <span class="font-semibold text-[#956400] text-[11px] tracking-wider uppercase">DEMO ACTIVA</span>
    </div>`;
  } else if (state.isCheckingHealth) {
    statusHtml = `<div class="flex items-center gap-1.5">
      ${icon('refresh-cw', 'w-3 h-3 text-[#787774] animate-spin')}
      <span class="text-[11px] font-medium text-[#787774]">VERIFICANDO</span>
    </div>`;
  } else if (state.isBackendHealthy) {
    statusHtml = `<div class="flex items-center gap-1.5">
      <div class="w-2 h-2 rounded-full bg-[#346538]"></div>
      <span class="text-xs font-bold text-[#346538] tracking-wider uppercase">SISTEMA ONLINE</span>
    </div>`;
  } else {
    statusHtml = `<div class="flex items-center gap-1.5">
      <div class="w-2 h-2 rounded-full bg-[#9F2F2D]"></div>
      <span class="text-xs font-bold text-[#9F2F2D] tracking-wider uppercase">OFFLINE</span>
    </div>`;
  }

  return `
  <header class="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-[#EAEAEA] min-h-16 shrink-0 sticky top-0 z-30 shadow-xs">
    <div class="flex items-center gap-3">
      <button type="button" data-action="volver-inicio"
              class="p-2 -ml-1 rounded-lg text-[#57534E] hover:text-[#111111] hover:bg-[#F3F2EF] transition-colors shrink-0"
              title="Volver a la portada" aria-label="Volver a la portada">
        ${icon('arrow-left', 'w-4 h-4')}
      </button>
      <div class="w-9 h-9 rounded-lg bg-[#1F6C9F]/10 text-[#1F6C9F] flex items-center justify-center shrink-0">${icon('layers', 'w-6 h-6')}</div>
      <div>
        <div class="flex items-baseline gap-2">
          <h1 class="text-lg sm:text-xl font-bold tracking-tight text-[#111111]">Góndola Inteligente</h1>
          <span class="text-[11px] font-medium text-[#787774]">v2.4.0</span>
        </div>
        <p class="text-[11px] text-[#787774] hidden sm:block">Métricas de flujo, permanencia y planogramas</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#EDF3EC] text-[#346538] border border-[#C7D6C5] text-xs font-semibold"
           title="El sistema no realiza reconocimiento facial ni almacena datos personales de clientes.">
        ${icon('shield-check', 'w-3.5 h-3.5 text-[#346538] shrink-0')}
        <span>100% Anónimo · Sin Biometría</span>
      </div>
      <div class="flex items-center gap-2 px-3 py-1.5 bg-[#F3F2EF] rounded-md border border-[#EAEAEA] text-xs">
        ${statusHtml}
        <div class="h-3 w-px bg-[#D6D3D1]"></div>
        <button type="button" data-action="toggle-dark-mode"
                class="p-0.5 hover:bg-[#EAEAEA] rounded text-[#57534E] hover:text-[#111111] transition-colors"
                title="${state.darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}" aria-label="Cambiar modo claro/oscuro">
          ${icon(state.darkMode ? 'sun' : 'moon', 'w-3.5 h-3.5')}
        </button>
        <button type="button" data-action="open-settings"
                class="p-0.5 hover:bg-[#EAEAEA] rounded text-[#57534E] hover:text-[#111111] transition-colors"
                title="Configuración de conexión con la API" aria-label="Configuración de la API">
          ${icon('sliders', 'w-3.5 h-3.5')}
        </button>
      </div>
    </div>
  </header>`;
}

function renderConnectionBanner() {
  if (!state.useMockMode && state.isBackendHealthy === false) {
    return `
    <div class="bg-[#FBF3DB] text-[#956400] px-4 py-2 text-xs border-b border-[#EDD9A3]">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          ${icon('alert-triangle', 'w-4 h-4 text-[#7A5200] shrink-0')}
          <span>No se detecta respuesta en <strong class="font-mono">${esc(state.apiBaseUrl)}</strong> (GET /health).</span>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" data-action="enable-mock" class="underline font-bold hover:text-[#5C3F00]">Activar datos de demostración del contrato</button>
          <span>·</span>
          <button type="button" data-action="retry-health" class="hover:underline flex items-center gap-1">${icon('refresh-cw', 'w-3 h-3')} Reintentar</button>
        </div>
      </div>
    </div>`;
  }
  if (state.useMockMode) {
    return `
    <div class="bg-[#F3F2EF] border-b border-[#EAEAEA] px-4 py-1.5 text-xs text-[#57534E]">
      <div class="max-w-7xl mx-auto flex items-center gap-2">
        ${icon('database', 'w-3.5 h-3.5 text-[#1F6C9F] shrink-0')}
        <span><strong class="text-[#111111]">Modo Demostración Activo:</strong> Respuestas mock que reflejan al 100% el contrato de la API FastAPI.</span>
      </div>
    </div>`;
  }
  return '';
}

function renderVideoSelector() {
  const current = state.videos.find((v) => v.video_id === state.selectedVideoId);
  const isDemo = current ? isDemoVideo(current.video_id) : false;

  const options = `<option value="" ${state.selectedVideoId ? '' : 'selected'}>Elegir un video…</option>` +
    state.videos.map((v) => {
      const demo = isDemoVideo(v.video_id);
      return `<option value="${esc(v.video_id)}" ${v.video_id === state.selectedVideoId ? 'selected' : ''}>${esc(v.source_name || v.video_id)} ${demo ? '(PRUEBA)' : '(Real)'}</option>`;
    }).join('');

  const badge = !current ? '' : isDemo
    ? `<span class="px-2.5 py-1 bg-[#FBF3DB] text-[#956400] text-[10px] font-bold rounded flex items-center gap-1 tracking-wider"
             title="Este video corresponde a un conjunto de prueba/simulación. No refleja una grabación real de tienda.">
        ${icon('alert-circle', 'w-3 h-3 text-[#7A5200] shrink-0')} DATOS DE PRUEBA ACTIVOS
       </span>`
    : `<span class="px-2.5 py-1 bg-[#EDF3EC] text-[#346538] border border-[#C7D6C5] text-[10px] font-bold rounded flex items-center gap-1 tracking-wider"
             title="Video capturado y procesado por el pipeline de visión de la tienda.">
        ${icon('sparkles', 'w-3 h-3 text-[#346538] shrink-0')} PRODUCCIÓN REAL
       </span>`;

  const meta = !current ? '' : `
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#F3F2EF] text-[11px] text-[#787774]">
      <div class="flex items-center gap-1" title="Duración del fragmento de video analizado">
        ${icon('clock', 'w-3 h-3 text-[#A8A29E]')}
        <span>Duración: <strong class="text-[#111111] font-semibold">${formatDuration(current.duration_s)}</strong></span>
      </div>
      <span class="w-1 h-1 rounded-full bg-[#D6D3D1] hidden sm:inline-block"></span>
      <div class="flex items-center gap-1" title="Resolución y tasa de cuadros por segundo">
        <span>${current.width}×${current.height} (${current.fps} fps)</span>
      </div>
      <span class="w-1 h-1 rounded-full bg-[#D6D3D1] hidden sm:inline-block"></span>
      <div class="flex items-center gap-1" title="Fecha y hora de procesamiento por el pipeline">
        ${icon('calendar', 'w-3 h-3 text-[#A8A29E]')}
        <span>${formatDateTime(current.processed_at)}</span>
      </div>
    </div>`;

  const errorBox = !state.errorVideos ? '' : `
    <div class="mt-2.5 p-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
      ${icon('alert-circle', 'w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5')}
      <div><span class="font-semibold">Aviso al cargar videos: </span><span>${esc(state.errorVideos)}</span></div>
    </div>`;

  // Los botones de exportar solo salen si hay un video con datos elegido
  // -exportar un "elige un video" no tiene sentido-. El reporte reutiliza
  // exactamente lo que ya esta en pantalla (ver exportarPDF/exportarCSV,
  // en analisis.js), no arma nada aparte.
  const exportar = !current ? '' : `
    <div class="no-imprimir flex items-center gap-1.5">
      <button type="button" data-action="exportar-pdf"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F2EF] hover:bg-[#EAEAEA] rounded-md border border-[#EAEAEA] text-xs font-semibold text-[#2F3437] transition-colors"
              title="Abre el diálogo de impresión del navegador — elige 'Guardar como PDF' ahí">
        ${icon('table', 'w-3.5 h-3.5 text-[#9F2F2D]')} PDF
      </button>
      <button type="button" data-action="exportar-csv"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F2EF] hover:bg-[#EAEAEA] rounded-md border border-[#EAEAEA] text-xs font-semibold text-[#2F3437] transition-colors"
              title="Descarga un .csv que Excel abre directamente">
        ${icon('table', 'w-3.5 h-3.5 text-[#346538]')} Excel
      </button>
    </div>`;

  return `
  <div class="no-imprimir bg-white rounded-xl border border-[#EAEAEA] p-3.5 sm:p-4 shadow-xs">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div class="flex-1 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-[#F3F2EF] rounded-md border border-[#EAEAEA] flex-1 sm:flex-initial min-w-[280px]">
          <span class="text-xs font-medium text-[#57534E] uppercase tracking-wider shrink-0">Video:</span>
          <select id="video-select" data-action="select-video" ${state.isLoadingVideos || !state.videos.length ? 'disabled' : ''}
                  class="bg-transparent text-sm font-semibold text-[#2F3437] outline-none cursor-pointer w-full py-0.5">
            ${options}
          </select>
        </div>
        <div class="flex items-center">${badge}</div>
        ${current && !state.useMockMode && current.video_id.startsWith('subido_') ? `
        <button type="button" data-action="eliminar-video" ${state.isDeletingVideo ? 'disabled' : ''}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F2EF] hover:bg-[#9F2F2D]/10 rounded-md border border-[#EAEAEA] hover:border-[#9F2F2D]/30 text-xs font-semibold text-[#9F2F2D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Borrar este video de la base de datos y del servidor. No se puede deshacer.">
          ${icon(state.isDeletingVideo ? 'refresh-cw' : 'trash', `w-3.5 h-3.5 ${state.isDeletingVideo ? 'animate-spin' : ''}`)} ${state.isDeletingVideo ? 'Borrando…' : 'Eliminar'}
        </button>` : ''}
        <button type="button" data-action="abrir-comparacion"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F2EF] hover:bg-[#EAEAEA] rounded-md border border-[#EAEAEA] text-xs font-semibold text-[#2F3437] transition-colors">
          ${icon('trending-up', 'w-3.5 h-3.5 text-[#1F6C9F]')} Comparar dos videos
        </button>
        <button type="button" data-action="abrir-subida" ${state.useMockMode ? 'disabled title="Apaga el Modo Datos de Demostración para subir un video: hace falta la API real."' : ''}
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F3F2EF] hover:bg-[#EAEAEA] rounded-md border border-[#EAEAEA] text-xs font-semibold text-[#2F3437] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          ${icon('upload', 'w-3.5 h-3.5 text-[#346538]')} Subir video
        </button>
        ${exportar}
        <button type="button" data-action="refresh-videos" ${state.isLoadingVideos ? 'disabled' : ''}
                class="inline-flex items-center gap-1 text-xs font-medium text-[#1F6C9F] hover:text-[#18567D] disabled:opacity-50 transition-colors ml-auto sm:ml-0"
                title="Volver a consultar lista de videos en /videos">
          ${icon('refresh-cw', `w-3 h-3 ${state.isLoadingVideos ? 'animate-spin' : ''}`)}
          <span class="text-[11px]">Actualizar</span>
        </button>
      </div>
      ${meta}
    </div>
    ${errorBox}
  </div>
  <div class="solo-imprimir" style="margin-bottom:1rem">
    <h1 style="font-size:1.25rem;font-weight:700">Góndola Inteligente — Reporte de análisis</h1>
    ${current ? `<p style="font-size:0.8rem;color:#57534E">Video: ${esc(current.source_name || current.video_id)} (${esc(current.video_id)}) — ${isDemo ? 'DATOS DE PRUEBA' : 'Producción real'} — generado ${esc(new Date().toLocaleString('es-CO'))}</p>` : ''}
  </div>`;
}

function metricCard({ id, title, value, subtext, badge, tone = 'neutral', tooltip, highlight = false, barColor = '#1F6C9F', progressPercent = 50, countTarget = null }) {
  const toneClasses = { accent: 'text-[#346538]', warning: 'text-[#B8790B]', danger: 'text-[#9F2F2D]', info: 'text-[#1F6C9F]', neutral: 'text-[#787774]' };
  const clamped = Math.min(100, Math.max(0, progressPercent));
  const valueHtml = countTarget !== null
    ? `<span class="text-2xl sm:text-3xl font-bold tracking-tight text-[#111111] tabular-nums" data-count-target="${countTarget}">0</span>`
    : `<span class="text-2xl sm:text-3xl font-bold tracking-tight text-[#111111] tabular-nums">${value}</span>`;
  return `
  <div id="${id}" class="p-4 rounded-xl border card-lift flex flex-col justify-between shadow-xs ${highlight ? 'bg-white border-[#1F6C9F]/40 ring-1 ring-[#1F6C9F]/20' : 'bg-white border-[#EAEAEA]'}">
    <div class="flex items-center justify-between gap-1 mb-1">
      <span class="text-[10px] font-bold text-[#787774] uppercase tracking-[0.1em] truncate" title="${esc(title)}">${esc(title)}</span>
      ${tooltip ? infoButton(title, tooltip) : ''}
    </div>
    <div class="my-1">
      <div class="flex items-baseline gap-2">
        ${valueHtml}
        ${badge ? `<span class="text-xs font-medium truncate ${toneClasses[tone]}">${esc(badge)}</span>` : ''}
      </div>
      <p class="text-[11px] text-[#787774] truncate mt-0.5" title="${esc(subtext)}">${esc(subtext)}</p>
    </div>
    <div class="w-full bg-[#F3F2EF] h-1 rounded-full overflow-hidden mt-2">
      <div class="h-full w-full kpi-bar rounded-full" style="transform:scaleX(${clamped / 100});background-color:${barColor}"></div>
    </div>
  </div>`;
}

// Video anonimizado (RENDER_MODE=privacy del AI Service): PILOTO, solo
// para probar si el equipo lo quiere -ver GET /videos/{id}/render en
// backend/api.py-. No existe en modo demo (los datos de MOCK_* no tienen
// ningun archivo de video detras, solo numeros inventados a mano) y no
// todos los videos reales tienen este render generado, por eso el
// manejo de error inline: si el archivo no esta, se oculta el
// reproductor roto y se muestra un aviso en vez de un cuadro negro.
function renderVideoPlayer() {
  // No solo "modo demo global apagado": un video de PRUEBA especifico
  // (video_demo_001/002, fixtures armados a mano en la base de datos, ver
  // isDemoVideo()) tampoco tiene ningun render real detras, aunque el
  // modo demo global este apagado -si no, el reproductor intenta cargar
  // y siempre muestra "no disponible", que no aporta nada a quien esta
  // viendo un dato de prueba a proposito.
  if (!state.selectedVideoId || isDemoVideo(state.selectedVideoId)) return '';
  // El <video> de verdad NO va aqui adentro: vive en #video-player-portal,
  // FUERA de #root (ver el <body> y el comentario grande en reproductor.js,
  // junto a initVideoPlayer()). Este div es solo un HUECO -con una altura
  // fija, para que el portal sepa que tamano ocupar- que reserva el
  // espacio en el layout normal de la pagina.
  return `
  <div class="no-imprimir bg-white rounded-xl border border-[#EAEAEA] p-4 sm:p-5 shadow-xs">
    <div class="flex items-center gap-2.5 mb-3">
      <div class="w-7 h-7 rounded-lg bg-[#F3F2EF] text-[#787774] flex items-center justify-center shrink-0">${icon('video-camera', 'w-4 h-4')}</div>
      <div>
        <h3 class="text-sm font-bold text-[#111111]">Video anonimizado</h3>
        <p class="text-[11px] text-[#787774]">Sin imágenes reales de la tienda — solo la detección</p>
      </div>
    </div>
    <div id="video-player-placeholder" class="w-full rounded-lg bg-[#0B1220]" style="height:400px"></div>
  </div>`;
}
