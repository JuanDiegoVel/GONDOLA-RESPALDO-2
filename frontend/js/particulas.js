// Fondo animado de particulas (constelacion)
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

// --------------------------------------------------------------------------
// Fondo animado de TODO el dashboard: una constelacion de particulas en
// tonos pasteles, muy tenue, para que se sienta vivo sin robarle
// legibilidad a los datos. Vive en su propio <canvas> (fuera de #root, ver
// index.html) y se arranca UNA sola vez al cargar la pagina, nunca se
// reinicia -si viviera dentro de #root, cada render() (que pasa docenas de
// veces por sesion: cambiar de video, abrir un modal) la reiniciaria desde
// cero, perdiendo las particulas ya en pantalla-.
// Fusionada desde una version paralela del dashboard: la unica adaptacion
// real fue leer el tema oscuro de
// `document.documentElement.classList.contains('dark')` -el mecanismo de
// ESTE archivo (ver toggle-dark-mode)- en vez de `body.dark-mode`, que era
// como lo resolvia el archivo original.
// --------------------------------------------------------------------------
let pageParticles = null;

function initPageParticles() {
  const canvas = document.getElementById('page-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    // Tamano visible (canvas.style.width/height, en pixeles literales) y
    // resolucion interna (canvas.width/height) con el MISMO numero exacto:
    // si uno fuera un porcentaje y el otro pixeles, el navegador reescala
    // el dibujo para que quepa, "encogiendo" la animacion hacia una
    // esquina. Con los dos en pixeles literales no hay reescalado posible.
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w;
    canvas.height = h;
  }
  resize();
  window.addEventListener('resize', resize);

  // Dos paletas: pastel para tema claro (discreta, no compite con los
  // datos) y mas vivida para tema oscuro (los tonos pastel casi no se ven
  // sobre fondo oscuro). Cada punto guarda solo un INDICE de color (0-3),
  // no el color en si: si el usuario cambia de tema a mitad de la
  // animacion, el siguiente cuadro ya pinta con la paleta correcta sin
  // tener que recrear los puntos.
  const LIGHT_PALETTE = ['#FFC24D', '#6FAFDB', '#E091C7', '#9C86D9'];
  const DARK_PALETTE  = ['#FFC24D', '#FF6FC0', '#4FC3E8', '#B18CFF'];
  const count = Math.min(160, Math.max(60, Math.round((window.innerWidth * window.innerHeight) / 13000)));
  pageParticles = Array.from({ length: count }).map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.34,
    vy: (Math.random() - 0.5) * 0.28,
    r: Math.random() * 2.2 + 1.7,
    hue: Math.floor(Math.random() * 4),
  }));

  function tick() {
    const dark = document.documentElement.classList.contains('dark');
    const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;
    const lineRGB = dark ? '255,255,255' : '31,41,55';
    const lineAlpha = dark ? 0.24 : 0.16;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of pageParticles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }

    // Lineas entre particulas cercanas: se notan en los huecos entre
    // tarjetas, sin competir con el texto de encima.
    for (let i = 0; i < pageParticles.length; i++) {
      for (let j = i + 1; j < pageParticles.length; j++) {
        const a = pageParticles[i], b = pageParticles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.strokeStyle = `rgba(${lineRGB},${lineAlpha * (1 - dist / 150)})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of pageParticles) {
      const color = palette[p.hue];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color + '70';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // prefers-reduced-motion: se pinta un solo cuadro estatico (no un
    // canvas vacio) y no se programa el siguiente -mismo criterio que el
    // parpadeo del mapa de calor, ver pintarHeatmap() en vista-zonas.js-.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(tick);
  }
  tick();
}
