import React, { useEffect } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import type { OpsFeedback } from '../../hooks/useOpsActions';

interface ApiToastProps {
  feedback: OpsFeedback | null;
  onClose: () => void;
}

const ESTILOS: Record<OpsFeedback['tipo'], string> = {
  ok: 'border-emerald-500/50 bg-emerald-950/90 text-emerald-200',
  erro: 'border-rose-500/50 bg-rose-950/90 text-rose-200',
  info: 'border-cyan-500/50 bg-[#0d1527]/95 text-cyan-200',
};

// Aviso flutuante com o resultado das chamadas à API. Some sozinho (exceto "info").
export const ApiToast: React.FC<ApiToastProps> = ({ feedback, onClose }) => {
  useEffect(() => {
    if (!feedback || feedback.tipo === 'info') return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [feedback, onClose]);

  if (!feedback) return null;
  const Icone = feedback.tipo === 'ok' ? CheckCircle2 : feedback.tipo === 'erro' ? TriangleAlert : Info;

  return (
    <div
      role={feedback.tipo === 'erro' ? 'alert' : 'status'}
      className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs shadow-xl ${ESTILOS[feedback.tipo]}`}
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{feedback.texto}</span>
      <button type="button" onClick={onClose} aria-label="Fechar aviso" className="opacity-70 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
