import type { AutosservicoItem, InstagramavelItem, SinteseAcumuladaData } from '../types/venue';

export const INITIAL_AUTOSSERVICO: AutosservicoItem[] = [
  {
    id: 'aut-01',
    codigo: 'AUT-BEER-01',
    nome: 'Beer Wall Master 01',
    tipoInsumo: 'Chopp Artesanal IPA & Pilsen',
    setor: 'Arena Principal',
    status: 'operacional',
    capacidadeTotalInsumo: 500,
    nivelAtualInsumo: 385,
    unidadeMedida: 'L',
    capacidadeCopos: 600,
    nivelCopos: 490,
    transacoesAcumuladas: 612,
    receitaTotal: 18360,
    ticketMedio: 30.0,
    tempoMedioAtendimentoSegundos: 24,
    pessoasNaFila: 4,
    tempoEstimadoEsperaMin: 1.6,
    temperaturaC: 2.1,
    pressaoPsi: 14.2,
    posicao3D: [-6, 0, 4],
    ultimoAbastecimento: 'Há 45 min',
    consumoPorHora: [
      { hora: '18h', transacoes: 45, receita: 1350 },
      { hora: '19h', transacoes: 110, receita: 3300 },
      { hora: '20h', transacoes: 185, receita: 5550 },
      { hora: '21h', transacoes: 160, receita: 4800 },
      { hora: '22h', transacoes: 112, receita: 3360 },
    ],
  },
  {
    id: 'aut-02',
    codigo: 'AUT-DRINK-02',
    nome: 'Dispenser Cocktails & Gin 02',
    tipoInsumo: 'Gin Tônica & Drinks Prontos',
    setor: 'Palco Sunset',
    status: 'atencao',
    capacidadeTotalInsumo: 300,
    nivelAtualInsumo: 68,
    unidadeMedida: 'L',
    capacidadeCopos: 400,
    nivelCopos: 82,
    transacoesAcumuladas: 480,
    receitaTotal: 19200,
    ticketMedio: 40.0,
    tempoMedioAtendimentoSegundos: 31,
    pessoasNaFila: 12,
    tempoEstimadoEsperaMin: 6.2,
    temperaturaC: 3.5,
    pressaoPsi: 13.8,
    posicao3D: [5, 0, 6],
    ultimoAbastecimento: 'Há 2h 10 min',
    consumoPorHora: [
      { hora: '18h', transacoes: 30, receita: 1200 },
      { hora: '19h', transacoes: 95, receita: 3800 },
      { hora: '20h', transacoes: 140, receita: 5600 },
      { hora: '21h', transacoes: 125, receita: 5000 },
      { hora: '22h', transacoes: 90, receita: 3600 },
    ],
  },
  {
    id: 'aut-03',
    codigo: 'AUT-SNACK-03',
    nome: 'Totem Grab & Go Gastrô 03',
    tipoInsumo: 'Pizzas Artesanais & Burgers',
    setor: 'Vila Gastronômica',
    status: 'operacional',
    capacidadeTotalInsumo: 350,
    nivelAtualInsumo: 240,
    unidadeMedida: 'un',
    capacidadeCopos: 350,
    nivelCopos: 310,
    transacoesAcumuladas: 340,
    receitaTotal: 15300,
    ticketMedio: 45.0,
    tempoMedioAtendimentoSegundos: 45,
    pessoasNaFila: 6,
    tempoEstimadoEsperaMin: 4.5,
    temperaturaC: -1.0,
    pressaoPsi: 0,
    posicao3D: [-7, 0, -4],
    ultimoAbastecimento: 'Há 1h 20 min',
    consumoPorHora: [
      { hora: '18h', transacoes: 25, receita: 1125 },
      { hora: '19h', transacoes: 75, receita: 3375 },
      { hora: '20h', transacoes: 120, receita: 5400 },
      { hora: '21h', transacoes: 70, receita: 3150 },
      { hora: '22h', transacoes: 50, receita: 2250 },
    ],
  },
  {
    id: 'aut-04',
    codigo: 'AUT-VIP-04',
    nome: 'Wine & Champagne Tap VIP',
    tipoInsumo: 'Vinhos Finos & Espumantes',
    setor: 'Camarote VIP',
    status: 'operacional',
    capacidadeTotalInsumo: 200,
    nivelAtualInsumo: 165,
    unidadeMedida: 'L',
    capacidadeCopos: 300,
    nivelCopos: 275,
    transacoesAcumuladas: 235,
    receitaTotal: 16450,
    ticketMedio: 70.0,
    tempoMedioAtendimentoSegundos: 20,
    pessoasNaFila: 2,
    tempoEstimadoEsperaMin: 0.7,
    temperaturaC: 5.0,
    pressaoPsi: 12.0,
    posicao3D: [6, 0, -5],
    ultimoAbastecimento: 'Há 30 min',
    consumoPorHora: [
      { hora: '18h', transacoes: 15, receita: 1050 },
      { hora: '19h', transacoes: 40, receita: 2800 },
      { hora: '20h', transacoes: 70, receita: 4900 },
      { hora: '21h', transacoes: 65, receita: 4550 },
      { hora: '22h', transacoes: 45, receita: 3150 },
    ],
  },
];

