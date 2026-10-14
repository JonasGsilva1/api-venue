/**
 * Serviços de leitura agregada: Endpoint 2 (status), 3 (dispatch), 4 (analytics) e 5 (readiness/heatmap).
 * 100% dos retornos em português.
 */
import type {
  AnalyticsSummaryResponse,
  OperationalDispatchRequest,
  OperationalDispatchResponse,
  PdvStatusResponse,
  PdvTipo,
  ReadinessHeatmapResponse,
} from '../contracts';
import { config } from '../config/env';
import {
  LIMIAR_ESTOQUE_CRITICO_PCT,
  arredondar,
  consolidarEstadoOperacional,
  habilitarRedirecionamentoPush,
  limitar,
} from '../domain/business-rules';
import { toDispatchContract, toReadingContract } from '../domain/mappers';
import type { ReadingRecord } from '../domain/types';
import { NotFoundError } from '../http/errors';
import type { VenueRepository } from '../repositories/venue.repository';
import type { AiEngineClient } from './ai-engine.client';
import { sseHub } from './sse.hub';

/** Leituras mais antigas que isto não são consideradas "estado atual" da zona. */
const VALIDADE_LEITURA_ATUAL_MS = 15 * 60_000;
/** Limiar de densidade (p/m²) para uma zona BAR/ESTANDE ser considerada zona de atração. */
const DENSIDADE_ZONA_ATRACAO = 0.25;
/** Modelo de Greenshields (velocidade × densidade) calibrado para circulação em estande. */
const VELOCIDADE_LIVRE_MS = 0.8;
const DENSIDADE_CONGESTIONAMENTO = 3.2;
/** Limiar da RAIZ: deslocamento + fila >= 25 min numa janela de 30 min → Drop-off > 80%. */
const RAZAO_CRITICA_DROPOFF = 25 / 30;

interface LeituraAtual {
  readonly tipo: PdvTipo;
  readonly permanencia: number;
  readonly leitura: ReadingRecord;
}

export class VenueQueryService {
  constructor(
    private readonly repo: VenueRepository,
    private readonly ai: AiEngineClient,
  ) {}

  /** Endpoint 2 */
  statusPdvs(): PdvStatusResponse {
    return this.repo.listPdvs().map((pdv) => {
      const ultima = this.repo.getLatestReading(pdv.id);
      return {
        id: pdv.id,
        nome: pdv.nome,
        tipo: pdv.tipo,
        capacidade: pdv.capacidade,
        localizacao_geo: pdv.localizacao_geo,
        area_m2: pdv.area_m2,
        ultima_leitura: ultima ? toReadingContract(ultima) : null,
        habilitar_redirecionamento_push: habilitarRedirecionamentoPush(ultima?.tempo_espera_seg ?? null),
      };
    });
  }

  /** Endpoint 3 — POST */
  criarDispatch(entrada: OperationalDispatchRequest): OperationalDispatchResponse {
    if (!this.repo.getPdv(entrada.pdv_id)) {
      throw new NotFoundError(`Zona/PDV ${entrada.pdv_id} não existe no seed do estande.`);
    }
    const registro = toDispatchContract(
      this.repo.createDispatch(entrada.pdv_id, entrada.nivel_critico, entrada.sugestao_acao),
    );
    sseHub.broadcast({ tipo: 'dispatch', emitido_em: new Date().toISOString(), dispatch: registro });
    return registro;
  }

  /** Endpoint 3 — GET */
  listarDispatches(): OperationalDispatchResponse[] {
    return this.repo.listDispatches().map(toDispatchContract);
  }

  /** Endpoint 4 — Analytics em Português */
  resumoDropoff(): AnalyticsSummaryResponse {
    const atuais = this.leiturasAtuais();
    // Fila = microcontextos transacionais/estruturais (zonas ESTANDE são de permanência, não de fila).
    const filas = atuais.filter(({ tipo }) => tipo !== 'ESTANDE').map(({ leitura }) => leitura.tempo_espera_seg);
    const queueMedioMin = filas.length === 0 ? 0 : filas.reduce((s, v) => s + v, 0) / filas.length / 60;

    const window = config.WINDOW_TIME_MIN;
    const razao = (config.DESLOCAMENTO_MEDIO_MIN + queueMedioMin) / window;

    let dropoff: number;
    if (razao >= RAZAO_CRITICA_DROPOFF) {
      // Acima do limiar crítico, a taxa supera 80% e cresce linearmente até 100% quando a janela é toda consumida.
      dropoff = 81 + 19 * ((Math.min(razao, 1) - RAZAO_CRITICA_DROPOFF) / (1 - RAZAO_CRITICA_DROPOFF));
    } else {
      // Abaixo do limiar, crescimento convexo (abandono acelera conforme a janela é consumida).
      dropoff = 80 * (razao / RAZAO_CRITICA_DROPOFF) ** 2;
    }

    return {
      janela_tempo_min: window,
      tempo_medio_fila_min: arredondar(queueMedioMin, 2),
      ponto_densidade_atingido: atuais.some(({ leitura }) => leitura.status_cor === 'VERMELHO'),
      taxa_abandono_estimada_pct: arredondar(limitar(dropoff, 0, 100), 1),
      pontuacao_esforco_ces: arredondar(limitar(1 + 4 * razao, 1, 5), 1),
      acumulado_evento: this.repo.getCounters(),
    };
  }

