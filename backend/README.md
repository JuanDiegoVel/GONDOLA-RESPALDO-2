# backend/

Importador + API REST en Python. Trabajo de la **Persona 7**. Lee lo que el
AI Service dejó en `data/output/` y `data/zones/`, lo sube a PostgreSQL, y
sirve las métricas por HTTP. El AI Service nunca toca la base de datos —
ver [`docs/architecture.md`](../docs/architecture.md).

## Arrancar

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # o source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # ya trae la URL de Postgres que arma docker-compose.yml
```

Levanta PostgreSQL con Docker (`docker-compose.yml` en esta misma carpeta
ya trae las credenciales que espera `.env.example`) y carga el esquema una
sola vez — detalle completo en [`docs/database.md`](../docs/database.md):

```bash
docker compose up -d
docker exec -i gondola-postgres psql -U gondola -d gondola < database/schema.sql
```

Y ya se puede importar y servir:

```bash
# 1. Importa lo que el pipeline ya dejó en data/output/ para un video
python importer.py --video-id video_001 --source-name video_001.mp4

# 2. Arranca la API
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

`--source-name` es opcional pero recomendado: sin él, `source_name` queda
`null` y el selector de video del dashboard muestra un nombre vacío.

Correr los tests (necesitan PostgreSQL real, ver `tests/`):

```bash
pytest
```

## Endpoints

| Método y ruta | Qué devuelve |
|---|---|
| `GET /health` | `{"status": "ok"}` si la API alcanza PostgreSQL |
| `GET /videos` | Los videos importados, más reciente primero |
| `GET /videos/{video_id}` | Resumen general (personas, interacciones, pick-ups, put-backs, permanencia) |
| `GET /videos/{video_id}/metrics` | Métricas por zona — una fila por góndola **y** una por cada estante (`gondola_A`, `gondola_A:estante_1`, ...) |
| `GET /videos/{video_id}/metrics/{zone_id}` | Métricas de una sola zona |
| `GET /videos/{video_id}/zones` | Jerarquía de zonas (qué estante cuelga de qué góndola), para agrupar en el dashboard |
| `GET /videos/{video_id}/positions` | El punto de apoyo (pies) de cada evento, en píxeles del frame — materia prima del mapa de calor real por coordenadas |
| `GET /videos/{video_id}/render` | El video ya procesado en modo `privacy` (fondo gris inventado + cajas de detección). Prefiere el render de `interact` (resalta APPROACH/PICK_UP/PUT_BACK) y cae al de `track` si no existe. 404 si el video no tiene ninguno de los dos en disco |

Todo esto sale de PostgreSQL, **excepto** `/render`, que sirve un archivo
estático de `data/output/` (ver el comentario de `RENDER_DIR` en `api.py`)
— es la única excepción a "esta capa solo lee de la base de datos".

### Subida de video desde el dashboard (`backend/uploads.py`)

La ÚNICA parte de esta API que escribe -por eso vive en su propio módulo,
ver la sección CORS abajo-. Deja que alguien suba un video sin tocar la
terminal ni copiar archivos a mano: sube el archivo, el servidor revisa
que sea apto (abre, dura entre 5 s y 15 min, la cámara es fija -ver
`_fraccion_camara_en_movimiento` en `uploads.py`-, YOLO encuentra
personas), la persona dibuja los estantes sobre un fotograma sin gente, y
desde ahí la API lanza sola la cadena completa (`detect → track → zones →
interact → metrics`) y la importa. `frontend/index.html` lo usa desde el
botón "Subir video" del panel principal.

El chequeo de cámara fija **no** verifica que la escena sea una góndola
-YOLO no tiene esa clase entre las 80 de COCO, no hay forma de que un
detector de objetos genérico sepa distinguir un pasillo de supermercado de
cualquier otro sitio-, solo descarta video grabado a mano, con paneo, zoom
o cortes de escena: una cámara de vigilancia que monitorea una góndola no
se mueve. Que la escena sea de verdad una góndola sigue quedando en manos
de quien sube el video (`confirma_gondola`, la casilla que hay que marcar
antes de subir).

| Método y ruta | Qué hace |
|---|---|
| `POST /uploads` | Recibe el archivo (multipart) + dos booleanos de condiciones de uso. Rechaza sin guardar nada si faltan. Arranca el prevuelo en un hilo aparte y devuelve un `job_id` |
| `GET /uploads/{job_id}` | Estado del trabajo (`revisando` → `esperando_zonas` → `procesando` → `listo`, o `rechazado`/`error`). El dashboard lo sondea cada 2 s |
| `GET /uploads/{job_id}/frame` | El fotograma de fondo para calibrar (sin personas, si el video tuvo alguno así) |
| `POST /uploads/{job_id}/zones` | Recibe los rectángulos dibujados, escribe `data/zones/<video_id>.json` y lanza la cadena completa como subproceso |

