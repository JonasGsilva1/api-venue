# Documentação de Hardware e Arquitetura - Venue Intelligence

Este documento detalha o inventário de hardware, o fluxo de dados, os modos de degradação e as especificações técnicas da plataforma Venue Intelligence.

---

## 1. Inventário das Câmeras
*Extraído diretamente de `HARDWARE_CAMERAS` no código-fonte.*

| Código da Câmera | Nome / Descrição | Setor / Localização | FPS Padrão | Posição no Ambiente (3D) | Status da Métrica |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CAM-ENT-01** | Câmera de Acesso Portão A | Acesso / Perímetro Norte | 30 FPS | Coordenadas 3D (Setor Norte) | Simulada (Fixa) |
| **CAM-ENT-02** | Câmera de Acesso VIP | Acesso / VIP | 30 FPS | Coordenadas 3D (Setor Norte) | Simulada (Fixa) |
| **CAM-ENT-03** | Câmera de Acesso Geral | Acesso / Geral | 30 FPS | Coordenadas 3D (Setor Norte) | Simulada (Fixa) |
| **CAM-ENT-04** | Câmera de Acesso Leste | Acesso / Leste | 30 FPS | Coordenadas 3D (Setor Norte) | Simulada (Fixa) |
| **CAM-FLUXO-01** | Controlo de Acesso & Densidade Oeste | Controlo de Acesso & Densidade Oeste | 60 FPS | Coordenadas 3D (Setor Oeste) | Simulada (Fixa) |
| **CAM-FLUXO-02** | Controlo de Acesso & Densidade Central | Controlo de Acesso & Densidade Central | 60 FPS | Coordenadas 3D (Setor Central) | Simulada (Fixa) |
| **CAM-FLUXO-03** | Controlo de Acesso & Densidade Leste | Controlo de Acesso & Densidade Leste | 60 FPS | Coordenadas 3D (Setor Leste) | Simulada (Fixa) |

> **Nota de Implementação:** Atualmente, as métricas exibidas pelas câmeras são strings/valores fixos simulados no código-fonte do front-end.

---

## 2. Métricas de Fluxo de Pessoas
*Exibidas na telemetria das câmeras interativas da Arena 3D.*

* **Contagem e densidade:** pessoas identificadas no setor e pessoas por metro quadrado.
* **Taxa de passagem:** quantidade de pessoas que atravessa o setor por minuto.
* **Nível de lotação:** estado operacional apresentado como fluxo normal, atenção ou lotação crítica.

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