export const INITIAL_INSTAGRAMAVEL: InstagramavelItem[] = [
  {
    id: 'inst-01',
    codigo: 'INSTA-NEON-01',
    nome: 'Túnel Neon Cyber Sound',
    patrocinador: 'Heineken 0.0',
    categoriaCenario: 'Túnel Imersivo de LED 360°',
    setor: 'Arena Principal',
    status: 'alta_procura',
    capturasTotais: 1420,
    compartilhamentosSociaisEstimados: 1180,
    alcanceEstimadoRedes: 185000,
    tempoPermanenciaMedioSegundos: 85,
    avaliacaoMedia: 4.92,
    npsScore: 94,
    pessoasNaFila: 18,
    tempoEsperaMin: 9.5,
    iluminacaoCenica: {
      modo: 'Neon Pulsar',
      corPrincipal: '#10b981',
      intensidadePct: 92,
    },
    posicao3D: [-2, 0, 7],
    hashtagsPrincipais: ['#HeinekenLive', '#ArenaCyber', '#NoiteNeon'],
    fotosRecentes: [
      { id: 'f-1', timestamp: '22:48', autor: '@mariana.sound', likes: 342 },
      { id: 'f-2', timestamp: '22:42', autor: '@lucas_bass', likes: 189 },
      { id: 'f-3', timestamp: '22:36', autor: '@dj_anapaula', likes: 512 },
    ],
  },
  {
    id: 'inst-02',
    codigo: 'INSTA-SWING-02',
    nome: 'Balanço Flutuante nas Alturas',
    patrocinador: 'Red Bull Energy',
    categoriaCenario: 'Instalação Aérea com Fumaça Iluminada',
    setor: 'Palco Sunset',
    status: 'ativo',
    capturasTotais: 980,
    compartilhamentosSociaisEstimados: 810,
    alcanceEstimadoRedes: 124000,
    tempoPermanenciaMedioSegundos: 110,
    avaliacaoMedia: 4.88,
    npsScore: 89,
    pessoasNaFila: 8,
    tempoEsperaMin: 5.2,
    iluminacaoCenica: {
      modo: 'Cyber Glow',
      corPrincipal: '#ef4444',
      intensidadePct: 88,
    },
    posicao3D: [2, 0, 8],
    hashtagsPrincipais: ['#TeDaAsas', '#SunsetVibe', '#RedBullFestival'],
    fotosRecentes: [
      { id: 'f-4', timestamp: '22:49', autor: '@felipetrip', likes: 230 },
      { id: 'f-5', timestamp: '22:40', autor: '@carol.vlog', likes: 418 },
    ],
  },
  {
    id: 'inst-03',
    codigo: 'INSTA-HOLO-03',
    nome: 'Cabine Holográfica Glitch 360°',
    patrocinador: 'Itaú Tech Labs',
    categoriaCenario: 'Vídeo Spinner Bullet-Time 4K',
    setor: 'Vila das Marcas',
    status: 'ativo',
    capturasTotais: 820,
    compartilhamentosSociaisEstimados: 750,
    alcanceEstimadoRedes: 98000,
    tempoPermanenciaMedioSegundos: 65,
    avaliacaoMedia: 4.85,
    npsScore: 86,
    pessoasNaFila: 5,
    tempoEsperaMin: 3.0,
    iluminacaoCenica: {
      modo: 'Studio Spotlight',
      corPrincipal: '#f59e0b',
      intensidadePct: 95,
    },
    posicao3D: [-3, 0, -7],
    hashtagsPrincipais: ['#ItauNoFestival', '#BulletTime360', '#TechFestival'],
    fotosRecentes: [
      { id: 'f-6', timestamp: '22:45', autor: '@bruno.engineer', likes: 175 },
      { id: 'f-7', timestamp: '22:31', autor: '@gabi_lifestyle', likes: 620 },
    ],
  },
  {
    id: 'inst-04',
    codigo: 'INSTA-VIP-04',
    nome: 'Espelho Infinito & Led Waves',
    patrocinador: 'Spotify Sessions',
    categoriaCenario: 'Infinity Mirror Room Audio-Reativa',
    setor: 'Camarote VIP',
    status: 'ativo',
    capturasTotais: 640,
    compartilhamentosSociaisEstimados: 590,
    alcanceEstimadoRedes: 112000,
    tempoPermanenciaMedioSegundos: 90,
    avaliacaoMedia: 4.96,
    npsScore: 96,
    pessoasNaFila: 4,
    tempoEsperaMin: 2.5,
    iluminacaoCenica: {
      modo: 'Golden Hour',
      corPrincipal: '#a855f7',
      intensidadePct: 85,
    },
    posicao3D: [3, 0, -6],
    hashtagsPrincipais: ['#SpotifyVIP', '#InfinityRoom', '#SoundsGood'],
    fotosRecentes: [
      { id: 'f-8', timestamp: '22:47', autor: '@vitor.soundtrack', likes: 440 },
      { id: 'f-9', timestamp: '22:38', autor: '@patricia_music', likes: 810 },
    ],
  },
];

