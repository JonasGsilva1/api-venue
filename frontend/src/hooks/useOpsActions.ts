import { useCallback, useState } from 'react';
import { getPdvStatus, mensagemDeErro, postDespacho, postTransacaoAutosservico } from '../services/venueApi';
import type { NivelCritico } from '../types/ops';
import type { PdvStatusItem } from '../types/publico';
import type { AutosservicoItem } from '../types/venue';
import { separarNome } from '../utils/publico';

export interface OpsFeedback {
  tipo: 'ok' | 'erro' | 'info';
  texto: string;
}

// Quanto pior a cor da zona, mais crítica a intervenção sugerida.
function nivelPorCor(zona: PdvStatusItem): NivelCritico {
  const cor = zona.ultima_leitura?.status_cor;
  if (cor === 'VERMELHO') return 'ALTO';
  // Acima de 180 s de espera a própria API manda redirecionar o público (regra do roteamento).
  if (cor === 'AMARELO' || zona.habilitar_redirecionamento_push) return 'MEDIO';
  return 'BAIXO';
}

// Escolhe a zona que mais precisa de ajuda: maior tempo de espera na última leitura.
function zonaMaisCritica(zonas: PdvStatusItem[]): PdvStatusItem | null {
  const comLeitura = zonas.filter((z) => z.ultima_leitura);
  if (comLeitura.length === 0) return null;
  return comLeitura.reduce((pior, z) =>
    (z.ultima_leitura?.tempo_espera_seg ?? 0) > (pior.ultima_leitura?.tempo_espera_seg ?? 0) ? z : pior,
  );
}

/**
 * Ações operacionais que falam com a API de verdade:
 * - despachoOps: registra uma intervenção para a zona mais crítica (POST /ops/dispatch);
 * - vendaExpress: registra uma venda no totem de autosserviço (POST /venue/autosservico/{id}/transacao).
 */
export function useOpsActions() {
  const [ocupado, setOcupado] = useState<'despacho' | 'venda' | null>(null);
  const [feedback, setFeedback] = useState<OpsFeedback | null>(null);

  const despachoOps = useCallback(async () => {
    setOcupado('despacho');
    setFeedback({ tipo: 'info', texto: 'Enviando despacho para a API...' });
    try {
      const zonas = await getPdvStatus();
      const alvo = zonaMaisCritica(zonas);
      if (!alvo) {
        setFeedback({ tipo: 'erro', texto: 'A API ainda não tem leituras de zonas para despachar.' });
        return;
      }
      const espera = alvo.ultima_leitura?.tempo_espera_seg ?? 0;
      const resposta = await postDespacho({
        pdv_id: alvo.id,
        nivel_critico: nivelPorCor(alvo),
        sugestao_acao: `Reforçar atendimento em ${alvo.nome} (espera de ${espera}s)`.slice(0, 500),
      });
      const zona = resposta.nome_zona ?? separarNome(alvo.nome).codigo;
      setFeedback({
        tipo: 'ok',
        texto: `Despacho #${resposta.id} registrado em ${zona} (${resposta.status}).`,
      });
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    } finally {
      setOcupado(null);
    }
  }, []);

  /** Devolve o totem atualizado pela API, ou null se a chamada falhou. */
  const vendaExpress = useCallback(async (id: string, valor: number): Promise<AutosservicoItem | null> => {
    setOcupado('venda');
    setFeedback({ tipo: 'info', texto: 'Registrando venda na API...' });
    try {
      const totem = await postTransacaoAutosservico(id, valor);
      setFeedback({ tipo: 'ok', texto: `Venda registrada na API em ${totem.nome}.` });
      return totem;
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: `${mensagemDeErro(err)} A venda ficou só na tela.` });
      return null;
    } finally {
      setOcupado(null);
    }
  }, []);

  const limparFeedback = useCallback(() => setFeedback(null), []);

  return { ocupado, feedback, despachoOps, vendaExpress, limparFeedback };
}
