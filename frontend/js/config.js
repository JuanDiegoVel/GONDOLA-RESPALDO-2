// Configuracion global
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

// Logo de la pantalla de inicio: PNG con transparencia real (no el JPG
// original, que traia un cuadriculado quemado en los pixeles). Vive como
// archivo aparte (assets/logo.png) y no como base64 embebido: un archivo
// suelto de ~260 KB no le hace ningun bien a un <script> de este tamano, y
// el navegador lo cachea aparte del resto del codigo. Procesado con una
// tecnica de clave de color; ver frontend/README.md.
const LOGO_SPLASH = 'assets/logo.png';
