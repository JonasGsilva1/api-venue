"""
Simulador de Cenários Operacionais S01–S10 (Formato A) — Integrado à API Principal RaizEvento (porta 8000).

Envia pacotes compatíveis com `TelemetryAnalysisRequestContract` (`extra="forbid"`, zero campos de estoque,
coordenadas anônimas 0..1000) autenticados com Bearer JWT para `POST /api/v1/telemetry/frame-analysis`,
atualizando em tempo real as zonas, câmeras (`CAM-FLUXO-01..03`) e WebSocket/SSE do Front-End React.
"""
from __future__ import annotations

import os
import time
from typing import Dict, List, Optional

import requests

API_BASE_URL = os.getenv("VENUE_API_BASE_URL", "http://127.0.0.1:8000/api/v1")
API_TOKEN = os.getenv("VENUE_API_TOKEN", "dev-raiz-token-2026")

# Lista de cenários baseada no Storyboard (S01 a S10), focada 100% em câmeras e gargalos
CENARIOS = [
    {
        "cenario_id": "S01",
        "descricao": "Readiness pós-montagem / 7 Câmeras + LiDAR online",
        "fila_z1": 0,
        "fluxo_z2": 0,
        "pessoas_lounge_z3": 0,
        "interacoes_insta_z4": 0,
        "corredor_norte_z5": 5,
        "transacoes_catraca_3m": 0,
        "taxa_nfc_seg": None,
    },
    {
        "cenario_id": "S02",
        "descricao": "Abertura e linha de base / Primeiros acessos no estande",
        "fila_z1": 1,
        "fluxo_z2": 1,
        "pessoas_lounge_z3": 6,
        "interacoes_insta_z4": 2,
        "corredor_norte_z5": 18,
        "transacoes_catraca_3m": 5,
        "taxa_nfc_seg": None,
    },
    {
        "cenario_id": "S03",
        "descricao": "Estande em operação equilibrada (Sem Alerta Crítico)",
        "fila_z1": 3,
        "fluxo_z2": 2,
        "pessoas_lounge_z3": 12,
        "interacoes_insta_z4": 5,
        "corredor_norte_z5": 42,
        "transacoes_catraca_3m": 14,
        "taxa_nfc_seg": None,
    },
    {
        "cenario_id": "S07/S08",
        "descricao": "Pico de demanda / Espera acima do alvo (Z1 >= 6 pax) + Gargalo no Corredor Norte",
        "fila_z1": 6,           # Gatilho de Redirecionamento Push (> 180s) e Alerta Assistido!
        "fluxo_z2": 4,
        "pessoas_lounge_z3": 18,
        "interacoes_insta_z4": 14,
        "corredor_norte_z5": 84,  # 16m 40s (Status VERMELHO)
        "transacoes_catraca_3m": 18,
        "taxa_nfc_seg": 45,     # Gatilho de anomalia NFC_LENTO
    },
    {
        "cenario_id": "S10",
        "descricao": "Síntese dos 3 dias / Fluxo normalizado pós-despacho tático",
        "fila_z1": 2,
        "fluxo_z2": 1,
        "pessoas_lounge_z3": 8,
        "interacoes_insta_z4": 4,
        "corredor_norte_z5": 20,
        "transacoes_catraca_3m": 12,
        "taxa_nfc_seg": None,
    },
]


def gerar_coordenadas_anonimas(qtd_pessoas: int, base_x: float = 500.0, base_y: float = 400.0) -> List[Dict[str, float]]:
    """Gera `qtd_pessoas` coordenadas (x, y) anônimas dentro do limite estrito 0.0..1000.0."""
    coords: List[Dict[str, float]] = []
    for i in range(max(0, int(qtd_pessoas))):
        desloc_x = ((i * 17) % 120) - 60
        desloc_y = ((i * 23) % 100) - 50
        x = round(min(max(base_x + desloc_x, 0.0), 1000.0), 1)
        y = round(min(max(base_y + desloc_y, 0.0), 1000.0), 1)
        coords.append({"x": x, "y": y})
    return coords


def enviar_leitura_zona(
    session: requests.Session,
    pdv_id: int,
    qtd_pessoas: int,
    transacoes_3m: int,
    taxa_nfc_seg: Optional[int] = None,
) -> Optional[Dict[str, object]]:
    url = f"{API_BASE_URL}/telemetry/frame-analysis"
    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "pdv_id": pdv_id,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": gerar_coordenadas_anonimas(qtd_pessoas, base_x=150.0 * pdv_id, base_y=350.0),
        "transacoes_pos_ultimos_3m": max(0, int(transacoes_3m)),
        "taxa_nfc_seg_por_pessoa": taxa_nfc_seg,
        "simular_falha_ia": "NENHUMA",
    }
    response = session.post(url, json=payload, headers=headers, timeout=2.0)
    if response.status_code in (200, 201):
        return response.json()
    print(f"   ❌ Erro HTTP {response.status_code} na Zona {pdv_id}: {response.text[:160]}")
    return None


def run_simulation(intervalo_segundos: float = 4.0) -> None:
    print("🚀 Iniciando Simulação Storyboard S01–S10 (Formato A)...")
    print(f"📡 Conectando à API Principal RaizEvento em: {API_BASE_URL}/telemetry/frame-analysis\n")

    session = requests.Session()
    try:
        for cenario in CENARIOS:
            print("------------------------------------------------------------------")
            print(f"📍 Cenário [{cenario['cenario_id']}] - {cenario['descricao']}")

            zonas_envio = [
                (1, cenario["fila_z1"], None),
                (2, cenario["fluxo_z2"], None),
                (3, cenario["pessoas_lounge_z3"], None),
                (4, cenario["interacoes_insta_z4"], None),
                (5, cenario["corredor_norte_z5"], cenario["taxa_nfc_seg"]),
            ]

            try:
                for pdv_id, pax, taxa_nfc in zonas_envio:
                    resp = enviar_leitura_zona(
                        session,
                        pdv_id=pdv_id,
                        qtd_pessoas=pax,
                        transacoes_3m=cenario["transacoes_catraca_3m"],
                        taxa_nfc_seg=taxa_nfc,
                    )
                    if resp and isinstance(resp.get("leitura"), dict):
                        leitura = resp["leitura"]
                        cor = leitura.get("status_cor")
                        espera = leitura.get("tempo_espera_fmt")
                        anomalias = leitura.get("anomalias", [])
                        icone = "🔴" if cor == "VERMELHO" else ("🟡" if cor == "AMARELO" else "🟢")
                        extra = f" | ⚠️ Anomalias: {', '.join(anomalias)}" if anomalias else ""
                        print(f"   {icone} Zona {pdv_id}: {leitura.get('pax_count')} pax | Espera: {espera} | Cor: {cor}{extra}")
            except Exception as exc:
                print(f"❌ Falha de conexão com a API Principal: {exc}")

            if intervalo_segundos > 0:
                time.sleep(intervalo_segundos)
    finally:
        session.close()


if __name__ == "__main__":
    run_simulation(intervalo_segundos=4.0)
