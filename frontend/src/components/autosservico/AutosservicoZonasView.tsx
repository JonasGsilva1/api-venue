import React, { useState } from 'react';
import clsx from 'clsx';
import {
  ShoppingBag,
  Camera,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Package,
  BatteryCharging,
  Coffee,
  RotateCcw,
  Smartphone,
  Check,
  Send,
} from 'lucide-react';

export interface TotemItem {
  id: string;
  codigo: string;
  nome: string;
  funcao: string;
  estoqueAtual: number;
  estoqueMaximo: number;
  status: 'OPERACIONAL' | 'ATENCAO' | 'RUPTURA';
  retiradasHoje: number;
  tipoIcone: 'kit' | 'cafe' | 'catalogo';
}

const TOTENS_INICIAIS: TotemItem[] = [
  {
    id: 't1',
    codigo: 'TOT-01',
    nome: 'Dispenser Welcome Kit & Brinde',
    funcao: 'Retirada autônoma via QR Code do crachá',
    estoqueAtual: 42,
    estoqueMaximo: 50,
    status: 'OPERACIONAL',
    retiradasHoje: 168,
    tipoIcone: 'kit',
  },
  {
    id: 't2',
    codigo: 'TOT-02',
    nome: 'Barista Automático & Café RAIZ',
    funcao: 'Dispensação de bebidas e doses especiais',
    estoqueAtual: 18,
    estoqueMaximo: 50,
    status: 'ATENCAO',
    retiradasHoje: 142,
    tipoIcone: 'cafe',
  },
  {
    id: 't3',
    codigo: 'TOT-03',
    nome: 'Terminal de Catálogo Interativo',
    funcao: 'Navegação em soluções e portfólio Porto Digital',
    estoqueAtual: 50,
    estoqueMaximo: 50,
    status: 'OPERACIONAL',
    retiradasHoje: 76,
    tipoIcone: 'catalogo',
  },
];

