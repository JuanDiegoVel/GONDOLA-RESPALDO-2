"""Subida de video desde el dashboard: prevuelo, calibracion y procesado.
Responsable: Persona 7.

El flujo: `POST /uploads` (archivo + terminos) arranca el prevuelo ->
`GET /uploads/{id}` informa el avance -> `POST /uploads/{id}/zones` recibe
los estantes dibujados, escribe data/zones/<id>.json y lanza la cadena.

El paso de zonas no se puede saltar: son rectangulos en pixeles de una
camara concreta, y sin ese archivo el importador se niega a importar.

El prevuelo comprueba que el archivo abra, que duracion/resolucion/fps
esten en rango, que la CAMARA sea fija (ver `_fraccion_camara_en_movimiento`)
y que YOLO encuentre PERSONAS. No comprueba que la escena sea una gondola:
YOLO detecta las 80 clases de COCO (no existe una clase "gondola" ni
"estante" en ese catalogo), y el chequeo de camara fija solo descarta
video grabado a mano/con paneo/con cortes de escena -una calle grabada con
tripode tambien pasaria ese chequeo-. Verificar que la escena ES una
gondola de verdad queda en manos de quien sube el video, y por eso lo
declara antes (`confirma_gondola`).

Privacidad: el video no sale de esta maquina y se BORRA si el prevuelo lo
rechaza. El frame para calibrar se elige entre los que no tienen ninguna
persona detectada (`frame_con_personas` avisa si no habia ninguno asi).

`_TRABAJOS` vive en memoria: reiniciar la API pierde los que esten a
medias. Es a proposito, se usa de a un video a la vez.
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
import threading
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

RAIZ = Path(__file__).resolve().parents[1]
VIDEOS_DIR = RAIZ / "data" / "videos"
ZONES_DIR = RAIZ / "data" / "zones"
OUTPUT_DIR = RAIZ / "data" / "output"
AI_SERVICE_DIR = RAIZ / "ai-service"

PREFIJO_VIDEO_SUBIDO = "subido_"
"""Todo video_id que genera este modulo (ver `subir()`) empieza asi. Es la
unica forma en la que el resto del sistema distingue "lo subio un usuario
desde el dashboard" de "es uno de los videos de ejemplo ya en la base
-`video_001`, `video_demo_merl_*`-": esos nunca llevan este prefijo."""

# --------------------------------------------------------------------------
# Limites del prevuelo. Son numeros con motivo, no gustos:
# --------------------------------------------------------------------------
MAX_BYTES = 500 * 1024 * 1024
"""500 MB. Los 6 videos reales pesan entre 17 y 26 MB; este techo deja
muchisimo margen y a la vez evita que un archivo enorme llene el disco."""

DURACION_MIN_S = 5.0
DURACION_MAX_S = 15 * 60.0
"""Menos de 5 s no da ni para un `dwell_time` que signifique algo. Mas de 15
minutos son mas de 40 min de procesado en CPU (medido: ~6.6 frames/s)."""

LADO_MIN = 240
LADO_MAX = 4096
"""Por debajo de 240 px de lado YOLO pierde personas; por encima de 4096 el
procesado se dispara sin que el resultado mejore para este caso."""

FPS_MIN, FPS_MAX = 1.0, 120.0

MUESTRAS = 24
"""Frames repartidos por todo el video que mira el prevuelo. 24 es suficiente
para saber si hay gente sin tardar mas de unos segundos."""

MIN_FRACCION_CON_PERSONAS = 0.15
"""Al menos un 15% de los frames muestreados tiene que tener una persona.
Por debajo de eso el video puede ser de una tienda, pero no hay a quien
seguir: la cadena entera daria cero, y es mejor decirlo antes de gastar
10 minutos de CPU que despues."""

