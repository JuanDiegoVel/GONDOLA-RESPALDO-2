"""Tests de la configuracion (gondola/config.py).

Se le pasa un diccionario a `load_config()` en vez de tocar el entorno real:
asi los tests no dependen de que .env exista ni de la maquina de cada quien.
"""

import re

import pytest

from gondola.config import RAIZ, _resolver_video_path, load_config
from gondola.errors import ConfigError


def test_carga_con_valores_por_defecto():
    """Sin ninguna variable definida, debe cargar con los valores por defecto."""
    cfg = load_config(env={})
    assert cfg.video_id == "video_001"
    assert cfg.confidence_threshold == 0.5
    assert cfg.iou_threshold == 0.45
    assert cfg.imgsz == 640
    assert cfg.frame_stride == 1
    assert cfg.max_frames == 0
    assert cfg.device == "cpu"
    assert cfg.render_mode == "privacy"
    assert cfg.log_level == "INFO"


def test_las_variables_del_entorno_ganan_a_los_defectos():
    cfg = load_config(env={"VIDEO_ID": "video_042", "CONFIDENCE_THRESHOLD": "0.8"})
    assert cfg.video_id == "video_042"
    assert cfg.confidence_threshold == 0.8


def test_las_rutas_relativas_se_resuelven_desde_la_raiz():
    """Para que el pipeline funcione igual sin importar desde donde se lance."""
    cfg = load_config(env={"OUTPUT_DIR": "data/output"})
    assert cfg.output_dir.is_absolute()
    assert cfg.output_dir == RAIZ / "data" / "output"


def test_una_ruta_absoluta_se_respeta_tal_cual():
    ruta = "C:/videos/tienda.mp4" if RAIZ.drive else "/videos/tienda.mp4"
    cfg = load_config(env={"VIDEO_PATH": ruta})
    assert cfg.video_path.is_absolute()


def test_la_configuracion_es_inmutable():
    """Congelada: ninguna etapa puede cambiarla a mitad del pipeline."""
    cfg = load_config(env={})
    with pytest.raises(Exception):
        cfg.confidence_threshold = 0.9  # type: ignore[misc]


@pytest.mark.parametrize("valor", ["1.5", "-0.2"])
def test_una_confianza_fuera_de_rango_falla(valor):
    with pytest.raises(ConfigError):
        load_config(env={"CONFIDENCE_THRESHOLD": valor})


def test_una_confianza_que_no_es_numero_falla():
    with pytest.raises(ConfigError):
        load_config(env={"CONFIDENCE_THRESHOLD": "alto"})


def test_un_stride_de_cero_falla():
    """FRAME_STRIDE=0 significaria no avanzar nunca: bucle infinito."""
    with pytest.raises(ConfigError):
        load_config(env={"FRAME_STRIDE": "0"})


def test_un_imgsz_demasiado_pequeno_falla():
    with pytest.raises(ConfigError):
        load_config(env={"IMGSZ": "64"})


def test_un_device_desconocido_falla():
    with pytest.raises(ConfigError):
        load_config(env={"DEVICE": "gpu"})


def test_un_render_mode_desconocido_falla():
    with pytest.raises(ConfigError):
        load_config(env={"RENDER_MODE": "bonito"})


def test_un_log_level_desconocido_falla():
    with pytest.raises(ConfigError):
        load_config(env={"LOG_LEVEL": "VERBOSE"})


def test_un_video_id_vacio_falla():
    with pytest.raises(ConfigError):
        load_config(env={"VIDEO_ID": "   "})


def test_el_mensaje_de_error_dice_que_hacer():
    """Un error de configuracion debe nombrar la variable, el rango y el .env."""
    with pytest.raises(ConfigError) as error:
        load_config(env={"CONFIDENCE_THRESHOLD": "1.5"})
    mensaje = str(error.value)
    assert "CONFIDENCE_THRESHOLD" in mensaje
    assert ".env" in mensaje
    assert "1.0" in mensaje


# --------------------------------------------------------------------------
# El .env.example es la documentacion de la configuracion
# --------------------------------------------------------------------------

