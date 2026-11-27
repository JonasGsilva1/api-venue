"""Leitura de vídeos públicos do Google Drive via Apps Script ou Drive API v3."""
from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_DRIVE_API = "https://www.googleapis.com/drive/v3"
_VIDEO_FIELDS = "nextPageToken,files(id,name,mimeType,size,thumbnailLink)"
_PREFIXOS_APPS_SCRIPT = ("https://script.google.com/", "https://script.googleusercontent.com/")
_PREFIXOS_DOWNLOAD_DRIVE = ("https://drive.google.com/", "https://drive.usercontent.google.com/")

# Cache em memória (file_id -> downloadUrl) preenchido na listagem via Apps Script.
_cache_videos_apps_script: dict[str, str] = {}


class GoogleDriveError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _apps_script_url() -> str:
    url = str(getattr(settings, "google_drive_apps_script_url", "") or "").strip().strip('"').strip("'")
    if url and not url.startswith(_PREFIXOS_APPS_SCRIPT):
        raise GoogleDriveError(
            503,
            "GOOGLE_DRIVE_APPS_SCRIPT_URL deve ser uma URL HTTPS válida do Google Apps Script.",
        )
    return url


def _configuracao() -> tuple[str, str]:
    api_key = str(getattr(settings, "google_drive_api_key", "") or "").strip().strip('"').strip("'")
    folder_id = str(getattr(settings, "google_drive_folder_id", "") or "").strip().strip('"').strip("'")
    if not api_key or not folder_id:
        raise GoogleDriveError(
            503,
            "Integração com Google Drive não configurada. Defina GOOGLE_DRIVE_APPS_SCRIPT_URL "
            "(ou GOOGLE_DRIVE_API_KEY e GOOGLE_DRIVE_FOLDER_ID).",
        )
    if not _id_valido(folder_id):
        raise GoogleDriveError(503, "GOOGLE_DRIVE_FOLDER_ID não é um ID válido de pasta do Google Drive.")
    return api_key, folder_id


def _id_valido(valor: str) -> bool:
    return bool(valor) and all(char in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for char in valor)


def _validar_resposta(response: httpx.Response, permitir_range_invalido: bool = False) -> None:
    if response.is_error and not (permitir_range_invalido and response.status_code == 416):
        logger.warning("Google Drive API respondeu com HTTP %s", response.status_code)
        raise GoogleDriveError(502, "Não foi possível obter os vídeos do Google Drive.")


def _json_body(response: httpx.Response) -> dict[str, Any]:
    try:
        dados = response.json()
    except ValueError as exc:
        logger.warning("Google Drive API retornou JSON inválido")
        raise GoogleDriveError(502, "O Google Drive retornou uma resposta inválida.") from exc
    if not isinstance(dados, dict):
        raise GoogleDriveError(502, "O Google Drive retornou uma resposta inválida.")
    return dados


async def _listar_videos_apps_script(url: str) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url)
            _validar_resposta(response)
            dados = _json_body(response)
    except httpx.HTTPError as exc:
        logger.warning("Falha de comunicação com Apps Script do Google Drive: tipo=%s", type(exc).__name__)
        raise GoogleDriveError(502, "Não foi possível conectar ao serviço de vídeos do Google Drive.") from exc

    arquivos = dados.get("videos", [])
    if not isinstance(arquivos, list) or not all(isinstance(arquivo, dict) for arquivo in arquivos):
        raise GoogleDriveError(502, "O Google Drive retornou uma lista de arquivos inválida.")

    videos: list[dict[str, Any]] = []
    novo_cache: dict[str, str] = {}
    for arquivo in arquivos:
        file_id = arquivo.get("id")
        name = arquivo.get("name")
        mime_type = arquivo.get("mimeType") or arquivo.get("mime_type")
        if not all(isinstance(campo, str) and campo for campo in (file_id, name, mime_type)):
            raise GoogleDriveError(502, "O Google Drive retornou dados de vídeo inválidos.")
        if not mime_type.startswith("video/"):
            continue

        download_url = arquivo.get("downloadUrl") or arquivo.get("download_url")
        if not isinstance(download_url, str) or not download_url.startswith(_PREFIXOS_DOWNLOAD_DRIVE):
            download_url = f"https://drive.google.com/uc?export=download&id={quote(file_id, safe='')}"

        novo_cache[file_id] = download_url
        videos.append(
            {
                "id": file_id,
                "name": name,
                "mimeType": mime_type,
                "size": arquivo.get("size"),
                "thumbnailLink": arquivo.get("thumbnailLink") or arquivo.get("thumbnail_url"),
            }
        )

    _cache_videos_apps_script.clear()
    _cache_videos_apps_script.update(novo_cache)
    return videos