UMBRAL_MOVIMIENTO_CAMARA = 0.3
ANCLAS_MOVIMIENTO = 6
SALTO_MOVIMIENTO_S = 0.5
"""Una camara de vigilancia que monitorea una gondola es FIJA: entre dos
capturas separadas por medio segundo, solo cambia la parte del cuadro
donde hay gente caminando -en pruebas sinteticas (camara fija + una
"persona" moviendose), la fraccion cambiada quedo bajo 4%, con margen de
sobra para ruido de video real (compresion, parpadeo de luces, varias
personas a la vez)-. Un video grabado a mano, con paneo, zoom, o editado
con cortes de escena cambia CASI TODO el cuadro de una vez: en las mismas
pruebas, un paneo constante de ~90 px/s dio ~32%, ya por encima del
umbral. Se comparan `ANCLAS_MOVIMIENTO` pares de frames, repartidos por
todo el video pero cada par separado solo `SALTO_MOVIMIENTO_S` segundos
-no los mismos frames que se muestrean para personas, mas abajo, que estan
separados por minutos: un salto tan corto aisla el movimiento de CAMARA en
el momento, sin confundirlo con que la escena cambia naturalmente a lo
largo de un video largo (mas gente entra, cambia la luz, etc.)-. No es una
prueba de que la escena sea una gondola -YOLO no tiene esa clase, ver el
docstring del modulo-, pero descarta de entrada clips que claramente no
vienen de una camara fija."""

ETAPAS = ("detect", "track", "zones", "interact", "metrics")

_RE_ETAPA = re.compile(r"^\[(" + "|".join(ETAPAS) + r")\]")
_RE_PORCENTAJE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)%")


# --------------------------------------------------------------------------
# Estado de los trabajos
# --------------------------------------------------------------------------

@dataclass
class Trabajo:
    """Un video en camino. `estado` es la maquina de estados completa:

    revisando -> esperando_zonas -> procesando -> listo
             \\-> rechazado                   \\-> error
    """

    job_id: str
    video_id: str
    nombre_original: str
    estado: str = "revisando"
    mensaje: str = "Revisando el video..."
    etapa: str | None = None
    progreso: int = 0
    detalles: dict[str, Any] = field(default_factory=dict)
    creado: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def como_json(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "video_id": self.video_id,
            "nombre_original": self.nombre_original,
            "estado": self.estado,
            "mensaje": self.mensaje,
            "etapa": self.etapa,
            "progreso": self.progreso,
            "detalles": self.detalles,
            "creado": self.creado,
        }


_TRABAJOS: dict[str, Trabajo] = {}
_CANDADO = threading.Lock()


def _actualizar(job_id: str, **campos: Any) -> None:
    """Unico sitio que toca un trabajo, siempre bajo candado: lo escribe un
    hilo de trabajo y lo lee el hilo que atiende el GET."""
    with _CANDADO:
        trabajo = _TRABAJOS.get(job_id)
        if trabajo is None:
            return
        for clave, valor in campos.items():
            setattr(trabajo, clave, valor)


def _obtener(job_id: str) -> Trabajo:
    with _CANDADO:
        trabajo = _TRABAJOS.get(job_id)
    if trabajo is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No conozco el trabajo '{job_id}'. Que hacer: vuelve a subir el "
                "video. Los trabajos viven en memoria y se pierden si se "
                "reinicia la API."
            ),
        )
    return trabajo


# --------------------------------------------------------------------------
# Prevuelo
# --------------------------------------------------------------------------

def _sanear(nombre: str) -> str:
    """Del nombre que trae el navegador a algo que sirva de `video_id`.

    Se queda con letras, numeros y guion bajo: ese id acaba en nombres de
    archivo, en la URL y en la base de datos, asi que no puede traer espacios,
    acentos ni barras (subir "../../algo.mp4" no debe poder escribir fuera de
    data/videos/)."""
    base = Path(nombre).stem
    base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode()
    base = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_").lower()
    return base[:40] or "video"


