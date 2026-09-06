// Subir un video desde el navegador
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

// ==========================================================================
// SUBIR UN VIDEO (portado de una version paralela del dashboard, hecha por
// un companero de equipo -ver backend/uploads.py para el lado servidor-).
// --------------------------------------------------------------------------
// Seis pasos, uno por pantalla del mismo modal:
//   terminos -> subiendo -> revisando -> zonas -> procesando -> listo
//                                    \-> rechazado
//
// El paso "zonas" no se puede saltar: las zonas son rectangulos en pixeles
// de UNA camara concreta (ver docs/zones-format.md), y un video que sube
// alguien viene de otra. Sin ese dibujo, el backend no puede medir por
// estante -y su importador se niega a importar-. Es preferible pedir treinta
// segundos de calibracion que inventar unas zonas por defecto y mostrar
// metricas por estante que no significan nada.
// ==========================================================================

// El frame de fondo y el temporizador de sondeo viven FUERA de state: son un
// objeto Image() y un id de setTimeout, no datos que la interfaz pinte, y
// meterlos en state solo haria ruido en cada setState().
let imagenCalibracion = null;
let sondeoSubida = null;

// sondearTrabajo() llama a setState() cada 2s mientras el prevuelo/proceso
// esta en marcha, y setState() reconstruye #root ENTERO (incluido este
// modal, ver app.js) en cada vuelta -incluidas las clases
// 'modal-backdrop'/'modal-anim', que traen una animacion de ENTRADA (fade
// + escala). Al recrear el mismo nodo con las mismas clases cada 2s, el
// navegador vuelve a disparar esa animacion de entrada una y otra vez: el
// modal "parpadea" (se ve pestanear) todo el tiempo que dura la subida,
// no solo al abrirse -bug real, reportado en la practica-. Con esta bandera
// la animacion de entrada se pinta SOLO la primera vez que el modal
// aparece en pantalla; los repintados de despues (con contenido
// actualizado: la barra de progreso, el mensaje) no vuelven a animarse.
let subidaYaAnimada = false;

function abrirSubida() {
  imagenCalibracion = null;
  subidaYaAnimada = false;
  setState({ subida: { ...SUBIDA_VACIA(), abierto: true } });
}

function cerrarSubida() {
  clearTimeout(sondeoSubida);
  sondeoSubida = null;
  imagenCalibracion = null;
  subidaYaAnimada = false;
  setState({ subida: SUBIDA_VACIA() });
}

function actualizarSubida(cambios) {
  setState({ subida: { ...state.subida, ...cambios } });
}

function terminosCompletos() {
  const t = state.subida.terminos;
  return t.gondola && t.privacidad && t.custodia;
}

function subirVideo() {
  const s = state.subida;
  if (!s.archivo || !terminosCompletos()) return;
  const datos = new FormData();
  datos.append('file', s.archivo);
  datos.append('acepta_terminos', 'true');
  datos.append('confirma_gondola', 'true');

  // XMLHttpRequest en vez de fetch() a proposito: fetch no sabe informar del
  // progreso de SUBIDA, y un video de decenas de MB sin barra parece colgado.
  const peticion = new XMLHttpRequest();
  peticion.open('POST', `${cleanBaseUrl(state.apiBaseUrl)}/uploads`);
  peticion.upload.onprogress = (e) => {
    if (e.lengthComputable) actualizarSubida({ pct: Math.round((e.loaded / e.total) * 100) });
  };
  peticion.onload = () => {
    let cuerpo = null;
    try { cuerpo = JSON.parse(peticion.responseText); } catch { /* respuesta no-JSON */ }
    if (peticion.status >= 400) {
      actualizarSubida({ paso: 'rechazado', error: (cuerpo && cuerpo.detail) || `El servidor respondió ${peticion.status}.` });
      return;
    }
    actualizarSubida({ paso: 'revisando', jobId: cuerpo.job_id, job: cuerpo, pct: 100 });
    sondearTrabajo();
  };
  peticion.onerror = () => actualizarSubida({
    paso: 'rechazado',
    error: `No se pudo contactar la API en ${state.apiBaseUrl}. ¿Está corriendo?`,
  });
  actualizarSubida({ paso: 'subiendo', pct: 0, error: null });
  peticion.send(datos);
}

