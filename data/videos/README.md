# data/videos/

## >>> COLOCAR AQUI EL VIDEO DE SCAPDER <<<

Deja el archivo de video de la tienda en esta carpeta y apunta a el desde tu
`.env`:

    VIDEO_PATH=data/videos/scapder.mp4
    VIDEO_ID=video_001

Reglas:

- Los videos **NO se suben a git** (pesan mucho y contienen imagenes de
  personas reales). `.gitignore` los excluye a proposito.
- `video_001.mp4` (Scapder) no es un video publico: no hay de donde
  descargarlo solo. Pidelo por el chat de WhatsApp del equipo -asi se
  reparte hoy-.
- Los clips del MERL Shopping Dataset SI son publicos (ver mas abajo), pero
  tambien se pueden pedir por WhatsApp para no tener que descargar el zip
  completo del dataset solo para cinco clips.
- **El nombre del archivo NO importa, no hace falta renombrar nada al
  guardarlo.** WhatsApp (o quien te lo mande) le pone el nombre que quiera
  (`VID-20260904-WA0002.mp4`, por ejemplo): si es el UNICO video en esta
  carpeta, `gondola/config.py` lo detecta solo, sin tocar `.env`. Si vas a
  tener mas de uno a la vez (para procesar varios videos distintos), ahi si
  usa `VIDEO_PATH` para decirle a cual apuntar -ver mas abajo-.
- `VIDEO_ID` es la etiqueta corta que quedara escrita en cada evento de salida.
  Si trabajas con otro video, cambia tambien el `VIDEO_ID`.

Ademas de `video_001.mp4` (Scapder), aqui tambien viven -por la misma razon,
no se suben a git- los clips del dataset publico **MERL Shopping Dataset**,
importados a PostgreSQL como `video_002`..`video_006` (cada uno con su
propia calibracion de camara, ver `data/zones/README.md`; en algunas
maquinas quedaron importados antes con el nombre viejo
`video_demo_merl_24_3`/`_15_3`/`_39_1`/`_18_3`/`_36_1`).