Los trabajos viven en memoria (`uploads._TRABAJOS`): reiniciar la API
pierde los que estén a medias, a propósito — se usa de a un video por vez,
no hace falta persistirlo.

**Paso manual obligatorio para que la subida funcione de verdad:** el
prevuelo necesita `opencv-python` y `ultralytics` (las mismas del
`ai-service`), pero a propósito NO están en `backend/requirements.txt`
(ver la nota en ese archivo) — así que instalar solo eso deja la API
arrancando bien, sus tests pasando, y la subida rechazando **cualquier**
video con `No pude revisar el video: No module named 'cv2'`, sin importar
qué tan buen video sea. Hace falta instalarlas A MANO, en el mismo
entorno donde corre `uvicorn api:app` (no basta con tenerlas en el
`.venv` del `ai-service`, es un proceso de Python aparte):

    cd backend
    .venv\Scripts\python -m pip install opencv-python==5.0.0.93 ultralytics==8.4.129

Solo hace falta en la máquina que vaya a recibir subidas desde el
dashboard, igual que ya pasa con quien corre el pipeline completo.

## Configuración (`backend/.env`)

Vive **aparte** del `.env` de la raíz (el del AI Service) a propósito: hay
un test en `ai-service/` que exige que el `.env.example` de la raíz
documente exactamente las variables que lee `gondola/config.py`, ni una
más — meter `DATABASE_URL` ahí lo rompería.

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | Sí |
| `RENDER_DIR` | Carpeta con los videos renderizados, si la API corre en otra máquina distinta a la que tiene `data/output/`. Por defecto `<raíz del repo>/data/output` | No |

## CORS

Una lista de orígenes (`ORIGENES_PERMITIDOS` en `api.py`), no `"*"`.
`frontend/index.html` es un archivo suelto que el navegador abre con
`file://...`, y eso manda `Origin: null` en cada `fetch()` — sin CORS
abierto, el navegador bloquea la respuesta aunque la API la haya procesado
bien. Antes esto era `allow_origins=["*"]`, aceptable cuando la API solo
respondía datos (puros `GET`). Desde que existe `/uploads` (escribe: guarda
un video, lanza el pipeline) `"*"` dejaría que cualquier página que alguien
de la tienda visitara en su navegador disparara esos endpoints contra
`127.0.0.1` sin que la persona se enterara — "no está expuesta a internet"
protege al *servidor*, no al *navegador* que lo consulta. Ahora solo se
aceptan `null` (el dashboard como archivo) y `localhost`/`127.0.0.1` (el
dashboard servido por HTTP).

## Videos reales importados hoy

`video_001` (video de Scapder) y cinco clips del dataset público **MERL
Shopping Dataset** (`video_demo_merl_24_3`, `_15_3`, `_39_1`, `_18_3`,
`_36_1` — mismo prefijo `video_demo_` que los datos de prueba del
dashboard, pero corridos por el pipeline de verdad, no inventados a mano).
Reutilizan la calibración de cámara de `video_001` porque comparten la
misma resolución (920×680): cada uno tiene su propio archivo en
`data/zones/<video_id>.json`, copia del de `video_001` con el `video_id`
cambiado -no un solo archivo compartido-, ver `data/zones/README.md`. A
diferencia de los videos en sí, estos SI están versionados en git (son
JSON pequeños, no video): sin ellos, volver a correr la cadena completa
sobre estos clips falla en la etapa `zones` pidiendo un archivo que no
existe -bug real, encontrado en la práctica: los cinco clips MERL se
importaron alguna vez con estos archivos, pero nunca se subieron a git,
así que un clon nuevo (o volver a correr el pipeline en la misma máquina,
tras borrar `data/zones/`) no podía reproducirlos-.

**Esto vive SOLO en la máquina donde se corrió el pipeline, no en git.**
Estos seis videos quedaron importados en el volumen de Docker de Postgres
de esa máquina (`gondola_pg_data`); un clon nuevo del repositorio arranca
con `schema.sql` cargado pero la tabla `videos` **vacía** -los archivos de
video en sí tampoco están en git, ver `data/videos/README.md`, así que ni
siquiera se puede correr el pipeline sobre ellos sin conseguirlos aparte-.
Para ver algo en el dashboard sin esperar a un video propio: `python -m
gondola run` con un video que sí tengas, cargar `seed_example.sql` (datos
ficticios con la forma exacta de los reales), o el "Modo Datos de
Demostración" que ya trae el propio `frontend/index.html` (no necesita
backend corriendo).

## Tests

`tests/test_importer.py` y `tests/test_api.py` corren contra PostgreSQL
real (no una base de datos falsa): si `DATABASE_URL` no apunta a un
servidor alcanzable, se saltan solos con un mensaje claro en vez de fallar
en rojo sin explicación (ver `tests/conftest.py`). Cada test usa un
`video_id` único (`video_test_<uuid>`) y lo borra al terminar —no dejan
residuos, pero tampoco corren dentro de una transacción revertida.