async function sondearTrabajo() {
  const s = state.subida;
  if (!s.jobId) return;
  try {
    const job = await fetchFromApi(`${cleanBaseUrl(state.apiBaseUrl)}/uploads/${s.jobId}`);
    const siguiente = {
      esperando_zonas: 'zonas',
      procesando: 'procesando',
      listo: 'listo',
      rechazado: 'rechazado',
      error: 'rechazado',
    }[job.estado] || 'revisando';
    actualizarSubida({ job, paso: siguiente, error: siguiente === 'rechazado' ? job.mensaje : null });
    if (job.estado === 'listo') {
      loadVideos();
      return;
    }
    if (job.estado === 'rechazado' || job.estado === 'error') return;
    // 'esperando_zonas' tambien corta el sondeo: nada va a cambiar del lado
    // del servidor mientras la persona dibuja los estantes -el siguiente
    // paso (procesando) lo arranca enviarZonas() a mano, no este sondeo-.
    // Sin este corte, cada 2s se reconstruia el modal ENTERO (incluido el
    // <canvas> de calibracion, un nodo nuevo) aunque el estado del trabajo
    // no hubiera cambiado: el lienzo con los rectangulos ya dibujados
    // parpadeaba y se reiniciaba a medio dibujar -bug real, reportado en la
    // practica-.
    if (job.estado === 'esperando_zonas') return;
  } catch (err) {
    actualizarSubida({ error: `Se perdió el contacto con la API: ${err.message}` });
  }
  sondeoSubida = setTimeout(sondearTrabajo, 2000);
}

