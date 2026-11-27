"""Leitura de vídeos públicos do Google Drive via Drive API v3."""
from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_DRIVE_API = "https://www.googleapis.com/drive/v3"
_VIDEO_FIELDS = "nextPageToken,files(id,name,mimeType,size,thumbnailLink)"


class GoogleDriveError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _configuracao() -> tuple[str, str]:
    if not settings.google_drive_api_key or not settings.google_drive_folder_id:
        raise GoogleDriveError(
            503,
            "Integração com Google Drive não configurada. Defina GOOGLE_DRIVE_API_KEY e GOOGLE_DRIVE_FOLDER_ID.",
        )
    if not _id_valido(settings.google_drive_folder_id):
        raise GoogleDriveError(503, "GOOGLE_DRIVE_FOLDER_ID não é um ID válido de pasta do Google Drive.")
    return settings.google_drive_api_key, settings.google_drive_folder_id


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


async def listar_videos_drive() -> list[dict[str, Any]]:
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


async def abrir_video_drive(file_id: str, range_header: Optional[str]) -> tuple[httpx.AsyncClient, httpx.Response]:
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