async def listar_videos_drive() -> list[dict[str, Any]]:
    url = _apps_script_url()
    if url:
        return await _listar_videos_apps_script(url)

    api_key, folder_id = _configuracao()
    videos: list[dict[str, Any]] = []
    parametros: dict[str, str | int] = {
        "q": f"'{folder_id}' in parents and trashed = false and mimeType contains 'video/'",
        "fields": _VIDEO_FIELDS,
        "pageSize": 1000,
        "orderBy": "name",
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                response = await client.get(
                    f"{_DRIVE_API}/files",
                    params=parametros,
                    headers={"X-Goog-Api-Key": api_key},
                )
                _validar_resposta(response)
                dados = _json_body(response)
                arquivos = dados.get("files", [])
                if not isinstance(arquivos, list) or not all(isinstance(arquivo, dict) for arquivo in arquivos):
                    raise GoogleDriveError(502, "O Google Drive retornou uma lista de arquivos inválida.")
                if any(
                    not isinstance(arquivo.get(campo), str)
                    for arquivo in arquivos
                    for campo in ("id", "name", "mimeType")
                ):
                    raise GoogleDriveError(502, "O Google Drive retornou dados de vídeo inválidos.")
                videos.extend(arquivos)
                page_token = dados.get("nextPageToken")
                if not page_token:
                    return videos
                parametros["pageToken"] = page_token
    except httpx.HTTPError as exc:
        logger.warning("Falha de comunicação com Google Drive: tipo=%s", type(exc).__name__)
        raise GoogleDriveError(502, "Não foi possível conectar ao Google Drive.") from exc


async def _abrir_video_apps_script(
    url: str,
    file_id: str,
    range_header: Optional[str],
) -> tuple[httpx.AsyncClient, httpx.Response]:
    if not _id_valido(file_id):
        raise GoogleDriveError(404, "Vídeo não encontrado nesta pasta.")

    download_url = _cache_videos_apps_script.get(file_id)
    if not download_url:
        await _listar_videos_apps_script(url)
        download_url = _cache_videos_apps_script.get(file_id)
    if not download_url:
        raise GoogleDriveError(404, "Vídeo não encontrado nesta pasta.")

    headers = {"Range": range_header} if range_header else {}
    client = httpx.AsyncClient(timeout=None, follow_redirects=True)
    response: Optional[httpx.Response] = None
    try:
        response = await client.send(client.build_request("GET", download_url, headers=headers), stream=True)
        if response.headers.get("content-type", "").startswith("text/html"):
            await response.aclose()
            response = None
            confirm_url = f"https://drive.usercontent.google.com/download?id={quote(file_id, safe='')}&export=download&confirm=t"
            response = await client.send(client.build_request("GET", confirm_url, headers=headers), stream=True)
        _validar_resposta(response, permitir_range_invalido=True)
        return client, response
    except GoogleDriveError:
        if response is not None:
            await response.aclose()
        await client.aclose()
        raise
    except httpx.HTTPError as exc:
        if response is not None:
            await response.aclose()
        await client.aclose()
        logger.warning("Falha ao carregar vídeo do Google Drive: tipo=%s", type(exc).__name__)
        raise GoogleDriveError(502, "Não foi possível carregar o vídeo do Google Drive.") from exc


async def abrir_video_drive(file_id: str, range_header: Optional[str]) -> tuple[httpx.AsyncClient, httpx.Response]:
    url = _apps_script_url()
    if url:
        return await _abrir_video_apps_script(url, file_id, range_header)

    api_key, folder_id = _configuracao()
    if not _id_valido(file_id):
        raise GoogleDriveError(404, "Vídeo não encontrado nesta pasta.")

    client = httpx.AsyncClient(timeout=None)
    try:
        metadata = await client.get(
            f"{_DRIVE_API}/files/{quote(file_id, safe='')}",
            params={"fields": "id,mimeType,parents", "supportsAllDrives": "true"},
            headers={"X-Goog-Api-Key": api_key},
            timeout=30.0,
        )
        if metadata.status_code == 404:
            raise GoogleDriveError(404, "Vídeo não encontrado nesta pasta.")
        _validar_resposta(metadata)
        dados = _json_body(metadata)
        if not dados.get("mimeType", "").startswith("video/"):
            raise GoogleDriveError(404, "Vídeo não encontrado nesta pasta.")

        headers = {"X-Goog-Api-Key": api_key}
        if range_header:
            headers["Range"] = range_header
        response = await client.send(
            client.build_request(
                "GET",
                f"{_DRIVE_API}/files/{quote(file_id, safe='')}",
                params={"alt": "media", "supportsAllDrives": "true"},
                headers=headers,
            ),
            stream=True,
        )
        _validar_resposta(response, permitir_range_invalido=True)
        return client, response
    except GoogleDriveError:
        await client.aclose()
        raise
    except httpx.HTTPError as exc:
        await client.aclose()
        logger.warning("Falha ao carregar vídeo do Google Drive: tipo=%s", type(exc).__name__)
        raise GoogleDriveError(502, "Não foi possível carregar o vídeo do Google Drive.") from exc