export function computeSinteseAcumulada(
  autos: AutosservicoItem[],
  instas: InstagramavelItem[]
): SinteseAcumuladaData {
  const receitaTotalAutosservico = autos.reduce((acc, curr) => acc + curr.receitaTotal, 0);
  const totalTransacoesAutos = autos.reduce((acc, curr) => acc + curr.transacoesAcumuladas, 0);
  const totalCapturasInstagramavel = instas.reduce((acc, curr) => acc + curr.capturasTotais, 0);
  const alcanceTotalRedes = instas.reduce((acc, curr) => acc + curr.alcanceEstimadoRedes, 0);
  const totalAtendimentosGerais = totalTransacoesAutos + totalCapturasInstagramavel;

  const ticketMedioGeral = totalTransacoesAutos > 0 ? receitaTotalAutosservico / totalTransacoesAutos : 0;
  
  const somaEsperas = [...autos.map(a => a.tempoEstimadoEsperaMin), ...instas.map(i => i.tempoEsperaMin)];
  const tempoMedioEsperaGlobalMin = somaEsperas.length > 0 
    ? somaEsperas.reduce((a, b) => a + b, 0) / somaEsperas.length 
    : 0;

  const vazaoMediaAtendimentosPorMin = Number((totalAtendimentosGerais / 300).toFixed(1));

  const autosservicoPorStatus = autos.reduce(
    (acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    },
    { operacional: 0, atencao: 0, critico: 0, manutencao: 0 } as Record<string, number>
  ) as SinteseAcumuladaData['autosservicoPorStatus'];

  const instagramavelPorStatus = instas.reduce(
    (acc, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    },
    { ativo: 0, alta_procura: 0, limpeza: 0, pausado: 0 } as Record<string, number>
  ) as SinteseAcumuladaData['instagramavelPorStatus'];

  const setorMap = new Map<string, { receita: number; volume: number }>();
  autos.forEach((a) => {
    const cur = setorMap.get(a.setor) || { receita: 0, volume: 0 };
    cur.receita += a.receitaTotal;
    cur.volume += a.transacoesAcumuladas;
    setorMap.set(a.setor, cur);
  });
  instas.forEach((i) => {
    const cur = setorMap.get(i.setor) || { receita: 0, volume: 0 };
    cur.volume += i.capturasTotais;
    setorMap.set(i.setor, cur);
  });

  const faturamentoPorSetor = Array.from(setorMap.entries()).map(([setor, data]) => ({
    setor,
    receita: data.receita,
    volume: data.volume,
    pct: receitaTotalAutosservico > 0 ? Number(((data.receita / receitaTotalAutosservico) * 100).toFixed(1)) : 0,
  }));

  const fluxoHorario = [
    { hora: '18h', autosservico: 115, instagramavel: 320, receita: 4725 },
    { hora: '19h', autosservico: 320, instagramavel: 680, receita: 16275 },
    { hora: '20h', autosservico: 515, instagramavel: 1100, receita: 26450 },
    { hora: '21h', autosservico: 420, instagramavel: 950, receita: 17500 },
    { hora: '22h', autosservico: 297, instagramavel: 810, receita: 12360 },
  ];

  const satisfacaoGeralScore = 4.91;

  const principaisAlertas: SinteseAcumuladaData['principaisAlertas'] = [
    {
      id: 'al-1',
      tipo: 'aviso',
      mensagem: 'Nível de Chopp Gin Tônica em 22% (68L restantes) no Totem AUT-DRINK-02 (Palco Sunset).',
      hora: '22:45',
      atracao: 'Dispenser Cocktails & Gin 02',
      atracaoId: 'aut-02',
      direcionamento: 'Despachar equipe de reabastecimento móvel com 2 barris de 50L e 1 lote de 200 copos para o Palco Sunset nos próximos 15 minutos.',
      impactoEstimado: 'Evita perda projetada de R$ 3.800 em vendas e ruptura antes do show das 23h15.',
      acaoRapidaLabel: 'Despachar Reposição Móvel',
    },
    {
      id: 'al-2',
      tipo: 'urgente',
      mensagem: 'Fila de 18 pessoas no Túnel Neon Cyber Sound (Tempo de espera médio elevado para 9.5 min).',
      hora: '22:38',
      atracao: 'Túnel Neon Cyber Sound',
      atracaoId: 'inst-01',
      direcionamento: 'Ativar modo de disparo fotográfico rápido (redução de pose de 85s para 50s) e sinalizar via totem o Balanço Flutuante (Setor Sunset), que possui fila de apenas 5 min.',
      impactoEstimado: 'Redução estimada de 45% no tempo de espera da fila e alívio de gargalo na circulação da Arena.',
      acaoRapidaLabel: 'Ativar Modo Ágil & Rebalancear Fila',
    },
    {
      id: 'al-3',
      tipo: 'info',
      mensagem: 'Meta horária de receita superada na Arena Principal (+18% sobre a projeção do dia).',
      hora: '22:15',
      atracao: 'Arena Principal',
      atracaoId: 'aut-01',
      direcionamento: 'Oportunidade comercial: disparar notificação promocional push no app do evento oferecendo combo "Chopp + Pizza Artesanal" na Vila Gastronômica para dispersar o fluxo.',
      impactoEstimado: 'Potencial de incremento de +R$ 4.500 no ticket médio de alimentação do setor gastronômico.',
      acaoRapidaLabel: 'Ativar Promoção Cruzada Gastrô',
    },
  ];

  return {
    eventoNome: 'Festival Som & Luz Arena 2026',
    dataEvento: '19 de Outubro de 2026',
    tempoDecorridoHoras: 4.8,
    publicoTotalEstimadoVenue: 18500,
    totalAtendimentosGerais,
    receitaTotalAutosservico,
    totalCapturasInstagramavel,
    alcanceTotalRedes,
    ticketMedioGeral,
    vazaoMediaAtendimentosPorMin,
    tempoMedioEsperaGlobalMin: Number(tempoMedioEsperaGlobalMin.toFixed(1)),
    satisfacaoGeralScore,
    autosservicoPorStatus,
    instagramavelPorStatus,
    faturamentoPorSetor,
    fluxoHorario,
    principaisAlertas,
  };
}