import React, { useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { mensagemDeErro } from '../../services/venueApi';
import type { PapelUsuario } from '../../types/auth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { user, loading, login, loginComPapel, usarTokenPadrao } = useAuth();
  const [modo, setModo] = useState<'login' | 'token'>('login');
  const [email, setEmail] = useState('operador@raizevento.com');
  const [password, setPassword] = useState('senha123');
  const [usuario, setUsuario] = useState('central.controle');
  const [papel, setPapel] = useState<PapelUsuario>('operador');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    try {
      await login({ email, password });
      setSucesso('Sessão autenticada via API.');
      onClose();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  };

  const handleGerarToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    try {
      await loginComPapel(usuario.trim().toLowerCase(), papel);
      setSucesso(`Token gerado para ${usuario} (${papel}).`);
      onClose();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Login"
    >
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-[#0b1220] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Login</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar login"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-slate-800 bg-[#070d18] px-3 py-2 text-xs text-slate-300">
          Sessão atual: <strong className="text-cyan-300">{user?.name ?? 'Operador'}</strong> ({user?.role ?? 'admin'})
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setModo('login');
              setErro(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
              modo === 'login'
                ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                : 'border-slate-800 text-slate-400 hover:bg-[#070d18]'
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Entrar no sistema</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setModo('token');
              setErro(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
              modo === 'token'
                ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                : 'border-slate-800 text-slate-400 hover:bg-[#070d18]'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Token de teste</span>
          </button>
        </div>

        {erro && (
          <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
            {erro}
          </div>
        )}
        {sucesso && (
          <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
            {sucesso}
          </div>
        )}

        {modo === 'login' ? (
          <form onSubmit={(e) => void handleLogin(e)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070d18] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070d18] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  usarTokenPadrao();
                  onClose();
                }}
                className="text-xs font-semibold text-slate-400 hover:text-cyan-300"
              >
                Usar token padrão
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleGerarToken(e)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Usuário técnico (letras minúsculas, números, `.`, `_`, `-`)
              </label>
              <input
                type="text"
                required
                pattern="^[a-z0-9._-]{3,60}$"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-[#070d18] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">Papel</label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value as PapelUsuario)}
                className="w-full rounded-lg border border-slate-800 bg-[#070d18] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="admin">admin (acesso total)</option>
                <option value="operador">operador (leitura e ações)</option>
                <option value="visualizador">visualizador (somente leitura)</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  usarTokenPadrao();
                  onClose();
                }}
                className="text-xs font-semibold text-slate-400 hover:text-cyan-300"
              >
                Restaurar token admin
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
              >
                {loading ? 'Gerando...' : 'Gerar token'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