export const AutosservicoZonasView: React.FC = () => {
  const [totens, setTotens] = useState<TotemItem[]>(TOTENS_INICIAIS);
  const [chamadoReposicaoEnviado, setChamadoReposicaoEnviado] = useState(false);

  // Simular retirada autônoma
  const handleRetirada = (id: string) => {
    setTotens((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const novoEstoque = Math.max(0, t.estoqueAtual - 1);
        const pct = novoEstoque / t.estoqueMaximo;
        const novoStatus = pct <= 0.15 ? 'RUPTURA' : pct <= 0.4 ? 'ATENCAO' : 'OPERACIONAL';
        return {
          ...t,
          estoqueAtual: novoEstoque,
          retiradasHoje: t.retiradasHoje + 1,
          status: novoStatus,
        };
      })
    );
  };

  // Reabastecer totem para 100%
  const handleReabastecer = (id: string) => {
    setTotens((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          estoqueAtual: t.estoqueMaximo,
          status: 'OPERACIONAL',
        };
      })
    );
  };

  // Solicitar reposição de equipe
  const handleSolicitarReposicao = () => {
    setChamadoReposicaoEnviado(true);
    setTimeout(() => setChamadoReposicaoEnviado(false), 4000);
  };

  const totalRetiradas = totens.reduce((s, t) => s + t.retiradasHoje, 0);
  const totensEmAlerta = totens.filter((t) => t.status === 'ATENCAO' || t.status === 'RUPTURA');
  const mediaEstoquePct = Math.round(
    (totens.reduce((s, t) => s + t.estoqueAtual / t.estoqueMaximo, 0) / totens.length) * 100
  );

  return (
    <div className="space-y-6">
      {/* 1. CABEÇALHO DA ABA */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100">Autosserviço & Zonas Interativas</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/40">
              Módulo Tático
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Totens autônomos, dispensação de kits, espaço instagramável e lounges de conexão
          </p>
        </div>

        {/* Notificar equipe de suporte */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSolicitarReposicao}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#111827] text-gray-200 border border-[#1E293B] hover:border-[#FFD600]/50 hover:text-white transition-all shadow-md"
          >
            <Send size={14} className="text-[#FFD600]" />
            <span>Notificar Reposição de Estoque</span>
          </button>
        </div>
      </header>

      {/* Alerta de chamado de reposição */}
      {chamadoReposicaoEnviado && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>
              <strong>Alerta de Reposição Emitido:</strong> Equipe de apoio do estande acionada via rádio para conferência e reposição de insumos.
            </span>
          </div>
          <span className="font-mono text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded">
            Enviado com sucesso
          </span>
        </div>
      )}

      {/* 2. KPIS GERAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Retiradas Totais */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Retiradas Autônomas</span>
            <ShoppingBag size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalRetiradas} <span className="text-sm font-normal text-gray-400">itens</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="font-mono text-emerald-400 font-semibold">98.4%</span>
            <span>sucesso na primeira tentativa</span>
          </div>
        </div>

        {/* KPI 2: Nível Geral de Estoque */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Estoque Médio</span>
            <Package size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {mediaEstoquePct}% <span className="text-sm font-normal text-gray-400">disponível</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            {totensEmAlerta.length > 0 ? (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle size={12} />
                1 totem requer reposição
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={12} />
                Sem risco de ruptura
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Engajamento Instagramável */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Espaço Instagramável</span>
            <Camera size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            528 <span className="text-sm font-normal text-gray-400">interações</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="font-mono text-gray-300 font-semibold">3m 15s</span>
            <span>permanência média</span>
          </div>
        </div>

        {/* KPI 4: Pontuação CES (Facilidade de Uso) */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Índice de Usabilidade (CES)</span>
            <Sparkles size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            4.8 <span className="text-sm font-normal text-gray-400">/ 5.0</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-400">
            <Check size={12} />
            <span>Fluxo autônomo sem atrito</span>
          </div>
        </div>
      </div>

      {/* 3. TOTENS E TERMINAIS AUTÔNOMOS */}
      <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#FFD600]" />
              Totens e Dispensers de Autosserviço
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Níveis em tempo real de suprimentos, volumetria de retiradas e botões de teste
            </p>
          </div>
          <span className="text-[11px] text-gray-400 font-mono">
            3 terminais online
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {totens.map((t) => {
            const pct = Math.round((t.estoqueAtual / t.estoqueMaximo) * 100);
            const isRuptura = t.status === 'RUPTURA';
            const isAtencao = t.status === 'ATENCAO';

            return (
              <div
                key={t.id}
                className={clsx(
                  'rounded-xl p-4 border bg-[#090D16] transition-all flex flex-col justify-between',
                  isRuptura
                    ? 'border-rose-500/50 shadow-rose-950/20 shadow-lg'
                    : isAtencao
                    ? 'border-amber-500/50'
                    : 'border-[#1E293B]'
                )}
              >
                <div>
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#111827] text-[#FFD600] border border-[#1E293B]">
                      {t.codigo}
                    </span>
                    <span
                      className={clsx(
                        'text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase border',
                        isRuptura
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : isAtencao
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      )}
                    >
                      {isRuptura ? 'Ruptura' : isAtencao ? 'Reposição Necessária' : 'Operacional'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    {t.tipoIcone === 'kit' && <Package size={16} className="text-[#FFD600]" />}
                    {t.tipoIcone === 'cafe' && <Coffee size={16} className="text-amber-400" />}
                    {t.tipoIcone === 'catalogo' && <Smartphone size={16} className="text-cyan-400" />}
                    <h4 className="font-bold text-sm text-gray-100">{t.nome}</h4>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{t.funcao}</p>

                  {/* Nível de Estoque */}
                  <div className="mt-4 p-3 rounded-lg bg-[#111827] border border-[#1E293B]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Estoque atual:</span>
                      <span className="font-mono font-bold text-gray-100">
                        {t.estoqueAtual} / {t.estoqueMaximo} ({pct}%)
                      </span>
                    </div>

                    <div className="mt-2 h-2 rounded-full bg-[#090D16] overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all duration-300',
                          isRuptura ? 'bg-rose-500' : isAtencao ? 'bg-amber-400' : 'bg-emerald-400'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                      <span>Retiradas hoje:</span>
                      <span className="font-mono text-gray-200">{t.retiradasHoje} acessos</span>
                    </div>
                  </div>
                </div>

                {/* Ações interativas */}
                <div className="mt-4 pt-3 border-t border-[#1E293B] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleRetirada(t.id)}
                    disabled={t.estoqueAtual === 0}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#111827] hover:bg-gray-800 border border-[#1E293B] text-xs font-semibold text-gray-200 hover:text-[#FFD600] disabled:opacity-40 transition-colors"
                  >
                    Simular Retirada
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReabastecer(t.id)}
                    className="p-1.5 rounded-lg bg-[#111827] hover:bg-gray-800 border border-[#1E293B] text-gray-400 hover:text-emerald-400 transition-colors"
                    title="Restaurar estoque para 100%"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. ZONAS DE EXPERIÊNCIA & ENGAJAMENTO (INSTAGRAMÁVEL + LOUNGE) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Espaço Instagramável */}
        <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Camera size={18} className="text-[#FFD600]" />
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
                Painel Instagramável RAIZ
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Sensor IA Ativo
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Parede de led vertical, cenografia viva e hashtag do evento #RaizPortoDigital
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs">
              <span className="text-gray-400">Pessoas no ponto focal:</span>
              <span className="font-mono text-sm font-bold text-gray-100">6 pessoas</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs">
              <span className="text-gray-400">Tempo de foto & permanência:</span>
              <span className="font-mono text-sm font-bold text-[#FFD600]">3m 20s</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs">
              <span className="text-gray-400">Status de engajamento:</span>
              <span className="font-mono text-emerald-400 font-semibold">Alta circulação</span>
            </div>
          </div>
        </div>

        {/* Lounge de Conexão */}
        <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BatteryCharging size={18} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
                Lounge Conexão & Carga
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              6 Estações
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Poltronas com carregamento por indução e conexão Wi-Fi dedicada
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs">
              <span className="text-gray-400">Poltronas ocupadas:</span>
              <span className="font-mono text-sm font-bold text-gray-100">4 / 6 estações (67%)</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs">
              <span className="text-gray-400">Permanência média de recarga:</span>
              <span className="font-mono text-sm font-bold text-[#FFD600]">14m 10s</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#090D16] border border-[#1E293B] text-xs">
              <span className="text-gray-400">Disponibilidade imediata:</span>
              <span className="font-mono text-emerald-400 font-semibold">2 vagas livres</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
