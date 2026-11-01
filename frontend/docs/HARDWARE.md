# Documentação de Hardware e Arquitetura - Venue Intelligence

Este documento detalha o inventário de hardware, o fluxo de dados, os modos de degradação e as especificações técnicas da plataforma Venue Intelligence.

---

## 1. Inventário das Câmeras
*Extraído diretamente de `HARDWARE_CAMERAS` no código-fonte.*

| Código da Câmera | Nome / Descrição | Setor / Localização | FPS Padrão | Posição no Ambiente (3D) | Status da Métrica |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CAM-FB-01** | Câmera Principal F&B | Praça de Alimentação | 30 FPS | Coordenadas 3D (Setor Norte) | Simulada (Fixa) |
| **CAM-FB-02** | Câmera Bar Chopeira | Bar Central (Pressão: ~32 PSI / ~2.2 bar) | 30 FPS | Coordenadas 3D (Setor Central) | Simulada (Fixa) |
| **CAM-ENT-01** | Câmera Acesso Principal | Entrada / Recepção | 30 FPS | Coordenadas 3D (Portal Norte) | Simulada (Fixa) |

> **Nota de Implementação:** Atualmente, as métricas exibidas pelas câmeras são strings/valores fixos simulados no código-fonte do front-end.

---

## 2. Sensores dos Totens de Autosserviço
*Extraído das definições de `AutosservicoItem` em `src/types/venue.ts`.*

* **Temperatura do Chiller:** Monitoramento térmico operacional dos barris/chillers de autosserviço (faixa ideal: 2°C a 4°C).
* **Pressão de CO₂ (Padronizada em PSI):** Leituras de pressão estabilizadas para extração correta de bebidas (conversão padronizada de bar para PSI: $1 \text{ bar} \approx 14.5 \text{ PSI}$).
* **Nível de Insumo:** Percentual volumétrico remanescente nos reservatórios dos totens (0% a 100%).

---

## 3. Fluxo de Dados de Telemetria
*Baseado no contrato de tipos `TelemetryReading`.*

O ciclo de vida dos dados de telemetria opera no seguinte pipeline contínuo:
1. **Captura:** Dispositivos de borda / Câmeras coletam frames e sinais brutos do ambiente.
2. **Inferência:** Processamento local ou em nuvem para extração de contagem de público, fluxo e gargalos.
3. **API:** Transmissão via endpoints REST/WebSocket estruturados no payload de telemetria.
4. **Painel (Dashboard):** Renderização em tempo real na interface web (React + Vite + Tailwind).

---

## 4. Modos de Degradação do Sistema
*Baseado nas diretrizes de resiliência definidas em `src/types/publico.ts`.*

* **`FALLBACK_502` (Bad Gateway / Falha de Conexão com API):** 
  * *Significado:* O servidor de telemetria está inacessível ou fora do ar. O painel aciona dados estáticos de contingência para evitar tela em branco.
* **`CONTINGENCIA_503` (Serviço Indisponível / Sobrecarga):** 
  * *Significado:* A infraestrutura de backend está sobrecarregada ou em manutenção programada. O sistema reduz a frequência de requisições e exibe aviso de operação degradada.
* **`MEDIA_MOVEL_504` (Gateway Timeout / Instabilidade de Rede):** 
  * *Significado:* Latência elevada ou perda de pacotes na borda. O painel passa a estimar os valores exibidos utilizando uma janela de média móvel baseada nos últimos dados válidos conhecidos.

---

## 5. Especificações de Hardware Reais (A Levantar com a Equipe)
* **Modelo das Câmeras:** `TODO: Preencher com os modelos exatos homologados (ex: Hikvision / Intelbras)`
* **Dispositivo de Borda (Edge Device):** `TODO: Definir hardware utilizado (ex: NVIDIA Jetson Nano / Raspberry Pi 4 / Server Local)`
* **Infraestrutura de Rede:** `TODO: Documentar topologia (Wi-Fi industrial, Cabeamento CAT6, VLANs)`
* **Alimentação Energética:** `TODO: Informar tipo de alimentação (PoE+, Fontes redundantes, No-break)`
* **Altura e Ângulo Reais de Instalação:** `TODO: Mapear gabarito de instalação física de cada câmera`
* **Calibração e Parâmetros Ópticos:** `TODO: Registrar matrizes de calibração e distorção de lente`
* **Lista de Materiais (BOM) e Custos:** `TODO: Consolidar orçamento e fornecedores`

---

## 6. Pontos de Falha e Plano de Contingência (A Combinar com o Mentor)
* **Ponto de Falha 1 (Queda de Energia na Borda):** `TODO: Alinhar procedimento de recovery automático com o mentor.`
* **Ponto de Falha 2 (Perda de Conectividade com a nuvem):** `TODO: Definir tempo de retenção de buffer local no dispositivo de borda.`