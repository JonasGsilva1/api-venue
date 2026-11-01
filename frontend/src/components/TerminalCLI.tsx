import React, { useState } from 'react';
import { Terminal as TerminalIcon, X } from 'lucide-react';

interface TerminalCLIProps {
  isOpen: boolean;
  onClose: () => void;
  onRunAction?: (cmd: string) => void;
}

export const TerminalCLI: React.FC<TerminalCLIProps> = ({ isOpen, onClose, onRunAction }) => {
  const [logs, setLogs] = useState<string[]>([
    '[INIT] Venue Intelligence Core v2.4.0 [GATEWAY: https://api-evento-ia.onrender.com]',
    '[OK] Telemetria de sensores de fluxo e pressão conectada (WebSocket ping: 431ms)',
    '[INFO] Motor Preditivo de Gargalos IA: monitorando 8 setores ativos da arena',
    '[READY] Digite "help" para ver os comandos operacionais ou execute uma ação preditiva.',
  ]);
  const [inputVal, setInputVal] = useState('');

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const newLogs = [...logs, `> ${trimmed}`];

    if (trimmed.toLowerCase() === 'help') {
      newLogs.push(
        'Comandos disponíveis:',
        '  status        - Exibe o estado operacional de todos os totens e ativações',
        '  repor-tudo    - Reabastece insumos de chopp e copos nos totens em déficit',
        '  aliviar-filas - Ativa modo ágil nos pontos instagramáveis e rebalanceia público',
        '  pico-sim      - Simula pico de 100 pessoas na Arena Principal',
        '  clear         - Limpa o console de telemetria'
      );
    } else if (trimmed.toLowerCase() === 'clear') {
      setLogs(['[CLEARED] Console reiniciado.']);
      setInputVal('');
      return;
    } else if (trimmed.toLowerCase() === 'status') {
      newLogs.push(
        '[TELEMETRIA] 4 Totens de Autosserviço: 3 Operacionais, 1 Atenção (AUT-DRINK-02)',
        '[TELEMETRIA] 4 Pontos Instagramáveis: 3 Ativos, 1 Alta Procura (Túnel Neon)',
        '[VENUES] Taxa de Throughput: 17.2 atendimentos/min · Espera global: 3.8 min'
      );
    } else if (trimmed.toLowerCase().includes('repor')) {
      newLogs.push('[SUCESSO] Ordem de despacho emitida para equipe móvel: todos os tanques em 100%.');
      if (onRunAction) onRunAction('repor-tudo');
    } else if (trimmed.toLowerCase().includes('fila') || trimmed.toLowerCase().includes('aliviar')) {
      newLogs.push('[SUCESSO] Modo fotográfico ágil ativado no Túnel Neon e Balanço Flutuante.');
      if (onRunAction) onRunAction('aliviar-filas');
    } else if (trimmed.toLowerCase().includes('pico')) {
      newLogs.push('[SIMULAÇÃO] Injeção de pico de tráfego de 100 participantes na arena.');
      if (onRunAction) onRunAction('pico');
    } else {
      newLogs.push(`[EXEC] Comando "${trimmed}" enviado para api-evento-ia.onrender.com`);
    }

    setLogs(newLogs);
    setInputVal('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[#090d16] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
        <div className="flex items-center justify-between px-4 py-3 bg-[#0d1527] border-b border-cyan-900/50">
          <div className="flex items-center gap-2 text-cyan-400">
            <TerminalIcon className="w-4 h-4 text-emerald-400" />
            <span className="font-bold tracking-tight text-white">Terminal Operacional & Execução de Diagnóstico CLI</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">ONLINE</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 h-72 overflow-y-auto space-y-1 text-slate-300 bg-[#060a12]">
          {logs.map((log, idx) => (
            <div
              key={idx}
              className={
                log.startsWith('>')
                  ? 'text-emerald-400 font-bold'
                  : log.startsWith('[SUCESSO]')
                  ? 'text-cyan-300'
                  : log.startsWith('[OK]')
                  ? 'text-emerald-300'
                  : log.startsWith('[INFO]')
                  ? 'text-amber-300'
                  : 'text-slate-300'
              }
            >
              {log}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeCommand(inputVal);
          }}
          className="flex items-center gap-2 p-3 bg-[#0d1527] border-t border-cyan-900/50"
        >
          <span className="text-emerald-400 font-bold">{'>_'}</span>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Digite um comando (ex: status, repor-tudo, aliviar-filas, pico-sim, help)..."
            className="flex-1 bg-transparent text-white focus:outline-none placeholder-slate-500 text-xs"
            autoFocus
          />
          <button
            type="submit"
            className="px-3 py-1 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold rounded-lg transition-colors text-xs"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
};