  /** Endpoint 5 — Prontidão e Mapa de Calor em Português */
  async readinessHeatmap(): Promise<ReadinessHeatmapResponse> {
    const pdvs = this.repo.listPdvs();
    const atuais = this.leiturasAtuais();
    const aiOnline = await this.ai.ping();

    const sensoresAtivos = pdvs.filter((p) => this.repo.getSensorStatus(p.id) === 'ONLINE').length;
    const estoqueOk = pdvs
      .filter((p) => p.tipo === 'BAR')
      .every((p) => this.repo.getEstoque(p.id) >= LIMIAR_ESTOQUE_CRITICO_PCT);
    const pcdPendente = this.repo
      .listDispatches()
      .some((d) => d.nivel_critico === 'CRITICO_PCD_CLIMA' && d.status !== 'RESOLVIDO');
    const acessoCritico = atuais.some(
      ({ tipo, leitura }) => (tipo === 'CATRACA' || tipo === 'BANHEIRO') && leitura.status_cor === 'VERMELHO',
    );

    const pessoas = atuais.reduce((s, { leitura }) => s + leitura.contagem_pessoas, 0);
    const capacidadeTotal = pdvs.reduce((s, p) => s + p.capacidade, 0);
    const permanencia =
      pessoas === 0
        ? 0
        : atuais.reduce((s, { leitura, permanencia: perm }) => s + leitura.contagem_pessoas * perm, 0) / pessoas;
    const densidadeMedia =
      pessoas === 0 ? 0 : atuais.reduce((s, { leitura }) => s + leitura.contagem_pessoas * leitura.densidade_m2, 0) / pessoas;
    const velocidade = VELOCIDADE_LIVRE_MS * Math.max(0, 1 - densidadeMedia / DENSIDADE_CONGESTIONAMENTO);

    return {
      prontidao: {
        sensores_ativos: sensoresAtivos,
        fontes_online_str: `${sensoresAtivos}/${pdvs.length}`,
        estoque_inicial_ok: estoqueOk,
        rota_livre_ok: !pcdPendente && !acessoCritico,
        motor_ia_online: aiOnline,
      },
      mapa_calor_global: {
        pessoas_presentes: pessoas,
        ocupacao_estimada_pct: capacidadeTotal === 0 ? 0 : arredondar((pessoas / capacidadeTotal) * 100, 1),
        permanencia_media_seg: Math.round(permanencia),
        densidade_maxima_m2: arredondar(Math.max(0, ...atuais.map(({ leitura }) => leitura.densidade_m2)), 2),
        velocidade_media_ms: arredondar(velocidade, 2),
        zonas_atracao: atuais.filter(
          ({ tipo, leitura }) => (tipo === 'BAR' || tipo === 'ESTANDE') && leitura.densidade_m2 >= DENSIDADE_ZONA_ATRACAO,
        ).length,
        pontos_criticos: atuais.filter(
          ({ leitura }) => leitura.status_cor === 'VERMELHO' || leitura.alerta_ruptura_estoque,
        ).length,
        estado_operacional: consolidarEstadoOperacional(atuais.map(({ leitura }) => leitura.status_cor)),
      },
    };
  }

  private leiturasAtuais(): LeituraAtual[] {
    const limite = Date.now() - VALIDADE_LEITURA_ATUAL_MS;
    const saida: LeituraAtual[] = [];
    for (const pdv of this.repo.listPdvs()) {
      const leitura = this.repo.getLatestReading(pdv.id);
      if (leitura && Date.parse(leitura.timestamp) >= limite) {
        saida.push({ tipo: pdv.tipo, permanencia: pdv.permanencia_referencia_seg, leitura });
      }
    }
    return saida;
  }
}
