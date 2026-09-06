"""Tests de la subida de video (backend/uploads.py).

Estos NO necesitan PostgreSQL ni YOLO: prueban las barreras que actuan
ANTES de gastar recursos -las condiciones de uso, los trabajos que no
existen, y la validacion de las zonas dibujadas-. El prevuelo de verdad
(abrir el video, pasarle YOLO) no se prueba aqui a proposito: necesitaria
los 3 GB de PyTorch y un video real, y entonces los 7 companeros ya no
podrian correr `pytest` sin instalarlo todo.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import uploads  # noqa: E402
from api import app  # noqa: E402

cliente = TestClient(app)


def _archivo_falso() -> dict:
    """Un 'video' de cuatro bytes. Sirve porque estos tests nunca llegan a
    abrirlo: se rechazan antes, en las condiciones de uso."""
    return {"file": ("prueba.mp4", io.BytesIO(b"\x00\x00\x00\x00"), "video/mp4")}


@pytest.mark.parametrize(
    "terminos",
    [
        {"acepta_terminos": "false", "confirma_gondola": "true"},
        {"acepta_terminos": "true", "confirma_gondola": "false"},
        {"acepta_terminos": "false", "confirma_gondola": "false"},
    ],
)
def test_sin_aceptar_las_condiciones_no_se_sube(terminos):
    """Las casillas del navegador no son la unica barrera: el servidor las
    vuelve a exigir. Si no, bastaria con llamar al endpoint a mano."""
    respuesta = cliente.post("/uploads", files=_archivo_falso(), data=terminos)
    assert respuesta.status_code == 400
    assert "condiciones" in respuesta.json()["detail"].lower()


def test_el_video_rechazado_no_queda_en_disco():
    """Un video que no se acepta no debe dejar rastro: contiene personas
    reales y no se va a usar para nada."""
    antes = set(uploads.VIDEOS_DIR.glob("*.mp4")) if uploads.VIDEOS_DIR.exists() else set()
    cliente.post("/uploads", files=_archivo_falso(), data={"acepta_terminos": "false", "confirma_gondola": "true"})
    despues = set(uploads.VIDEOS_DIR.glob("*.mp4")) if uploads.VIDEOS_DIR.exists() else set()
    assert antes == despues


def test_un_trabajo_que_no_existe_da_404_con_instrucciones():
    respuesta = cliente.get("/uploads/no_existe_este_trabajo")
    assert respuesta.status_code == 404
    assert "vuelve a subir" in respuesta.json()["detail"].lower()


def test_no_se_aceptan_zonas_de_un_trabajo_que_no_espera_zonas():
    """Mandar zonas dos veces, o antes de que el prevuelo termine, tiene que
    dar un error claro y no volver a lanzar la cadena."""
    trabajo = uploads.Trabajo(job_id="t_estado", video_id="t_estado", nombre_original="x.mp4")
    trabajo.estado = "procesando"
    uploads._TRABAJOS[trabajo.job_id] = trabajo
    try:
        respuesta = cliente.post(
            "/uploads/t_estado/zones",
            json={"gondola_name": "G", "shelves": [{"name": "E1", "x": 0, "y": 0, "width": 10, "height": 10}]},
        )
        assert respuesta.status_code == 409
        assert "procesando" in respuesta.json()["detail"]
    finally:
        uploads._TRABAJOS.pop(trabajo.job_id, None)


def test_un_estante_fuera_del_frame_se_rechaza():
    """El rectangulo llega en pixeles del frame original; si se sale, el
    archivo de zonas quedaria invalido y `zones` fallaria mucho despues."""
    trabajo = uploads.Trabajo(job_id="t_fuera", video_id="t_fuera", nombre_original="x.mp4")
    trabajo.estado = "esperando_zonas"
    trabajo.detalles = {"width": 640, "height": 480}
    uploads._TRABAJOS[trabajo.job_id] = trabajo
    try:
        respuesta = cliente.post(
            "/uploads/t_fuera/zones",
            json={"gondola_name": "G", "shelves": [{"name": "Se sale", "x": 600, "y": 0, "width": 200, "height": 100}]},
        )
        assert respuesta.status_code == 422
        assert "se sale del frame" in respuesta.json()["detail"]
    finally:
        uploads._TRABAJOS.pop(trabajo.job_id, None)


def test_hacen_falta_estantes():
    """Sin ningun rectangulo no hay nada que medir por zona: se corta aqui,
    no despues de diez minutos de pipeline."""
    trabajo = uploads.Trabajo(job_id="t_vacio", video_id="t_vacio", nombre_original="x.mp4")
    trabajo.estado = "esperando_zonas"
    trabajo.detalles = {"width": 640, "height": 480}
    uploads._TRABAJOS[trabajo.job_id] = trabajo
    try:
        respuesta = cliente.post("/uploads/t_vacio/zones", json={"gondola_name": "G", "shelves": []})
        assert respuesta.status_code == 422
    finally:
        uploads._TRABAJOS.pop(trabajo.job_id, None)


@pytest.mark.parametrize(
    "nombre, esperado",
    [
        ("Video de la Tienda.mp4", "video_de_la_tienda"),
        # Path().stem se queda solo con el ultimo tramo y sin extension, asi
        # que la ruta entera desaparece: no hay forma de escribir fuera.
        ("../../etc/passwd", "passwd"),
        ("cámara_3.MP4", "camara_3"),
        ("!!!.mp4", "video"),
    ],
)
def test_el_nombre_del_archivo_se_sanea(nombre, esperado):
    """El nombre que manda el navegador acaba en un nombre de archivo, en la
    URL y en la base de datos. Subir '../../algo' no puede escribir fuera de
    data/videos/."""
    assert uploads._sanear(nombre) == esperado


# --------------------------------------------------------------------------
# CORS: quien puede escribir en esta API
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "origen, permitido",
    [
        ("null", True),                     # el dashboard abierto con file://
        ("http://localhost:8000", True),    # servido por HTTP en la misma maquina
        ("http://127.0.0.1:5500", True),    # cualquier puerto local
        ("https://sitio-malicioso.com", False),
        ("http://localhost.evil.com", False),  # el punto no es un separador valido
        ("null.evil.com", False),
    ],
)
def test_solo_los_origenes_locales_pueden_escribir(origen, permitido):
    """El navegador de alguien de la tienda esta DENTRO de la red local, asi
    que "esto no se expone a internet" no protege de una web cualquiera que
    dispare peticiones a 127.0.0.1. La lista de origenes es la barrera."""
    respuesta = cliente.options(
        "/uploads/x/zones",
        headers={
            "Origin": origen,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    permitido_por_la_api = respuesta.headers.get("access-control-allow-origin") == origen
    assert permitido_por_la_api is permitido