def _fraccion_camara_en_movimiento(cv2: Any, captura: Any, total: int, fps: float) -> float:
    """Promedio de que fraccion del cuadro cambia drasticamente entre pares
    de frames cercanos en el tiempo, repartidos por todo el video. Alto si
    la camara paneo/se movio/hubo un corte de escena; bajo si la camara es
    fija y solo se movio la gente. Ver el docstring de UMBRAL_MOVIMIENTO_CAMARA."""
    salto = max(1, round(fps * SALTO_MOVIMIENTO_S))
    limite = total - 1 - salto
    anclas = [int(i * limite / (ANCLAS_MOVIMIENTO - 1)) for i in range(ANCLAS_MOVIMIENTO)] if limite > 0 else [0]

    fracciones: list[float] = []
    for ancla in anclas:
        captura.set(cv2.CAP_PROP_POS_FRAMES, ancla)
        ok1, frame1 = captura.read()
        captura.set(cv2.CAP_PROP_POS_FRAMES, ancla + salto)
        ok2, frame2 = captura.read()
        if not (ok1 and ok2):
            continue
        gris1 = cv2.GaussianBlur(cv2.cvtColor(frame1, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        gris2 = cv2.GaussianBlur(cv2.cvtColor(frame2, cv2.COLOR_BGR2GRAY), (5, 5), 0)
        diferencia = cv2.absdiff(gris1, gris2)
        cambiados = int((diferencia > 25).sum())
        fracciones.append(cambiados / diferencia.size)

    return sum(fracciones) / len(fracciones) if fracciones else 0.0


def _revisar(ruta: Path) -> dict[str, Any]:
    """Abre el video, mide, y pasa YOLO por una muestra de frames.

    Devuelve siempre un dict con `apto` y `motivo`; nunca lanza por un video
    malo -un archivo que no abre es una respuesta, no una excepcion-.

    Las librerias pesadas se importan AQUI DENTRO, no arriba del archivo: si
    no, no se podria arrancar la API (ni correr sus tests) sin instalar los
    3 GB de PyTorch. Es la misma regla de `gondola/stages/detect.py`.
    """
    import cv2

    captura = cv2.VideoCapture(str(ruta))
    if not captura.isOpened():
        return {"apto": False, "motivo": "No pude abrir el archivo: no parece un video, o usa un codec que OpenCV no sabe leer."}

    fps = captura.get(cv2.CAP_PROP_FPS)
    ancho = int(captura.get(cv2.CAP_PROP_FRAME_WIDTH))
    alto = int(captura.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(captura.get(cv2.CAP_PROP_FRAME_COUNT))
    medidas = {"width": ancho, "height": alto, "fps": round(fps, 3) if fps else 0, "frame_count": total}

    if not (FPS_MIN <= fps <= FPS_MAX):
        captura.release()
        return {"apto": False, "motivo": f"Los fps del video ({fps:.1f}) estan fuera de rango ({FPS_MIN:g}-{FPS_MAX:g}).", **medidas}
    if not (LADO_MIN <= min(ancho, alto) and max(ancho, alto) <= LADO_MAX):
        captura.release()
        return {"apto": False, "motivo": f"La resolucion ({ancho}x{alto}) esta fuera de rango: el lado menor debe pasar de {LADO_MIN} px y el mayor no llegar a {LADO_MAX} px.", **medidas}

    duracion = total / fps if fps else 0
    medidas["duration_s"] = round(duracion, 2)
    if duracion < DURACION_MIN_S:
        captura.release()
        return {"apto": False, "motivo": f"El video dura {duracion:.1f} s. Hace falta al menos {DURACION_MIN_S:g} s para medir permanencia.", **medidas}
    if duracion > DURACION_MAX_S:
        captura.release()
        return {"apto": False, "motivo": f"El video dura {duracion / 60:.1f} min, mas del maximo de {DURACION_MAX_S / 60:g} min.", **medidas}

    fraccion_movimiento = _fraccion_camara_en_movimiento(cv2, captura, total, fps)
    medidas["fraccion_movimiento_camara"] = round(fraccion_movimiento, 3)
    if fraccion_movimiento > UMBRAL_MOVIMIENTO_CAMARA:
        captura.release()
        return {
            "apto": False,
            "motivo": (
                f"La camara se mueve demasiado para ser una camara fija de vigilancia "
                f"({fraccion_movimiento:.0%} del cuadro cambia entre capturas cercanas en el "
                f"tiempo, maximo {UMBRAL_MOVIMIENTO_CAMARA:.0%}). Una gondola se monitorea con "
                "una camara fija; un video grabado a mano, con paneo, zoom, o con cortes de "
                "escena no sirve para medir dwell time por coordenadas."
            ),
            **medidas,
        }

    from ultralytics import YOLO

    modelo = YOLO(str(RAIZ / "data" / "models" / "yolo11n.pt"))
    indices = [int(i * (total - 1) / (MUESTRAS - 1)) for i in range(MUESTRAS)]
    con_personas = 0
    mejor_frame_vacio: Any = None
    mejor_frame_lleno: Any = None
    menos_personas = 10**9
    puntos_pies: list[dict[str, float]] = []

    for indice in indices:
        captura.set(cv2.CAP_PROP_POS_FRAMES, indice)
        ok, frame = captura.read()
        if not ok:
            continue
        resultado = modelo.predict(frame, classes=[0], conf=0.5, verbose=False)[0]
        cuantas = len(resultado.boxes)
        if cuantas:
            con_personas += 1
            if cuantas < menos_personas:
                menos_personas, mejor_frame_lleno = cuantas, frame
            # El punto de apoyo (centro del borde inferior de la caja, los
            # pies) de cada persona vista en el prevuelo: mismo calculo que
            # `BBox.support_point` en el contrato, pero calculado aqui a
            # mano porque el prevuelo trabaja con cajas crudas de YOLO
            # (xyxy), no con el contrato todavia -eso lo arma recien
            # 'detect', que ni siquiera ha corrido-. Sirve de GUIA VISUAL
            # en la pantalla de calibracion: en vez de adivinar donde para
            # la gente frente al estante, quien calibra ve puntos de gente
            # REAL de este mismo video. Coordenadas de pixeles del frame
            # -no de nadie identificable, es literalmente un punto (x, y)-.
            for caja in resultado.boxes:
                x1, y1, x2, y2 = (float(v) for v in caja.xyxy[0].tolist())
                puntos_pies.append({"x": round((x1 + x2) / 2, 1), "y": round(y2, 1)})
        elif mejor_frame_vacio is None:
            mejor_frame_vacio = frame
    captura.release()

    fraccion = con_personas / len(indices)
    medidas["frames_muestreados"] = len(indices)
    medidas["frames_con_personas"] = con_personas
    medidas["fraccion_con_personas"] = round(fraccion, 3)
    medidas["puntos_pies"] = puntos_pies

    if fraccion < MIN_FRACCION_CON_PERSONAS:
        return {
            "apto": False,
            "motivo": (
                f"Solo {con_personas} de {len(indices)} frames muestreados tienen personas "
                f"({fraccion:.0%}, minimo {MIN_FRACCION_CON_PERSONAS:.0%}). Sin gente a la que seguir, "
                "la cadena daria cero en todo. Sube un video con clientes frente a la gondola."
            ),
            **medidas,
        }

    # Fondo para dibujar las zonas: se prefiere SIEMPRE uno sin personas.
    frame_fondo = mejor_frame_vacio if mejor_frame_vacio is not None else mejor_frame_lleno
    medidas["frame_con_personas"] = mejor_frame_vacio is None
    if frame_fondo is not None:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(OUTPUT_DIR / f"{ruta.stem}.calib.jpg"), frame_fondo)

    return {"apto": True, "motivo": "", **medidas}


def _hilo_prevuelo(job_id: str, ruta: Path) -> None:
    try:
        informe = _revisar(ruta)
    except Exception as error:  # noqa: BLE001 - cualquier fallo aqui es un rechazo, no un 500
        log.exception("Prevuelo fallido para %s", ruta.name)
        ruta.unlink(missing_ok=True)
        _actualizar(job_id, estado="error", mensaje=f"No pude revisar el video: {error}", progreso=0)
        return

    if not informe["apto"]:
        # Un video rechazado no se guarda: contiene personas reales y no se
        # va a usar para nada.
        ruta.unlink(missing_ok=True)
        _actualizar(job_id, estado="rechazado", mensaje=informe["motivo"], detalles=informe, progreso=0)
        return

    _actualizar(
        job_id,
        estado="esperando_zonas",
        mensaje="Video apto. Dibuja los estantes sobre el frame para poder medir por zona.",
        detalles=informe,
        progreso=10,
    )


# --------------------------------------------------------------------------
# Procesado: la cadena del AI Service + el importador
# --------------------------------------------------------------------------

def _hilo_procesar(job_id: str, video_id: str, nombre_original: str) -> None:
    """Corre `python -m gondola run` y despues importa a PostgreSQL.

    Se lanza como SUBPROCESO, no importando `gondola` aqui: la cadena carga
    PyTorch y tarda minutos, y un subproceso se puede seguir por su salida
    (de ahi el porcentaje que ve el usuario) sin bloquear a la API.
    """
    entorno = {
        **_entorno_base(),
        "VIDEO_ID": video_id,
        "VIDEO_PATH": f"data/videos/{video_id}.mp4",
        "RENDER_MODE": "privacy",
        # Sin esto, el HIJO decide por su cuenta si su stdout es una terminal
        # o no -y aqui NUNCA lo es: es la tuberia que este mismo Popen abre
        # mas abajo (stdout=PIPE)-, asi que usa buffer COMPLETO (varios KB)
        # en vez de linea por linea. `bufsize=1` de Popen solo afecta como
        # el PADRE (este proceso) LEE la tuberia; no le dice nada al hijo
        # sobre como ESCRIBIR. El resultado, real, visto en la practica: el
        # `for linea in proceso.stdout` de abajo no recibia nada hasta que
        # el buffer del hijo se llenaba o el proceso terminaba, asi que el
        # progreso (mas abajo) se quedaba pegado en 10% y saltaba de golpe a
        # 100% -sin barra de verdad, aunque la cadena si avanzaba por dentro-.
        "PYTHONUNBUFFERED": "1",
    }
    proceso = subprocess.Popen(
        [sys.executable, "-u", "-m", "gondola", "run"],
        cwd=str(AI_SERVICE_DIR),
        env=entorno,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    indice_etapa = 0
    ultimas_lineas: list[str] = []
    assert proceso.stdout is not None
    for linea in proceso.stdout:
        ultimas_lineas = (ultimas_lineas + [linea.rstrip()])[-25:]
        etapa = _RE_ETAPA.match(linea)
        if etapa:
            indice_etapa = ETAPAS.index(etapa.group(1))
            _actualizar(job_id, etapa=etapa.group(1), mensaje=f"Procesando: {etapa.group(1)}")
        porcentaje = _RE_PORCENTAJE.match(linea)
        dentro = float(porcentaje.group(1)) / 100 if porcentaje else 0.0
        # 10% ya gastado en el prevuelo, 85% para las 5 etapas, 5% para importar.
        _actualizar(job_id, progreso=int(10 + 85 * (indice_etapa + dentro) / len(ETAPAS)))

    if proceso.wait() != 0:
        _actualizar(
            job_id,
            estado="error",
            mensaje="La cadena del AI Service fallo:\n" + "\n".join(ultimas_lineas[-12:]),
        )
        return

    _actualizar(job_id, estado="procesando", etapa="importar", mensaje="Guardando en la base de datos...", progreso=95)
    try:
        import importer

        importer.import_video(video_id, source_name=nombre_original)
    except Exception as error:  # noqa: BLE001
        log.exception("Importacion fallida para %s", video_id)
        _actualizar(job_id, estado="error", mensaje=f"El video se proceso pero no se pudo importar: {error}")
        return

    _actualizar(
        job_id,
        estado="listo",
        etapa=None,
        progreso=100,
        mensaje="Listo. El video ya aparece en el selector.",
    )


def _entorno_base() -> dict[str, str]:
    """El entorno del proceso, menos las variables del pipeline que este
    modulo pisa. Se limpian para que un VIDEO_ID que alguien tenga exportado
    en su terminal no se cuele en el subproceso."""
    import os

    entorno = {k: v for k, v in os.environ.items() if k not in {"VIDEO_ID", "VIDEO_PATH", "RENDER_MODE", "MAX_FRAMES"}}
    return entorno


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

router = APIRouter(prefix="/uploads", tags=["subida"])


class Estante(BaseModel):
    """Un rectangulo dibujado por el usuario, en pixeles del frame original."""

    name: str = Field(min_length=1, max_length=60)
    product_category: str | None = Field(default=None, max_length=60)
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class Calibracion(BaseModel):
    gondola_name: str = Field(default="Gondola subida", min_length=1, max_length=80)
    shelves: list[Estante] = Field(min_length=1, max_length=6)


@router.post("")
async def subir(
    file: UploadFile = File(...),
    acepta_terminos: bool = Form(...),
    confirma_gondola: bool = Form(...),
) -> dict[str, Any]:
    """Recibe el video y arranca el prevuelo.

    Los dos booleanos NO son decorativos: sin ellos esto responde 400 y no se
    guarda nada. Quedan registrados con hora en el trabajo, que es lo unico
    que hace de constancia de que alguien acepto las condiciones.
    """
    if not (acepta_terminos and confirma_gondola):
        raise HTTPException(
            status_code=400,
            detail="Hay que aceptar las condiciones de uso y declarar que el video es de una gondola antes de subirlo.",
        )

    video_id = f"{PREFIJO_VIDEO_SUBIDO}{_sanear(file.filename or 'video')}_{datetime.now().strftime('%H%M%S')}"
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    destino = VIDEOS_DIR / f"{video_id}.mp4"

    escritos = 0
    try:
        with destino.open("wb") as salida:
            while trozo := await file.read(1024 * 1024):
                escritos += len(trozo)
                if escritos > MAX_BYTES:
                    raise HTTPException(status_code=413, detail=f"El video pasa del maximo de {MAX_BYTES // (1024 * 1024)} MB.")
                salida.write(trozo)
    except HTTPException:
        destino.unlink(missing_ok=True)
        raise

    trabajo = Trabajo(
        job_id=video_id,
        video_id=video_id,
        nombre_original=file.filename or f"{video_id}.mp4",
        detalles={
            "bytes": escritos,
            "acepta_terminos": True,
            "confirma_gondola": True,
            "aceptado_en": datetime.now(timezone.utc).isoformat(),
        },
    )
    with _CANDADO:
        _TRABAJOS[trabajo.job_id] = trabajo

    threading.Thread(target=_hilo_prevuelo, args=(trabajo.job_id, destino), daemon=True).start()
    return trabajo.como_json()


@router.get("/{job_id}")
def estado(job_id: str) -> dict[str, Any]:
    """Como va el trabajo. Es lo unico que consulta el dashboard mientras
    espera, cada par de segundos."""
    return _obtener(job_id).como_json()


@router.get("/{job_id}/frame")
def frame_de_calibracion(job_id: str) -> FileResponse:
    """El fotograma de fondo sobre el que se dibujan los estantes.

    Se eligio en el prevuelo entre los frames SIN personas siempre que el
    video tuviera alguno (ver `_revisar`)."""
    trabajo = _obtener(job_id)
    ruta = OUTPUT_DIR / f"{trabajo.video_id}.calib.jpg"
    if not ruta.exists():
        raise HTTPException(status_code=404, detail="Todavia no hay frame de calibracion: el prevuelo no ha terminado.")
    return FileResponse(ruta, media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


@router.post("/{job_id}/zones")
def guardar_zonas(job_id: str, calibracion: Calibracion) -> dict[str, Any]:
    """Escribe data/zones/<video_id>.json con lo que dibujo el usuario y
    lanza la cadena completa."""
    trabajo = _obtener(job_id)
    if trabajo.estado != "esperando_zonas":
        raise HTTPException(
            status_code=409,
            detail=f"Este trabajo esta en '{trabajo.estado}', no esperando zonas.",
        )

    ancho = int(trabajo.detalles.get("width", 0))
    alto = int(trabajo.detalles.get("height", 0))
    for estante in calibracion.shelves:
        if estante.x + estante.width > ancho or estante.y + estante.height > alto:
            raise HTTPException(
                status_code=422,
                detail=f"El estante '{estante.name}' se sale del frame ({ancho}x{alto}).",
            )

    documento = {
        "video_id": trabajo.video_id,
        "frame_width": ancho,
        "frame_height": alto,
        "gondolas": [
            {
                "zone_id": "gondola_A",
                "name": calibracion.gondola_name,
                "product_category": None,
                "shelves": [
                    {
                        "segment": f"estante_{i}",
                        "name": estante.name,
                        "product_category": estante.product_category,
                        "floor_zone": {
                            "x": round(estante.x),
                            "y": round(estante.y),
                            "width": round(estante.width),
                            "height": round(estante.height),
                        },
                    }
                    for i, estante in enumerate(calibracion.shelves, start=1)
                ],
            }
        ],
    }
    ZONES_DIR.mkdir(parents=True, exist_ok=True)
    (ZONES_DIR / f"{trabajo.video_id}.json").write_text(
        json.dumps(documento, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    _actualizar(
        job_id,
        estado="procesando",
        mensaje="Zonas guardadas. Procesando el video, esto tarda varios minutos...",
        progreso=10,
    )
    threading.Thread(
        target=_hilo_procesar,
        args=(job_id, trabajo.video_id, trabajo.nombre_original),
        daemon=True,
    ).start()
    return _obtener(job_id).como_json()
