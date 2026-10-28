import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Share2, 
  Clock, 
  CheckCircle, 
  Download, 
  Zap, 
  Activity, 
  Layers, 
  AlertTriangle
} from 'lucide-react';
import type { SinteseAcumuladaData } from '../types/venue';

interface SinteseAcumuladaProps {
  data: SinteseAcumuladaData;
  setorAtivo?: string | null;
  onFiltrarSetor?: (setor: string | null) => void;
  onSimularPicoDeFluxo?: () => void;
  onExportarCSV?: () => void;
  onExecutarAcaoSugerida?: (alertaId: string, atracaoId?: string) => void;
}

export const SinteseAcumulada: React.FC<SinteseAcumuladaProps> = ({
  data,
  setorAtivo = null,
  onFiltrarSetor,
  onSimularPicoDeFluxo,
  onExportarCSV,
  onExecutarAcaoSugerida,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [alertaDismissed, setAlertaDismissed] = useState<Record<string, boolean>>({});
  const [alertasExecutados, setAlertasExecutados] = useState<Record<string, boolean>>({});

  const handleExecutarSugestao = (alertaId: string, atracaoId?: string) => {
    setAlertasExecutados((prev) => ({ ...prev, [alertaId]: true }));
    if (onExecutarAcaoSugerida) {
      onExecutarAcaoSugerida(alertaId, atracaoId);
    }
  };

  const handleExport = () => {
    setDownloading(true);
    if (onExportarCSV) {
      onExportarCSV();
    } else {
      const headers = ['Métrica', 'Valor'];
      const rows = [
        ['Evento', data.eventoNome],
        ['Data', data.dataEvento],
        ['Atendimentos Totais', data.totalAtendimentosGerais.toString()],
        ['Receita Autosserviço (R$)', data.receitaTotalAutosservico.toFixed(2)],
        ['Capturas Instagramáveis', data.totalCapturasInstagramavel.toString()],
        ['Alcance Social Estimado', data.alcanceTotalRedes.toString()],
        ['Ticket Médio (R$)', data.ticketMedioGeral.toFixed(2)],
        ['Vazão Média (atend/min)', data.vazaoMediaAtendimentosPorMin.toString()],
        ['Tempo Médio de Espera (min)', data.tempoMedioEsperaGlobalMin.toString()],
        ['Satisfação Média (NPS/Score)', data.satisfacaoGeralScore.toString()],
      ];

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map(e => e.join(';')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `sintese_acumulada_evento_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setTimeout(() => setDownloading(false), 800);
  };

  const maxFluxo = Math.max(...data.fluxoHorario.map((f) => f.autosservico + f.instagramavel), 1);

  return (
    <section className="space-y-6">
      {/* 1. DESTAQUE: CARD DE PREDIÇÃO DE GARGALOS */}
      <div className="space-y-4">
        {data.principaisAlertas
          .filter((a) => !alertaDismissed[a.id])
          .map((alerta) => {
            const isExecutado = alertasExecutados[alerta.id];
            return (
              <div 
                key={alerta.id}
                className="relative rounded-2xl border border-rose-600/80 bg-gradient-to-r from-[#200812] via-[#14060d] to-[#0c0816] p-5 sm:p-6 shadow-2xl shadow-rose-950/40 text-slate-100"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-10 h-10 rounded-xl bg-rose-950/70 border border-rose-500/50 flex items-center justify-center text-rose-400 shrink-0 shadow-md">
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                    </div>

                    <span className="font-mono font-bold text-[11px] px-2.5 py-1 rounded bg-rose-950/80 border border-rose-500/60 text-rose-300 tracking-wider">
                      PRODUTO 2 • IA MOTOR PREDITIVO
                    </span>

                    <span className="font-bold text-[11px] px-2.5 py-0.5 rounded bg-rose-600 text-white tracking-wider">
                      CRÍTICO
                    </span>

                    <span className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Tempo p/ formação de fila: <strong className="text-white font-bold">03m 30s</strong></span>
                    </span>
                  </div>

                  <button
                    onClick={() => setAlertaDismissed({ ...alertaDismissed, [alerta.id]: true })}
                    className="text-slate-400 hover:text-white text-xs font-mono self-end sm:self-auto"
                  >
                    Dispensar
                  </button>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Gargalo Detectado: {alerta.atracao}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    Diagnóstico da IA: {alerta.mensagem}
                  </p>
                </div>

                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0c1322] border border-slate-700/80 text-xs text-amber-400 font-bold">
                  <Zap className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                  <span>Ação Recomendada: {alerta.direcionamento}</span>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleExecutarSugestao(alerta.id, alerta.atracaoId)}
                    disabled={isExecutado}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-white rounded-xl shadow-lg transition-all active:scale-95 ${
                      isExecutado
                        ? 'bg-emerald-600 text-white cursor-default shadow-emerald-950/50'
                        : 'bg-gradient-to-r from-[#ff0055] to-[#ff7700] hover:from-[#ff1a66] hover:to-[#ff881a] shadow-rose-950/60'
                    }`}
                  >
                    {isExecutado ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span>Medida Preditiva Executada com Sucesso</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-white" />
                        <span>Executar Medida Preditiva ({alerta.acaoRapidaLabel || 'Acionar Filas'})</span>
                      </>
                    )}
                  </button>

                  {alerta.impactoEstimado && (
                    <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>{alerta.impactoEstimado}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* 2. CONSOLIDAÇÃO EXECUTIVA DA SÍNTESE ACUMULADA */}
      <div className="rounded-2xl border border-slate-800 bg-[#0c1424] p-5 sm:p-7 shadow-xl text-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/40 text-[10px]">
                RELATÓRIO ACUMULADO
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">{data.dataEvento}</span>
              <span className="text-slate-500">·</span>
              <span className="text-emerald-400 font-mono">{data.tempoDecorridoHoras}h de operação contínua</span>
            </div>

            <h2 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-cyan-400 shrink-0" />
              <span>Síntese Acumulada de Inteligência do Evento</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Consolidação analítica de telemetria de totens, público em tempo real, receita F&B e alcance de marcas parceiras.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onSimularPicoDeFluxo && (
              <button
                onClick={onSimularPicoDeFluxo}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-300 bg-amber-950/40 border border-amber-600/50 hover:bg-amber-900/50 active:scale-95 rounded-lg transition-all"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Simular Pico (+100 atendimentos)</span>
              </button>
            )}

            <button
              onClick={handleExport}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 rounded-lg shadow-md shadow-emerald-500/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Gerando CSV...' : 'Exportar Relatório'}</span>
            </button>
          </div>
        </div>

        {/* 4 KPIs Macroeconômicos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6 border-b border-slate-800">
          <div className="p-4 rounded-xl bg-[#070d18] border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Público Atendido</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              {data.totalAtendimentosGerais.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold font-mono">
                {((data.totalAtendimentosGerais / data.publicoTotalEstimadoVenue) * 100).toFixed(1)}%
              </span>
              <span>do público total na arena</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#070d18] border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Receita Acumulada</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(data.receitaTotalAutosservico)}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>Ticket médio:</span>
              <strong className="font-mono text-white">R$ {data.ticketMedioGeral.toFixed(2)}</strong>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#070d18] border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Alcance das Marcas</span>
              <Share2 className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-fuchsia-400">
              {(data.alcanceTotalRedes / 1000).toFixed(0)}k
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <strong className="font-mono text-white">{data.totalCapturasInstagramavel.toLocaleString('pt-BR')}</strong>
              <span>fotos capturadas</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#070d18] border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Vazão & Agilidade</span>
              <Clock className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              {data.vazaoMediaAtendimentosPorMin} <span className="text-sm font-normal text-slate-400">atend/min</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <span>Espera média:</span>
              <strong className="font-mono text-amber-400">{data.tempoMedioEsperaGlobalMin} min</strong>
            </div>
          </div>
        </div>

        {/* Comparativo de Setor & Curva de Demanda */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Desempenho por Setor da Arena</span>
              </h3>

              {onFiltrarSetor && setorAtivo && (
                <button
                  onClick={() => onFiltrarSetor(null)}
                  className="text-xs text-cyan-400 font-medium hover:underline"
                >
                  Limpar Filtro ({setorAtivo})
                </button>
              )}
            </div>

            <div className="space-y-3">
              {data.faturamentoPorSetor.map((setor) => {
                const isFiltered = setorAtivo === setor.setor;
                return (
                  <div 
                    key={setor.setor}
                    onClick={() => onFiltrarSetor && onFiltrarSetor(isFiltered ? null : setor.setor)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isFiltered 
                        ? 'border-cyan-400 bg-cyan-950/40' 
                        : 'border-slate-800 bg-[#070d18] hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-slate-200">{setor.setor}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-white tabular-nums">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(setor.receita)}
                        </span>
                        <span className="text-cyan-400 font-mono text-[11px] tabular-nums">
                          {setor.pct}%
                        </span>
                      </div>
                    </div>

                    <div className="h-2 w-full bg-[#040810] rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, setor.pct)}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                      <span>{setor.volume} atendimentos</span>
                      <span className="text-cyan-400 font-medium">Isolar Setor</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <span>Curva de Demanda & Fluxo Horário</span>
              </h3>
              <span className="text-xs text-slate-500">Autosserviço vs Instagramável</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-[#070d18] space-y-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded-xs bg-cyan-500 inline-block" />
                  <span>Autosserviço (Transações)</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-3 rounded-xs bg-fuchsia-500 inline-block" />
                  <span>Instagramável (Fotos)</span>
                </span>
              </div>

              <div className="space-y-2.5 pt-1">
                {data.fluxoHorario.map((item) => {
                  const totalItem = item.autosservico + item.instagramavel;
                  const pctTotal = (totalItem / maxFluxo) * 100;
                  const pctAuto = (item.autosservico / totalItem) * 100;

                  return (
                    <div key={item.hora} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="font-semibold text-slate-300">{item.hora}</span>
                        <span className="text-slate-400 tabular-nums">
                          {totalItem} atendimentos · R$ {item.receita.toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="h-3 w-full bg-[#040810] border border-slate-800 rounded-sm overflow-hidden flex" style={{ width: `${Math.max(10, pctTotal)}%` }}>
                        <div 
                          className="h-full bg-cyan-500 transition-all duration-300" 
                          style={{ width: `${pctAuto}%` }}
                          title={`Autosserviço: ${item.autosservico}`}
                        />
                        <div 
                          className="h-full bg-fuchsia-500 transition-all duration-300" 
                          style={{ width: `${100 - pctAuto}%` }}
                          title={`Instagramável: ${item.instagramavel}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};