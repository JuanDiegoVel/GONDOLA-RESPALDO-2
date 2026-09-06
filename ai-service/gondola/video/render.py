"""Video de salida, en dos modos muy distintos.

    privacy  (POR DEFECTO)  Fondo neutro, SIN NINGUNA IMAGEN REAL. Solo los
                            rectangulos, el numero de frame, el timestamp y el
                            conteo de personas. Se puede proyectar ante un
                            jurado, subir a una presentacion o mandar por
                            correo sin exponer a nadie: literalmente no
                            contiene un solo pixel de la tienda.
    debug                   Cajas verdes sobre el video original. Sirve para
                            comprobar que la deteccion esta bien puesta. NO se
                            comparte: contiene imagenes de personas reales.
    none                    No genera video. Mas rapido.

El modo privacy no es una version censurada del modo debug: es un video que se
dibuja desde cero sobre un lienzo vacio. El frame original ni siquiera se le
pasa. Esa es la diferencia entre tapar los datos y no tenerlos.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Callable, NamedTuple, Sequence

import cv2
import numpy as np

from gondola.contract import Event
from gondola.errors import VideoError


class ZonaDibujo(NamedTuple):
    """Un rectangulo de PISO (mismo formato que `FloorZone`, en
    `gondola/zones_config.py`) para dibujar de fondo en el render 'privacy':
    coordenadas de MOBILIARIO fijo -de donde sale `floor_zone` en el archivo
    de calibracion-, nunca de una persona. Por eso se puede dibujar incluso
    en el modo que no muestra un solo pixel real: no es dato de nadie, es la
    tienda. `color` ya viene resuelto (ver `_color_actividad` en
    `gondola/stages/interact.py`): este modulo solo dibuja, no decide que
    tan "caliente" esta una zona."""

    x: float
    y: float
    width: float
    height: float
    etiqueta: str
    color: tuple[int, int, int]

# El video que se sube al dashboard tiene que reproducirse en un <video> de
# navegador, y ningun navegador sabe decodificar 'mp4v' (MPEG-4 Part 2, el
# fourcc que usaba esta clase antes) -se descarga bien pero el navegador
# tira un error de codec no soportado, bug real visto probando el
# reproductor del dashboard-. 'avc1' es H.264, que si soportan todos.
#
# En Windows, el backend FFmpeg de OpenCV necesita la libreria de Cisco
# (openh264-*.dll) para codificar H.264, y no la trae incluida por
# licencia. Se descarga aparte (ver data/models/README.md, mismo patron
# que yolo11n.pt) y se registra aqui su carpeta como sitio de busqueda de
# DLLs -si no esta, VideoWriter.isOpened() sigue devolviendo True pero
# escribe un archivo casi vacio sin avisar con una excepcion, por eso
# 'python -m gondola doctor' tambien la revisa (ver cli.py)-.
if sys.platform == "win32":
    _CARPETA_MODELOS = Path(__file__).resolve().parents[3] / "data" / "models"
    if _CARPETA_MODELOS.is_dir():
        import os

        os.add_dll_directory(str(_CARPETA_MODELOS))

# Colores en BGR, que es el orden que usa OpenCV.
VERDE = (80, 220, 80)
GRIS_FONDO = (32, 32, 34)
GRIS_REJILLA = (48, 48, 52)
BLANCO = (235, 235, 235)
GRIS_TEXTO = (150, 150, 150)

FUENTE = cv2.FONT_HERSHEY_SIMPLEX


class Renderer:
    """Escribe el video de salida. Usar como context manager.

    En modo 'none' no crea ningun archivo y `write` no hace nada: asi quien
    llama no necesita repetir `if modo != "none"` en cada frame.
    """

    def __init__(
        self, destino: Path, modo: str, ancho: int, alto: int, fps: float,
        zonas: Sequence[ZonaDibujo] = (),
    ):
        self.modo = modo
        self.destino = destino
        self.ancho = ancho
        self.alto = alto
        self.zonas = zonas
        self._writer = None

        if modo == "none":
            return

        destino.parent.mkdir(parents=True, exist_ok=True)
        # VideoWriter.fourcc es la forma moderna; funciona en OpenCV 4 y 5.
        # 'avc1' = H.264: es el que sabe reproducir un <video> de navegador
        # (ver el comentario grande arriba de este archivo). Si falta la
        # libreria openh264 de Windows, OpenCV NO lanza una excepcion aqui
        # -isOpened() sigue diciendo True- y en vez de eso escribe un
        # archivo casi vacio en silencio: por eso 'python -m gondola doctor'
        # tambien avisa si falta esa DLL, no solo si falta este archivo.
        codec = cv2.VideoWriter.fourcc(*"avc1")
        writer = cv2.VideoWriter(str(destino), codec, fps, (ancho, alto))
        if not writer.isOpened():
            raise VideoError(
                f"No pude crear el video de salida en:\n    {destino}\n\n"
                f"Que hacer: comprueba que la carpeta se pueda escribir, o corre "
                f"con --render none si no necesitas video."
            )
        self._writer = writer

    def write(
        self,
        frame_original,
        eventos: Sequence[Event],
        indice: int,
        timestamp: float,
        color_de: Callable[[Event], tuple[int, int, int]] | None = None,
        etiqueta_de: Callable[[Event], str] | None = None,
        estado_extra: str | None = None,
        color_estado: tuple[int, int, int] | None = None,
        productos: int | None = None,
        interacciones: int | None = None,
        devoluciones: int | None = None,
    ) -> None:
        """Escribe un frame. En modo privacy, `frame_original` se ignora.

        `color_de` y `etiqueta_de` son opcionales: sin ellos, cada caja sale
        verde con su confianza (lo que necesita `detect`). Pasarlos permite
        que otra etapa (por ejemplo `track`, con su track_id) dibuje distinto
        sin duplicar nada de OpenCV fuera de este modulo.

        `estado_extra`/`color_estado` son para un aviso TEMPORAL en la
        cabecera (una ventana de segundos, ver 'interact'); `productos`,
        `interacciones` y `devoluciones` son CONTADORES ACUMULADOS que se
        quedan ahi el resto del video, igual que `personas` -ver
        `_dibujar_cabecera`-.
        """
        if self._writer is None:
            return

        if self.modo == "privacy":
            lienzo = self._lienzo_neutro()
            self._dibujar_zonas(lienzo)
        else:
            lienzo = frame_original.copy()

        for evento in eventos:
            color = color_de(evento) if color_de else VERDE
            etiqueta = etiqueta_de(evento) if etiqueta_de else f"person {evento.detection.confidence:.2f}"
            self._dibujar_caja(lienzo, evento, color, etiqueta)

        self._dibujar_cabecera(
            lienzo, indice, timestamp, len(eventos), estado_extra, color_estado,
            productos, interacciones, devoluciones,
        )
        self._writer.write(lienzo)

    def _dibujar_lineas_estante(self, lienzo: np.ndarray, x1: int, y1: int, x2: int, y2: int) -> None:
        """Un par de lineas horizontales dentro del rectangulo de zona, para
        que se lea como "un estante con niveles" y no como un bloque de
        color liso -mismo pictograma que el boceto de la portada
        (frontend/js/vista-modales.js): la góndola ahí tambien es un
        rectangulo con divisiones, no una silueta fotorrealista-. Con solo
        dos lineas por zona el costo es minimo (esto se repite en CADA
        frame del video, no una vez)."""
        color_linea = (215, 215, 215)
        alto = y2 - y1
        for i in (1, 2):
            ly = y1 + int(alto * i / 3)
            cv2.line(lienzo, (x1 + 3, ly), (x2 - 3, ly), color_linea, 1, cv2.LINE_AA)

    def _dibujar_zonas(self, lienzo: np.ndarray) -> None:
        """Rectangulos de PISO de la calibracion, de fondo, para que quien no
        conoce el proyecto entienda DONDE esta mirando -antes de esto, el
        render eran cajas flotando sobre una rejilla vacia, sin ninguna
        referencia de que habia alrededor-. Semitransparentes (mezclados con
        `cv2.addWeighted`, no pintados solidos): no deben tapar del todo la
        rejilla ni una caja de persona que camine por encima. El color de
        cada una ya viene resuelto por quien llama segun su actividad -mas
        calido, mas interaccion-, asi que aqui no hay ninguna cuenta que
        hacer, solo dibujar."""
        for zona in self.zonas:
            x1, y1 = int(zona.x), int(zona.y)
            x2, y2 = int(zona.x + zona.width), int(zona.y + zona.height)

            capa = lienzo.copy()
            cv2.rectangle(capa, (x1, y1), (x2, y2), zona.color, -1)
            cv2.addWeighted(capa, 0.35, lienzo, 0.65, 0, dst=lienzo)
            cv2.rectangle(lienzo, (x1, y1), (x2, y2), zona.color, 2)
            self._dibujar_lineas_estante(lienzo, x1, y1, x2, y2)

            # Mismo recorte que en _dibujar_caja: un nombre de gondola/estante
            # largo, o una zona calibrada pegada al borde derecho, no debe
            # dejar la etiqueta cortada fuera de cuadro.
            (ancho_txt, alto_txt), _ = cv2.getTextSize(zona.etiqueta, FUENTE, 0.45, 1)
            lx = max(0, min(x1, self.ancho - ancho_txt - 8))
            cv2.rectangle(lienzo, (lx, y1), (lx + ancho_txt + 8, y1 + alto_txt + 8), zona.color, -1)
            cv2.putText(lienzo, zona.etiqueta, (lx + 4, y1 + alto_txt + 3), FUENTE, 0.45,
                        (20, 20, 20), 1, cv2.LINE_AA)

    def _lienzo_neutro(self) -> np.ndarray:
        """Un fondo gris con una rejilla suave. Cero informacion de la tienda."""
        lienzo = np.full((self.alto, self.ancho, 3), GRIS_FONDO, dtype=np.uint8)
        paso = 80
        for x in range(paso, self.ancho, paso):
            cv2.line(lienzo, (x, 0), (x, self.alto), GRIS_REJILLA, 1)
        for y in range(paso, self.alto, paso):
            cv2.line(lienzo, (0, y), (self.ancho, y), GRIS_REJILLA, 1)
        return lienzo

    def _dibujar_silueta_persona(
        self, lienzo: np.ndarray, x1: int, y1: int, x2: int, y2: int,
        color: tuple[int, int, int],
    ) -> None:
        """Un pictograma minimo (cabeza + cuerpo, sin rostro ni rasgos) DENTRO
        de la caja de deteccion. Pedido explicito: un rectangulo con "id 7"
        arriba no se lee como "una persona" para alguien sin contexto del
        proyecto, solo como un cuadro abstracto. No hay ninguna silueta REAL
        que copiar -la caja es lo unico que el sistema sabe-, asi que esta
        forma es generica y se escala al tamano de CADA caja en concreto,
        igual que el boceto de la portada del dashboard
        (frontend/js/vista-modales.js): misma idea, resuelta en OpenCV en vez
        de SVG."""
        ancho, alto = x2 - x1, y2 - y1
        cx = x1 + ancho // 2

        radio_cabeza = max(3, min(ancho, alto) // 6)
        cy_cabeza = y1 + radio_cabeza + max(2, int(alto * 0.05))
        cv2.circle(lienzo, (cx, cy_cabeza), radio_cabeza, color, -1)

        cuerpo_y1 = min(cy_cabeza + int(radio_cabeza * 0.8), y2 - 2)
        ancho_cuerpo = max(radio_cabeza * 2, int(ancho * 0.7))
        cx1 = max(x1 + 1, cx - ancho_cuerpo // 2)
        cx2 = min(x2 - 1, cx + ancho_cuerpo // 2)
        if cuerpo_y1 < y2:
            cv2.rectangle(lienzo, (cx1, cuerpo_y1), (cx2, y2 - 1), color, -1)

    def _dibujar_caja(
        self,
        lienzo: np.ndarray,
        evento: Event,
        color: tuple[int, int, int] = VERDE,
        etiqueta: str | None = None,
    ) -> None:
        """Dibuja el rectangulo, su etiqueta y el punto de apoyo, en el color dado.

        Sin `color` ni `etiqueta` se comporta como siempre (verde, confianza):
        son opcionales para que `write()` pueda pasarlos por track, y para que
        una caja se pueda dibujar suelta (como hacen los tests) sin tener que
        inventarselos.
        """
        if etiqueta is None:
            etiqueta = f"person {evento.detection.confidence:.2f}"
        caja = evento.detection.bbox
        x1, y1 = int(caja.x), int(caja.y)
        x2, y2 = int(caja.x + caja.width), int(caja.y + caja.height)

        cv2.rectangle(lienzo, (x1, y1), (x2, y2), color, 2)
        self._dibujar_silueta_persona(lienzo, x1, y1, x2, y2, color)

        # La etiqueta ahora puede traer zona + dwell_time ademas del id (ver
        # _etiqueta_de_interaccion), asi que es bastante mas larga que antes:
        # sin este ajuste, una persona parada cerca del borde derecho o
        # superior del frame dejaba la etiqueta cortada, fuera de cuadro -bug
        # real, visto en la primera prueba de este dibujo-. `lx`/`ly` son la
        # esquina donde ANCLA la etiqueta (normalmente x1, y1: pegada arriba
        # a la izquierda de la caja), recortada para que el rectangulo de
        # fondo siempre quepa entero dentro del lienzo.
        (ancho_txt, alto_txt), _ = cv2.getTextSize(etiqueta, FUENTE, 0.5, 1)
        lx = max(0, min(x1, self.ancho - ancho_txt - 6))
        ly = max(alto_txt + 6, y1)
        cv2.rectangle(lienzo, (lx, ly - alto_txt - 6), (lx + ancho_txt + 6, ly), color, -1)
        cv2.putText(lienzo, etiqueta, (lx + 3, ly - 4), FUENTE, 0.5, (20, 20, 20), 1,
                    cv2.LINE_AA)

        # El punto de apoyo (los pies): lo que la Persona 4 usara para ubicar a
        # la persona en el plano del piso.
        px, py = caja.support_point
        cv2.circle(lienzo, (int(px), int(py)), 4, color, -1)

    def _dibujar_cabecera(
        self, lienzo, indice: int, timestamp: float, personas: int,
        estado_extra: str | None = None, color_estado: tuple[int, int, int] | None = None,
        productos: int | None = None, interacciones: int | None = None,
        devoluciones: int | None = None,
    ) -> None:
        """Frame, timestamp, conteo de personas EN ESTE FRAME y, si se pasan,
        los contadores ACUMULADOS hasta este instante -al lado de 'personas',
        mismo estilo, para que se lea igual de facil: cada uno empieza en 0 y
        sube cuando corresponde (`interacciones` en cualquier APPROACH/
        PICK_UP/PUT_BACK, `productos` solo en PICK_UP, `devoluciones` solo en
        PUT_BACK), y se queda en ese numero el resto del video -no son una
        ventana que desaparece, como `estado_extra`, mas abajo-."""
        cv2.rectangle(lienzo, (0, 0), (self.ancho, 34), (0, 0, 0), -1)
        izquierda = f"frame {indice}   t={timestamp:6.2f}s   personas: {personas}"
        if interacciones is not None:
            izquierda += f"   interacciones: {interacciones}"
        if productos is not None:
            izquierda += f"   pick-ups: {productos}"
        if devoluciones is not None:
            izquierda += f"   put-backs: {devoluciones}"
        cv2.putText(lienzo, izquierda, (10, 22), FUENTE, 0.55, BLANCO, 1, cv2.LINE_AA)

        if estado_extra:
            # Una insignia de color aparte del texto de siempre, no solo el
            # mismo texto en otro color: asi salta a la vista aunque se este
            # viendo de reojo, no solo leyendo con cuidado.
            (ancho_base, _), _ = cv2.getTextSize(izquierda, FUENTE, 0.55, 1)
            x = 10 + ancho_base + 20
            color = color_estado or BLANCO
            (ancho_estado, _), _ = cv2.getTextSize(estado_extra, FUENTE, 0.65, 2)
            cv2.rectangle(lienzo, (x - 8, 5), (x + ancho_estado + 8, 29), color, -1)
            cv2.putText(lienzo, estado_extra, (x, 22), FUENTE, 0.65, (20, 20, 20), 2, cv2.LINE_AA)

        derecha = "SIN IMAGEN REAL" if self.modo == "privacy" else "MODO DEBUG - NO COMPARTIR"
        color = GRIS_TEXTO if self.modo == "privacy" else (80, 80, 235)
        (ancho_txt, _), _ = cv2.getTextSize(derecha, FUENTE, 0.5, 1)
        cv2.putText(lienzo, derecha, (self.ancho - ancho_txt - 10, 22), FUENTE, 0.5,
                    color, 1, cv2.LINE_AA)

    def close(self) -> None:
        if self._writer is not None:
            self._writer.release()
            self._writer = None

    def __enter__(self) -> "Renderer":
        return self

    def __exit__(self, *_) -> None:
        self.close()


def abrir_con_el_sistema(ruta: Path) -> None:
    """Abre el video con el reproductor por defecto del sistema operativo."""
    import subprocess
    import sys

    try:
        if sys.platform == "win32":
            import os

            os.startfile(ruta)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.run(["open", str(ruta)], check=False)
        else:
            subprocess.run(["xdg-open", str(ruta)], check=False)
    except OSError as exc:
        # No poder abrir el reproductor no es motivo para fallar: el video ya
        # esta escrito y la ruta se acaba de imprimir.
        print(f"  (no pude abrir el reproductor: {exc})")
