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
      <div className="w-full max-w-md rounded-2xl border border-raiz-accent/40 bg-raiz-dark p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-raiz-border-dark pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-raiz-accent" />
            <h3 className="text-base font-bold text-raiz-text-light">Login</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar login"
            className="rounded-lg p-1 text-raiz-text-light/75 hover:bg-raiz-border-dark hover:text-raiz-text-light"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-raiz-border-dark bg-raiz-section px-3 py-2 text-xs text-raiz-text-light/75">
          Sessão atual: <strong className="text-raiz-accent">{user?.name ?? 'Operador'}</strong> ({user?.role ?? 'admin'})
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
                ? 'border-raiz-accent/40 bg-raiz-accent/15 text-raiz-accent'
                : 'border-raiz-border-dark text-raiz-text-light/75 hover:bg-raiz-section'
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
                ? 'border-raiz-accent/40 bg-raiz-accent/15 text-raiz-accent'
                : 'border-raiz-border-dark text-raiz-text-light/75 hover:bg-raiz-section'
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
          <div className="mt-3 rounded-lg border border-raiz-accent/40 bg-raiz-accent/10 px-3 py-2 text-xs text-raiz-accent">
            {sucesso}
          </div>
        )}

        {modo === 'login' ? (
          <form onSubmit={(e) => void handleLogin(e)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-raiz-text-light/75">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-raiz-border-dark bg-raiz-section px-3 py-2 text-xs text-raiz-text-light focus:border-raiz-accent/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-raiz-text-light/75">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-raiz-border-dark bg-raiz-section px-3 py-2 text-xs text-raiz-text-light focus:border-raiz-accent/40 focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  usarTokenPadrao();
                  onClose();
                }}
                className="text-xs font-semibold text-raiz-text-light/75 hover:text-raiz-accent"
              >
                Usar token padrão
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-raiz-accent px-4 py-2 text-xs font-bold text-raiz-text-dark hover:bg-raiz-accent/90 disabled:opacity-50"
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleGerarToken(e)} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-raiz-text-light/75">
                Usuário técnico (letras minúsculas, números, `.`, `_`, `-`)
              </label>
              <input
                type="text"
                required
                pattern="^[a-z0-9._-]{3,60}$"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full rounded-lg border border-raiz-border-dark bg-raiz-section px-3 py-2 text-xs text-raiz-text-light focus:border-raiz-accent/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-raiz-text-light/75">Papel</label>
              <select
                value={papel}
                onChange={(e) => setPapel(e.target.value as PapelUsuario)}
                className="w-full rounded-lg border border-raiz-border-dark bg-raiz-section px-3 py-2 text-xs text-raiz-text-light focus:border-raiz-accent/40 focus:outline-none"
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
                className="text-xs font-semibold text-raiz-text-light/75 hover:text-raiz-accent"
              >
                Restaurar token admin
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-raiz-accent px-4 py-2 text-xs font-bold text-raiz-text-dark hover:bg-raiz-accent/90 disabled:opacity-50"
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
