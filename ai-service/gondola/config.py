"""Configuracion del pipeline, leida del archivo .env con valores por defecto.

Un solo objeto `Config` congelado que se arma al arrancar y se pasa hacia
abajo. Nadie llama a `os.getenv` fuera de este archivo: si un valor se puede
cambiar, esta aqui y esta documentado en `.env.example`.

Si un valor esta fuera de rango, el programa falla AQUI, al arrancar, con un
mensaje que dice que corregir; no 20 minutos despues en mitad del video.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv

from gondola.errors import ConfigError

# Raiz del repositorio (config.py esta en <raiz>/ai-service/gondola/).
RAIZ = Path(__file__).resolve().parents[2]

DEVICES_VALIDOS = {"cpu", "cuda", "mps"}
RENDER_MODES_VALIDOS = {"none", "debug", "privacy"}
LOG_LEVELS_VALIDOS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


@dataclass(frozen=True)
class Config:
    """Todos los ajustes del pipeline. Congelado: nadie lo modifica a mitad de camino."""

    video_path: Path
    video_id: str
    model_path: Path
    output_dir: Path
    groundtruth_dir: Path
    confidence_threshold: float
    iou_threshold: float
    imgsz: int
    frame_stride: int
    max_frames: int
    device: str
    render_mode: str
    log_level: str


def _leer_float(env: Mapping[str, str], nombre: str, defecto: float,
                minimo: float, maximo: float) -> float:
    """Lee un decimal y verifica que este dentro del rango permitido."""
    crudo = env.get(nombre, str(defecto))
    try:
        valor = float(crudo)
    except ValueError:
        raise ConfigError(
            f"{nombre}={crudo!r} no es un numero. "
            f"Edita tu .env y pon un decimal entre {minimo} y {maximo} "
            f"(por defecto: {defecto})."
        ) from None
    if not minimo <= valor <= maximo:
        raise ConfigError(
            f"{nombre}={valor} esta fuera de rango. "
            f"Debe estar entre {minimo} y {maximo}. Edita tu .env "
            f"(por defecto: {defecto})."
        )
    return valor


def _leer_int(env: Mapping[str, str], nombre: str, defecto: int,
              minimo: int, maximo: int) -> int:
    """Lee un entero y verifica que este dentro del rango permitido."""
    crudo = env.get(nombre, str(defecto))
    try:
        valor = int(crudo)
    except ValueError:
        raise ConfigError(
            f"{nombre}={crudo!r} no es un numero entero. "
            f"Edita tu .env y pon un entero entre {minimo} y {maximo} "
            f"(por defecto: {defecto})."
        ) from None
    if not minimo <= valor <= maximo:
        raise ConfigError(
            f"{nombre}={valor} esta fuera de rango. "
            f"Debe estar entre {minimo} y {maximo}. Edita tu .env "
            f"(por defecto: {defecto})."
        )
    return valor


def _leer_opcion(env: Mapping[str, str], nombre: str, defecto: str,
                 validos: set[str]) -> str:
    """Lee un texto que solo puede tomar unos pocos valores conocidos."""
    valor = env.get(nombre, defecto).strip()
    if valor not in validos:
        opciones = ", ".join(sorted(validos))
        raise ConfigError(
            f"{nombre}={valor!r} no es un valor permitido. "
            f"Edita tu .env y usa uno de estos: {opciones} "
            f"(por defecto: {defecto})."
        )
    return valor


def _leer_ruta(env: Mapping[str, str], nombre: str, defecto: str) -> Path:
    """Lee una ruta. Si es relativa, la resuelve desde la raiz del repositorio.

    No comprueba que el archivo exista: en la Fase 1 todavia no hay video ni
    modelo. Esa comprobacion la hara quien abra el archivo (Fases 2 y 3).
    """
    crudo = env.get(nombre, defecto).strip()
    if not crudo:
        raise ConfigError(
            f"{nombre} esta vacio en tu .env. Copia .env.example a .env "
            f"y pon una ruta (por defecto: {defecto})."
        )
    ruta = Path(crudo)
    return ruta if ruta.is_absolute() else (RAIZ / ruta)


EXTENSIONES_VIDEO = (".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v")


def _resolver_video_path(ruta_configurada: Path) -> Path:
    """Si `VIDEO_PATH` no existe, busca UN solo video en esa misma carpeta y
    lo usa en su lugar -sin que nadie tenga que tocar `.env`-.

    El motivo: el video real casi nunca llega con un nombre elegido por
    quien lo va a procesar -llega por WhatsApp, con el nombre que le puso
    el telefono de quien lo mando (`VID-20260904-WA0002.mp4`, por
    ejemplo)-. Renombrarlo cada vez, o pedirle a cada persona del equipo
    que edite `VIDEO_PATH` a mano, es friccion que no aporta nada: al
    pipeline nunca le importo el nombre del archivo (`VIDEO_ID` -la
    etiqueta que sí importa, para los archivos de salida- es una variable
    aparte, ver `load_config()`).

    Solo actua cuando la busqueda no es ambigua: si la carpeta tiene CERO
    o VARIOS videos, se deja `ruta_configurada` tal cual y quien la revise
    (`gondola doctor`, o el error de `video/reader.py`) sigue viendo el
    mensaje de siempre -mejor un error claro que adivinar cual de varios
    videos era."""
    if ruta_configurada.exists():
        return ruta_configurada
    carpeta = ruta_configurada.parent
    if not carpeta.is_dir():
        return ruta_configurada
    candidatos = sorted(
        p for p in carpeta.iterdir()
        if p.is_file() and p.suffix.lower() in EXTENSIONES_VIDEO
    )
    if len(candidatos) == 1:
        print(
            f"[config] No encontre '{ruta_configurada.name}' en {carpeta}, "
            f"pero ahi hay un solo video: usando '{candidatos[0].name}'. "
            f"(Para fijar el nombre en vez de adivinarlo, pon VIDEO_PATH en tu .env)"
        )
        return candidatos[0]
    return ruta_configurada


def load_config(env: Mapping[str, str] | None = None) -> Config:
    """Arma la configuracion y la valida.

    Si `env` es None lee el archivo .env y las variables del sistema. Pasarle un
    diccionario permite probarla en los tests sin tocar el entorno real.

    Lanza `ConfigError` con un mensaje que dice que corregir.
    """
    if env is None:
        load_dotenv(RAIZ / ".env")
        env = os.environ

    video_id = env.get("VIDEO_ID", "video_001").strip()
    if not video_id:
        raise ConfigError(
            "VIDEO_ID esta vacio en tu .env. Ponle una etiqueta corta al video, "
            "por ejemplo VIDEO_ID=video_001."
        )

    return Config(
        video_path=_resolver_video_path(_leer_ruta(env, "VIDEO_PATH", "data/videos/scapder.mp4")),
        video_id=video_id,
        model_path=_leer_ruta(env, "MODEL_PATH", "data/models/yolo11n.pt"),
        output_dir=_leer_ruta(env, "OUTPUT_DIR", "data/output"),
        groundtruth_dir=_leer_ruta(env, "GROUNDTRUTH_DIR", "data/groundtruth"),
        confidence_threshold=_leer_float(env, "CONFIDENCE_THRESHOLD", 0.5, 0.0, 1.0),
        iou_threshold=_leer_float(env, "IOU_THRESHOLD", 0.45, 0.0, 1.0),
        imgsz=_leer_int(env, "IMGSZ", 640, 320, 1920),
        frame_stride=_leer_int(env, "FRAME_STRIDE", 1, 1, 100),
        max_frames=_leer_int(env, "MAX_FRAMES", 0, 0, 1_000_000),
        device=_leer_opcion(env, "DEVICE", "cpu", DEVICES_VALIDOS),
        render_mode=_leer_opcion(env, "RENDER_MODE", "privacy", RENDER_MODES_VALIDOS),
        log_level=_leer_opcion(env, "LOG_LEVEL", "INFO", LOG_LEVELS_VALIDOS),
    )
