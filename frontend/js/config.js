// Configuracion global
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

// Cierto solo cuando el dashboard se abre desde el dominio publicado en
// Firebase Hosting (gondola-inteligente.web.app o .firebaseapp.com), nunca
// en local (file:// o http://localhost). Dos cosas dependen de esto:
//   1. A que backend apunta por defecto (ver DEFAULT_API_BASE_URL abajo).
//   2. Que botones tiene sentido mostrar (ver vista-panel.js): "Subir
//      video" no funciona contra el backend de Render -no tiene PyTorch
//      instalado, ver render.yaml- y el boton de Configuracion de la API
//      deja apuntar el dashboard a un localhost que nadie mas que tu tiene
//      corriendo. Las dos siguen existiendo y funcionando en local: para
//      la presentacion, subir un video se demuestra ahi, no en la version
//      publicada.
const ES_DESPLIEGUE_PUBLICO = location.hostname.endsWith('.web.app') || location.hostname.endsWith('.firebaseapp.com');

const DEFAULT_API_BASE_URL = ES_DESPLIEGUE_PUBLICO
  ? 'https://gondola-backend.onrender.com'
  : 'http://127.0.0.1:8000';

// Logo de la pantalla de inicio: PNG con transparencia real (no el JPG
// original, que traia un cuadriculado quemado en los pixeles). Vive como
// archivo aparte (assets/logo.png) y no como base64 embebido: un archivo
// suelto de ~260 KB no le hace ningun bien a un <script> de este tamano, y
// el navegador lo cachea aparte del resto del codigo. Procesado con una
// tecnica de clave de color; ver frontend/README.md.
const LOGO_SPLASH = 'assets/logo.png';
