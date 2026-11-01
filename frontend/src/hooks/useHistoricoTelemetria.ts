import { useEffect, useRef, useState } from 'react';
import type { Amostra } from '../utils/predicao';

/**
 * Guarda as últimas `max` amostras de cada id (buffer circular) para alimentar
 * o algoritmo preditivo.
 *
 * - `valores`: valor atual da métrica por id, ex.: { 'aut-01': 3.2, 'inst-01': 9.5 }
 *   (monte com useMemo no componente para evitar recriar o objeto à toa).
 * - `intervaloMs`: de quanto em quanto tempo uma nova amostra é gravada.
 * - `max`: tamanho da janela deslizante (30 amostras por padrão).
 *
 * Retorna o `historico` (Map mutável, mesma referência entre renders) e a
 * `versao`, que muda a cada nova amostra. Inclua `versao` nas dependências de
 * qualquer useMemo/useEffect que leia o `historico`.
 */
export function useHistoricoTelemetria(
  valores: Record<string, number>,
  intervaloMs: number,
  max = 30,
) {
  const bufferRef = useRef(new Map<string, Amostra[]>());
  const valoresRef = useRef(valores);
  const [versao, setVersao] = useState(0);

  // Mantém o valor mais recente acessível ao timer sem reiniciá-lo a cada render.
  useEffect(() => {
    valoresRef.current = valores;
  }, [valores]);

  useEffect(() => {
    const buffer = bufferRef.current;

    const amostrar = () => {
      const t = Date.now();
      const atuais = valoresRef.current;

      for (const [id, valor] of Object.entries(atuais)) {
        if (!Number.isFinite(valor)) continue;
        const lista = buffer.get(id) ?? [];
        const ultima = lista[lista.length - 1];
        // Evita amostras duplicadas (ex.: StrictMode monta o efeito duas vezes em dev).
        if (ultima && t - ultima.t < 500) continue;
        buffer.set(id, [...lista, { t, valor }].slice(-max));
      }

      // Remove ids que deixaram de existir (atração removida).
      for (const id of buffer.keys()) {
        if (!(id in atuais)) buffer.delete(id);
      }

      setVersao((v) => v + 1);
    };

    amostrar(); // primeira amostra imediata, sem esperar o primeiro intervalo
    const timer = setInterval(amostrar, intervaloMs);
    return () => clearInterval(timer);
  }, [intervaloMs, max]);

  return { historico: bufferRef.current, versao };
}