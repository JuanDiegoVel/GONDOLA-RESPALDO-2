# Viabilidad Edge: correr todo en la propia tienda

**Pregunta que responde este documento:** ¿el pipeline puede procesar el
video completo en un equipo modesto, dentro de la tienda, sin mandar nada
a la nube? Es un criterio de evaluación del reto, y es doble: privacidad
(el video nunca sale del local) y viabilidad (que el cómputo alcance).

## Método

Los números salen de `performance.fps_procesamiento` en cada
`<video_id>.detect.summary.json`, escrito por
`ai-service/gondola/stages/detect.py` al final de una corrida real —no son
una estimación de laboratorio, son medidas de las corridas que ya están
importadas en PostgreSQL. `detect` es la única etapa que pesa: `track`,
`zones`, `interact` y `metrics` juntas tardan segundos por video, no
minutos (ver sus propios `.summary.json`).

Hardware usado: **Intel Core i5-12450H (8 núcleos / 12 hilos), 16 GB RAM,
Windows 11, sin GPU** (`DEVICE=cpu` en `.env`) — un laptop de gama media,
no un servidor. Modelo `yolo11n.pt`, `imgsz=640`, `confidence=0.5`, sin
`FRAME_STRIDE` salvo donde se indica.

## Medición: 6 videos reales, este hardware

| Video | Duración del video | Tiempo de cómputo | fps de procesamiento |
|---|---|---|---|
| video_001 | 205.4 s | 379.4 s | 16.24 |
| video_002 | 132.7 s | 211.8 s | 18.79 |
| video_003 | 135.0 s | 222.0 s | 18.24 |
| video_004 | 162.8 s | 265.0 s | 18.43 |
| video_005 | 126.0 s | 203.3 s | 18.60 |
| video_006 | 131.0 s | 214.9 s | 18.28 |

**Promedio: ≈ 18 fps** en este equipo. Como referencia cruzada, otra
máquina usada durante el desarrollo (ver `docs/interact-fase1-diseno.md`,
sección "Lo que se midió antes de opinar") midió **10.6 fps** — confirma
que el pipeline corre en más de un perfil de hardware modesto, con
margen según la máquina.

## La respuesta al criterio

A ~18 fps sobre un video grabado a 30 fps, el pipeline corre a **~1.6× el
tiempo real** (procesa más lento de lo que dura el video). Un video de
**1 hora tardaría ≈ 100 minutos** en procesarse completo en este
hardware. Sigue siendo enteramente local: nunca se manda un frame fuera
de la tienda, solo se tarda más que el reloj de pared.

## La palanca: `FRAME_STRIDE`

`FRAME_STRIDE` (ya existe en `gondola/config.py`, expuesto también como
`--stride` en el CLI) procesa 1 de cada N frames en vez de todos. Se
midió con `FRAME_STRIDE=2` sobre `video_002` (mismo hardware, mismo
video, sin volver a codificar nada):

| Config | Frames procesados | Tiempo de cómputo | Video cubierto / segundo de cómputo |
|---|---|---|---|
| stride=1 (todos los frames) | 3980 | 211.8 s | 0.63× (más lento que tiempo real) |
| stride=2 (1 de cada 2) | 1990 | 103.5 s | **1.28× (más rápido que tiempo real)** |

Con `FRAME_STRIDE=2` este mismo equipo procesa **más rápido de lo que se
graba el video**: alcanzaría para analizar una cámara en vivo sin
acumular atraso, muestreando a ~15 fps efectivos (de sobra para
`dwell_time` y detección de `APPROACH`/`PICK_UP`, que se miden en
segundos, no en frames individuales).

## Conclusión

**Edge es viable en este proyecto**, con dos regímenes según el equipo
disponible en la tienda:

- **Modo batch** (stride=1, todos los frames): completamente local, pero
  más lento que tiempo real (~1.6×) — apto para procesar el video del día
  fuera de horario de atención, no para un panel en vivo.
- **Modo casi-tiempo-real** (stride=2): completamente local Y al ritmo de
  una cámara en vivo, a costa de la mitad de la resolución temporal
  (aceptable para las métricas que usa este proyecto).

En ningún caso el video sale del equipo local: `ai-service/` solo lee el
archivo de video y el modelo desde disco (`data/videos/`,
`data/models/`), `backend/` solo habla con el PostgreSQL local
(`localhost:5433`), y `frontend/` solo hace `fetch()` a esa API en
`127.0.0.1` — ninguna de las tres capas llama a un servicio externo. La
privacidad no depende de una promesa, es una consecuencia directa de que
el cómputo cabe en la propia tienda.

## Qué falta (no cubierto aquí)

- No se midió con GPU (`DEVICE=cuda`): sería estrictamente más rápido,
  pero se dejó fuera a propósito porque "equipo modesto de tienda" en
  este reto se interpreta como CPU-only.
- No se midió el consumo de RAM pico durante `detect` (solo CPU/tiempo).
- No se probó en hardware más limitado que un i5 de laptop (p. ej. un
  mini-PC o un Raspberry Pi) — quedaría como siguiente paso si el equipo
  quiere un piso más bajo que confirmar.
