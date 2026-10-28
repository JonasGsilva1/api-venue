import React, { useState } from 'react';
import clsx from 'clsx';
import {
  Users,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BellRing,
  UserCheck,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react';
import { formatarDuracao } from '../../utils/publico';

export interface GuicheItem {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  atendente: string;
  pessoasNaFila: number;
  capacidadeFila: number;
  tempoMedioAtendimentoSeg: number;
  status: 'NORMAL' | 'PRESSAO' | 'CRITICO';
  atendimentosConcluidos: number;
}

const GUICHES_INICIAIS: GuicheItem[] = [
  {
    id: 'g1',
    codigo: 'G-01',
    nome: 'Atendimento & Recepção Geral',
    tipo: 'Informações & Cadastro RAIZ',
    atendente: 'Mariana Costa',
    pessoasNaFila: 4,
    capacidadeFila: 8,
    tempoMedioAtendimentoSeg: 170, // 2m 50s
    status: 'NORMAL',
    atendimentosConcluidos: 42,
  },
  {
    id: 'g2',
    codigo: 'G-02',
    nome: 'Degustação & Experiência',
    tipo: 'Bar & Harmonização',
    atendente: 'Felipe Alencar',
    pessoasNaFila: 7,
    capacidadeFila: 8,
    tempoMedioAtendimentoSeg: 250, // 4m 10s
    status: 'PRESSAO',
    atendimentosConcluidos: 58,
  },
  {
    id: 'g3',
    codigo: 'G-03',
    nome: 'Retirada Express & Welcome Kit',
    tipo: 'Entrega Rápida de Brindes',
    atendente: 'Lucas Peixoto',
    pessoasNaFila: 2,
    capacidadeFila: 6,
    tempoMedioAtendimentoSeg: 90, // 1m 30s
    status: 'NORMAL',
    atendimentosConcluidos: 64,
  },
];

const HISTORICO_HORARIOS = [
  { hora: '10:00', pessoas: 5, tempoMin: 2.1 },
  { hora: '11:00', pessoas: 9, tempoMin: 3.4 },
  { hora: '12:00', pessoas: 15, tempoMin: 5.2 }, // pico almoço
  { hora: '13:00', pessoas: 18, tempoMin: 6.1 }, // pico almoço
  { hora: '14:00', pessoas: 12, tempoMin: 4.5 },
  { hora: '15:00', pessoas: 14, tempoMin: 4.8 },
  { hora: '16:00', pessoas: 13, tempoMin: 4.2 },
  { hora: '17:00 (Agora)', pessoas: 13, tempoMin: 3.8 },
];

export const BalcaoFilasView: React.FC = () => {
  const [guiches, setGuiches] = useState<GuicheItem[]>(GUICHES_INICIAIS);
  const [redirecionamentoPushAtivo, setRedirecionamentoPushAtivo] = useState(false);
  const [notificacaoEnviada, setNotificacaoEnviada] = useState(false);

  // Totais agregados
  const totalPessoasFila = guiches.reduce((s, g) => s + g.pessoasNaFila, 0);
  const totalAtendidos = guiches.reduce((s, g) => s + g.atendimentosConcluidos, 0);
  const tempoMedioGeralSeg = Math.round(
    guiches.reduce((s, g) => s + g.tempoMedioAtendimentoSeg, 0) / guiches.length
  );
  const guicheSobPressao = guiches.find((g) => g.status === 'PRESSAO' || g.status === 'CRITICO');

  // Adicionar pessoa em uma fila específica
  const handleAdicionarPessoa = (id: string) => {
    setGuiches((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const novaFila = g.pessoasNaFila + 1;
        const ocupacao = novaFila / g.capacidadeFila;
        const novoStatus = ocupacao >= 0.85 ? 'CRITICO' : ocupacao >= 0.6 ? 'PRESSAO' : 'NORMAL';
        return {
          ...g,
          pessoasNaFila: novaFila,
          status: novoStatus,
        };
      })
    );
  };

  // Concluir atendimento em um guichê
  const handleConcluirAtendimento = (id: string) => {
    setGuiches((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const novaFila = Math.max(0, g.pessoasNaFila - 1);
        const ocupacao = novaFila / g.capacidadeFila;
        const novoStatus = ocupacao >= 0.85 ? 'CRITICO' : ocupacao >= 0.6 ? 'PRESSAO' : 'NORMAL';
        return {
          ...g,
          pessoasNaFila: novaFila,
          atendimentosConcluidos: g.atendimentosConcluidos + 1,
          status: novoStatus,
        };
      })
    );
  };

  // Acionar push de redirecionamento para desafogar
  const handleAcionarPush = () => {
    setRedirecionamentoPushAtivo(true);
    setNotificacaoEnviada(true);
    setTimeout(() => setNotificacaoEnviada(false), 4000);
  };

  return (
    <div className="space-y-6">
      {/* 1. CABEÇALHO DA ABA */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100">Balcão & Gestão de Filas</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/40">
              Módulo Tático
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Monitoramento de fluxo de guichês, tempos de espera e vazão no estande RAIZ
          </p>
        </div>

        {/* Ação rápida de redistribuição de público */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAcionarPush}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shadow-md',
              redirecionamentoPushAtivo
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-[#111827] text-gray-200 border-[#1E293B] hover:border-[#FFD600]/50 hover:text-white'
            )}
          >
            <BellRing size={15} className={redirecionamentoPushAtivo ? 'text-[#FFD600] animate-bounce' : 'text-gray-400'} />
            <span>{redirecionamentoPushAtivo ? 'Redirecionamento Ativo' : 'Ativar Push de Redirecionamento'}</span>
          </button>
        </div>
      </header>

      {/* Alerta de notificação push disparada */}
      {notificacaoEnviada && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#FFD600] shrink-0" />
            <span>
              <strong>Notificação Push Enviada:</strong> Visitantes com espera estimada superior a 4 min foram orientados para os totens de autosserviço.
            </span>
          </div>
          <span className="font-mono text-[10px] bg-amber-500/20 px-2 py-0.5 rounded">Disparado agora</span>
        </div>
      )}

      {/* 2. CARDS DE KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Tempo Médio de Espera */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Tempo Médio de Espera</span>
            <Clock size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {formatarDuracao(tempoMedioGeralSeg)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold">
              Meta: &lt; 5m
            </span>
            <span className="text-gray-400">Tempo controlado</span>
          </div>
        </div>

        {/* KPI 2: Pessoas em Fila */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Pessoas em Fila</span>
            <Users size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalPessoasFila} <span className="text-sm font-normal text-gray-400">em 3 guichês</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            {guicheSobPressao ? (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle size={12} />
                Ponto de atenção no Guichê 02
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} />
                Distribuição fluida
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Vazão de Atendimento */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Vazão de Atendimento</span>
            <TrendingUp size={16} className="text-emerald-400" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            74 <span className="text-sm font-normal text-gray-400">atend./hora</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="font-mono text-emerald-400 font-semibold">+9.2%</span>
            <span>vs. período anterior</span>
          </div>
        </div>

        {/* KPI 4: Atendimentos Concluídos */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Concluídos</span>
            <UserCheck size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalAtendidos} <span className="text-sm font-normal text-gray-400">hoje</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="font-mono text-gray-300 font-semibold">97.4%</span>
            <span>taxa de sucesso</span>
          </div>
        </div>
      </div>

      {/* 3. MONITOR DOS GUICHÊS DE ATENDIMENTO (INTERATIVOS) */}
      <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#FFD600]" />
              Pontos de Atendimento (Guichês Ativos)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Status operacional individual, fila atual e tempo de espera por posição
            </p>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">
            3 operadores em serviço
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {guiches.map((g) => {
            const pct = Math.round((g.pessoasNaFila / g.capacidadeFila) * 100);
            const isCritico = g.status === 'CRITICO';
            const isPressao = g.status === 'PRESSAO';

            return (
              <div
                key={g.id}
                className={clsx(
                  'rounded-xl p-4 border bg-[#090D16] transition-all flex flex-col justify-between',
                  isCritico
                    ? 'border-rose-500/50 shadow-rose-950/20 shadow-lg'
                    : isPressao
                    ? 'border-amber-500/50'
                    : 'border-[#1E293B]'
                )}
              >
                <div>
                  {/* Cabeçalho do Card */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#111827] text-[#FFD600] border border-[#1E293B]">
                      {g.codigo}
                    </span>
                    <span
                      className={clsx(
                        'text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border',
                        isCritico
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : isPressao
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      )}
                    >
                      {isCritico ? 'Fila Crítica' : isPressao ? 'Pressão Moderada' : 'Fluxo Normal'}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-gray-100">{g.nome}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{g.tipo}</p>
                  <p className="text-[11px] text-gray-500 mt-1 font-mono">
                    Operador: <span className="text-gray-300 font-sans">{g.atendente}</span>
                  </p>

                  {/* Fila e Barra de Ocupação */}
                  <div className="mt-4 p-3 rounded-lg bg-[#111827] border border-[#1E293B]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Pessoas em espera:</span>
                      <span className="font-mono font-bold text-gray-100">
                        {g.pessoasNaFila} / {g.capacidadeFila}
                      </span>
                    </div>

                    <div className="mt-2 h-2 rounded-full bg-[#090D16] overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all duration-300',
                          isCritico ? 'bg-rose-500' : isPressao ? 'bg-amber-400' : 'bg-emerald-400'
                        )}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>Tempo médio:</span>
                      <span className="font-mono text-gray-200">
                        {formatarDuracao(g.tempoMedioAtendimentoSeg)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Controles rápidos de simulação */}
                <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">Simular Fila:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAdicionarPessoa(g.id)}
                      className="p-1.5 rounded-lg bg-[#111827] hover:bg-gray-800 border border-[#1E293B] text-gray-200 hover:text-[#FFD600] transition-colors"
                      title="Adicionar pessoa na fila"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConcluirAtendimento(g.id)}
                      className="p-1.5 rounded-lg bg-[#111827] hover:bg-gray-800 border border-[#1E293B] text-gray-200 hover:text-emerald-400 transition-colors"
                      title="Concluir atendimento"
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. HISTÓRICO DE ESPERA E HORÁRIOS DE PICO */}
      <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
              <Clock size={16} className="text-[#FFD600]" />
              Evolução do Tempo de Espera ao Longo do Dia
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Comparativo horário de fila em relação ao limite de alerta de 5 minutos
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-300">
              <span className="size-2 rounded-full bg-[#FFD600]" /> Tempo Médio
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="h-0.5 w-3 bg-rose-500" /> Limite Alerta (5 min)
            </span>
          </div>
        </div>

        {/* Visualização de barras com SVG */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-4">
          {HISTORICO_HORARIOS.map((h, i) => {
            const alturaPct = Math.min(100, Math.round((h.tempoMin / 7) * 100));
            const acimaLimite = h.tempoMin >= 5.0;

            return (
              <div key={i} className="flex flex-col items-center">
                <div className="font-mono text-[11px] text-gray-400 mb-1">
                  {h.tempoMin.toFixed(1)}m
                </div>
                <div className="w-full h-32 bg-[#090D16] rounded-lg p-1.5 border border-[#1E293B] flex items-end justify-center relative">
                  {/* Linha de limite de 5 minutos */}
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-rose-500/50"
                    style={{ bottom: `${(5 / 7) * 100}%` }}
                  />

                  {/* Barra de volume */}
                  <div
                    className={clsx(
                      'w-full max-w-[28px] rounded transition-all duration-500',
                      acimaLimite ? 'bg-rose-500 shadow-md shadow-rose-950/40' : 'bg-[#FFD600]'
                    )}
                    style={{ height: `${alturaPct}%` }}
                    title={`${h.hora}: ${h.tempoMin}m de espera (${h.pessoas} pessoas)`}
                  />
                </div>
                <span className="text-[10px] text-gray-400 font-mono mt-1.5 text-center truncate w-full">
                  {h.hora}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
