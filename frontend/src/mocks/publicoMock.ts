
export interface EntradasSaidas {
  entradas: number;
  saidas: number;
}

export interface AcumuladoDia {
  dia: 'D1' | 'D2' | 'D3';
  visitas: number;
}

const SAIDAS_SIMULADAS = 28;

export function simularEntradasSaidas(pessoasPresentes: number): EntradasSaidas {
  return { entradas: pessoasPresentes + SAIDAS_SIMULADAS, saidas: SAIDAS_SIMULADAS };
}

const PESOS_DIARIOS = { D1: 240, D2: 320, D3: 400 } as const;
const TOTAL_PESOS = PESOS_DIARIOS.D1 + PESOS_DIARIOS.D2 + PESOS_DIARIOS.D3;

export function simularAcumuladoPorDia(totalReal: number | null): AcumuladoDia[] {
  const total = totalReal ?? TOTAL_PESOS;
  const d1 = Math.round((total * PESOS_DIARIOS.D1) / TOTAL_PESOS);
  const d2 = Math.round((total * PESOS_DIARIOS.D2) / TOTAL_PESOS);
  const d3 = Math.max(0, total - d1 - d2);
  return [
    { dia: 'D1', visitas: d1 },
    { dia: 'D2', visitas: d2 },
    { dia: 'D3', visitas: d3 },
  ];
}
