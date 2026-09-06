// render(), eventos y arranque
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

// Ultimo video cuyos numeros se animaron, para no repetir la animacion.
let hasAnimatedIn = false;
let lastCountedVideoId = null;

function render() {
  const root = document.getElementById('root');
  // La clase vive en <html>, no en #root: #root se reconstruye entero en
  // cada render() (ver el comentario grande junto a #root en index.html),
  // pero el CSS de modo oscuro esta escrito contra "html.dark ..." para
  // que siga aplicando aunque #root cambie de contenido -incluida la
  // pantalla de bienvenida-.
  document.documentElement.classList.toggle('dark', state.darkMode);

  if (state.mostrandoInicio) {
    // Antes del return: la portada no tiene hueco para el reproductor, y
    // como vive fuera de #root (ver reproductor.js) nadie mas lo iba a
    // esconder -bug real, encontrado en la practica: el boton ATRAS del
    // navegador podia traer de vuelta la portada mientras un video seguia
    // reproduciendose en el panel o en la comparacion, y se quedaba
    // flotando encima, todavia sonando.
    ocultarReproductores();
    root.innerHTML = renderPantallaInicio();
    return;
  }

  const errorBlocks = [
    state.errorVideos ? errorAlert({ title: 'Error al consultar lista de videos (/videos)', detail: state.errorVideos, retryAction: 'refresh-videos', isRetrying: state.isLoadingVideos }) : '',
    state.errorDetail ? errorAlert({ title: `Error al consultar video ${esc(state.selectedVideoId)} (/videos/${esc(state.selectedVideoId)})`, detail: state.errorDetail, retryAction: 'retry-detail', isRetrying: state.isLoadingDetail }) : '',
  ].join('');

  const firstPaint = !hasAnimatedIn && !!state.videoDetail;

  // Sin video elegido -a proposito no se auto-elige ninguno, ver
  // loadVideos()-, no tiene sentido mostrar tarjetas de zonas/mapa de
  // calor/etc. todas vacias: se corta ahi con un solo mensaje central.
  const sinVideoElegido = !state.selectedVideoId && !state.isLoadingVideos;

  const mainContent = state.mostrandoComparacion
    ? renderComparisonView()
    : `
    <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-4 ${firstPaint ? 'stagger-in' : ''}">
      ${renderVideoSelector()}
      ${errorBlocks}
      ${sinVideoElegido ? `
      <div class="bg-white rounded-xl border border-dashed border-[#D6D3D1] py-16 text-center">
        ${icon('layers', 'w-8 h-8 text-[#A8A29E] mx-auto mb-3')}
        <h3 class="text-sm font-semibold text-[#2F3437]">Elige un video arriba para ver su análisis</h3>
        <p class="text-xs text-[#787774] mt-1">El panel no elige uno por ti — selecciona uno del desplegable "Video".</p>
      </div>` : `
      ${renderVideoPlayer()}
      ${renderSummaryCards()}
      <!-- Columna izquierda (8/12): tabla y mapa de calor, los datos "crudos".
           Columna derecha (4/12): tarjeta de rechazo + privacidad + el
           diagnostico automatico (renderInsights), que se movio aqui a
           proposito para dejar la izquierda solo con datos, sin texto. -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div class="lg:col-span-8 space-y-4">
          ${renderZonesSection()}
          ${renderPositionsHeatmap()}
          ${renderZonesHeatmap()}
          ${renderFeedback()}
        </div>
        <div class="lg:col-span-4 space-y-4">
          ${renderSidebar()}
          ${renderInsights()}
        </div>
      </div>`}
    </main>`;

  root.innerHTML = `
    <div class="no-imprimir">${renderHeader()}</div>
    <div class="no-imprimir">${renderConnectionBanner()}</div>
    ${mainContent}
    <footer class="no-imprimir bg-white border-t border-[#EAEAEA] py-3.5 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs text-[#787774]">
        <p>Góndola Inteligente · Consola de analítica de video para space management y planogramas.</p>
      </div>
    </footer>
    ${renderConfigModal()}
    ${renderSubidaModal()}
    ${renderInfoModal()}
  `;

  if (firstPaint) hasAnimatedIn = true;
  fillCountUps();

  // Tailwind (CDN) inyecta el CSS de las clases nuevas de forma asincrona
  // -no esta listo en el mismo tick en que se reemplaza root.innerHTML-,
  // asi que medir posiciones (getBoundingClientRect, container.clientWidth)
  // justo aqui puede leer un layout todavia sin estilos aplicados: el
  // reproductor de video quedaba flotando en un sitio equivocado (bug
  // real, visto en pantalla) porque se posicionaba contra ese layout a
  // medias. Un doble requestAnimationFrame espera a que el navegador ya
  // haya pintado con los estilos puestos antes de medir nada.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (state.mostrandoComparacion) {
      pintarHeatmap('positions-heatmap-canvas-a', state.compareAPositions);
      pintarHeatmap('positions-heatmap-canvas-b', state.compareBPositions);
    } else {
      pintarHeatmap('positions-heatmap-canvas', state.positions);
    }
    initVideoPlayer();
    initLienzoZonas();
  }));
}

