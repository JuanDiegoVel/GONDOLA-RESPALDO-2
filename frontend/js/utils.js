// Formato, escape, datos de prueba y rutas
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

// --------------------------------------------------------------------------
// Formateo: convierten numeros/fechas crudas de la API en texto legible.
// Ninguna hace calculos de negocio, solo presentacion.
// --------------------------------------------------------------------------
function formatDwellTime(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '—';
  if (seconds < 0) return '0.0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
}
function formatPercentage(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}
function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-ES').format(value);
}
function calculateRejectionRate(putBack, pickUp) {
  if (putBack === null || putBack === undefined || pickUp === null || pickUp === undefined) {
    return { rate: null, label: '—', explanation: 'Sin datos suficientes' };
  }
  if (pickUp === 0) return { rate: null, label: '—', explanation: 'Sin tomas registradas' };
  const rate = putBack / pickUp;
  return { rate, label: `${(rate * 100).toFixed(1)}%`, explanation: `${putBack} de ${pickUp} tomas devueltas` };
}
// Los UNICOS video_id que son datos ficticios metidos a mano en PostgreSQL
// (ver backend/database/seed_example.sql), no un video real que paso por
// el pipeline. Antes esto era una lista de "reales conocidos"
// (VIDEOS_REALES_CONOCIDOS): el problema es que esa lista tiene que
// crecer -a mano, en este archivo- cada vez que CUALQUIERA del equipo
// procesa un video nuevo, y si alguien lo olvida, el video queda
// marcado "Prueba" Y SIN REPRODUCTOR (ver isDemoVideo() e _initSlot(),
// en reproductor.js, los dos lo consultan). Al reves -una lista de
// "pruebas conocidas"- no tiene ese problema: seed_example.sql es un
// archivo fijo y versionado, esta lista NUNCA necesita crecer, y
// cualquier video_id nuevo que la API real devuelva se trata como real
// por defecto, sin que nadie tenga que acordarse de nada.
const VIDEOS_DE_PRUEBA_CONOCIDOS = new Set([
  'video_demo_001',
  'video_demo_002',
]);

function isDemoVideo(videoId) {
  // "PRUEBA" es para los datos inventados a mano (MOCK_VIDEOS y compania,
  // en datos-demo.js, cuando el modo demo esta prendido) Y para los
  // fixtures fijos de seed_example.sql (ver el comentario arriba).
  // Cualquier OTRO video_id que la API real devuelva se asume real: no
  // hay lista que mantener.
  if (!state.useMockMode) return VIDEOS_DE_PRUEBA_CONOCIDOS.has(videoId);
  return videoId.toLowerCase().startsWith('video_demo_');
}
function formatDuration(durationSeconds) {
  if (!durationSeconds || isNaN(durationSeconds)) return '—';
  const mins = Math.floor(durationSeconds / 60);
  const secs = Math.floor(durationSeconds % 60);
  return mins === 0 ? `${secs}s` : `${mins}m ${secs}s`;
}
function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  } catch { return isoString; }
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Estado inicial del flujo de subida (ver subida.js). Vive aqui arriba,
// antes de `state` (estado.js), porque `state` lo llama al construirse: un
// `const` declarado despues todavia no existe en ese momento -portado de
// una version paralela del dashboard (companero de equipo), que agrego la
// subida de video desde el propio navegador.
const SUBIDA_VACIA = () => ({
  abierto: false,
  paso: 'terminos',
  archivo: null,
  terminos: { gondola: false, privacidad: false, custodia: false },
  jobId: null,
  job: null,
  error: null,
  pct: 0,
  rects: [],
  nombreGondola: 'Góndola subida',
});

// --------------------------------------------------------------------------
// Rutas: #/inicio, #/panel y #/comparar
// --------------------------------------------------------------------------
// Antes la portada y el panel eran el mismo `index.html` sin cambiar la URL,
// asi que el boton ATRAS del navegador no volvia a la portada: sacaba de la
// pagina entera. Con un hash por pantalla, cada una es una entrada del
// historial y "atras" hace lo que cualquiera espera. #/comparar tiene su
// PROPIA entrada (no comparte #/panel con el video unico): antes las dos
// compartian ruta y ATRAS desde comparar saltaba directo a la portada sin
// pasar por el video unico -bug real, reportado en la practica-.
//
// Se usa el hash (#/panel) y no History API con rutas de verdad (/panel)
// a proposito: este archivo se abre con doble clic (file://...), sin
// servidor que sirva esas rutas -pushState pondria una URL que al recargar
// daria 404-. El hash funciona igual abierto como archivo o servido.
const RUTAS = ['inicio', 'panel', 'comparar'];

function rutaActual() {
  const r = (location.hash || '').replace(/^#\/?/, '');
  return RUTAS.includes(r) ? r : 'inicio';
}

function irA(ruta) {
  // Cambiar el hash ya dispara 'hashchange', que es quien re-renderiza (ver
  // sincronizarConRuta() y arrancar(), en estado.js): no se llama a
  // setState() aqui para no pintar dos veces.
  if (rutaActual() === ruta) return;
  location.hash = `#/${ruta}`;
}

function sincronizarConRuta() {
  const ruta = rutaActual();
  setState({ mostrandoInicio: ruta === 'inicio', mostrandoComparacion: ruta === 'comparar' });
}
