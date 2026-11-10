import os
import streamlit as st
import requests
import pandas as pd

API_BASE_URL = os.getenv("VENUE_API_BASE_URL", "http://127.0.0.1:8000/api/v1")
API_TOKEN = os.getenv("VENUE_API_TOKEN", "dev-raiz-token-2026")
HEADERS = {"Authorization": f"Bearer {API_TOKEN}"}

st.set_page_config(
    page_title="RaizEvento - Venue Intelligence (Edge Monitor)",
    page_icon="📡",
    layout="wide",
)

st.title("📡 RaizEvento | Venue Intelligence — Monitor Auxiliar (Formato A)")
st.subheader("Conectado diretamente à API Unificada FastAPI (Porta 8000)")


def get_pdv_status():
    try:
        res = requests.get(f"{API_BASE_URL}/pdv/status", headers=HEADERS, timeout=2.0)
        if res.status_code == 200:
            return res.json()
    except Exception:
        return None


def get_dispatches():
    try:
        res = requests.get(f"{API_BASE_URL}/ops/dispatch", headers=HEADERS, timeout=2.0)
        if res.status_code == 200:
            return res.json().get("ordens", [])
    except Exception:
        return []


def criar_dispatch(pdv_id: int, nivel: str, acao: str):
    try:
        payload = {"pdv_id": pdv_id, "nivel_critico": nivel, "sugestao_acao": acao}
        res = requests.post(f"{API_BASE_URL}/ops/dispatch", json=payload, headers=HEADERS, timeout=2.0)
        return res.status_code == 201
    except Exception:
        return False


if st.button("🔄 Atualizar Painel"):
    st.rerun()

status = get_pdv_status()
dispatches = get_dispatches()

if not status:
    st.warning("⚠️ Aguardando conexão com a API Principal em http://127.0.0.1:8000... Inicie o backend FastAPI.")
else:
    st.markdown("---")
    st.markdown(f"### 📍 Status Operacional do Evento: **{status['status_operacional_evento']}**")

    zonas = {z["id"]: z for z in status.get("zonas", [])}
    z1 = zonas.get(1, {})
    z3 = zonas.get(3, {})
    z4 = zonas.get(4, {})
    z5 = zonas.get(5, {})

    l1 = z1.get("ultima_leitura") or {}
    l3 = z3.get("ultima_leitura") or {}
    l5 = z5.get("ultima_leitura") or {}

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Pessoas no Lounge (Z3)", l3.get("pax_count", 0))
    col2.metric("Fila Acesso Estande (Z1)", f"{l1.get('pax_count', 0)} pax")
    col3.metric("Tempo Espera (Z1)", l1.get("tempo_espera_fmt", "0m 00s"))
    col4.metric("Corredor Norte (ACN)", f"{l5.get('pax_count', 0)} pax")
    col5.metric("Interações Instagramável (Z5)", z4.get("indicadores", {}).get("interacoes", 0))

    st.markdown("---")
    st.subheader("🚨 Zonas com Redirecionamento Push / Gargalo Ativo")

    zonas_criticas = [
        z for z in status.get("zonas", [])
        if z.get("habilitar_redirecionamento_push") or (z.get("ultima_leitura") or {}).get("status_cor") in ("AMARELO", "VERMELHO")
    ]

    if not zonas_criticas:
        st.success("🟢 Nenhuma zona com gargalo crítico no momento.")
    else:
        for z in zonas_criticas:
            leitura = z.get("ultima_leitura") or {}
            cor = leitura.get("status_cor", "VERDE")
            with st.expander(f"⚠️ [{cor}] {z['nome']} — Espera: {leitura.get('tempo_espera_fmt', 'N/A')}", expanded=True):
                st.write(f"**Pessoas detectadas (YOLO):** {leitura.get('pax_count', 0)} pax | **Densidade:** {leitura.get('densidade_m2', 0)} pax/m²")
                with st.form(key=f"form_dispatch_{z['id']}"):
                    acao = st.text_input(
                        "Ação Tática / Despacho de Equipe:",
                        placeholder="Ex: Remanejar 2 orientadores de fluxo e abrir faixa extra",
                    )
                    submitted = st.form_submit_button("✅ Acionar Despacho na API")
                    if submitted and acao and len(acao) >= 5:
                        nivel = "CRITICO" if cor == "VERMELHO" else "ALTO"
                        if criar_dispatch(z["id"], nivel, acao):
                            st.success("Ordem de despacho registrada na API Principal!")
                            st.rerun()

    st.markdown("---")
    st.subheader("📋 Histórico de Ordens de Despacho Tático (`GET /api/v1/ops/dispatch`)")
    if dispatches:
        df_hist = pd.DataFrame(dispatches)[["id", "nome_zona", "nivel_critico", "sugestao_acao", "status", "criado_em"]]
        st.dataframe(df_hist, use_container_width=True)
    else:
        st.info("Nenhum despacho tático registrado até o momento.")
