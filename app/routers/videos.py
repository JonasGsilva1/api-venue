"""Endpoints para listar e reproduzir vídeos armazenados no Google Drive."""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict

from app.auth import UsuarioAutenticado, exigir_leitura
from app.config import settings
from app.errors import RESPOSTAS_PADRAO, sem_query_params
from app.services.google_drive import GoogleDriveError, abrir_video_drive, listar_videos_drive

router = APIRouter(
    prefix="/api/v1/videos",
    tags=["Vídeos do Drive"],
    responses=RESPOSTAS_PADRAO,
)

_DURACAO_LINK_VIDEO_SEG = 3600


def _assinatura_video(file_id: str, expiracao: int) -> str:
    escopo = getattr(settings, "google_drive_apps_script_url", "") or settings.google_drive_folder_id
    mensagem = f"{escopo}:{file_id}:{expiracao}".encode("utf-8")
    return hmac.new(settings.jwt_secret.encode("utf-8"), mensagem, hashlib.sha256).hexdigest()


class VideoDriveContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    mime_type: str
    size: Optional[int] = None
    thumbnail_url: Optional[str] = None
    content_url: str


class VideosDriveResponseContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total: int
    videos: list[VideoDriveContract]


@router.get(
    "",
    response_model=VideosDriveResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Lista vídeos da pasta configurada no Google Drive",
    description=(
        "Lista todos os arquivos de vídeo da pasta do Google Drive configurada no servidor "
        "(`GOOGLE_DRIVE_APPS_SCRIPT_URL`, ou `GOOGLE_DRIVE_API_KEY` + `GOOGLE_DRIVE_FOLDER_ID`). "
        "A pasta precisa estar compartilhada para leitura de qualquer pessoa com o link.\n\n"
        "**Onde aparece no site:** aba **Vídeos do Drive** (botão **Atualizar lista**)."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def listar_videos(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> VideosDriveResponseContract:
    try:
        arquivos = await listar_videos_drive()
    except GoogleDriveError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    videos = [
        VideoDriveContract(
            id=arquivo["id"],
            name=arquivo["name"],
            mime_type=arquivo["mimeType"],
            size=arquivo.get("size"),
            thumbnail_url=arquivo.get("thumbnailLink"),
            content_url=(
                f"/api/v1/videos/{arquivo['id']}/content/"
                f"{(expiracao := int(time.time()) + _DURACAO_LINK_VIDEO_SEG)}/"
                f"{_assinatura_video(arquivo['id'], expiracao)}"
            ),
        )
        for arquivo in arquivos
    ]
    return VideosDriveResponseContract(total=len(videos), videos=videos)


@router.get(
    "/{file_id}/content/{expiracao}/{assinatura}",
    summary="Reproduz ou baixa um vídeo da pasta configurada",
    description=(
        "Faz o streaming direto do vídeo hospedado no Google Drive usando o link temporário assinado "
        "devolvido na listagem, permitindo avançar e voltar a barra de tempo do player (cabeçalho `Range`).\n\n"
        "**Onde aparece no site:** aba **Vídeos do Drive** (reprodutor de cada vídeo)."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def reproduzir_video(
    file_id: str,
    expiracao: int,
    assinatura: str,
    range_header: Optional[str] = Header(None, alias="Range"),
) -> StreamingResponse:
    if expiracao <= int(time.time()) or not hmac.compare_digest(assinatura, _assinatura_video(file_id, expiracao)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Link de reprodução inválido ou expirado.")

    try:
        client, response = await abrir_video_drive(file_id, range_header)
    except GoogleDriveError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    headers = {
        nome: response.headers[nome]
        for nome in ("content-length", "content-range", "accept-ranges", "etag")
        if nome in response.headers
    }

    async def transmitir():
        try:
            async for bloco in response.aiter_bytes():
                yield bloco
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(
        transmitir(),
        status_code=response.status_code,
        media_type=response.headers.get("content-type", "application/octet-stream"),
        headers=headers,
    )