function fillCountUps() {
  const isNewVideo = state.videoDetail && state.videoDetail.video_id !== lastCountedVideoId;
  document.querySelectorAll('[data-count-target]').forEach((el) => {
    const target = Number(el.dataset.countTarget);
    if (isNewVideo) animateCount(el, target, 650);
    else el.textContent = formatNumber(target);
  });
  if (state.videoDetail) lastCountedVideoId = state.videoDetail.video_id;
}

function animateCount(el, to, duration) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = t <= 0 ? 0 : 1 - Math.pow(2, -10 * t);
    el.textContent = formatNumber(Math.round(to * eased));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatNumber(to);
  }
  requestAnimationFrame(tick);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'entrar-panel') irA('panel');
  else if (action === 'volver-inicio') irA('inicio');
  else if (action === 'exportar-pdf') window.print();
  else if (action === 'exportar-csv') exportarCSV();
  else if (action === 'open-settings') setState({ isConfigModalOpen: true, configTest: null, configUrlDraft: null });
  else if (action === 'toggle-dark-mode') {
    const nuevo = !state.darkMode;
    localStorage.setItem('gondola_dark_mode', String(nuevo));
    setState({ darkMode: nuevo });
  }
  else if (action === 'close-settings') setState({ isConfigModalOpen: false, configTest: null, configUrlDraft: null });
  else if (action === 'mostrar-info') setState({ infoAbierto: { titulo: el.dataset.infoTitulo, texto: el.dataset.infoTexto } });
  else if (action === 'cerrar-info') setState({ infoAbierto: null });
  else if (action === 'refresh-videos') loadVideos();
  else if (action === 'eliminar-video') {
    const actual = state.videos.find((v) => v.video_id === state.selectedVideoId);
    const nombre = actual ? (actual.source_name || actual.video_id) : state.selectedVideoId;
    // confirm() nativo, no un modal propio: es una unica pregunta de
    // si/no antes de una accion que NO se puede deshacer (borra archivos
    // del servidor, no solo la fila de la lista) -no hace falta mas
    // ceremonia que esa para algo tan puntual.
    if (window.confirm(`¿Eliminar "${nombre}"?\n\nEsto borra el video de la base de datos y TODOS sus archivos en el servidor (video, render, calibración). No se puede deshacer.`)) {
      eliminarVideoActual();
    }
  }
  else if (action === 'retry-detail') loadVideoDetail(state.selectedVideoId);
  else if (action === 'retry-health') verifyHealth();
  else if (action === 'enable-mock') toggleMockMode(true);
  else if (action === 'toggle-mock-in-modal') toggleMockMode(!state.useMockMode);
  else if (action === 'zones-view-table') setState({ zonesViewMode: 'table' });
  else if (action === 'zones-view-cards') setState({ zonesViewMode: 'cards' });
  else if (action === 'abrir-comparacion') {
    // #/comparar es su PROPIA ruta en el hash (distinta de #/panel, ver el
    // comentario de mostrandoComparacion en estado.js) -asi ATRAS desde
    // comparar vuelve al video unico, no salta directo a la portada.
    irA('comparar');
    if (!state.compareA && state.selectedVideoId) loadCompareData('A', state.selectedVideoId);
  }
  else if (action === 'cerrar-comparacion') irA('panel');
  else if (action === 'abrir-subida') abrirSubida();
  else if (action === 'subida-cerrar') cerrarSubida();
  else if (action === 'subida-reiniciar') abrirSubida();
  else if (action === 'subida-enviar') subirVideo();
  else if (action === 'subida-zonas') enviarZonas();
  else if (action === 'borrar-rect') {
    const i = Number(el.dataset.indice);
    actualizarSubida({ rects: state.subida.rects.filter((_, n) => n !== i) });
  }
  else if (action === 'subida-ver') {
    const id = state.subida.job && state.subida.job.video_id;
    cerrarSubida();
    if (id) { setState({ selectedVideoId: id }); selectVideo(id); }
  }
  else if (action === 'reset-default-url') { setState({ configUrlDraft: DEFAULT_API_BASE_URL }); }
  else if (action === 'test-connection') {
    const url = document.getElementById('api-base-url-input').value;
    setState({ configTesting: true, configTest: null, configUrlDraft: url });
    try {
      const res = await checkBackendHealth(url);
      setState({ configTesting: false, configTest: { success: true, message: `Conexión exitosa: GET /health respondió status "${res.status}"` } });
    } catch (err) {
      setState({ configTesting: false, configTest: { success: false, message: `No se pudo conectar: ${err.message}. Asegúrate de que el backend FastAPI esté corriendo en ${url}.` } });
    }
  }
  else if (action === 'save-settings') {
    const url = document.getElementById('api-base-url-input').value.trim();
    localStorage.setItem('gondola_api_base_url', url);
    state.apiBaseUrl = url;
    state.isConfigModalOpen = false;
    state.configTest = null;
    state.configUrlDraft = null;
    render();
    verifyHealth();
    loadVideos();
  }
});

