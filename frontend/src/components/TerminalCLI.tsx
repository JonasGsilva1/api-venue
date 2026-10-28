import React, { useState } from 'react';
import { Terminal as TerminalIcon, X } from 'lucide-react';

interface TerminalCLIProps {
  isOpen: boolean;
  onClose: () => void;
  onRunAction?: (cmd: string) => Promise<string | void> | void;
}

export const TerminalCLI: React.FC<TerminalCLIProps> = ({ isOpen, onClose, onRunAction }) => {
  const [logs, setLogs] = useState<string[]>([
    '[INIT] Venue Intelligence Core v2.0.0 [FASTAPI PORTA 8000]',
    '[OK] Telemetria de sensores de fluxo e pressão conectada (WebSocket / SSE)',
    '[INFO] Motor Preditivo de Gargalos IA: monitorando setores ativos da arena',
    '[READY] Digite "help" para ver os comandos operacionais ou execute uma ação preditiva.',
  ]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);

  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const newLogs = [...logs, `> ${trimmed}`];

    if (trimmed.toLowerCase() === 'help') {
      newLogs.push(
        'Comandos disponíveis:',
        '  status        - Consulta /health e estado operacional da API',
        '  repor-tudo    - Emite requisição de reposição de insumos e totens via API',
        '  aliviar-filas - Dispara acionamento preditivo de contingência',
        '  pico-sim      - Simula pico de público em todos os setores da arena',
        '  clear         - Limpa o console de telemetria'
      );
      setLogs(newLogs);
      setInputVal('');
      return;
    } else if (trimmed.toLowerCase() === 'clear') {
      setLogs(['[CLEARED] Console reiniciado.']);
      setInputVal('');
      return;
    }

    setLogs([...newLogs, '[EXEC] Enviando requisição para API na porta 8000...']);
    setLoading(true);

    try {
      if (onRunAction) {
        const result = await onRunAction(trimmed);
        if (result) {
          setLogs((prev) => [...prev, result]);
        }
      } else {
        setLogs((prev) => [...prev, `[OK] Comando "${trimmed}" processado.`]);
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        `[ERRO] Falha ao executar: ${err?.response?.data?.mensagem || err?.message || 'Erro desconhecido'}`,
      ]);
    } finally {
      setLoading(false);
      setInputVal('');
    }
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
            disabled={loading}
            className="px-3 py-1 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 font-bold rounded-lg transition-colors text-xs"
          >
            {loading ? 'Executando...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
};