import React, { useState } from 'react';
import { Terminal as TerminalIcon, X } from 'lucide-react';
import {
  getDispatches,
  getHealth,
  getSintese,
  mensagemDeErro,
  postSimularPico,
  postYoloScan,
} from '../services/venueApi';

interface TerminalCLIProps {
  isOpen: boolean;
  onClose: () => void;
  onRunAction?: (cmd: string) => void;
}

export const TerminalCLI: React.FC<TerminalCLIProps> = ({ isOpen, onClose, onRunAction }) => {
  const [logs, setLogs] = useState<string[]>([
    '[INIT] Venue Intelligence Core conectado à API FastAPI',
    '[READY] Digite "help" para ver os comandos conectados à API em tempo real.',
  ]);
  const [inputVal, setInputVal] = useState('');
  const [executando, setExecutando] = useState(false);

  const appendLog = (...linhas: string[]) => {
    setLogs((prev) => [...prev, ...linhas]);
  };

  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || executando) return;
    const lower = trimmed.toLowerCase();

    appendLog(`> ${trimmed}`);
    setInputVal('');

    if (lower === 'help') {
      appendLog(
        'Comandos disponíveis:',
        '  status        - Consulta Saúde da API (/health) e Síntese Acumulada',
        '  despachos     - Lista as ordens em Despacho Ops (/api/v1/ops/dispatch)',
        '  yolo-scan     - Roda detecção de teste no servidor (/api/v1/telemetry/yolo-scan)',
        '  pico-sim      - Dispara Simular Pico na API (/api/v1/venue/simular-pico)',
        '  aliviar-filas - Executa ação preditiva na API',
        '  clear         - Limpa o console',
      );
      return;
    }

    if (lower === 'clear') {
      setLogs(['[CLEARED] Console reiniciado.']);
      return;
    }

    setExecutando(true);
    try {
      if (lower === 'status') {
        const [health, sintese] = await Promise.all([getHealth(), getSintese()]);
        appendLog(
          `[OK] API v${health.versao} · Estado: ${health.status_operacional_evento} · IA online: ${health.motor_ia_online ? 'SIM' : 'NÃO'} · Conexões ao vivo: ${health.conexoes_tempo_real}`,
          `[INFO] Câmeras ativas: ${sintese.camerasMonitoradasAtivas} · Atendimentos: ${sintese.totalAtendimentosGerais} · Espera média: ${sintese.tempoMedioEsperaGlobalMin} min`,
        );
      } else if (lower.includes('despacho')) {
        const resp = await getDispatches();
        appendLog(
          `[INFO] Despacho Ops: ${resp.total_ordens} ordem(ns) · Estado: ${resp.status_operacional_evento}`,
          ...resp.ordens.slice(-5).map(
            (o) => `  #${o.id} [${o.nivel_critico}] ${o.nome_zona ?? `Zona ${o.pdv_id}`}: ${o.sugestao_acao} (${o.status})`,
          ),
        );
      } else if (lower.includes('yolo')) {
        const resp = await postYoloScan({ frame_indice: 3, pdv_fila_id: 1, pdv_estande_id: 3 });
        appendLog(
          `[SUCESSO] Motor ${resp.motor_visao} (${resp.resolucao_frame}) → Fila: ${resp.pessoas_zona_fila} pax (${resp.leitura_fila.tempo_espera_fmt}, ${resp.leitura_fila.status_cor}) · Estande: ${resp.pessoas_zona_estande} pax`,
        );
        onRunAction?.('yolo-scan');
      } else if (lower.includes('pico')) {
        const resp = await postSimularPico();
        appendLog(`[SUCESSO] ${resp.mensagem}`);
        onRunAction?.('pico');
      } else if (lower.includes('fila') || lower.includes('aliviar')) {
        onRunAction?.('aliviar-filas');
        appendLog('[SUCESSO] Medida de alívio de fila acionada na API.');
      } else {
        appendLog(`[INFO] Comando "${trimmed}" não reconhecido. Digite "help".`);
      }
    } catch (err) {
      appendLog(`[ERRO] ${mensagemDeErro(err)}`);
    } finally {
      setExecutando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-raiz-dark border border-raiz-accent/40 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
        <div className="flex items-center justify-between px-4 py-3 bg-raiz-section border-b border-raiz-border-dark">
          <div className="flex items-center gap-2 text-raiz-accent">
            <TerminalIcon className="w-4 h-4 text-raiz-accent" />
            <span className="font-bold tracking-tight text-raiz-text-light">Terminal Operacional &amp; Execução de Diagnóstico CLI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-raiz-accent/10 border border-raiz-accent/40 text-raiz-accent">ONLINE</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-raiz-text-light/75 hover:text-raiz-text-light rounded-md hover:bg-raiz-border-dark transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 h-72 overflow-y-auto space-y-1 text-raiz-text-light/75 bg-raiz-dark">
          {logs.map((log, idx) => (
            <div
              key={idx}
              className={
                log.startsWith('>')
                  ? 'text-raiz-accent font-bold'
                  : log.startsWith('[SUCESSO]')
                    ? 'text-raiz-accent'
                    : log.startsWith('[OK]')
                      ? 'text-raiz-accent'
                      : log.startsWith('[ERRO]')
                        ? 'text-rose-400'
                        : log.startsWith('[INFO]')
                          ? 'text-amber-300'
                          : 'text-raiz-text-light/75'
              }
            >
              {log}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void executeCommand(inputVal);
          }}
          className="flex items-center gap-2 p-3 bg-raiz-section border-t border-raiz-border-dark"
        >
          <span className="text-raiz-accent font-bold">{'>_'}</span>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Digite um comando (ex: status, despachos, yolo-scan, pico-sim, help)..."
            className="flex-1 bg-transparent text-raiz-text-light focus:outline-none placeholder-raiz-text-light/55 text-xs"
            autoFocus
          />
          <button
            type="submit"
            disabled={executando}
            className="px-3 py-1 bg-raiz-accent hover:bg-raiz-accent/90 disabled:opacity-50 text-raiz-text-dark font-bold rounded-lg transition-colors text-xs"
          >
            {executando ? '...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
};
