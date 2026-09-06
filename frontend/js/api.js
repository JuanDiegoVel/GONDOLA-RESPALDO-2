// Llamadas HTTP a la API (backend/api.py)
// Parte del dashboard de Gondola Inteligente. Se carga desde index.html
// como <script> clasico (no modulo ES): ver el comentario de index.html.

function cleanBaseUrl(url) { return url.trim().replace(/\/+$/, ''); }

async function fetchFromApi(url) {
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let errorDetail = `Error en la solicitud (${response.status} ${response.statusText})`;
    try {
      const errorJson = await response.json();
      if (errorJson && typeof errorJson.detail === 'string') errorDetail = errorJson.detail;
    } catch {}
    const err = new Error(errorDetail);
    err.status = response.status;
    throw err;
  }
  return response.json();
}
async function checkBackendHealth(baseUrl) {
  return fetchFromApi(`${cleanBaseUrl(baseUrl)}/health`);
}
async function getVideos(baseUrl, useMock) {
  if (useMock) return MOCK_VIDEOS;
  return fetchFromApi(`${cleanBaseUrl(baseUrl)}/videos`);
}
async function getVideoDetail(baseUrl, videoId, useMock) {
  if (useMock) {
    const mock = MOCK_DETAILS[videoId];
    if (mock) return mock;
    const err = new Error(`El video '${videoId}' no existe en el registro del sistema de vision.`);
    err.status = 404;
    throw err;
  }
  return fetchFromApi(`${cleanBaseUrl(baseUrl)}/videos/${encodeURIComponent(videoId)}`);
}
async function getVideoMetrics(baseUrl, videoId, useMock) {
  if (useMock) return MOCK_METRICS[videoId] || [];
  return fetchFromApi(`${cleanBaseUrl(baseUrl)}/videos/${encodeURIComponent(videoId)}/metrics`);
}