def test_env_example_documenta_exactamente_las_variables_que_se_leen():
    """La convencion del proyecto es que toda variable nueva se documente.

    Este test la hace cumplir sola: compara las variables que `config.py` lee
    con las que `.env.example` documenta. Si alguien anade una y se olvida del
    .env.example (o al reves), aqui se entera, no el companero que clone el
    repositorio la semana que viene.
    """
    fuente = (RAIZ / "ai-service" / "gondola" / "config.py").read_text(encoding="utf-8")
    leidas = set(re.findall(r'env\.get\(\s*(?:env,\s*)?"([A-Z_]+)"', fuente))
    leidas |= set(re.findall(r'_leer_\w+\(env,\s*"([A-Z_]+)"', fuente))

    ejemplo = (RAIZ / ".env.example").read_text(encoding="utf-8")
    documentadas = set(re.findall(r"^([A-Z_]+)=", ejemplo, re.MULTILINE))

    assert leidas == documentadas, (
        f"Sin documentar en .env.example: {sorted(leidas - documentadas)}. "
        f"Documentadas pero ya no se leen: {sorted(documentadas - leidas)}."
    )


def test_lo_que_dice_el_env_example_es_lo_que_carga_la_configuracion():
    """Los valores de ejemplo tienen que ser validos: es lo que copia el equipo."""
    ejemplo = (RAIZ / ".env.example").read_text(encoding="utf-8")
    env = dict(re.findall(r"^([A-Z_]+)=(.*)$", ejemplo, re.MULTILINE))
    cfg = load_config(env=env)
    assert cfg.video_id == env["VIDEO_ID"]
    assert cfg.render_mode == "privacy"  # el defecto seguro, tambien en el ejemplo


# --------------------------------------------------------------------------
# VIDEO_PATH no encontrado: si hay un solo video en la carpeta, se usa ese
# --------------------------------------------------------------------------
# El video real casi nunca llega con el nombre que alguien elegiria a mano
# -llega por WhatsApp, con el nombre que le puso el telefono de quien lo
# mando-. Pedirle a cada persona del equipo que edite VIDEO_PATH para que
# coincida exactamente es friccion innecesaria: al pipeline nunca le
# importo el nombre del archivo, solo VIDEO_ID (una variable aparte).

def test_si_video_path_no_existe_y_hay_un_solo_video_se_usa_ese(tmp_path):
    carpeta = tmp_path / "videos"
    carpeta.mkdir()
    real = carpeta / "VID-20260904-WA0002.mp4"
    real.write_bytes(b"no es un video de verdad, solo hace falta que exista")

    resultado = _resolver_video_path(carpeta / "scapder.mp4")

    assert resultado == real


def test_si_video_path_existe_no_se_toca_aunque_haya_otros_videos(tmp_path):
    carpeta = tmp_path / "videos"
    carpeta.mkdir()
    configurado = carpeta / "scapder.mp4"
    configurado.write_bytes(b"x")
    (carpeta / "otro.mp4").write_bytes(b"x")

    assert _resolver_video_path(configurado) == configurado


def test_si_no_hay_ningun_video_en_la_carpeta_se_deja_la_ruta_configurada(tmp_path):
    carpeta = tmp_path / "videos"
    carpeta.mkdir()

    resultado = _resolver_video_path(carpeta / "scapder.mp4")

    assert resultado == carpeta / "scapder.mp4"


def test_si_hay_varios_videos_no_se_adivina_cual_usar(tmp_path):
    """Ambiguo a proposito: mejor el error claro de siempre que adivinar mal."""
    carpeta = tmp_path / "videos"
    carpeta.mkdir()
    (carpeta / "uno.mp4").write_bytes(b"x")
    (carpeta / "dos.mp4").write_bytes(b"x")

    resultado = _resolver_video_path(carpeta / "scapder.mp4")

    assert resultado == carpeta / "scapder.mp4"


def test_archivos_que_no_son_video_se_ignoran_al_buscar_el_unico_candidato(tmp_path):
    carpeta = tmp_path / "videos"
    carpeta.mkdir()
    (carpeta / "README.md").write_text("no es un video")
    real = carpeta / "clip.mov"
    real.write_bytes(b"x")

    assert _resolver_video_path(carpeta / "scapder.mp4") == real


def test_load_config_aplica_el_fallback_de_video_path(tmp_path):
    """Integracion: el fallback tambien actua pasando por load_config(), no
    solo llamando a _resolver_video_path() suelto. Ruta ABSOLUTA a proposito
    -una relativa la resolveria _leer_ruta contra RAIZ (la raiz real del
    repositorio), no contra tmp_path, y el test dejaria de estar aislado."""
    carpeta = tmp_path / "data" / "videos"
    carpeta.mkdir(parents=True)
    real = carpeta / "IMG_1234.mp4"
    real.write_bytes(b"x")

    cfg = load_config(env={"VIDEO_PATH": str(carpeta / "scapder.mp4")})

    assert cfg.video_path == real