async function enviarZonas() {
  const s = state.subida;
  if (!s.rects.length) return;
  try {
    const cuerpo = {
      gondola_name: s.nombreGondola || 'Góndola subida',
      shelves: s.rects.map((r, i) => ({
        name: r.name || `Estante ${i + 1}`,
        product_category: r.categoria || null,
        x: Math.round(r.x), y: Math.round(r.y),
        width: Math.round(r.w), height: Math.round(r.h),
      })),
    };
    const res = await fetch(`${cleanBaseUrl(state.apiBaseUrl)}/uploads/${s.jobId}/zones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      actualizarSubida({ error: e.detail || `El servidor respondió ${res.status}.` });
      return;
    }
    actualizarSubida({ paso: 'procesando', error: null, job: await res.json() });
    sondearTrabajo();
  } catch (err) {
    actualizarSubida({ error: `No se pudieron guardar las zonas: ${err.message}` });
  }
}

// --- El lienzo de calibración -------------------------------------------
// Se dibuja a mano en vez de con una libreria: son cuatro rectangulos sobre
// una imagen. Las coordenadas se guardan SIEMPRE en pixeles del frame
// original (no de la pantalla), que es lo que espera data/zones/*.json.

function pintarLienzo() {
  const lienzo = document.getElementById('lienzo-zonas');
  if (!lienzo || !imagenCalibracion) return;
  const ctx = lienzo.getContext('2d');
  const escala = lienzo.width / imagenCalibracion.naturalWidth;
  ctx.drawImage(imagenCalibracion, 0, 0, lienzo.width, lienzo.height);

  // Puntos de apoyo (pies) de la gente que el prevuelo YA vio en este mismo
  // video (ver `puntos_pies` en backend/uploads.py), dibujados ANTES que
  // los rectangulos -para que la persona vea donde camina la gente de
  // verdad y dibuje la zona ENCIMA de esos puntos, en vez de adivinar
  // mirando solo donde se ven los productos-. Pedido explicito: antes de
  // esto, alguien calibrando a ojo podia marcar el estante (arriba del
  // cuadro, en camara cenital) en vez del piso (mas abajo, donde estan los
  // pies), y esa zona nunca hacia match con nadie -bug real, encontrado
  // en la practica-.
  const puntos = (state.subida.job && state.subida.job.detalles && state.subida.job.detalles.puntos_pies) || [];
  puntos.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x * escala, p.y * escala, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(52,101,56,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  state.subida.rects.forEach((r, i) => {
    ctx.strokeStyle = '#1F6C9F';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(31,108,159,0.18)';
    ctx.fillRect(r.x * escala, r.y * escala, r.w * escala, r.h * escala);
    ctx.strokeRect(r.x * escala, r.y * escala, r.w * escala, r.h * escala);
    ctx.fillStyle = '#1F6C9F';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`${i + 1}. ${r.name || 'sin nombre'}`, r.x * escala + 6, r.y * escala + 18);
  });
}

function initLienzoZonas() {
  const lienzo = document.getElementById('lienzo-zonas');
  if (!lienzo || state.subida.paso !== 'zonas') return;

  const dibujar = () => {
    const ancho = Math.min(lienzo.parentElement.clientWidth, imagenCalibracion.naturalWidth);
    lienzo.width = ancho;
    lienzo.height = Math.round(ancho * imagenCalibracion.naturalHeight / imagenCalibracion.naturalWidth);
    pintarLienzo();
  };

  // Pintar Y enganchar los manejadores de mouse viven en la MISMA funcion
  // -activar()-, llamada desde los DOS caminos posibles (imagen ya cargada
  // de una vuelta anterior, o recien terminada de cargar) en vez de que
  // enganchar los manejadores depende de una SEGUNDA llamada a
  // initLienzoZonas() despues de la primera (la de la imagen). Antes esa
  // segunda llamada la disparaba gratis el sondeo de subida, que volvia a
  // renderizar el modal entero cada 2s -incluso ya en el paso 'zonas', un
  // bug real de parpadeo, arreglado en sondearTrabajo()-. Al arreglar eso
  // se corto tambien la unica repeticion que hacia que esta funcion
  // llegara alguna vez a enganchar onmousedown/onmousemove/onmouseup:
  // la imagen se veia, pero arrastrar para dibujar un estante no hacia
  // nada -bug real, reportado en la practica, sintoma inverso al parpadeo
  // pero misma causa raiz-.
  const activar = () => {
    dibujar();

    // Arrastrar para crear un rectangulo. Durante el arrastre NO se llama a
    // setState(): repintar todo el dashboard en cada mousemove daria tirones.
    // Solo al soltar se guarda el rectangulo y se vuelve a renderizar -eso
    // SI dispara un render() nuevo, que crea un <canvas> nuevo, por eso
    // activar() se vuelve a llamar entera la proxima vez en vez de enganchar
    // los manejadores una sola vez para siempre.
    let inicio = null;
    const aFrame = (e) => {
      const caja = lienzo.getBoundingClientRect();
      const escala = imagenCalibracion.naturalWidth / caja.width;
      return { x: (e.clientX - caja.left) * escala, y: (e.clientY - caja.top) * escala };
    };
    lienzo.onmousedown = (e) => { if (state.subida.rects.length < 4) inicio = aFrame(e); };
    lienzo.onmousemove = (e) => {
      if (!inicio) return;
      const p = aFrame(e);
      pintarLienzo();
      const ctx = lienzo.getContext('2d');
      const escala = lienzo.width / imagenCalibracion.naturalWidth;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#9F2F2D';
      ctx.strokeRect(inicio.x * escala, inicio.y * escala, (p.x - inicio.x) * escala, (p.y - inicio.y) * escala);
      ctx.setLineDash([]);
    };
    lienzo.onmouseup = (e) => {
      if (!inicio) return;
      const p = aFrame(e);
      const r = {
        x: Math.min(inicio.x, p.x), y: Math.min(inicio.y, p.y),
        w: Math.abs(p.x - inicio.x), h: Math.abs(p.y - inicio.y),
        name: `Estante ${state.subida.rects.length + 1}`, categoria: '',
      };
      inicio = null;
      // Un clic sin arrastrar no es un estante: se ignora en vez de crear un
      // rectangulo de 2 px que despues hay que borrar a mano.
      if (r.w < 20 || r.h < 20) { pintarLienzo(); return; }
      actualizarSubida({ rects: [...state.subida.rects, r] });
    };
    lienzo.onmouseleave = () => { inicio = null; pintarLienzo(); };
  };

  if (!imagenCalibracion) {
    const img = new Image();
    img.onload = () => { imagenCalibracion = img; activar(); };
    img.onerror = () => actualizarSubida({ error: 'No pude cargar el fotograma de calibración.' });
    img.src = `${cleanBaseUrl(state.apiBaseUrl)}/uploads/${state.subida.jobId}/frame`;
    return;
  }
  activar();
}

// --- Las seis pantallas --------------------------------------------------

function casillaTermino(clave, texto) {
  const marcada = state.subida.terminos[clave];
  return `
    <label class="flex items-start gap-2.5 p-3 rounded-lg border ${marcada ? 'border-[#1F6C9F]/40 bg-[#1F6C9F]/5' : 'border-[#EAEAEA] bg-white'} cursor-pointer transition-colors">
      <input type="checkbox" data-termino="${clave}" ${marcada ? 'checked' : ''} class="mt-0.5 accent-[#1F6C9F] w-4 h-4 shrink-0">
      <span class="text-xs leading-relaxed text-[#2F3437]">${texto}</span>
    </label>`;
}

function barraProgreso(pct, etiqueta) {
  return `
    <div>
      <div class="flex justify-between text-xs font-medium text-[#57534E] mb-1.5">
        <span>${esc(etiqueta)}</span><span class="tabular-nums">${pct}%</span>
      </div>
      <div class="h-2 bg-[#EAEAEA] rounded-full overflow-hidden">
        <div class="h-full bg-[#1F6C9F] transition-all duration-300" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function cuerpoSubida() {
  const s = state.subida;
  const err = s.error ? `
    <div class="p-3 rounded-lg border border-[#9F2F2D]/30 bg-[#9F2F2D]/5 text-xs text-[#9F2F2D] leading-relaxed">${esc(s.error)}</div>` : '';

  if (s.paso === 'terminos') {
    return `
      ${err}
      <div class="space-y-2">
        ${casillaTermino('gondola', 'Declaro que el video muestra una <strong>góndola o lineal de tienda</strong> y a sus clientes, y que tengo autorización para analizarlo.')}
        ${casillaTermino('privacidad', 'Entiendo que el sistema <strong>no identifica personas</strong>: no reconoce rostros, no infiere edad, género ni emociones. Solo cuenta siluetas y mide permanencia e interacción.')}
        ${casillaTermino('custodia', 'Entiendo que el video se guarda <strong>en esta máquina</strong> (<code>data/videos/</code>), no se sube a internet, y que si la revisión previa lo rechaza <strong>se borra en el acto</strong>.')}
      </div>
      <div>
        <label class="block text-xs font-semibold text-[#57534E] mb-1.5">Archivo de video</label>
        <input type="file" id="archivo-subida" accept="video/mp4,video/quicktime,video/x-msvideo,video/*"
               class="block w-full text-xs text-[#2F3437] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#F3F2EF] file:text-[#2F3437] hover:file:bg-[#EAEAEA] cursor-pointer">
        ${s.archivo ? `<p class="text-[11px] text-[#787774] mt-1.5">${esc(s.archivo.name)} · ${(s.archivo.size / 1048576).toFixed(1)} MB</p>` : ''}
      </div>
      <p class="text-[11px] text-[#787774] leading-relaxed">
        Antes de procesarlo, el sistema revisa que el archivo abra, que dure entre 5 s y 15 min, y que
        <strong>YOLO encuentre personas</strong> en una muestra de 24 fotogramas. No comprueba que sea una góndola:
        eso no lo puede saber un detector de objetos, y por eso lo declaras tú arriba.
      </p>`;
  }

  if (s.paso === 'subiendo') return `${err}${barraProgreso(s.pct, 'Subiendo el archivo...')}`;

  if (s.paso === 'revisando') {
    return `
      ${err}
      <div class="flex items-center gap-3 text-sm text-[#2F3437]">
        ${icon('refresh-cw', 'w-4 h-4 animate-spin text-[#1F6C9F]')}
        <span>Revisando el video con YOLO (24 fotogramas repartidos)...</span>
      </div>`;
  }

  if (s.paso === 'rechazado') {
    return `
      <div class="p-4 rounded-lg border border-[#9F2F2D]/30 bg-[#9F2F2D]/5">
        <p class="text-sm font-bold text-[#9F2F2D] mb-1">Video no apto</p>
        <p class="text-xs text-[#2F3437] leading-relaxed">${esc(s.error || (s.job && s.job.mensaje) || 'Sin motivo.')}</p>
      </div>
      <p class="text-[11px] text-[#787774]">El archivo ya se borró de <code>data/videos/</code>.</p>`;
  }

  if (s.paso === 'zonas') {
    const d = (s.job && s.job.detalles) || {};
    const aviso = d.frame_con_personas ? `
      <div class="p-2.5 rounded-lg border border-[#956400]/30 bg-[#956400]/5 text-[11px] text-[#956400] leading-relaxed">
        Este video no tiene ningún fotograma sin gente, así que el fondo muestra personas reales.
        No se guarda ni se comparte: solo se usa aquí para que puedas ubicar los estantes.
      </div>` : `
      <div class="p-2.5 rounded-lg border border-[#346538]/30 bg-[#346538]/5 text-[11px] text-[#346538] leading-relaxed">
        El fondo es un fotograma <strong>sin ninguna persona detectada</strong>, elegido a propósito para calibrar sin mirar a nadie.
      </div>`;
    const lista = s.rects.length ? s.rects.map((r, i) => `
      <div class="flex items-center gap-2">
        <span class="text-[11px] font-bold text-[#1F6C9F] w-4 shrink-0">${i + 1}</span>
        <input type="text" data-rect-nombre="${i}" value="${esc(r.name)}" placeholder="Nombre del estante"
               class="flex-1 min-w-0 px-2 py-1 text-xs border border-[#EAEAEA] rounded-md bg-white">
        <input type="text" data-rect-categoria="${i}" value="${esc(r.categoria || '')}" placeholder="categoría"
               class="w-24 px-2 py-1 text-xs border border-[#EAEAEA] rounded-md bg-white">
        <button type="button" data-action="borrar-rect" data-indice="${i}"
                class="p-1 rounded text-[#9F2F2D] hover:bg-[#9F2F2D]/10 shrink-0" aria-label="Borrar">${icon('x', 'w-3.5 h-3.5')}</button>
      </div>`).join('') : `<p class="text-[11px] text-[#787774]">Todavía no has dibujado ningún estante.</p>`;

    const puntosPies = d.puntos_pies || [];
    const guiaPies = puntosPies.length ? `
      <p class="text-[11px] text-[#57534E] flex items-center gap-1.5">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:rgba(52,101,56,0.75);border:1px solid #fff;box-shadow:0 0 0 1px #34653880"></span>
        Los puntos verdes son pies de gente real que la revisión previa ya detectó en este video: dibuja el estante
        rodeándolos, no adivinando dónde crees que camina la gente.
      </p>` : '';

    return `
      ${err}${aviso}
      <p class="text-xs text-[#2F3437] leading-relaxed">
        <strong>Arrastra sobre la imagen</strong> para marcar el <strong>área del piso</strong> por donde la gente camina
        frente a cada estante (no los productos: a las personas se las ubica por los pies). Puedes marcar hasta 4.
      </p>
      ${guiaPies}
      <div class="rounded-lg border border-[#EAEAEA] overflow-hidden bg-[#F3F2EF]">
        <canvas id="lienzo-zonas" class="block w-full cursor-crosshair"></canvas>
      </div>
      <div>
        <label class="block text-xs font-semibold text-[#57534E] mb-1.5">Nombre de la góndola</label>
        <input type="text" id="nombre-gondola" value="${esc(s.nombreGondola)}"
               class="w-full px-2.5 py-1.5 text-xs border border-[#EAEAEA] rounded-md bg-white">
      </div>
      <div class="space-y-2">${lista}</div>
      <p class="text-[11px] text-[#787774]">
        Resolución del video: ${d.width || '?'}×${d.height || '?'} px · ${d.duration_s || '?'} s ·
        personas en ${d.frames_con_personas || 0}/${d.frames_muestreados || 0} fotogramas muestreados.
      </p>`;
  }

  if (s.paso === 'procesando') {
    const job = s.job || {};
    const etapa = job.etapa ? `Etapa: ${job.etapa}` : 'Preparando...';
    return `
      ${err}
      ${barraProgreso(job.progreso || 0, etapa)}
      <p class="text-xs text-[#2F3437] leading-relaxed">${esc(job.mensaje || '')}</p>
      <p class="text-[11px] text-[#787774] leading-relaxed">
        La cadena completa (detect → track → zones → interact → metrics) tarda varios minutos en CPU.
        Puedes cerrar esta ventana: el procesado sigue en el servidor y el video aparecerá en el selector al terminar.
      </p>`;
  }

  // listo
  return `
    <div class="p-4 rounded-lg border border-[#346538]/30 bg-[#346538]/5">
      <p class="text-sm font-bold text-[#346538] mb-1">Video procesado</p>
      <p class="text-xs text-[#2F3437] leading-relaxed">Ya está importado y disponible en el selector, con sus métricas, mapa de calor y video anonimizado.</p>
    </div>`;
}

function renderSubidaModal() {
  const s = state.subida;
  if (!s.abierto) return '';

  const acciones = {
    terminos: `<button type="button" data-action="subida-enviar" ${(!s.archivo || !terminosCompletos()) ? 'disabled' : ''}
      class="px-4 py-2 bg-[#111111] text-white rounded-lg text-xs font-semibold hover:bg-[#2F3437] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Subir y revisar</button>`,
    rechazado: `<button type="button" data-action="subida-reiniciar" class="px-4 py-2 bg-[#111111] text-white rounded-lg text-xs font-semibold hover:bg-[#2F3437] transition-colors">Probar con otro video</button>`,
    zonas: `<button type="button" data-action="subida-zonas" ${!s.rects.length ? 'disabled' : ''}
      class="px-4 py-2 bg-[#111111] text-white rounded-lg text-xs font-semibold hover:bg-[#2F3437] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Guardar zonas y procesar</button>`,
    listo: `<button type="button" data-action="subida-ver" class="px-4 py-2 bg-[#111111] text-white rounded-lg text-xs font-semibold hover:bg-[#2F3437] transition-colors">Ver el video</button>`,
  }[s.paso] || '';

  // Solo la PRIMERA vez que este modal se pinta desde que se abrio se le
  // pone la animacion de entrada -las vueltas siguientes, mientras
  // sondearTrabajo() actualiza el progreso cada 2s, la omiten (ver el
  // docstring de subidaYaAnimada), para no "parpadear" todo el rato.
  const animacionEntrada = subidaYaAnimada ? '' : 'modal-backdrop';
  const animacionCaja = subidaYaAnimada ? '' : 'modal-anim';
  subidaYaAnimada = true;

  return `
  <div role="dialog" aria-modal="true" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs ${animacionEntrada}">
    <div class="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden ${animacionCaja} max-h-[92vh] flex flex-col">
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-slate-900 text-white">${icon('upload', 'w-4 h-4')}</div>
          <div>
            <h2 class="text-sm font-bold text-slate-900">Subir un video de góndola</h2>
            <p class="text-xs text-slate-500">Condiciones de uso · revisión previa · calibración · análisis</p>
          </div>
        </div>
        <button type="button" data-action="subida-cerrar" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors" aria-label="Cerrar ventana">${icon('x', 'w-4 h-4')}</button>
      </div>
      <div class="p-6 space-y-4 overflow-y-auto">${cuerpoSubida()}</div>
      <div class="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex justify-end gap-2 shrink-0">
        <button type="button" data-action="subida-cerrar" class="px-4 py-2 rounded-lg text-xs font-semibold text-[#57534E] hover:bg-[#EAEAEA] transition-colors">Cerrar</button>
        ${acciones}
      </div>
    </div>
  </div>`;
}