document.addEventListener('input', (e) => {
  // Sin render() aqui a proposito: solo guarda lo que la persona ya ve
  // escrito, para que un setState() disparado por otra cosa (el fetch de
  // "Probar", por ejemplo) no lo borre. Ver el docstring de configUrlDraft.
  if (e.target.id === 'api-base-url-input') state.configUrlDraft = e.target.value;
  // Los nombres de los estantes y de la gondola se guardan SIN render(),
  // por el mismo motivo que la URL de arriba: repintar en cada tecla
  // reconstruiria el input y se perderia el cursor a media palabra.
  else if (e.target.id === 'nombre-gondola') state.subida.nombreGondola = e.target.value;
  else if (e.target.dataset.rectNombre !== undefined) {
    const r = state.subida.rects[Number(e.target.dataset.rectNombre)];
    if (r) { r.name = e.target.value; pintarLienzo(); }
  }
  else if (e.target.dataset.rectCategoria !== undefined) {
    const r = state.subida.rects[Number(e.target.dataset.rectCategoria)];
    if (r) r.categoria = e.target.value;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'video-select') selectVideo(e.target.value);
  else if (e.target.id === 'archivo-subida') actualizarSubida({ archivo: e.target.files[0] || null, error: null });
  else if (e.target.dataset.termino) {
    actualizarSubida({ terminos: { ...state.subida.terminos, [e.target.dataset.termino]: e.target.checked } });
  }
  else if (e.target.dataset.compareSlot) loadCompareData(e.target.dataset.compareSlot, e.target.value);
  else if (e.target.id === 'heatmap-style-select') {
    localStorage.setItem('gondola_heatmap_style', e.target.value);
    setState({ heatmapStyle: e.target.value });
  }
});

render();
arrancar();
initPageParticles();
