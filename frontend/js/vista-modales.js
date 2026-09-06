// Modal de configuracion y portada de bienvenida
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

// Boceto de linea (sin fotos, sin colores llamativos) para la portada:
// pedido explicito de que alguien SIN contexto del proyecto pueda entender
// de un vistazo que hace el sistema -"ve" una posicion, no un rostro- sin
// necesidad de mostrar un video real (el render anonimizado de verdad, con
// cajas sobre fondo gris, solo aparece DENTRO del panel, con un video
// elegido). La persona es una silueta a proposito SIN rasgos (ni ojos, ni
// boca): la cara nunca se dibuja, ni siquiera en un boceto. El punto y el
// recuadro punteado en azul son el UNICO dato real que el sistema guarda
// de alguien: su posicion (los pies) en un instante, no su identidad.
// Los colores usan `currentColor` sobre clases `text-[...]` que YA tienen
// su version de modo oscuro en css/estilos.css (mismo mecanismo que el
// resto del dashboard) en vez de colores fijos, para no verse lavado en
// modo oscuro.
const ILUSTRACION_CONCEPTO_SVG = `
<svg viewBox="0 0 360 170" class="w-full h-auto max-w-[300px] mx-auto" role="img" aria-label="Boceto: una gondola con estantes y una persona junto a ella, dibujada sin rostro, con un punto marcando solo su posicion en el piso">
  <line x1="10" y1="155" x2="345" y2="155" class="text-[#D6D3D1]" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <g class="text-[#57534E]" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linejoin="round">
    <rect x="30" y="25" width="120" height="125" rx="4"/>
    <line x1="30" y1="67" x2="150" y2="67"/>
    <line x1="30" y1="108" x2="150" y2="108"/>
  </g>
  <g class="text-[#D6D3D1]" fill="currentColor">
    <rect x="40" y="36" width="16" height="16" rx="2"/>
    <rect x="64" y="36" width="16" height="16" rx="2"/>
    <rect x="88" y="36" width="16" height="16" rx="2"/>
    <rect x="40" y="78" width="16" height="16" rx="2"/>
    <rect x="64" y="78" width="16" height="16" rx="2"/>
    <rect x="40" y="119" width="16" height="16" rx="2"/>
    <rect x="88" y="119" width="16" height="16" rx="2"/>
  </g>
  <g class="text-[#57534E]" fill="currentColor">
    <circle cx="225" cy="58" r="13"/>
    <rect x="205" y="72" width="40" height="48" rx="18"/>
    <rect x="210" y="115" width="10" height="38" rx="5"/>
    <rect x="232" y="115" width="10" height="38" rx="5"/>
  </g>
  <g class="text-[#1F6C9F]">
    <rect x="198" y="146" width="54" height="16" rx="5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
    <circle cx="225" cy="154" r="4" fill="currentColor"/>
    <line x1="252" y1="154" x2="266" y2="154" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/>
    <text x="269" y="158" font-size="11" font-weight="600" fill="currentColor">posición (x, y)</text>
  </g>
</svg>`;

function renderConfigModal() {
  if (!state.isConfigModalOpen) return '';
  const testResultHtml = !state.configTest ? '' : `
    <div class="p-3 rounded-lg border text-xs flex items-start gap-2 ${state.configTest.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}">
      ${state.configTest.success ? icon('check-circle-2', 'w-4 h-4 text-emerald-600 shrink-0 mt-0.5') : icon('alert-triangle', 'w-4 h-4 text-amber-600 shrink-0 mt-0.5')}
      <div class="leading-relaxed">${esc(state.configTest.message)}</div>
    </div>`;

  return `
  <div role="dialog" aria-modal="true" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs modal-backdrop">
    <div class="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden modal-anim">
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-slate-900 text-white">${icon('server', 'w-4 h-4')}</div>
          <div>
            <h2 class="text-sm font-bold text-slate-900">Configuración de la API REST (FastAPI)</h2>
            <p class="text-xs text-slate-500">Conexión exclusiva con el backend de Góndola Inteligente</p>
          </div>
        </div>
        <button type="button" data-action="close-settings" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors" aria-label="Cerrar ventana">${icon('x', 'w-4 h-4')}</button>
      </div>
      <div class="p-6 space-y-5">
        <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
          <div class="space-y-0.5">
            <div class="flex items-center gap-2">${icon('database', 'w-4 h-4 text-indigo-600')}<span class="text-xs font-bold text-slate-900">Modo Datos de Demostración (Contrato Oficial)</span></div>
            <p class="text-xs text-slate-500 leading-relaxed">Útil para explorar la interfaz sin requerir el backend FastAPI corriendo localmente. Replica con precisión los endpoints y esquemas requeridos.</p>
          </div>
          <button type="button" data-action="toggle-mock-in-modal" class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${state.useMockMode ? 'bg-indigo-600' : 'bg-slate-300'}">
            <span class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${state.useMockMode ? 'translate-x-5' : 'translate-x-0'}"></span>
          </button>
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label for="api-base-url-input" class="text-xs font-semibold text-slate-700">Base URL de la API (Python FastAPI):</label>
            <button type="button" data-action="reset-default-url" class="text-[11px] text-indigo-600 hover:underline">Restablecer (127.0.0.1:8000)</button>
          </div>
          <div class="flex gap-2">
            <input id="api-base-url-input" type="text" value="${esc(state.configUrlDraft ?? state.apiBaseUrl)}" placeholder="http://127.0.0.1:8000"
                   class="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            <button type="button" data-action="test-connection" ${state.configTesting ? 'disabled' : ''} class="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50">
              ${state.configTesting ? icon('refresh-cw', 'w-3.5 h-3.5 animate-spin text-slate-500') : icon('server', 'w-3.5 h-3.5 text-slate-500')} Probar
            </button>
          </div>
          <p class="text-[11px] text-slate-500">Valor por defecto: <code class="bg-slate-100 px-1 py-0.5 rounded text-slate-700">http://127.0.0.1:8000</code>. Se consulta el endpoint <code class="bg-slate-100 px-1 py-0.5 rounded text-slate-700">GET /health</code>.</p>
        </div>
        ${testResultHtml}
        <div class="pt-2 border-t border-slate-100">
          <h4 class="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">${icon('help-circle', 'w-3.5 h-3.5 text-slate-400')} Endpoints de solo lectura consumidos:</h4>
          <div class="text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-1">
            <div>GET /health</div><div>GET /videos</div><div>GET /videos/{video_id}</div><div>GET /videos/{video_id}/metrics</div><div>GET /videos/{video_id}/zones</div>
          </div>
        </div>
      </div>
      <div class="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
        <button type="button" data-action="close-settings" class="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200/70 transition-colors">Cancelar</button>
        <button type="button" data-action="save-settings" class="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors">Guardar y Aplicar</button>
      </div>
    </div>
  </div>`;
}

