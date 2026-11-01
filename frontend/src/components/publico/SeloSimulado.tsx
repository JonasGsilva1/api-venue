import React from 'react';

interface SeloSimuladoProps {
  /** Texto do selo. Padrão: "Simulado". */
  texto?: string;
  /** Explicação que aparece ao passar o mouse. */
  detalhe?: string;
}

// Selo que marca, de forma explícita, qualquer dado fictício na tela.
export const SeloSimulado: React.FC<SeloSimuladoProps> = ({
  texto = 'Simulado',
  detalhe = 'Dado fictício: ainda não há fonte real para esta métrica.',
}) => (
  <span
    title={detalhe}
    className="px-1.5 py-0.5 text-[10px] rounded font-mono uppercase tracking-wider bg-[#FFD600]/10 text-[#FFD600] border border-[#FFD600]/30"
  >
    {texto}
  </span>
);
