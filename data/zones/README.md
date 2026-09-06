# data/zones/

Archivos de calibracion de camara: donde estan las gondolas y estantes de una
tienda, en pixeles. Formato completo: [`docs/zones-format.md`](../../docs/zones-format.md).

- `video_001.example.json` — **ejemplo**, calibrado a ojo contra
  `data/videos/video_001.mp4` con `scripts/draw_zones.py`. Sirve para
  desarrollar y probar sin depender de que alguien mas haya calibrado ya el
  video real. No lo trates como calibracion final: revisalo con la
  herramienta antes de confiar en el.
- `video_001.json` — la calibracion real (1 gondola, 2 estantes:
  "Cereales" y "Snacks y pasabocas") usada para importar `video_001` de
  verdad a PostgreSQL.
- `video_002.json`..`video_006.json` — calibracion propia (no reutilizada
  de `video_001.json`) para los cinco clips del dataset publico **MERL
  Shopping Dataset**. Import bajo estos `video_id`; en algunas maquinas
  esos mismos clips quedaron importados antes con el nombre viejo
  `video_demo_merl_24_3`/`_15_3`/`_39_1`/`_18_3`/`_36_1` -sin un archivo de
  calibracion propio en git, reutilizaban `video_001.json` a mano-: no hace
  falta recalibrar esos, solo re-importar con el `video_id` nuevo cuando se
  pueda (ver `VIDEOS_REALES_CONOCIDOS` en `frontend/index.html`, que
  reconoce ambos nombres mientras tanto).
- A diferencia de los videos y los modelos, **estos archivos SI se versionan
  en git**: son texto plano, pequenos, y no contienen ninguna imagen ni dato
  de personas -son coordenadas de una camara fija, no de gente.

Para calibrar un video nuevo: copia el ejemplo, ajusta las coordenadas, y
revisa el resultado con

    python scripts/draw_zones.py --zones data/zones/<tu_archivo>.json --frame <algun_frame_con_gente>