// Modal generico que abre cualquier infoButton() (ver vista-panel.js): un
// solo modal reutilizado por TODAS las tarjetas del dashboard, en vez de
// uno por tarjeta -el texto que muestra viene del propio boton que lo
// abrio (state.infoAbierto = {titulo, texto}, puesto en app.js), no de una
// lista aparte que alguien pueda olvidar mantener sincronizada.
function renderInfoModal() {
  const info = state.infoAbierto;
  if (!info) return '';
  return `
  <div role="dialog" aria-modal="true" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs modal-backdrop">
    <div class="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden modal-anim">
      <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-[#1F6C9F] text-white">${icon('help-circle', 'w-4 h-4')}</div>
          <h2 class="text-sm font-bold text-slate-900">${esc(info.titulo)}</h2>
        </div>
        <button type="button" data-action="cerrar-info" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors" aria-label="Cerrar ventana">${icon('x', 'w-4 h-4')}</button>
      </div>
      <div class="p-5">
        <p class="text-sm text-slate-600 leading-relaxed">${esc(info.texto)}</p>
      </div>
    </div>
  </div>`;
}

// Portada de bienvenida: que se ve esta pagina, que puede hacer, con que
// esta hecha -"muy por encimita", nada tecnico a fondo- y el logo en el
// centro. Vive fuera del <main> normal a proposito: es su propia pantalla
// completa, sin la barra de navegacion ni el resto del dashboard detras.
function renderPantallaInicio() {
  return `
  <div class="min-h-screen flex items-center justify-center px-4 py-10">
    <div class="max-w-xl w-full text-center space-y-6">
      <img src="${LOGO_SPLASH}" alt="Góndola Inteligente" class="mx-auto w-40 sm:w-48 h-auto drop-shadow-sm" />

      <div class="space-y-2">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-[#111111]">Góndola Inteligente</h1>
        <p class="text-sm text-[#57534E] leading-relaxed">
          Analiza video de cámaras de tienda para entender cómo se mueven los clientes
          frente a una góndola — cuántos pasan, dónde se detienen y qué productos tocan —
          sin identificar a ninguna persona.
        </p>
      </div>

      <div class="bg-white rounded-xl border border-[#EAEAEA] p-5 shadow-xs">
        ${ILUSTRACION_CONCEPTO_SVG}
        <p class="text-xs text-[#787774] text-center mt-2 leading-relaxed">
          Así "vemos" a un cliente: nunca su rostro ni su identidad, solo un punto que marca dónde están sus pies frente al estante, cuadro a cuadro.
        </p>
      </div>

      <div class="bg-white rounded-xl border border-[#EAEAEA] p-5 text-left shadow-xs space-y-3">
        <h2 class="text-[10px] font-bold text-[#787774] uppercase tracking-[0.1em]">Qué puede hacer</h2>
        <ul class="space-y-2 text-sm text-[#2F3437]">
          <li class="flex items-start gap-2">${icon('trend-up', 'w-4 h-4 text-[#1F6C9F] shrink-0 mt-0.5')}<span>Contar tráfico y medir cuánto tiempo se detiene la gente frente a un estante.</span></li>
          <li class="flex items-start gap-2">${icon('sparkle', 'w-4 h-4 text-[#1F6C9F] shrink-0 mt-0.5')}<span>Detectar cuándo alguien toma o devuelve un producto, y calcular la tasa de rechazo.</span></li>
          <li class="flex items-start gap-2">${icon('map', 'w-4 h-4 text-[#1F6C9F] shrink-0 mt-0.5')}<span>Un mapa de calor real, por coordenadas, de dónde circula la gente.</span></li>
          <li class="flex items-start gap-2">${icon('layout-grid', 'w-4 h-4 text-[#1F6C9F] shrink-0 mt-0.5')}<span>Comparar dos videos lado a lado con su análisis completo.</span></li>
          <li class="flex items-start gap-2">${icon('shield-check', 'w-4 h-4 text-[#346538] shrink-0 mt-0.5')}<span>100% anónimo: nunca se identifica rostros ni personas, solo trayectorias.</span></li>
        </ul>
      </div>

      <p class="text-[11px] text-[#A8A29E]">
        Hecho con Python (visión por computador) y un dashboard web ligero, sobre una base de datos PostgreSQL.
      </p>

      <button type="button" data-action="entrar-panel"
              class="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1F6C9F] hover:bg-[#18567D] text-white text-sm font-semibold rounded-lg shadow-xs transition-colors">
        Entrar al panel ${icon('arrow-right', 'w-4 h-4')}
      </button>
    </div>
  </div>`;
}
